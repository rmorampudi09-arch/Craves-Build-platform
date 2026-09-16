import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('gateway_fingerprints', Path(__file__).parents[1] / 'capture-gateway-policy-fingerprints.py')
gateway = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gateway)


class GatewayPolicyFingerprintTest(unittest.TestCase):
    def test_policy_body_and_etag_are_not_exported(self):
        source = [{'properties': {'value': '<policies>PRIVATE-CANARY</policies>', 'format': 'xml'}, 'etag': 'PRIVATE-ETAG'}]
        value = gateway.summarize('/apis/example', source)
        self.assertNotIn('PRIVATE', json.dumps(value))
        self.assertEqual(len(value['xmlSha256']), 64)
        self.assertEqual(len(value['etagSha256']), 64)

    def test_same_length_changes_have_different_fingerprints(self):
        def summary(value): return gateway.summarize('global', [{'properties': {'value': value}}])
        self.assertEqual(summary('<a/>'), summary('<a/>'))
        self.assertNotEqual(summary('<a/>')['xmlSha256'], summary('<b/>')['xmlSha256'])

    def test_no_local_policy_is_distinct_from_missing_or_ambiguous_data(self):
        self.assertEqual(gateway.summarize('global', [])['status'], 'NO_LOCAL_POLICY')
        for rows in [[{}], [{'properties': {'value': ''}}], [{}, {}]]:
            with self.subTest(rows=rows), self.assertRaises(ValueError): gateway.summarize('global', rows)

    def test_identifiers_cannot_escape_resource_scope(self):
        self.assertEqual(gateway.segment('craves-api;rev=2'), 'craves-api;rev=2')
        for value in ['../secrets', '.', '..', 'a?api-version=x', '%2f', '', None]:
            with self.subTest(value=value), self.assertRaises(ValueError): gateway.segment(value)

    def test_non_read_collections_are_rejected_without_execution(self):
        with patch.object(gateway.subprocess, 'run') as run:
            for suffix in ['/namedValues', '/apis/a/operations/x', '/apis/a/../../secrets', '/apis/../policies', '/policies?x=1']:
                with self.subTest(suffix=suffix), self.assertRaises(ValueError): gateway.read(suffix)
            run.assert_not_called()

    def test_scoped_get_only_and_failure_is_redacted(self):
        with patch.object(gateway.subprocess, 'run') as run:
            run.return_value.returncode = 1
            run.return_value.stderr = 'PRIVATE-CANARY'
            with self.assertRaisesRegex(RuntimeError, 'raw output suppressed'): gateway.read('/apis/a/operations/b/policies')
            args = run.call_args.args[0]
            self.assertEqual(args[1:4], ['rest', '--method', 'get'])
            self.assertTrue(args[5].startswith(gateway.BASE + '/apis/a/operations/b/policies?'))

    def test_pagination_cannot_be_misreported_as_complete(self):
        with patch.object(gateway.subprocess, 'run') as run:
            run.return_value.returncode = 0
            run.return_value.stdout = json.dumps({'value': [], 'nextLink': 'https://other.example'})
            with self.assertRaises(ValueError): gateway.read('/apis')


if __name__ == '__main__': unittest.main()
