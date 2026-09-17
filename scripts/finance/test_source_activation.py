import copy
import json
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import activate_source_runtime as target


def app():
    return {'location': 'centralindia', 'identity': {'type': 'SystemAssigned'}, 'properties': {
        'environmentId': 'existing', 'template': {'containers': [{'name': 'app', 'image': 'unchanged', 'env': [
            {'name': 'EXISTING_PAYMENT_KEY', 'secretRef': 'existing-payment'}]}], 'scale': {'maxReplicas': 1}},
        'configuration': {'activeRevisionsMode': 'Single', 'ingress': {'traffic': [{'revisionName': 'old', 'weight': 100}]},
                          'secrets': [{'name': 'existing-payment', 'keyVaultUrl': 'existing'}]}}}


class SourceActivationTests(unittest.TestCase):
    def test_only_five_named_accounting_flags(self):
        self.assertEqual(set(target.FLAGS), {'order', 'integration'})
        self.assertEqual(sum(map(len, target.FLAGS.values())), 5)
        self.assertFalse(any('PAYOUT' in n or 'BANK' in n for v in target.FLAGS.values() for n in v))

    def test_flags_allow_false_missing_or_true_and_are_idempotent(self):
        value = app()
        desired = target.FLAGS['order']
        self.assertEqual(len(target.missing_flags(value, desired)), 3)
        value['properties']['template']['containers'][0]['env'] += [{'name': k, 'value': 'true'} for k in desired]
        self.assertEqual(target.missing_flags(value, desired), [])
        value['properties']['template']['containers'][0]['env'][-1]['value'] = 'false'
        self.assertEqual(len(target.missing_flags(value, desired)), 1)

    def test_conflicting_flag_or_duplicate_rejected(self):
        for extra in ([{'name': 'CRAVES_FINANCE_SOURCE_ENABLED', 'secretRef': 'unknown'}],
                      [{'name': 'CRAVES_FINANCE_SOURCE_ENABLED', 'value': 'yes'}],
                      [{'name': 'SAME', 'value': 'x'}, {'name': 'SAME', 'value': 'y'}]):
            value = app(); value['properties']['template']['containers'][0]['env'] += extra
            with self.assertRaises(target.GuardError): target.missing_flags(value, target.FLAGS['order'])

    def test_all_unrelated_settings_and_keys_in_fingerprint(self):
        value = app(); before = target.fingerprint(value, target.FLAGS['order'])
        for kind in ('image', 'key', 'scale', 'identity'):
            changed = copy.deepcopy(value)
            if kind == 'image': changed['properties']['template']['containers'][0]['image'] = 'other'
            if kind == 'key': changed['properties']['configuration']['secrets'][0]['keyVaultUrl'] = 'other'
            if kind == 'scale': changed['properties']['template']['scale']['maxReplicas'] = 2
            if kind == 'identity': changed['identity'] = {'type': 'other'}
            self.assertNotEqual(before, target.fingerprint(changed, target.FLAGS['order']))
        value['properties']['template']['containers'][0]['env'] += [{'name': k, 'value': 'true'} for k in target.FLAGS['order']]
        self.assertEqual(before, target.fingerprint(value, target.FLAGS['order']))

    def test_database_requests_are_read_only_and_redacted(self):
        with patch.object(target.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout='{"events":0}')) as run:
            self.assertEqual(target.sql('SELECT 1;', {'PGOPTIONS': '-c default_transaction_read_only=on'}), {'events': 0})
            self.assertIn('BEGIN READ ONLY', run.call_args.kwargs['input'])
            self.assertIn('ROLLBACK', run.call_args.kwargs['input'])
        with self.assertRaises(target.GuardError): target.sql('SELECT 1;', {})
        with patch.object(target.subprocess, 'run', return_value=SimpleNamespace(returncode=1, stdout='secret')):
            with self.assertRaisesRegex(target.GuardError, '^Bounded read-only database check failed$'):
                target.sql('SELECT 1;', {'PGOPTIONS': '-c default_transaction_read_only=on'})

    def test_no_update_when_already_enabled(self):
        value = app()
        value['properties']['latestReadyRevisionName'] = 'ready'
        value['properties']['template']['containers'][0]['env'] += [{'name': k, 'value': 'true'} for k in target.FLAGS['order']]
        with patch.object(target, 'snapshot', return_value=value), patch.object(target, 'ready', return_value=True), patch.object(target, 'az') as az:
            target.configure('order', value)
            az.assert_not_called()

    def test_concurrent_drift_blocks_before_write(self):
        before = app(); after = copy.deepcopy(before)
        after['properties']['template']['containers'][0]['image'] = 'unexpected'
        with patch.object(target, 'snapshot', return_value=after), patch.object(target, 'az') as az:
            with self.assertRaises(target.GuardError): target.configure('order', before)
            az.assert_not_called()

    def test_secret_outside_existing_vault_rejected(self):
        value = app()
        with patch.object(target, 'az') as az:
            with self.assertRaises(target.GuardError): target.secret(value, 'EXISTING_PAYMENT_KEY')
            az.assert_not_called()

    def test_no_policy_or_business_writes_in_sql(self):
        for query in target.QUERIES.values():
            self.assertTrue(query.lstrip().startswith('SELECT '))
            self.assertNotRegex(query.upper(), r'\b(UPDATE|DELETE|INSERT|TRUNCATE|ALTER)\b')


if __name__ == '__main__': unittest.main()
