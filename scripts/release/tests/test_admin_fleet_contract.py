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
            if method in ("post", "put", "delete"):
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

    def test_expiring_documents_need_an_expiry_to_be_approved(self):
        schemas = self.spec["components"]["schemas"]
        self.assertIn("PUC", schemas["RiderDocument"]["properties"]["type"]["enum"])
        approve = self.spec["paths"]["/api/v1/admin/fleet/riders/{riderId}/documents/{documentId}/approve"]["post"]
        self.assertFalse(approve["requestBody"]["required"])
        body = approve["requestBody"]["content"]["application/json"]["schema"]
        self.assertEqual(body["properties"], {"expiresOn": {"type": "string", "format": "date", "description": "Expiry date printed on the document."}})
        self.assertIn("EXPIRY_REQUIRED", approve["responses"]["422"]["description"])
        for document_type in ("DRIVING_LICENCE", "VEHICLE_RC", "VEHICLE_INSURANCE", "PUC"):
            self.assertIn(document_type, approve["description"])

    def test_the_full_registration_number_is_write_only(self):
        schemas = self.spec["components"]["schemas"]
        self.assertEqual(set(schemas["RiderVehicleInput"]["required"]), {"label", "regNumber"})
        self.assertTrue(schemas["RiderVehicleInput"]["properties"]["regNumber"]["writeOnly"])
        self.assertEqual(set(schemas["RiderVehicle"]["properties"]), {"label", "regNumberMasked"})
        put = self.spec["paths"]["/api/v1/admin/fleet/riders/{riderId}/vehicle"]["put"]
        self.assertEqual(put["responses"]["200"]["content"]["application/json"]["schema"], {"$ref": "#/components/schemas/RiderVehicle"})

    def test_vehicle_slots_and_banner_writes_are_operations_only(self):
        paths = self.spec["paths"]
        writes = {
            ("/api/v1/admin/fleet/riders/{riderId}/vehicle", "put"), ("/api/v1/admin/fleet/slots", "post"),
            ("/api/v1/admin/fleet/slots/{slotId}/cancel", "post"), ("/api/v1/admin/fleet/banner", "put"),
            ("/api/v1/admin/fleet/banner", "delete"),
        }
        for path, method in writes:
            self.assertEqual(set(paths[path][method]["x-roles"]), {"PLATFORM_ADMIN", "OPERATIONS_ADMIN"}, f"{method} {path}")
        reads = set(paths["/api/v1/admin/fleet/trips"]["get"]["x-roles"])
        for path in ("/api/v1/admin/fleet/slots", "/api/v1/admin/fleet/banner"):
            self.assertEqual(set(paths[path]["get"]["x-roles"]), reads, path)

    def test_slot_rules(self):
        schemas = self.spec["components"]["schemas"]
        slot = schemas["Slot"]
        self.assertEqual(set(slot["required"]), {"slotId", "riderId", "riderName", "zoneName", "startsAt", "endsAt", "guaranteedPerHourPaise", "status"})
        self.assertEqual(slot["properties"]["status"]["enum"], ["BOOKED", "CANCELLED", "COMPLETED"])
        self.assertTrue({"onlineInZoneMinutes", "topUpPaise"} <= set(slot["properties"]))
        self.assertEqual(set(schemas["SlotInput"]["required"]), {"riderId", "zoneName", "startsAt", "endsAt", "guaranteedPerHourPaise"})
        create = self.spec["paths"]["/api/v1/admin/fleet/slots"]["post"]
        self.assertIn("SLOT_OVERLAP", create["responses"]["409"]["description"])
        self.assertIn("GUARANTEE_OUT_OF_RANGE", create["responses"]["422"]["description"])
        self.assertIn("SLOT_END_NOT_AFTER_START", create["responses"]["422"]["description"])
        listing = {param["name"]: param for param in self.spec["paths"]["/api/v1/admin/fleet/slots"]["get"]["parameters"]}
        self.assertEqual(set(listing), {"from", "to", "riderId"})
        cancel = self.spec["paths"]["/api/v1/admin/fleet/slots/{slotId}/cancel"]["post"]
        self.assertEqual(cancel["requestBody"], {"$ref": "#/components/requestBodies/Reason"})

    def test_banner_is_short_and_can_be_absent(self):
        banner = self.spec["components"]["schemas"]["ZoneBanner"]
        self.assertEqual(banner["properties"]["tone"]["enum"], ["info", "warning"])
        self.assertEqual(banner["properties"]["text"]["maxLength"], 160)
        self.assertEqual(set(banner["required"]), {"tone", "text", "until"})
        item = self.spec["paths"]["/api/v1/admin/fleet/banner"]
        self.assertTrue({"200", "204"} <= set(item["get"]["responses"]))
        self.assertIn("204", item["delete"]["responses"])
        self.assertNotIn("requestBody", item["delete"])


if __name__ == "__main__":
    unittest.main()
