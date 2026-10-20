"""Checks contracts/openapi/admin-fleet-v1.yaml keeps the ops console rules.

Run: python -m unittest discover -s scripts/release/tests -p test_admin_fleet_contract.py -v
"""
import pathlib
import unittest

import yaml

CONTRACT = pathlib.Path(__file__).resolve().parents[3] / "contracts/openapi/admin-fleet-v1.yaml"
# auth-service InternalAdminRoles; the legacy ADMIN role must never appear.
INTERNAL_ROLES = {
    "PLATFORM_ADMIN", "SUPPORT_ADMIN", "PAYMENTS_ADMIN", "OPERATIONS_ADMIN", "CHEF_ADMIN",
    "COMPLIANCE_ADMIN", "SUBSCRIPTION_ADMIN", "NOTIFICATION_ADMIN", "AUDIT_ADMIN",
}


def walk(node):
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from walk(value)
    elif isinstance(node, list):
        for value in node:
            yield from walk(value)


class AdminFleetContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec = yaml.safe_load(CONTRACT.read_text(encoding="utf-8"))
        cls.operations = [
            (path, method, op)
            for path, item in cls.spec["paths"].items()
            for method, op in item.items()
        ]

    def test_is_openapi_303_under_the_admin_fleet_prefix(self):
        self.assertEqual(self.spec["openapi"], "3.0.3")
        for path, _, _ in self.operations:
            self.assertTrue(path.startswith("/api/v1/admin/fleet/"), path)

    def test_every_operation_names_scoped_roles_only(self):
        for path, method, op in self.operations:
            roles = set(op.get("x-roles", []))
            self.assertTrue(roles, f"{method} {path} has no roles")
            self.assertLessEqual(roles, INTERNAL_ROLES, f"{method} {path}")
            self.assertIn("PLATFORM_ADMIN", roles, f"{method} {path}")
            self.assertIn("403", op["responses"], f"{method} {path}")

    def test_every_mutation_takes_an_idempotency_key(self):
        key = {"$ref": "#/components/parameters/IdempotencyKey"}
        for path, method, op in self.operations:
            if method in ("post", "put"):
                self.assertIn(key, op.get("parameters", []), f"{method} {path}")
        self.assertEqual(self.spec["components"]["parameters"]["IdempotencyKey"]["name"], "Idempotency-Key")

    def test_every_reference_resolves(self):
        for node in walk(self.spec):
            ref = node.get("$ref")
            if ref is None:
                continue
            target = self.spec
            for part in ref.removeprefix("#/").split("/"):
                self.assertIn(part, target, ref)
                target = target[part]

    def test_errors_are_code_and_message(self):
        self.assertEqual(set(self.spec["components"]["schemas"]["Error"]["required"]), {"code", "message"})

    def test_money_is_integer_paise(self):
        for node in walk(self.spec):
            for name, field in (node.get("properties") or {}).items():
                if name.lower().endswith("paise"):
                    self.assertEqual(field["type"], "integer", name)
                self.assertNotIn("rupees", name.lower())

    def test_due_process_and_privacy_rules(self):
        schemas = self.spec["components"]["schemas"]
        self.assertEqual(schemas["StatusEventKind"]["enum"], ["SAFETY_PAUSE", "NOTICE", "RESTORE", "DEACTIVATE"])
        self.assertTrue({"reason", "evidenceSummary", "kind"} <= set(schemas["StatusEventInput"]["required"]))
        self.assertIn("approverName", schemas["StatusEvent"]["required"])
        self.assertNotIn("AADHAAR", " ".join(schemas["RiderDocument"]["properties"]["type"]["enum"]))
        approve = self.spec["paths"]["/api/v1/admin/fleet/payout-batches/{batchId}/approve"]["post"]
        self.assertIn("SAME_APPROVER", approve["responses"]["403"]["description"])
        self.assertIn("createdByMe", schemas["PayoutBatchSummary"]["required"])

    def test_payments_admins_can_open_the_rider_whose_payout_account_they_set(self):
        paths = self.spec["paths"]
        setters = set(paths["/api/v1/admin/fleet/riders/{riderId}/payout-account"]["put"]["x-roles"])
        for path in ("/api/v1/admin/fleet/riders", "/api/v1/admin/fleet/riders/{riderId}"):
            self.assertLessEqual(setters, set(paths[path]["get"]["x-roles"]), path)


if __name__ == "__main__":
    unittest.main()
