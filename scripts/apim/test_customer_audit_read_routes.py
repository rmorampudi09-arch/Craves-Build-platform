import importlib.util
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET

spec = importlib.util.spec_from_file_location("routes", Path(__file__).with_name("customer-audit-read-routes.py"))
routes = importlib.util.module_from_spec(spec)
spec.loader.exec_module(routes)


class RouteSafetyTests(unittest.TestCase):
    def test_all_published_operations_are_reads(self):
        for _, prefix, _, operations in routes.GROUPS:
            self.assertTrue(prefix.startswith("api/v1/"))
            self.assertNotIn("internal", prefix)
            for key, path in operations:
                self.assertEqual(routes.operation_body(key, path)["properties"]["method"], "GET")

    def test_path_parameters_are_required(self):
        for key in ("caseId", "orderId"):
            params = routes.operation_body("read", "/{" + key + "}")["properties"]["templateParameters"]
            self.assertEqual(params, [{"name": key, "type": "string", "required": True}])

    def test_policy_preserves_base_and_auth_and_no_store(self):
        xml = routes.policy("https://service.example/api/v1/orders")
        tree = ET.fromstring(xml)
        for section in ("inbound", "backend", "outbound", "on-error"):
            self.assertIsNotNone(tree.find(section + "/base"))
        self.assertIn("Authorization", xml)
        self.assertIn("Bearer ", xml)
        self.assertEqual(tree.find("inbound/choose/when/return-response/set-status").attrib["code"], "401")
        self.assertIn("no-store", xml)
        self.assertNotIn("validate-jwt", xml)  # Existing backend validates signatures and ownership.

    def test_inherited_backend_conflict_fails(self):
        with self.assertRaises(RuntimeError):
            routes.validate_policy('<policies><inbound><set-backend-service backend-id="shared" /></inbound></policies>')

    def test_conflicting_route_and_id_fail(self):
        for existing in ([{"name": "old", "method": "GET", "urlTemplate": "/mine"}],
                         [{"name": "new", "method": "GET", "urlTemplate": "/other"}]):
            with self.assertRaises(RuntimeError):
                routes.validate_operations(existing, [("new", "/mine")])

    def test_exact_idempotent_route_is_allowed(self):
        routes.validate_operations([{"name": "read", "method": "GET", "urlTemplate": "/mine"}], [("read", "/mine")])


if __name__ == "__main__":
    unittest.main()

