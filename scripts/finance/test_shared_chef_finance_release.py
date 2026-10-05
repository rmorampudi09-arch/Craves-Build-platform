import copy
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("shared_finance_release", Path(__file__).with_name("shared_chef_finance_release.py"))
release = importlib.util.module_from_spec(spec); spec.loader.exec_module(release)


def app(name="test"):
    return {"name": name, "identity": {"type": "SystemAssigned"}, "tags": {}, "properties": {
        "configuration": {"activeRevisionsMode": "Single", "ingress": {"fqdn": name + ".test.azurecontainerapps.io", "traffic": [{"weight": 100}]}},
        "template": {"revisionSuffix": "old", "scale": {"maxReplicas": 1}, "containers": [{"image": release.LOGIN + "/craves/test:old",
            "env": [{"name": "CRAVES_BANK_INTERNAL_KEY", "secretRef": "bank-internal"}]}]}}}


class SharedFinanceReleaseTests(unittest.TestCase):
    def test_image_only_change_preserves_runtime_signature(self):
        before = app(); after = copy.deepcopy(before)
        after["properties"]["template"]["containers"][0]["image"] = release.LOGIN + "/craves/test:new"
        after["properties"]["template"]["revisionSuffix"] = "new"
        after["properties"]["configuration"]["ingress"]["traffic"][0]["weight"] = 0
        self.assertEqual(release.signature(before), release.signature(after))

    def test_provider_flag_and_credential_binding_changes_are_detected(self):
        before = app()
        for setting in [{"name": "CRAVES_RAZORPAYX_PRODUCTION_APPROVED", "value": "true"},
                        {"name": "CRAVES_BANK_INTERNAL_KEY", "secretRef": "replacement"}]:
            after = copy.deepcopy(before); after["properties"]["template"]["containers"][0]["env"] = [setting]
            self.assertNotEqual(release.signature(before), release.signature(after))

    def test_unrelated_app_redeployment_and_runtime_drift_stop_release(self):
        current = {"other": app("other")}
        baseline = {"apps": {"other": {"signature": release.signature(current["other"]), "image": current["other"]["properties"]["template"]["containers"][0]["image"]}}}
        release.compare_inventory(baseline, current, {})
        current["other"]["properties"]["template"]["containers"][0]["image"] += "-new"
        with self.assertRaisesRegex(ValueError, "Unexpected app image"): release.compare_inventory(baseline, current, {})

    def test_wrong_tenant_or_subscription_cannot_access_app_inventory(self):
        for account in [{"id": "old-subscription", "tenantId": release.TENANT}, {"id": release.SUB, "tenantId": "old-tenant"}]:
            with patch.object(release.active, "az", return_value=account) as azure:
                with self.assertRaisesRegex(ValueError, "Wrong active Azure"): release.inventory()
                azure.assert_called_once_with("account", "show")

    def test_empty_or_unknown_finance_history_cannot_be_deployed(self):
        with self.assertRaises(ValueError): release.validate_history([])
        with self.assertRaises(ValueError): release.validate_history([{"type": "SQL", "version": "999", "success": True, "script": "V999__unknown.sql", "checksum": 0}])

    def history(self):
        reader = release.active.history_module(); reader.REQUIRED["integration-service"] = set()
        return [{"version": version, "type": "SQL", "success": True, **row} for version, row in reader.expected("integration-service").items()]

    def test_only_final_additive_migration_may_be_pending(self):
        rows = self.history(); release.validate_history(rows)
        pending = [r for r in rows if r["version"] != "148"]; self.assertNotIn("148", release.validate_history(pending))
        with self.assertRaisesRegex(ValueError, "Only additive V148"): release.validate_history([r for r in pending if r["version"] != "146"])

    def test_changed_applied_migration_checksum_is_rejected(self):
        rows = self.history(); rows[0]["checksum"] += 1
        with self.assertRaisesRegex(ValueError, "checksum differs"): release.validate_history(rows)

    def test_wrong_vault_unpinned_signing_key_and_direct_key_are_rejected(self):
        target = app()
        for url in ["https://wrong.vault.azure.net/secrets/bank/" + "a" * 32,
                    "https://kvcravesprodlowkmqgfy.vault.azure.net/secrets/bank"]:
            with patch.object(release.active, "az", return_value=[{"name": "bank-internal", "keyVaultUrl": url, "identity": "system"}]) as azure:
                with self.assertRaisesRegex(ValueError, "pinned"): release.secret(target, "CRAVES_BANK_INTERNAL_KEY")
                self.assertEqual(1, azure.call_count)
        target["properties"]["template"]["containers"][0]["env"][0] = {"name": "CRAVES_BANK_INTERNAL_KEY", "value": "SYNTHETIC_DIRECT_KEY"}
        with patch.object(release.active, "az") as azure:
            with self.assertRaisesRegex(ValueError, "Key Vault secret reference"): release.secret(target, "CRAVES_BANK_INTERNAL_KEY")
            azure.assert_not_called()

    def test_missing_or_conflicting_common_terms_stop_before_deployment(self):
        for count in [0, 2]:
            with patch.object(release, "database", return_value={"policyReady": True, "reviewedRateCount": count}):
                with self.assertRaisesRegex(ValueError, "unanimous"): release.policy_and_terms(app())
        with patch.object(release, "database", return_value={"policyReady": False, "reviewedRateCount": 1}):
            with self.assertRaisesRegex(ValueError, "Active common finance policy"): release.policy_and_terms(app())

    def test_existing_shared_terms_allow_genuine_individual_exceptions(self):
        with patch.object(release, "database", side_effect=[{"policyReady": True, "reviewedRateCount": 2}, {"ready": True}]):
            self.assertTrue(release.policy_and_terms(app(), deployed=True)["sharedTermsReady"])

    def test_stale_main_is_rejected_before_any_azure_access(self):
        with patch.object(release, "sha", return_value="a" * 40), patch.object(release, "github", return_value={"commit": {"sha": "b" * 40}}), patch.object(release.active, "az") as azure:
            with self.assertRaisesRegex(ValueError, "Main changed"): release.evidence()
            azure.assert_not_called()

    def test_missing_or_stale_baseline_stops_before_deploy_command(self):
        with patch.object(release, "sha", return_value="a" * 40), patch.object(release.subprocess, "run") as run:
            with self.assertRaisesRegex(ValueError, "Preflight source differs"): release.deploy({"sourceSha": "b" * 40})
            run.assert_not_called()

    def test_semantic_verification_failure_rolls_back_only_this_release(self):
        baseline = {"sourceSha": "a" * 40}
        def failure(before, changed):
            changed["integration"] = "new-image"
            raise ValueError("Synthetic authority verification failure")
        with patch.object(release, "deploy_checked", side_effect=failure), patch.object(release, "rollback") as rollback:
            with self.assertRaisesRegex(ValueError, "authority verification failure"): release.deploy(baseline)
            rollback.assert_called_once_with(baseline, {"integration": "new-image"})

    def test_preflight_failure_cannot_initiate_a_rollback_mutation(self):
        with patch.object(release, "deploy_checked", side_effect=ValueError("Synthetic preflight stop")), patch.object(release, "rollback") as rollback:
            with self.assertRaisesRegex(ValueError, "preflight stop"): release.deploy({})
            rollback.assert_not_called()


if __name__ == "__main__": unittest.main()
