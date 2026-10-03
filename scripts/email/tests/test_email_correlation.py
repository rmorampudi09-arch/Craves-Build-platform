import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('email_correlation', Path(__file__).parents[1] / 'inspect-email-correlation.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
KEY = b'a' * 32


def row(**changes):
    value = {'identity': '00000000-0000-0000-0000-000000000001', 'email': 'synthetic@example.invalid',
             'revision': 2, 'verified': True, 'verified_at': '2026-09-16T12:00:00.000000',
             'customer_mismatch': False, 'chef_mismatch': False}
    value.update(changes)
    return value


def snapshot(rows=None):
    return {'private': m.pseudonyms([row()] if rows is None else rows, KEY), 'revision': 'same', 'image': 'same'}


class EmailCorrelationTest(unittest.TestCase):
    def test_matching_nonempty_records_without_pii_or_digests_in_receipt(self):
        value = snapshot()
        result = m.compare_stable(value, value, value, value)
        self.assertTrue(result['observedRowsMatch'])
        self.assertEqual(1, result['canonicalCount'])
        self.assertNotIn('synthetic', json.dumps(result))
        self.assertNotIn('00000000', json.dumps(result))
        self.assertTrue(all(type(v) in (bool, int) for v in result.values()))

    def test_empty_evidence_cannot_pass(self):
        value = snapshot([])
        result = m.compare_stable(value, value, value, value)
        self.assertFalse(result['observedRowsMatch']); self.assertFalse(result['exercised'])

    def test_matching_counts_do_not_hide_missing_and_orphaned_identity(self):
        auth = snapshot(); chef = snapshot([row(identity='00000000-0000-0000-0000-000000000002')])
        result = m.compare_stable(auth, chef, auth, chef)
        self.assertFalse(result['observedRowsMatch'])
        self.assertEqual(1, result['missingProjections']); self.assertEqual(1, result['orphanedProjections'])

    def test_each_canonical_field_is_compared_exactly(self):
        auth = snapshot()
        for changes in ({'email': 'another@example.invalid'}, {'revision': 3}, {'verified': False},
                        {'verified_at': '2026-09-16T12:00:00.000001'}):
            chef = snapshot([row(**changes)])
            result = m.compare_stable(auth, chef, auth, chef)
            self.assertEqual(1, result['emailVersionOrVerificationMismatches'])
            self.assertFalse(result['observedRowsMatch'])

    def test_profile_mismatch_and_unverified_authority_do_not_pass(self):
        for field in ('customer_mismatch', 'chef_mismatch'):
            auth = snapshot(); chef = snapshot([row(**{field: True})])
            self.assertFalse(m.compare_stable(auth, chef, auth, chef)['observedRowsMatch'])
        value = snapshot([row(verified=False)])
        self.assertFalse(m.compare_stable(value, value, value, value)['observedRowsMatch'])

    def test_changes_between_passes_and_runtime_drift_are_inconclusive(self):
        first = snapshot()
        for last in (snapshot([row(revision=3)]), {**snapshot(), 'revision': 'different'}, snapshot([])):
            with self.assertRaises(ValueError): m.compare_stable(first, first, last, first)
            with self.assertRaises(ValueError): m.compare_stable(first, first, first, last)

    def test_private_keys_cannot_be_reused_as_public_identity_hashes(self):
        self.assertNotEqual(m.pseudonyms([row()], KEY), m.pseudonyms([row()], b'b'*32))
        with self.assertRaises(ValueError): m.pseudonyms([row()], b'short')

    def test_duplicate_malformed_excess_rows_and_fields_rejected(self):
        for rows in ([row(), row()], [row(extra='private')], [row(revision=True)], [row(verified=1)],
                     [row(email=None)], [row(verified_at=None)], [row(identity='not-an-id')],
                     [row(verified_at='2026-99-99T00:00:00.000000')]):
            with self.assertRaises(ValueError): m.pseudonyms(rows, KEY)
        with patch.object(m, 'MAX_ROWS', 1):
            with self.assertRaises(ValueError): m.pseudonyms([row(), row()], KEY)

    def test_sql_fixed_readonly_bounded_and_credentials_not_arguments(self):
        for service in m.SERVICES:
            with patch.object(m.subprocess, 'run', return_value=subprocess.CompletedProcess([],0,'[]','')) as run:
                m.private_rows(service, {'PGOPTIONS':'-c default_transaction_read_only=on','PGPASSWORD':'synthetic-secret'})
                args, kw = run.call_args
                self.assertEqual(['psql','-X','-qAt','--set=ON_ERROR_STOP=1'], args[0])
                self.assertTrue(kw['input'].startswith('BEGIN READ ONLY;'))
                self.assertTrue(kw['input'].endswith('ROLLBACK;\n'))
                self.assertIn('LIMIT 10001',kw['input']); self.assertEqual(25,kw['timeout'])
                for forbidden in ('UPDATE ', 'INSERT ', 'DELETE ', 'CREATE ', 'DROP ', 'SELECT *', 'synthetic-secret'):
                    self.assertNotIn(forbidden, kw['input'])
        with patch.object(m.subprocess, 'run') as run:
            with self.assertRaises(ValueError): m.private_rows('unknown',{})
            with self.assertRaises(ValueError): m.private_rows('auth-service',{})
            run.assert_not_called()

    def test_subprocess_error_never_reveals_private_output(self):
        with patch.object(m.subprocess,'run',return_value=subprocess.CompletedProcess([],1,'private-email','private-password')):
            with self.assertRaises(ValueError) as error:
                m.private_rows('auth-service',{'PGOPTIONS':'-c default_transaction_read_only=on'})
            self.assertNotIn('private',str(error.exception))

    def test_main_performs_two_passes_and_never_outputs_private_comparison(self):
        with patch.object(m.history,'az',side_effect=[{'id':m.history.SUB},[]]), \
             patch.object(m,'capture_service',return_value=snapshot()) as capture:
            result=m.main()
        self.assertEqual([a.args[0] for a in capture.call_args_list],list(m.SERVICES)*2)
        self.assertNotIn('synthetic',json.dumps(result)); self.assertNotIn('private"',json.dumps(result))
        self.assertFalse(result['crossDatabaseAtomicSnapshot']); self.assertFalse(result['mailboxAccepted'])
        self.assertFalse(result['publicLaunchAccepted'])


if __name__ == '__main__': unittest.main()
