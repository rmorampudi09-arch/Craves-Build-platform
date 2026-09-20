import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('auth_gateway', Path(__file__).parents[1] / 'inspect-auth-gateway.py')
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)


def rows(inbound):
    return [{'properties': {'value': '<policies><inbound>' + inbound + '</inbound><backend><base/></backend></policies>', 'format': 'rawxml'}}]


class AuthGatewayInventoryTest(unittest.TestCase):
    def test_numeric_limit_reported_without_key_expression(self):
        result = m.describe('scope', rows('<base/><rate-limit-by-key calls="120" renewal-period="60" counter-key="PRIVATE_VALUE"/>'))
        self.assertEqual(120, result['unconditionalRateLimits'][0]['calls'])
        self.assertTrue(result['inheritsInbound'])
        self.assertNotIn('PRIVATE', json.dumps(result))

    def test_conditional_limit_is_not_unconditional(self):
        result = m.describe('scope', rows('<choose><when condition="PRIVATE"><rate-limit calls="10" renewal-period="60"/></when></choose>'))
        self.assertEqual(1, result['conditionalRateLimitCount'])
        self.assertEqual([], result['unconditionalRateLimits'])

    def test_no_policy_inherits_but_present_policy_without_base_does_not(self):
        self.assertTrue(m.describe('scope', [])['inheritsInbound'])
        self.assertFalse(m.describe('scope', rows(''))['inheritsInbound'])

    def test_unknown_limit_expression_is_withheld(self):
        result = m.describe('scope', rows('<rate-limit calls="PRIVATE" renewal-period="0"/>'))
        self.assertIsNone(result['unconditionalRateLimits'][0]['calls'])
        self.assertIsNone(result['unconditionalRateLimits'][0]['renewal-period'])
        self.assertNotIn('PRIVATE', json.dumps(result))

    def test_unsupported_xml_is_rejected(self):
        with self.assertRaises(ValueError):
            m.describe('scope', [{'properties': {'value': '<!DOCTYPE policies><policies><inbound/></policies>'}}])

    def test_unique_routes_required(self):
        with patch.object(m.gateway, 'read', side_effect=[[], [], []]):
            with self.assertRaises(ValueError): m.capture()

    def test_parent_limit_only_counts_when_inherited_and_no_data_leaks(self):
        ops = [{'name': 'exchange', 'properties': {'method': 'POST', 'urlTemplate': '/firebase/exchange'}},
               {'name': 'refresh', 'properties': {'method': 'POST', 'urlTemplate': '/refresh'}}]
        mapping = {'/policies': rows('<rate-limit calls="120" renewal-period="60"/>'),
                   m.API + '/policies': rows('<base/>'), m.API + '/operations': ops,
                   m.API + '/operations/exchange/policies': rows('<base/>'),
                   m.API + '/operations/refresh/policies': rows('<set-header name="PRIVATE"/>')}
        with patch.object(m.gateway, 'read', side_effect=lambda scope: mapping[scope]):
            result = m.capture()
        self.assertEqual([True, False], [r['unconditionalBoundedLimitPresent'] for r in result['routes']])
        self.assertFalse(result['effectiveGatewayProtectionAccepted'])
        self.assertNotIn('PRIVATE', json.dumps(result))

    def test_drift_stops(self):
        ops = [{'name': x, 'properties': {'method': 'POST', 'urlTemplate': path}}
               for x, path in [('exchange', '/firebase/exchange'), ('refresh', '/refresh')]]
        with patch.object(m.gateway, 'read', side_effect=[[], [], ops, [], [], rows('<base/>')]):
            with self.assertRaisesRegex(ValueError, 'changed'): m.capture()


if __name__ == '__main__': unittest.main()
