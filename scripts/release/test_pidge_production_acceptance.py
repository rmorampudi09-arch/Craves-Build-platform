import importlib.util
import pathlib
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("pidge_acceptance", pathlib.Path(__file__).with_name("pidge-production-acceptance.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CanaryTest(unittest.TestCase):
    def setUp(self):
        self.client = module.Acceptance.__new__(module.Acceptance)
        self.client.env = {"PIDGE_CHANNEL": {"value": "Craves Hyperlocal"}}
        self.sql_calls = []
        self.calls = []
        self.callback_count = 1
        self.initial_status = "pending"
        self.uncertain = False
        self.client.sql = self.sql
        self.client.vendor = self.vendor
        stop = {"contactPhone": "+919876543210", "contactName": "Test fixture",
                "address": "Fixture only", "city": "Hyderabad", "state": "Telangana",
                "postalCode": "500001", "latitude": 17.4, "longitude": 78.4}
        self.route = {"pickup": stop, "dropoff": stop, "declaredGoodsValue": 100,
                      "totalWeightGrams": 500, "items": [{"itemName": "Fixture meal", "unitPrice": 100, "quantity": 1}]}

    def sql(self, query):
        self.sql_calls.append(query)
        if query.startswith("INSERT"):
            return query.split("VALUES ('", 1)[1].split("'", 1)[0]
        if query.startswith("SELECT count"):
            return str(self.callback_count)
        return ""

    def vendor(self, path, body=None):
        self.calls.append(path)
        if path == "/order":
            if self.uncertain:
                raise TimeoutError("Response lost")
            return {"data": {body["trips"][0]["source_order_id"]: "canary-123"}}
        if path == "/canary-123/cancel":
            return {"data": "Order Cancelled"}
        if path == "/order/canary-123":
            return {"data": {"id": "canary-123", "status": "cancelled" if "/canary-123/cancel" in self.calls else self.initial_status}}
        self.fail("Unexpected provider call: " + path)

    def test_authenticated_canary_is_cancelled_without_dispatch(self):
        self.client.callback_canary(self.route)
        self.assertEqual(["/order", "/order/canary-123", "/canary-123/cancel", "/order/canary-123"], self.calls)
        self.assertTrue(any("state='CANCELLED'" in q for q in self.sql_calls))

    def test_unexpected_auto_allocation_is_cancelled_and_blocks_activation(self):
        self.initial_status = "fulfilled"
        with self.assertRaisesRegex(AssertionError, "auto-allocation"):
            self.client.callback_canary(self.route)
        self.assertIn("/canary-123/cancel", self.calls)

    def test_lost_create_response_is_not_retried(self):
        self.uncertain = True
        with self.assertRaises(TimeoutError):
            self.client.callback_canary(self.route)
        self.assertEqual(["/order"], self.calls)
        self.assertEqual(1, len(self.sql_calls))

    def test_missing_provider_callback_blocks_activation_after_cancellation(self):
        self.callback_count = 0
        with patch.object(module.time, "sleep"), self.assertRaisesRegex(RuntimeError, "callback"):
            self.client.callback_canary(self.route)
        self.assertIn("/canary-123/cancel", self.calls)
        self.assertTrue(any("state='CANCELLED'" in q for q in self.sql_calls))


if __name__ == "__main__":
    unittest.main()
