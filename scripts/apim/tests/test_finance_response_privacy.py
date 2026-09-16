import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

spec = importlib.util.spec_from_file_location('finance_privacy', Path(__file__).parents[1] / 'finance-response-privacy.py')
privacy = importlib.util.module_from_spec(spec); spec.loader.exec_module(privacy)
GLOBAL = '<policies><inbound><cors /></inbound><backend><forward-request /></backend><outbound><base /></outbound><on-error><base /></on-error></policies>'
POLICY = '<policies><inbound><base /><choose><when condition="UNCHANGED-EXPRESSION"><return-response><set-status code="401" reason="Unauthorized" /><set-body>UNCHANGED-BODY</set-body></return-response></when></choose><set-backend-service base-url="https://original.example" /></inbound><backend><base /></backend><outbound><base /><set-header name="Cache-Control" exists-action="override"><value>no-store</value></set-header></outbound><on-error><base /></on-error></policies>'


class FakeManagement:
    def __init__(self):
        self.policies = {'/policies/policy': GLOBAL}
        self.policies.update({'/apis/' + aid + '/policies/policy': POLICY for aid in privacy.API_IDS})
        self.policies.update({scope.removesuffix('/policy'): text for scope, text in tuple(self.policies.items())})
        self.writes = []
        self.etag = '"version-1"'

    def request(self, scope, method='GET', text=None, etag=None):
        if method == 'PUT':
            if etag != self.etag: raise privacy.GuardError('Version mismatch')
            self.policies[scope] = text; self.writes.append((scope, etag))
            return None
        return self.policies[scope], self.etag


