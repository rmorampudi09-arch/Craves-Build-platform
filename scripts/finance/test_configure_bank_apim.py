import copy
import json
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlsplit
import configure_bank_apim as release
from test_configure_bank_runtime import app

def formatted_policy(value):
    root = ET.fromstring(value)
    for node in root.iter():
        attributes = list(node.attrib.items())
        node.attrib.clear()
        node.attrib.update(reversed(attributes))
    ET.indent(root)
    return ET.tostring(root, encoding="unicode", short_empty_elements=False).replace("&quot;", "&#34;")


class ApimFixture:
    """In-memory ARM state; no HTTP or CLI execution is possible in these tests."""
    def __init__(self, existing=False, fault=None):
        self.backend = release.origin(app())
        self.apis = {}
        self.events = []
        self.policy_submissions = []
        self.fault = fault
        if existing:
            for api_id, path in release.ROUTES.items():
                self.apis[api_id] = {
                    "name": api_id,
                    "properties": {"path": path, "description": release.OWNER,
                                   "serviceUrl": self.backend, "protocols": ["https"],
                                   "subscriptionRequired": False},
                    "operations": {"bank-" + method.lower(): {
                        "name": "bank-" + method.lower(),
                        "properties": {"method": method, "urlTemplate": "/"}}
                        for method in ("GET", "POST")},
                    "policies": [{"properties": {"value": formatted_policy(release.policy_text(self.backend, path))}}],
                }

    def az(self, *args, **kwargs):
        if args[:2] == ("account", "show"): return "test-subscription"
        if args[:2] == ("apim", "show"): return {"gatewayUrl": "https://test.azure-api.net"}
        if args[:2] == ("containerapp", "show"): return app()
        if args[:3] == ("rest", "--method", "get"):
            if "Accept=application/json" not in args:
                raise AssertionError("Management resource reads must request JSON")
            api_id = urlsplit(args[args.index("--url") + 1]).path.split("/apis/")[1]
            self.events.append(("read-api", api_id))
            value = copy.deepcopy(self.apis[api_id])
            if self.fault == "backend": value["properties"]["serviceUrl"] = "https://wrong.invalid"
            if self.fault == "owner": value["properties"]["description"] = "foreign"
            return value
        raise AssertionError("Unexpected Azure command")

    def pages(self, target):
        path = urlsplit(target).path
        if path.endswith("/apis"):
            return copy.deepcopy(list(self.apis.values()))
        if "/apis/" not in path: return []
        api_id, suffix = path.split("/apis/")[1].split("/", 1)
        self.events.append(("read-" + suffix, api_id))
        value = self.apis[api_id]
        if suffix == "policies": return copy.deepcopy(value["policies"])
        if suffix == "operations": return copy.deepcopy(list(value["operations"].values()))
        if suffix.endswith("/policies") and self.fault == "operation-policy":
            return [{"properties": {"value": "<policies><inbound><return-response /></inbound></policies>"}}]
        return []

    def put(self, target, body, create=False):
        path = urlsplit(target).path.split("/apis/")[1].split("/")
        api_id = path[0]
        properties = copy.deepcopy(body["properties"])
        if len(path) == 1:
            self.events.append(("create-api" if create else "publish-api", api_id))
            if create:
                self.apis[api_id] = {"name": api_id, "properties": properties, "operations": {}, "policies": []}
            elif self.fault != "subscription-not-saved":
                self.apis[api_id]["properties"] = properties
        elif path[1] == "operations":
            self.events.append(("write-operation", api_id))
            if self.fault == "missing-operation" and path[2] == "bank-post": return
            if self.fault == "operation-path": properties["urlTemplate"] = "/wrong"
            self.apis[api_id]["operations"][path[2]] = {"name": path[2], "properties": properties}
        elif path[1] == "policies":
            self.events.append(("write-policy", api_id))
            self.policy_submissions.append(copy.deepcopy(properties))
            properties["value"] = formatted_policy(properties["value"])
            if self.fault == "policy": properties["value"] = properties["value"].replace("no-store", "public")
            if self.fault == "malformed-policy": properties["value"] = "<policies>"
            if self.fault == "double-encoded-condition": properties["value"] = properties["value"].replace("&#34;", "&amp;quot;")
            self.apis[api_id]["policies"] = [{"properties": properties}]
        else:
            raise AssertionError("Unexpected resource write")

    def run(self, apply=True):
        with tempfile.TemporaryDirectory() as folder, patch.object(release, "az", side_effect=self.az), \
             patch.object(release, "pages", side_effect=self.pages), patch.object(release, "put", side_effect=self.put), \
             patch.object(release, "protected_status", side_effect=lambda target: self.events.append(("probe", target))), \
             patch.object(release.subprocess, "check_output", return_value="a" * 40):
            args = ["--output", str(Path(folder) / "plan.json")]
            if apply: args += ["--apply", "--expected-source-sha", "a" * 40]
            return release.main(args)


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

    def test_xml_formatting_is_equivalent_without_changing_meaning(self):
        policy = release.policy_text("https://service.azurecontainerapps.io", "api/v1/chef-onboarding/bank")
        self.assertEqual(release.policy_structure(policy), release.policy_structure(formatted_policy(policy)))

    def test_xml_semantic_changes_are_not_equivalent(self):
        policy = release.policy_text("https://service.azurecontainerapps.io", "api/v1/chef-onboarding/bank")
        changes = [policy.replace("no-store", "public"), policy.replace("no-store", " no-store "),
                   policy.replace("Bearer ", "Basic "), policy.replace("https://service", "https://wrong"),
                   policy.replace("api/v1/chef-onboarding/bank", "internal/v1/finance/events"),
                   policy.replace('copy-unmatched-params="false"', 'copy-unmatched-params="true"'),
                   policy.replace("<inbound>", "<inbound><trace />"),
                   policy.replace("&quot;", "&amp;quot;")]
        reordered = ET.fromstring(policy)
        inbound = reordered.find("inbound")
        first = inbound[0]; inbound.remove(first); inbound.append(first)
        changes.append(ET.tostring(reordered, encoding="unicode"))
        for changed in changes:
            with self.subTest(changed=changed):
                self.assertNotEqual(release.policy_structure(policy), release.policy_structure(changed))

    def test_invalid_or_wrong_root_policy_is_rejected(self):
        for policy in (None, "", "<policies>", "<unexpected />"):
            with self.subTest(policy=policy), self.assertRaises(release.GuardError):
                release.policy_structure(policy)

    def test_put_uses_json_header_suppresses_response_and_retains_create_guard(self):
        body = {"properties": {"format": "xml", "value": "<policies />"}}
        paths = []
        def fake(*args, **kwargs):
            self.assertEqual("none", kwargs["output"])
            self.assertIn("Content-Type=application/json", args)
            path = Path(args[args.index("--body") + 1].removeprefix("@")); paths.append(path)
            self.assertEqual(body, json.loads(path.read_text()))
        with patch.object(release, "az", side_effect=fake) as cloud:
            release.put("https://management.azure.com/resource", body, create=True)
            self.assertIn("If-None-Match=*", cloud.call_args.args)
            release.put("https://management.azure.com/resource", body)
            self.assertNotIn("If-None-Match=*", cloud.call_args.args)
        self.assertTrue(all(not path.exists() for path in paths))

    def test_policy_submission_uses_xml_mode_for_encoded_expression_attributes(self):
        fixture = ApimFixture()
        self.assertEqual(0, fixture.run())
        self.assertEqual(len(release.ROUTES), len(fixture.policy_submissions))
        for properties in fixture.policy_submissions:
            self.assertEqual("xml", properties["format"])
            self.assertIn("&quot;Authorization&quot;", properties["value"])
            condition = ET.fromstring(properties["value"]).find("./inbound/choose/when").get("condition")
            self.assertIn('"Authorization"', condition)
            self.assertNotIn("&quot;", condition)

    def test_management_collection_reads_request_json(self):
        with patch.object(release, "az", return_value={"value": []}) as cloud:
            self.assertEqual([], release.pages("https://management.azure.com/resource/policies"))
            self.assertIn("Accept=application/json", cloud.call_args.args)

    def test_apply_requires_readbacks_before_publication_and_after_removing_subscription_gate(self):
        fixture = ApimFixture()
        self.assertEqual(0, fixture.run())
        self.assertEqual(set(release.ROUTES), set(fixture.apis))
        for api_id in release.ROUTES:
            publication = fixture.events.index(("publish-api", api_id))
            for kind in ("read-policies", "read-operations", "read-api",
                         "read-operations/bank-get/policies", "read-operations/bank-post/policies"):
                self.assertIn((kind, api_id), fixture.events[:publication])
            self.assertIn(("read-api", api_id), fixture.events[publication + 1:])
            self.assertFalse(fixture.apis[api_id]["properties"]["subscriptionRequired"])

    def test_owned_formatted_policy_is_idempotent_in_plan_and_apply(self):
        for apply in (False, True):
            fixture = ApimFixture(existing=True)
            self.assertEqual(0, fixture.run(apply=apply))
            self.assertFalse(any(kind.startswith(("write-", "create-", "publish-")) for kind, _ in fixture.events))

    def test_readback_failures_do_not_remove_subscription_protection(self):
        for fault in ("policy", "malformed-policy", "double-encoded-condition", "missing-operation", "operation-path",
                      "operation-policy", "backend", "owner"):
            with self.subTest(fault=fault):
                fixture = ApimFixture(fault=fault)
                with self.assertRaises(release.GuardError): fixture.run()
                self.assertFalse(any(kind == "publish-api" for kind, _ in fixture.events))
                self.assertTrue(all(value["properties"]["subscriptionRequired"] for value in fixture.apis.values()))
                self.assertFalse(any(kind == "probe" and "azure-api.net" in target for kind, target in fixture.events))

    def test_ignored_subscription_update_does_not_report_a_successful_release(self):
        fixture = ApimFixture(fault="subscription-not-saved")
        with self.assertRaises(release.GuardError): fixture.run()
        self.assertTrue(any(kind == "publish-api" for kind, _ in fixture.events))
        self.assertFalse(any(kind == "probe" and "azure-api.net" in target for kind, target in fixture.events))
        self.assertTrue(all(value["properties"]["subscriptionRequired"] for value in fixture.apis.values()))

if __name__ == "__main__": unittest.main()
