import json
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch
import configure_bank_apim as release
from test_configure_bank_runtime import app

class BankApiGuardTest(unittest.TestCase):
    def test_policy_requires_bearer_and_retains_backend_auth_and_inherited_controls(self):
        text = release.policy_text("https://service.azurecontainerapps.io", "api/v1/chef-onboarding/bank")
        root = ET.fromstring(text)
        self.assertEqual("401", root.find("./inbound/choose/when/return-response/set-status").get("code"))
        self.assertIn("Bearer ", text); self.assertIsNotNone(root.find("./inbound/base"))
        self.assertEqual("no-store", root.find("./outbound/set-header/value").text)
        self.assertEqual("/api/v1/chef-onboarding/bank", root.find("./inbound/rewrite-uri").get("template"))
    def test_no_private_financial_or_identity_routes_are_published(self):
        self.assertEqual(2, len(release.ROUTES))
        self.assertTrue(all(path.startswith("api/v1/") and "internal" not in path for path in release.ROUTES.values()))
    def test_body_logging_blocks_publication(self):
        with self.assertRaises(release.GuardError):
            release.privacy_guard([], [{"properties": {"frontend": {"request": {"body": {"bytes": 1024}}}}}])
    def test_credential_header_logging_blocks_publication(self):
        with self.assertRaises(release.GuardError):
            release.privacy_guard([], [{"properties": {"backend": {"request": {"headers": ["Authorization"]}}}}])
    def test_inherited_custom_body_or_fragment_logging_blocks_publication(self):
        for text in ['<policies><trace /></policies>', '<policies><include-fragment fragment-id="unknown" /></policies>',
                     '<policies><set-body>@(context.Request.Body.As&lt;string&gt;())</set-body></policies>']:
            with self.subTest(text=text), self.assertRaises(release.GuardError):
                release.privacy_guard([{"properties": {"value": text}}], [])
    def test_inherited_backend_id_is_not_silently_overridden(self):
        with self.assertRaises(release.GuardError):
            release.privacy_guard([{"properties": {"value": '<policies><set-backend-service backend-id="existing" /></policies>'}}], [])
    def test_safe_inheritance_is_preserved(self):
        release.privacy_guard([{"properties": {"value": '<policies><inbound><base /></inbound></policies>'}}],
            [{"properties": {"frontend": {"request": {"body": {"bytes": 0}, "headers": []}}}}])
    def test_foreign_route_cannot_be_overwritten(self):
        with self.assertRaises(release.GuardError):
            release.check_existing([{"name": "foreign", "properties": {"path": "api/v1/chef-onboarding/bank"}}],
                                   "craves-bank-enrollment-v1", "api/v1/chef-onboarding/bank")
    def test_owned_route_can_be_reused_without_new_api(self):
        existing = {"name": "craves-bank-enrollment-v1", "properties": {"path": "api/v1/chef-onboarding/bank", "description": release.OWNER}}
        self.assertEqual(existing, release.check_existing([existing], existing["name"], existing["properties"]["path"]))
    def test_management_pagination_never_follows_an_external_host(self):
        with patch.object(release, "az") as cloud:
            with self.assertRaises(release.GuardError): release.pages("https://attacker.invalid/?token=x")
            cloud.assert_not_called()
    def test_wrong_release_sha_is_rejected_before_any_cloud_operation(self):
        with patch.object(release.subprocess, "check_output", return_value="a" * 40), patch.object(release, "az") as cloud:
            with self.assertRaises(release.GuardError): release.main(["--apply", "--expected-source-sha", "b" * 40])
            cloud.assert_not_called()
    def test_default_plan_does_not_create_routes_or_make_provider_calls(self):
        def fake(*args):
            if args[:2] == ("account", "show"): return "test-subscription"
            if args[:2] == ("apim", "show"): return {"gatewayUrl": "https://test.azure-api.net"}
            if args[:2] == ("containerapp", "show"): return app()
            raise AssertionError(args[:2])
        with tempfile.TemporaryDirectory() as folder, patch.object(release, "az", side_effect=fake), \
             patch.object(release, "pages", return_value=[]), patch.object(release, "put") as write, \
             patch.object(release.subprocess, "check_output", return_value="a" * 40):
            output = Path(folder) / "plan.json"
            self.assertEqual(0, release.main(["--output", str(output)]))
            self.assertEqual("PLAN_ONLY", json.loads(output.read_text())["mode"])
            write.assert_not_called()

if __name__ == "__main__": unittest.main()