class FinancePrivacyTest(unittest.TestCase):
    def test_only_privacy_changes_routing_auth_body_and_cors_are_preserved(self):
        updated = privacy.patch_policy(POLICY)
        self.assertEqual(privacy.without_privacy(privacy.root(POLICY)), privacy.without_privacy(privacy.root(updated)))
        self.assertIn('UNCHANGED-EXPRESSION', updated); self.assertIn('UNCHANGED-BODY', updated)
        self.assertIn('https://original.example', updated)

    def test_return_response_order_places_headers_before_body(self):
        response = privacy.root(privacy.patch_policy(POLICY)).find('.//return-response')
        self.assertEqual([n.tag for n in response], ['set-status', 'set-header', 'set-header', 'set-body'])
        self.assertEqual(response.find("set-header[@name='Cache-Control']/value").text, privacy.CACHE_VALUE)

    def test_success_denial_validation_and_upstream_error_paths_get_headers(self):
        for code, section in [(200, 'outbound'), (403, 'outbound'), (400, 'outbound'), (500, 'on-error')]:
            with self.subTest(status=code, section=section):
                node = privacy.root(privacy.patch_policy(POLICY)).find(section)
                self.assertEqual(node.find("set-header[@name='Cache-Control']/value").text, privacy.CACHE_VALUE)
                self.assertEqual(node.find("set-header[@name='Pragma']/value").text, 'no-cache')
                self.assertEqual(node[0].tag, 'base')

    def test_idempotent_and_no_duplicate_privacy_headers(self):
        once = privacy.patch_policy(POLICY)
        self.assertEqual(privacy.patch_policy(once), once)
        self.assertEqual(len(privacy.root(once).findall(".//set-header[@name='Cache-Control']")), 3)

    def test_nested_early_errors_are_protected(self):
        custom = POLICY.replace('<on-error><base />', '<on-error><base /><choose><otherwise><return-response><set-status code="503" /></return-response></otherwise></choose>')
        for response in privacy.root(privacy.patch_policy(custom)).iter('return-response'):
            self.assertIsNotNone(response.find("set-header[@name='Cache-Control']"))

    def test_malformed_sections_entities_and_declarations_fail(self):
        for text in ['<policies/>', '<policies>', '<!DOCTYPE foo>' + POLICY, POLICY.replace('<inbound>', '<other>')]:
            with self.subTest(text=text[:30]), self.assertRaises(privacy.GuardError): privacy.patch_policy(text)

    def test_only_two_target_policies_and_readonly_global_scope(self):
        for suffix in ['/namedValues', '/apis/other/policies/policy', '/apis/craves-finance-admin-v1/operations/x/policies/policy', '/policies/policy?x=y']:
            with self.assertRaises(privacy.GuardError): privacy.scope_url(suffix)
        client = privacy.Management.__new__(privacy.Management); client.token = 'canary'
        with self.assertRaises(privacy.GuardError): client.request('/policies/policy', 'PUT', POLICY, '"1"')
        for etag in (None, '', '*', 'bad\r\nvalue'):
            with self.assertRaises(privacy.GuardError): client.request('/apis/craves-finance-admin-v1/policies/policy', 'PUT', POLICY, etag)

    def test_inspect_exports_no_expressions_bodies_or_origins(self):
        value = json.dumps(privacy.inspect(POLICY))
        for private in ['UNCHANGED', 'original.example', 'condition=']: self.assertNotIn(private, value)

    def run_fixture(self, client, apply=False):
        with patch.object(privacy, 'EXPECTED_POLICY_SHA', privacy.sha(POLICY)), patch.object(privacy, 'EXPECTED_GLOBAL_SHA', privacy.sha(GLOBAL)), patch.object(privacy, 'EXPECTED_RESOURCE_POLICY_SHA', privacy.sha(POLICY)), patch.object(privacy, 'EXPECTED_RESOURCE_GLOBAL_SHA', privacy.sha(GLOBAL)), patch.object(privacy, 'probe', return_value=[{'passed': True}]):
            return privacy.run(client, apply)

    def test_inspect_has_no_writes(self):
        client = FakeManagement(); result = self.run_fixture(client)
        self.assertTrue(result['readOnly']); self.assertEqual(client.writes, [])
        self.assertFalse(result['accepted'])

    def test_apply_updates_exact_two_policies_with_etag_and_readback(self):
        client = FakeManagement(); result = self.run_fixture(client, True)
        self.assertEqual(len(client.writes), 2)
        self.assertTrue(all(r['applied'] for r in result['policies']))
        self.assertEqual(client.policies['/policies/policy'], GLOBAL)

    def test_changed_global_or_api_fails_before_any_write(self):
        for scope in ['/policies/policy', '/apis/craves-chef-finance-v1/policies/policy']:
            client = FakeManagement(); client.policies[scope] += ' '
            with self.assertRaises(privacy.GuardError): self.run_fixture(client, True)
            self.assertEqual(client.writes, [])

    def test_readonly_drift_exports_hash_and_structure_without_authorizing_writes(self):
        client = FakeManagement()
        client.policies['/policies/policy'] += ' '
        client.policies['/apis/craves-chef-finance-v1/policies/policy'] += ' '
        result = self.run_fixture(client)
        self.assertFalse(result['globalBaselineMatches'])
        self.assertEqual([row['baselineMatches'] for row in result['policies']], [True, False])
        self.assertFalse(result['accepted'])
        self.assertEqual(client.writes, [])
        for sensitive in ['UNCHANGED', 'original.example', 'condition=']:
            self.assertNotIn(sensitive, json.dumps(result))
        with self.assertRaises(privacy.GuardError): self.run_fixture(client, True)
        self.assertEqual(client.writes, [])

    def test_missing_etag_blocks_apply_but_allows_inspection(self):
        client = FakeManagement(); client.etag = None
        result = self.run_fixture(client)
        self.assertFalse(result['policies'][0]['exactEtagAvailable'])
        with self.assertRaises(privacy.GuardError): self.run_fixture(client, True)
        self.assertEqual(client.writes, [])

    def test_partial_policy_is_described_readonly_but_never_patched_or_applied(self):
        partial = '<policies><inbound><base /></inbound></policies>'
        info = privacy.inspect(partial)
        self.assertEqual(info['sectionOrder'], ['inbound'])
        self.assertFalse(info['sectionsMatchPatchShape'])
        with self.assertRaises(privacy.GuardError): privacy.patch_policy(partial)
        client = FakeManagement()
        client.policies['/policies/policy'] = partial
        client.policies['/apis/craves-chef-finance-v1/policies/policy'] = partial
        result = self.run_fixture(client)
        self.assertIsNone(result['policies'][1]['proposed'])
        self.assertEqual(client.writes, [])
        with self.assertRaises(privacy.GuardError): self.run_fixture(client, True)

    def test_unrecognized_section_names_are_not_exported(self):
        info = privacy.inspect('<policies><PRIVATE_CANARY /></policies>')
        self.assertEqual(info['sectionOrder'], ['UNRECOGNIZED'])
        self.assertNotIn('PRIVATE_CANARY', json.dumps(info))

    def test_collection_and_resource_equivalence_does_not_ignore_meaningful_changes(self):
        client = FakeManagement()
        scope = '/apis/craves-finance-admin-v1/policies/policy'
        formatted = POLICY.replace('><', '>\n    <')
        client.policies[scope.removesuffix('/policy')] = formatted
        with patch.object(privacy, 'EXPECTED_POLICY_SHA', privacy.sha(formatted)), patch.object(privacy, 'EXPECTED_RESOURCE_POLICY_SHA', privacy.sha(POLICY)):
            self.assertTrue(privacy.reconcile(client, scope, POLICY)['passed'])
            for mutation in [POLICY.replace('401', '200'), POLICY.replace('UNCHANGED-BODY', 'changed'), POLICY.replace('original.example', 'different.example')]:
                with self.subTest(mutation=mutation[:20]):
                    self.assertFalse(privacy.reconcile(client, scope, mutation)['structureEquivalent'])

    def test_collection_drift_blocks_all_writes_even_if_resource_is_expected(self):
        client = FakeManagement()
        client.policies['/apis/craves-chef-finance-v1/policies'] += ' '
        with self.assertRaises(privacy.GuardError): self.run_fixture(client, True)
        self.assertEqual(client.writes, [])

    def test_collection_validation_rejects_missing_ambiguous_paginated_and_unknown_format(self):
        row = {'properties': {'format': 'xml', 'value': POLICY}}
        self.assertEqual(privacy.collection_policy({'value': [row]}), POLICY)
        for data in [{'value': []}, {'value': [row, row]}, {'value': [row], 'nextLink': 'private'},
                     {'value': [{'properties': {'format': 'rawxml-link', 'value': POLICY}}]}]:
            with self.assertRaises(privacy.GuardError): privacy.collection_policy(data)

    def test_collection_writes_are_never_allowed(self):
        client = privacy.Management.__new__(privacy.Management); client.token = 'canary'
        for scope in ['/policies', '/apis/craves-finance-admin-v1/policies']:
            with self.assertRaises(privacy.GuardError): client.request(scope, 'PUT', POLICY, '"1"')

    def test_global_without_error_section_is_valid_but_never_patched(self):
        text = '<policies><inbound /><backend><forward-request /></backend><outbound /></policies>'
        privacy.validate_global(text)
        for altered in [text.replace('<outbound />', ''), text.replace('<inbound />', '<inbound><return-response /></inbound>'),
                        text.replace('<outbound />', '<outbound><cache-lookup /></outbound>'),
                        text.replace('<inbound />', '<inbound><include-fragment fragment-id="not-reviewed" /></inbound>')]:
            with self.assertRaises(privacy.GuardError): privacy.validate_global(altered)

    def test_etag_race_blocks_write(self):
        client = FakeManagement(); original = client.request; reads = {}
        def changing(scope, method='GET', text=None, etag=None):
            result = original(scope, method, text, etag)
            reads[scope] = reads.get(scope, 0) + 1
            if scope == '/apis/craves-finance-admin-v1/policies/policy' and reads[scope] > 1:
                return result[0], '"new-version"'
            return result
        client.request = changing
        with self.assertRaises(privacy.GuardError): self.run_fixture(client, True)
        self.assertEqual(client.writes, [])


if __name__ == '__main__': unittest.main()
