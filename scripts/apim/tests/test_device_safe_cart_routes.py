import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

spec = importlib.util.spec_from_file_location('routes', Path(__file__).resolve().parents[1] / 'device-safe-cart-routes.py')
routes = importlib.util.module_from_spec(spec)
spec.loader.exec_module(routes)

class SafeCartGatewayTest(unittest.TestCase):
    def test_exact_three_conditional_routes(self):
        self.assertEqual(len(routes.ROUTES), 3)
        self.assertEqual({path for _, path in routes.ROUTES}, {'/clear-if-unchanged','/switch-kitchen','/reorder-if-unchanged/{orderId}'})

    def test_policy_preserves_inherited_security_and_uses_private_cache_headers(self):
        for _, path in routes.ROUTES:
            root = ET.fromstring(routes.policy('https://orders.example.invalid', path))
            self.assertEqual(root.find('inbound')[0].tag, 'base')
            self.assertIn('Authorization', root.find('inbound/choose/when').attrib['condition'])
            self.assertEqual(root.find('inbound/choose/when/return-response/set-status').attrib['code'], '401')
            self.assertEqual(root.find('inbound/set-backend-service').attrib['base-url'], 'https://orders.example.invalid/api/v1/cart')
            self.assertEqual(root.find('inbound/rewrite-uri').attrib['template'], path)
            self.assertIn('no-store', root.find('outbound/set-header[@name="Cache-Control"]/value').text)

    def test_formatted_xml_readback_is_equivalent(self):
        xml = routes.policy('https://orders.example.invalid', '/switch-kitchen')
        root = ET.fromstring(xml)
        ET.indent(root)
        self.assertEqual(routes.canonical_policy(xml), routes.canonical_policy(ET.tostring(root)))

    def test_owned_escaped_expression_repair_is_exact_and_security_preserving(self):
        xml = routes.policy('https://orders.example.invalid', '/switch-kitchen')
        root = ET.fromstring(xml)
        condition = root.find('inbound/choose/when')
        condition.set('condition', condition.get('condition').replace('"', '&quot;'))
        self.assertTrue(routes.matches_owned_policy(ET.tostring(root), xml))
        condition.set('condition', '@(false)')
        self.assertFalse(routes.matches_owned_policy(ET.tostring(root), xml))

    def test_changed_backend_is_not_treated_as_encoding_difference(self):
        xml = routes.policy('https://orders.example.invalid', '/switch-kitchen')
        other = routes.policy('https://other.example.invalid', '/switch-kitchen')
        self.assertFalse(routes.matches_owned_policy(other, xml))

    @patch.object(routes, 'az')
    @patch.object(routes, 'http_status')
    def test_changed_image_stops_before_any_health_or_gateway_request(self, status, az):
        az.return_value = {'properties': {'latestRevisionName':'r1', 'latestReadyRevisionName':'r1', 'template':{'containers':[{'image':'another-release'}]}}}
        with self.assertRaisesRegex(RuntimeError, 'image changed'):
            routes.runtime('expected-release')
        status.assert_not_called()

    @patch.object(routes, 'az')
    def test_in_progress_rollout_stops(self, az):
        az.return_value = {'properties': {'latestRevisionName':'new', 'latestReadyRevisionName':'old'}}
        with self.assertRaisesRegex(RuntimeError, 'not fully ready'):
            routes.runtime('expected-release')

    @patch.object(routes, 'rest')
    def test_backend_id_override_is_rejected(self, rest):
        rest.return_value = {'value':[{'properties':{'value':'<policies><inbound><set-backend-service backend-id="other" /></inbound></policies>'}}]}
        with self.assertRaisesRegex(RuntimeError, 'backend-id'):
            routes.read_policies('https://management.example.invalid')

if __name__ == '__main__':
    unittest.main()
