import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("preflight", Path(__file__).resolve().parents[1] / "rmorampudi09_preflight.py")
preflight = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(preflight)


class PreflightTests(unittest.TestCase):
    def setUp(self):
        self.sources = {str(v): {"script": f"V{v}__baseline.sql", "checksum": v} for v in range(1, 14)}
        self.sources["13"]["script"] = "V13__customer_address_label.sql"
        self.rows = [{"version": str(v), **self.sources[str(v)], "type": "SQL", "success": True} for v in range(1, 13)]

    def test_v16_requires_exact_source_and_applied_history_checksum(self):
        for version,script in (("14","V14__chef_onboarding_v2.sql"),("15","V15__chef_onboarding_all_chefs_selected_proof.sql"),("16","V16__chef_onboarding_submission_contract.sql")):
            self.sources[version]={"script":script,"checksum":int(version)}
        self.assertEqual(preflight.compare_history(self.rows,self.sources)["v16"],"PENDING")
        for version in ("13","14","15","16"):
            self.rows.append({"version":version,**self.sources[version],"type":"SQL","success":True})
        self.assertEqual(preflight.compare_history(self.rows,self.sources)["v16"],"APPLIED_MATCHING")
        self.rows[-1]["checksum"]=999
        with self.assertRaisesRegex(ValueError,"differs.*V16"):
            preflight.compare_history(self.rows,self.sources)

    def test_v17_is_exactly_reviewed_and_may_be_pending_after_applied_v16(self):
        for version,script in (("14","V14__chef_onboarding_v2.sql"),("15","V15__chef_onboarding_all_chefs_selected_proof.sql"),("16","V16__chef_onboarding_submission_contract.sql"),("17","V17__chef_onboarding_reference_and_correction_sections.sql")):
            self.sources[version]={"script":script,"checksum":int(version)}
        for version in ("13","14","15","16"):
            self.rows.append({"version":version,**self.sources[version],"type":"SQL","success":True})
        result=preflight.compare_history(self.rows,self.sources)
        self.assertEqual((result["v16"],result["v17"]),("APPLIED_MATCHING","PENDING"))
        self.rows.append({"version":"17",**self.sources["17"],"type":"SQL","success":True})
        self.assertEqual(preflight.compare_history(self.rows,self.sources)["v17"],"APPLIED_MATCHING")
        self.rows.pop()
        self.sources["17"]["script"]="V17__other.sql"
        with self.assertRaisesRegex(ValueError,"Incorrect V17"):
            preflight.compare_history(self.rows,self.sources)

    def test_bank_release_accepts_only_exact_later_v149(self):
        sources={"148":{"script":"V148__existing.sql","checksum":148},"149":{"script":"V149__chef_bank_branch_directory.sql","checksum":149}}
        rows=[{"version":"148",**sources["148"],"type":"SQL","success":True}]
        self.assertEqual(preflight.compare_bank_history(rows,sources)["v149"],"PENDING")
        rows.append({"version":"149",**sources["149"],"type":"SQL","success":True})
        self.assertEqual(preflight.compare_bank_history(rows,sources)["v149"],"APPLIED_MATCHING")
        rows[-1]["checksum"]=150
        with self.assertRaises(ValueError):preflight.compare_bank_history(rows,sources)
        with self.assertRaises(ValueError):preflight.compare_bank_history(rows[:1],{**sources,"147":{"script":"V147__earlier.sql","checksum":147}})

    def test_v12_allows_only_pending_approved_v13(self):
        self.assertEqual(preflight.compare_history(self.rows, self.sources)["v13"], "PENDING")

    def test_bank_schema_marker_is_metadata_not_an_applied_sql_version(self):
        sources={"148":{"script":"V148__existing.sql","checksum":148},"149":{"script":"V149__chef_bank_branch_directory.sql","checksum":149}}
        marker={"type":"SCHEMA","version":None,"script":'"payment_schema"',"checksum":None,"success":True}
        sql={"version":"148",**sources["148"],"type":"SQL","success":True}
        report=preflight.compare_bank_history([marker,sql],sources)
        self.assertEqual(report["v149"],"PENDING")
        self.assertEqual(report["pendingVersions"],["149"])
        self.assertEqual(report["history"][0]["kind"],"SCHEMA")
        with self.assertRaises(ValueError):preflight.compare_bank_history([marker],sources)

    def test_bank_schema_marker_cannot_hide_invalid_or_duplicate_history(self):
        sources={"148":{"script":"V148__existing.sql","checksum":148},"149":{"script":"V149__chef_bank_branch_directory.sql","checksum":149}}
        marker={"type":"SCHEMA","version":None,"script":'"payment_schema"',"checksum":None,"success":True}
        sql={"version":"148",**sources["148"],"type":"SQL","success":True}
        for field,value in (("success",False),("checksum",0),("version","0"),("script",'"other_schema"'),("type","BASELINE")):
            with self.subTest(field=field),self.assertRaises(ValueError):
                preflight.compare_bank_history([{**marker,field:value},sql],sources)
        for rows in ([marker,marker,sql],[sql,marker],[marker,sql,sql],[marker,{**sql,"checksum":999}],[marker,{**sql,"success":False}]):
            with self.subTest(rows=rows),self.assertRaises(ValueError):
                preflight.compare_bank_history(rows,sources)

    def test_bank_history_bounds_and_unexpected_fields_remain_blocked(self):
        sources={"149":{"script":"V149__chef_bank_branch_directory.sql","checksum":149}}
        for rows in (None,[],[{}]*251,[{"type":"SCHEMA","private":"unexpected"}]):
            with self.subTest(rows=rows),self.assertRaises(ValueError):
                preflight.compare_bank_history(rows,sources)

    def test_matching_v13_is_idempotent(self):
        self.rows.append({"version": "13", **self.sources["13"], "type": "SQL", "success": True})
        self.assertEqual(preflight.compare_history(self.rows, self.sources)["v13"], "APPLIED_MATCHING")

    def test_conflicting_old_address_name_is_blocked(self):
        self.rows.append({"version": "13", "script": "V13__customer_address_name.sql", "checksum": 13, "type": "SQL", "success": True})
        with self.assertRaisesRegex(ValueError, "differs.*V13"):
            preflight.compare_history(self.rows, self.sources)

    def test_history_repair_or_missing_baseline_is_not_assumed_safe(self):
        for field, value in (("checksum", 999), ("success", False), ("type", "BASELINE")):
            with self.subTest(field=field), self.assertRaises(ValueError):
                rows = [dict(row) for row in self.rows]
                rows[0][field] = value
                preflight.compare_history(rows, self.sources)
        with self.assertRaises(ValueError):
            preflight.compare_history(self.rows[1:], self.sources)

    def test_v13_with_pending_onboarding_preserves_v13_applied_state(self):
        self.sources["14"] = {"script": "V14__chef_onboarding_v2.sql", "checksum": 14}
        self.rows.append({"version": "13", **self.sources["13"], "type": "SQL", "success": True})
        report = preflight.compare_history(self.rows, self.sources)
        self.assertEqual(report["v13"], "APPLIED_MATCHING")
        self.assertEqual(report["v14"], "PENDING")
        self.assertEqual(report["pendingVersions"], ["14"])

    def test_v12_allows_both_reviewed_additions_and_matching_v14_replay(self):
        self.sources["14"] = {"script": "V14__chef_onboarding_v2.sql", "checksum": 14}
        self.assertEqual(preflight.compare_history(self.rows, self.sources)["pendingVersions"], ["13", "14"])
        for version in ("13", "14"):
            self.rows.append({"version": version, **self.sources[version], "type": "SQL", "success": True})
        report = preflight.compare_history(self.rows, self.sources)
        self.assertEqual(report["v14"], "APPLIED_MATCHING")
        self.assertEqual(report["pendingVersions"], [])

    def test_unknown_or_conflicting_onboarding_migrations_are_rejected(self):
        for version, script in (("14", "V14__other.sql"), ("15", "V15__unknown.sql")):
            with self.subTest(version=version):
                sources = dict(self.sources)
                sources[version] = {"script": script, "checksum": int(version)}
                with self.assertRaises(ValueError):
                    preflight.compare_history(self.rows, sources)
        self.sources["14"] = {"script": "V14__chef_onboarding_v2.sql", "checksum": 14}
        with self.assertRaisesRegex(ValueError, "differs.*V14"):
            preflight.compare_history(self.rows + [
                {"version": "13", **self.sources["13"], "type": "SQL", "success": True},
                {"version": "14", "script": "V14__chef_onboarding_v2.sql", "checksum": 999, "type": "SQL", "success": True}
            ], self.sources)

    def test_onboarding_cannot_be_applied_before_address_baseline(self):
        self.sources["14"] = {"script": "V14__chef_onboarding_v2.sql", "checksum": 14}
        with self.assertRaisesRegex(ValueError, "precede V13"):
            preflight.compare_history(self.rows + [
                {"version": "14", **self.sources["14"], "type": "SQL", "success": True}
            ], self.sources)

    def test_v15_is_explicitly_reviewed_and_preserves_applied_history(self):
        self.sources["14"] = {"script": "V14__chef_onboarding_v2.sql", "checksum": 14}
        self.sources["15"] = {"script": "V15__chef_onboarding_all_chefs_selected_proof.sql", "checksum": 15}
        self.assertEqual(preflight.compare_history(self.rows, self.sources)["pendingVersions"], ["13", "14", "15"])
        for version in ("13", "14", "15"):
            self.rows.append({"version": version, **self.sources[version], "type": "SQL", "success": True})
        self.assertEqual(preflight.compare_history(self.rows, self.sources)["v15"], "APPLIED_MATCHING")
        rows = [dict(row) for row in self.rows]
        rows[-1]["checksum"] = 999
        with self.assertRaisesRegex(ValueError, "differs.*V15"):
            preflight.compare_history(rows, self.sources)
        with self.assertRaisesRegex(ValueError, "precede V14"):
            preflight.compare_history(self.rows[:-2] + [self.rows[-1]], self.sources)

    def test_ambiguous_resources_are_rejected(self):
        with self.assertRaises(ValueError):
            preflight.one([{"name": "web-a"}, {"name": "web-b"}], "web-")

    def test_runtime_report_redacts_unselected_values(self):
        app = {"name": "app", "properties": {"template": {"containers": [{"name": "main", "image": "image",
            "env": [{"name": "PASSWORD", "value": "do-not-report"}, {"name": "DATABASE", "secretRef": "pg-pass"},
                    {"name": "CRAVES_BUILD_SHA", "value": "a" * 40}]}]}}}
        result = str(preflight.runtime_summary(app))
        self.assertNotIn("do-not-report", result)
        self.assertNotIn("PASSWORD", result)
        self.assertIn("pg-pass", result)

    def test_azure_writes_cannot_execute(self):
        for command in (("containerapp", "update"), ("keyvault", "secret", "set"), ("role", "assignment", "create")):
            with self.subTest(command=command), patch.object(preflight.subprocess, "run") as run:
                with self.assertRaisesRegex(ValueError, "write refused"):
                    preflight.az(*command)
                run.assert_not_called()


if __name__ == "__main__":
    unittest.main()

