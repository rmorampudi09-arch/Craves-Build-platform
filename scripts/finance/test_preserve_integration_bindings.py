import copy
import importlib.util
import os
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("preserve", Path(__file__).with_name("preserve_integration_bindings.py"))
preserve = importlib.util.module_from_spec(spec); spec.loader.exec_module(preserve)


class BindingPreservationTest(unittest.TestCase):
    def setUp(self):
        self.values = {ref: "DISPOSABLE_TEST_VALUE_" + ref for ref in preserve.REFS}
        self.rows = [{"name": ref} for ref in sorted(preserve.REFS)] + [{"name": "pg-pass", "identity": "system", "keyVaultUrl": preserve.PREFIX + "pg-password"}]
        self.app = {"name": preserve.APP, "identity": {"type": "SystemAssigned"}, "tags": {}, "properties": {
            "latestRevisionName": "old", "latestReadyRevisionName": "old",
            "configuration": {"secrets": copy.deepcopy(self.rows), "activeRevisionsMode": "Single"},
            "template": {"scale": {"maxReplicas": 1}, "containers": [{"image": "existing-image", "env":
                [{"name": ref, "secretRef": ref} for ref in sorted(preserve.REFS)] +
                [{"name": "SPRING_DATASOURCE_PASSWORD", "secretRef": "pg-pass"},
                 {"name": "PROVIDER_ENABLED", "value": "false"}]}]}}}
        self.store = {}; self.writes = []; self.snapshots = 0; self.race = None

    def inventory(self): return {preserve.APP: copy.deepcopy(self.app), preserve.release.APPS["user-chef-service"]: {"image": "untouched"}}

    def azure(self, *args):
        if args[:3] == ("containerapp", "secret", "list"):
            if "--show-values" in args:
                self.snapshots += 1
                if self.race and self.snapshots == 2: self.values["bank-internal"] = "CONCURRENT_VALUE"
                return [{**row, **({"value": self.values[row["name"]]} if row["name"] in self.values and not row.get("keyVaultUrl") else {})} for row in self.rows]
            return copy.deepcopy(self.rows)
        if args[:3] == ("keyvault", "secret", "list"):
            return [{"name": name} for name in self.store]
        if args[:3] == ("keyvault", "secret", "show"):
            url = args[args.index("--id") + 1]; name = url[len(preserve.PREFIX):].split("/")[0]
            return copy.deepcopy(self.store[name])
        if args[:3] == ("keyvault", "secret", "set"):
            filename = Path(args[args.index("--file") + 1])
            self.assertEqual(0o600, filename.stat().st_mode & 0o777)
            value = filename.read_text(); self.assertNotIn(value, args)
            name = args[args.index("--name") + 1]
            item = {"id": preserve.PREFIX + name + "/" + "a" * 32, "value": value, "attributes": {"enabled": True}}
            self.store[name] = item; self.writes.append("vault"); return item
        if args[:3] == ("containerapp", "secret", "set"):
            for entry in args[args.index("--secrets") + 1:]:
                ref, url = entry.split("=keyvaultref:", 1); url = url.removesuffix(",identityref:system")
                self.rows = [{"name": ref, "keyVaultUrl": url, "identity": "system"} if x["name"] == ref else x for x in self.rows]
            self.app["properties"]["configuration"]["secrets"] = copy.deepcopy(self.rows)
            self.writes.append("binding"); return {}
        raise AssertionError("Unexpected operation")

    def run_apply(self):
        with patch.object(preserve, "azure", side_effect=self.azure), patch.object(preserve.release, "inventory", side_effect=self.inventory), \
             patch.object(preserve.release, "secret", return_value=self.values["bank-internal"]), \
             patch.object(preserve.release, "validate_database_state", return_value={"sharedTermsReady": True}):
            return preserve.apply()

    def test_missing_database_or_common_terms_cannot_write_bindings(self):
        with patch.object(preserve, "azure", side_effect=self.azure), patch.object(preserve.release, "inventory", side_effect=self.inventory), \
             patch.object(preserve.release, "validate_database_state", side_effect=ValueError("Common terms unavailable")):
            with self.assertRaisesRegex(ValueError, "Common terms unavailable"): preserve.apply()
        self.assertEqual([], self.writes)

    def test_exact_values_and_runtime_are_preserved_without_rotation(self):
        before = preserve.stable(self.app); expected = dict(self.values)
        report = self.run_apply()
        self.assertTrue(report["verified"]); self.assertFalse(report["credentialRotation"])
        self.assertFalse(report["permissionChanges"]); self.assertFalse(report["revisionRestarted"])
        self.assertEqual(before, preserve.stable(self.app)); self.assertEqual(1, self.writes.count("binding"))
        for ref, value in expected.items(): self.assertEqual(value, self.store["craves-integration-" + ref + "-preserved-v1"]["value"])

    def test_existing_different_or_disabled_destination_cannot_be_overwritten(self):
        for value, enabled in [("DIFFERENT", True), (self.values["bank-internal"], False)]:
            with self.subTest(enabled=enabled):
                self.store["craves-integration-bank-internal-preserved-v1"] = {"id": preserve.PREFIX + "craves-integration-bank-internal-preserved-v1/" + "a" * 32, "value": value, "attributes": {"enabled": enabled}}
                with self.assertRaisesRegex(ValueError, "refusing overwrite"): self.run_apply()
                self.assertEqual([], self.writes)

    def test_wrong_vault_and_identity_stop_before_writes(self):
        baseline = copy.deepcopy(self.rows)
        for changes in [{"identity": "other"}, {"keyVaultUrl": "https://another.vault.azure.net/secrets/db"}]:
            self.rows = copy.deepcopy(baseline); self.rows[-1].update(changes)
            with self.assertRaisesRegex(ValueError, "scoped database vault"): self.run_apply()
            self.assertEqual([], self.writes)

    def test_unexpected_direct_reference_is_rejected(self):
        self.rows.append({"name": "unexpected"}); self.app["properties"]["template"]["containers"][0]["env"].append({"name": "UNEXPECTED", "secretRef": "unexpected"})
        with self.assertRaisesRegex(ValueError, "Unexpected direct"): self.run_apply()
        self.assertEqual([], self.writes)

    def test_concurrent_secret_change_stops_before_writes(self):
        self.race = True
        with self.assertRaisesRegex(ValueError, "Concurrent secret change"): self.run_apply()
        self.assertEqual([], self.writes)

    def test_provider_image_and_revision_drift_are_detected(self):
        before = self.inventory()
        for field in ["image", "latest", "provider"]:
            after = copy.deepcopy(before)
            if field == "image": after[preserve.APP]["properties"]["template"]["containers"][0]["image"] = "new"
            elif field == "latest": after[preserve.APP]["properties"]["latestRevisionName"] = "new"
            else: after[preserve.APP]["properties"]["template"]["containers"][0]["env"][-1]["value"] = "true"
            with self.assertRaisesRegex(ValueError, "runtime changed"): preserve.unchanged(before, after)

    def test_version_urls_cannot_leave_current_vault_or_name(self):
        for url in [preserve.PREFIX + "other/" + "a" * 32, preserve.PREFIX + "craves-integration-bank-internal-preserved-v1", "https://other.vault.azure.net/secrets/x/" + "a" * 32]:
            with self.assertRaises(ValueError): preserve.pinned(url, "bank-internal")


if __name__ == "__main__": unittest.main()
