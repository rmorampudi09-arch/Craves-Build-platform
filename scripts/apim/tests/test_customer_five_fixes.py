import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

spec = importlib.util.spec_from_file_location('fixes', Path(__file__).resolve().parents[1] / 'customer-five-fixes.py')
fixes = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixes)

class CustomerRepairTest(unittest.TestCase):
    def test_only_two_review_write_routes(self):
        self.assertEqual(fixes.WRITES, [('create-order-review', 'POST'), ('update-order-review', 'PUT')])
        self.assertEqual(fixes.PATH, '/{orderId}/review')

    def test_owned_order_destination_and_inherited_security(self):
        root = ET.fromstring(fixes.review_policy('https://order.example.invalid'))
        self.assertEqual(root.find('inbound')[0].tag, 'base')
        self.assertEqual(root.find('inbound/set-backend-service').get('base-url'), 'https://order.example.invalid/api/v1/orders')
        self.assertEqual(root.find('inbound/rewrite-uri').get('template'), fixes.PATH)
        self.assertEqual(root.find('inbound/choose/when/return-response/set-status').get('code'), '401')
        self.assertIn('Authorization', root.find('inbound/choose/when').get('condition'))
        self.assertIn('no-store', root.find('outbound/set-header/value').text)

    @patch.object(fixes.safe, 'runtime')
    @patch.object(fixes.safe, 'az', return_value={'id':'another-subscription'})
    def test_wrong_subscription_stops_before_runtime(self, az, runtime):
        with self.assertRaisesRegex(RuntimeError, 'Wrong subscription'):
            fixes.main(True)
        runtime.assert_not_called()

    @patch.object(fixes.safe, 'rest')
    @patch.object(fixes.safe, 'read_policies')
    @patch.object(fixes.safe, 'runtime', return_value='https://order.example.invalid')
    @patch.object(fixes.safe, 'az', side_effect=[{'id':fixes.safe.SUB}, []])
    def test_missing_owner_never_writes(self, az, runtime, policies, rest):
        with self.assertRaisesRegex(RuntimeError, 'ownership ambiguous'):
            fixes.main(True)
        rest.assert_not_called()

if __name__ == '__main__':
    unittest.main()
