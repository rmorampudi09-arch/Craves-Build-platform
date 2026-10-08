import copy
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("release", Path(__file__).resolve().parents[1] / "active_address_release.py")
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)


class ActiveReleaseTests(unittest.TestCase):
    def setUp(self):
        self.before = {"identity": {"type": "SystemAssigned"}, "properties": {
            "configuration": {"secrets": [{"name": "existing", "keyVaultUrl": "https://existing.vault.azure.net/secrets/existing"}]},
            "template": {"scale": {"minReplicas": 1, "maxReplicas": 1}, "containers": [{
                "name": "web", "image": "previous", "env": [
                    {"name": "CRAVES_BUILD_SHA", "value": "a" * 40},
                    {"name": "NEXT_PUBLIC_RAZORPAY_MODE", "value": "production"},
                    {"name": "EXISTING_SECRET", "secretRef": "existing"}]}]}}}

    def candidate(self):
        value = copy.deepcopy(self.before)
        container = value["properties"]["template"]["containers"][0]
        container["image"] = "reviewed-image"
        container["env"][0]["value"] = "b" * 40
        return value

    def test_only_image_and_source_sha_can_change(self):
        release.web_guard(self.before, self.candidate(), "reviewed-image", "b" * 40)

    def test_payment_or_secret_or_scale_drift_stops_release_and_recovery(self):
        for field in ("payment", "secret", "scale", "identity"):
            value = self.candidate()
            if field == "payment":
                value["properties"]["template"]["containers"][0]["env"][1]["value"] = "sandbox"
            elif field == "secret":
                value["properties"]["template"]["containers"][0]["env"][2]["secretRef"] = "other"
            elif field == "scale":
                value["properties"]["template"]["scale"]["maxReplicas"] = 2
            else:
                value["identity"]["type"] = "None"
            with self.subTest(field=field), self.assertRaises(ValueError):
                release.web_guard(self.before, value, "reviewed-image", "b" * 40)

    def test_concurrent_source_or_image_change_is_blocked(self):
        with self.assertRaises(ValueError):
            release.web_guard(self.before, self.candidate(), "unrelated", "b" * 40)
        with self.assertRaises(ValueError):
            release.web_guard(self.before, self.candidate(), "reviewed-image", "c" * 40)

    def test_web_cannot_precede_v13(self):
        report = {"account": {"subscriptionId": release.SUBSCRIPTION},
                  "database": {"compatible": True, "v13": "PENDING"}}
        with self.assertRaisesRegex(ValueError, "V13 first"):
            release.require_database(report, applied=True)
        release.require_database(report)

    def test_web_waits_for_matching_v14_when_release_contains_onboarding(self):
        report = {"account": {"subscriptionId": release.SUBSCRIPTION},
                  "database": {"compatible": True, "v13": "APPLIED_MATCHING", "v14": "PENDING"}}
        release.require_database(report)
        with self.assertRaisesRegex(ValueError, "V14 first"):
            release.require_database(report, applied=True)
        report["database"]["v14"] = "APPLIED_MATCHING"
        release.require_database(report, applied=True)

    def test_web_waits_for_matching_v15_when_release_contains_selected_proof(self):
        report = {"account": {"subscriptionId": release.SUBSCRIPTION},
                  "database": {"compatible": True, "v13": "APPLIED_MATCHING", "v14": "APPLIED_MATCHING", "v15": "PENDING"}}
        with self.assertRaisesRegex(ValueError, "V15 first"):
            release.require_database(report, applied=True)
        report["database"]["v15"] = "APPLIED_MATCHING"
        release.require_database(report, applied=True)

    def test_confirmation_is_checked_before_any_azure_access(self):
        for operation in ("backend", "apim", "web"):
            with self.subTest(operation=operation), patch.object(release, "azure") as azure:
                with self.assertRaisesRegex(ValueError, "confirmation"):
                    release.execute(SimpleNamespace(operation=operation, confirm=False))
                azure.assert_not_called()

    def test_unrelated_registry_cannot_be_selected(self):
        with patch.object(release, "azure") as azure:
            with self.assertRaisesRegex(ValueError, "registry"):
                release.resolve_image("oldregistry.azurecr.io/craves/customer-web-next:old")
            azure.assert_not_called()


if __name__ == "__main__":
    unittest.main()
