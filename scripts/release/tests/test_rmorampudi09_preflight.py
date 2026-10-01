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

    def test_v12_allows_only_pending_approved_v13(self):
        self.assertEqual(preflight.compare_history(self.rows, self.sources)["v13"], "PENDING")

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
