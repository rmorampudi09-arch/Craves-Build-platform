"""The courier webhook gateway files: policy values, route table = controllers, README uses placeholders only.

Run: python3 -m unittest discover -s scripts/apim/tests -p test_courier_webhooks_apim.py -v
"""
import re
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[3]
FOLDER = ROOT / 'infra/apim/courier-webhooks'
JAVA = ROOT / 'services/integration-service/src/main/java'
WEBHOOK_PREFIX = '/api/v1/webhooks/delivery/'


def routes():
    return [line.split('|')[1:] for line in (FOLDER / 'routes.txt').read_text().splitlines() if line.startswith('route|')]


def controller_posts():
    """(method, path) of every POST handler under the courier webhook prefix, read from the Java source."""
    found = set()
    for source in JAVA.rglob('*.java'):
        text = source.read_text()
        if WEBHOOK_PREFIX not in text or '@RestController' not in text:
            continue
        base = re.search(r'@RequestMapping\(\s*(?:value\s*=\s*|path\s*=\s*)?"([^"]*)"', text)
        base = base.group(1) if base else ''
        for args in re.findall(r'@PostMapping(?:\(([^)]*)\))?', text):
            path = re.search(r'(?:^|value\s*=\s*|path\s*=\s*)"([^"]*)"', args.strip())
            found.add(('POST', base + (path.group(1) if path else '')))
    return {route for route in found if route[1].startswith(WEBHOOK_PREFIX)}


class CourierWebhookPolicyTest(unittest.TestCase):
    def setUp(self):
        self.policy = ET.parse(FOLDER / 'policy.xml').getroot()

    def test_policy_is_well_formed_and_inherits_every_section(self):
        self.assertEqual(self.policy.tag, 'policies')
        self.assertEqual([section.tag for section in self.policy], ['inbound', 'backend', 'outbound', 'on-error'])
        for section in self.policy:
            self.assertEqual(section[0].tag, 'base', section.tag)

    def test_inbound_sets_the_body_size_and_the_call_rate_and_nothing_else(self):
        inbound = self.policy.find('inbound')
        self.assertEqual([child.tag for child in inbound], ['base', 'validate-content', 'rate-limit-by-key'])
        self.assertEqual(inbound.find('validate-content').attrib, {
            'unspecified-content-type-action': 'ignore', 'max-size': '262144', 'size-exceeded-action': 'prevent'})
        self.assertEqual(inbound.find('rate-limit-by-key').attrib, {
            'calls': '300', 'renewal-period': '60', 'counter-key': '@(context.Request.IpAddress)'})

    def test_body_size_is_not_below_what_the_service_accepts(self):
        service = (JAVA / 'in/craves/integration/delivery/pidge/PidgeWebhookService.java').read_text()
        accepted = [int(n) for n in re.findall(r'raw\.length\(\)\s*>\s*(\d+)', service)]
        self.assertEqual(len(accepted), 1)
        self.assertGreaterEqual(int(self.policy.find('inbound/validate-content').get('max-size')), accepted[0])

    def test_no_address_list_and_no_backend_or_secret_in_the_policy(self):
        text = (FOLDER / 'policy.xml').read_text()
        self.assertEqual(list(self.policy.iter('ip-filter')), [])
        self.assertEqual(list(self.policy.iter('set-backend-service')), [])
        self.assertNotRegex(text, r'\d+\.\d+\.\d+\.\d+|https?://|named-value|\{\{')


class CourierWebhookRoutesTest(unittest.TestCase):
    def test_routes_are_the_controllers_post_paths(self):
        table = routes()
        self.assertEqual({(method, path) for _, _, method, path, _ in table}, controller_posts())
        self.assertEqual({path for _, _, _, path, _ in table}, {WEBHOOK_PREFIX + 'borzo', WEBHOOK_PREFIX + 'pidge'})
        self.assertEqual(len({op for _, op, _, _, _ in table}), len(table), 'operation ids are unique')
        for _, _, _, _, kind in table:
            self.assertTrue((FOLDER / f'{kind}.xml').is_file(), kind)


class CourierWebhookReadmeTest(unittest.TestCase):
    def test_readme_names_the_values_and_uses_placeholders_for_every_resource(self):
        readme = (FOLDER / 'README.md').read_text()
        for needed in ('262144', '300 calls per 60 s', 'non-production instance first', '## Verify', '## Roll back',
                       '<SUBSCRIPTION_ID>', '<RESOURCE_GROUP>', '<APIM_NAME>', '<API_ID>', '<OPERATION_ID>', '<GATEWAY_HOST>'):
            self.assertIn(needed, readme)
        for path in (WEBHOOK_PREFIX + 'borzo', WEBHOOK_PREFIX + 'pidge'):
            self.assertIn('POST ' + path, readme)
        # No resource name, id, host or address: placeholders only.
        self.assertNotRegex(readme, r'(?i)\b(?:apim|rg|ca|kv|afd|cr|pg|sb|st)-?craves|craves\.in|azure-api\.net|azurecontainerapps'
                                    r'|[0-9a-f]{8}-[0-9a-f]{4}-|34eefd|721906c9|\d+\.\d+\.\d+\.\d+|@[a-z0-9-]+\.(?:com|in)\b')
        self.assertNotIn('azure-pipelines', readme)
        for host in re.findall(r'https://([^/\s"]+)', readme):
            self.assertIn(host, {'management.azure.com', '<GATEWAY_HOST>'})


if __name__ == '__main__':
    unittest.main()
