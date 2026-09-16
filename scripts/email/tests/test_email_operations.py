import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('email_operations', Path(__file__).parents[1] / 'inspect-email-operations.py')
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)


class EmailOperationsTest(unittest.TestCase):
    def valid(self, service):
        return {key: 0 for key in m.FIELDS[service]}

    def test_only_the_three_owned_aggregate_shapes_are_allowed(self):
        self.assertEqual({'auth-service': 10, 'user-chef-service': 4, 'notification-service': 4},
                         {service: len(fields) for service, fields in m.FIELDS.items()})
        for service in m.FIELDS:
            self.assertEqual(self.valid(service), m.validate(service, self.valid(service)))
            for value in (-1, True, '0', 2**63, None):
                invalid = self.valid(service); invalid[next(iter(invalid))] = value
                with self.assertRaises(ValueError): m.validate(service, invalid)

    def test_unknown_or_customer_level_fields_cannot_be_output(self):
        for field in ('email', 'identityId', 'code', 'token', 'requestBody'):
            invalid = self.valid('auth-service'); invalid[field] = 'PRIVATE'
            with self.assertRaises(ValueError): m.validate('auth-service', invalid)
        with self.assertRaises(ValueError): m.validate('unknown', {})
        with self.assertRaises(ValueError): m.validate('auth-service', {})

    def test_sql_is_fixed_read_only_bounded_and_never_takes_arbitrary_query(self):
        for service in m.QUERIES:
            response = subprocess.CompletedProcess([], 0, json.dumps(self.valid(service)), '')
            with patch.object(m.subprocess, 'run', return_value=response) as run:
                m.sql(service, {'PGOPTIONS': '-c default_transaction_read_only=on'})
                args, kwargs = run.call_args
                self.assertEqual(['psql', '-X', '-qAt', '--set=ON_ERROR_STOP=1'], args[0])
                self.assertTrue(kwargs['input'].startswith('BEGIN READ ONLY;'))
                self.assertTrue(kwargs['input'].endswith('ROLLBACK;\n'))
                self.assertIn("statement_timeout='10s'", kwargs['input'])
                self.assertEqual(25, kwargs['timeout'])
                for command in ('INSERT ', 'UPDATE ', 'DELETE ', 'CREATE ', 'DROP ', 'SELECT *'):
                    self.assertNotIn(command, kwargs['input'].upper())
        with patch.object(m.subprocess, 'run') as run:
            with self.assertRaises(ValueError): m.sql('auth-service; DELETE', {})
            with self.assertRaises(ValueError): m.sql('auth-service', {})
            run.assert_not_called()

    def test_database_error_and_oversized_response_do_not_leak(self):
        for response in (subprocess.CompletedProcess([], 1, '', 'fixture-private-password'),
                         subprocess.CompletedProcess([], 0, 'a'*4000, '')):
            with patch.object(m.subprocess, 'run', return_value=response):
                with self.assertRaises(ValueError) as raised:
                    m.sql('auth-service', {'PGOPTIONS':'-c default_transaction_read_only=on'})
                self.assertNotIn('fixture-private-password', str(raised.exception))

    def test_no_pending_rows_have_zero_age_without_null_json(self):
        self.assertIn('greatest(0,floor(extract(epoch FROM now()-min(created_at))))', m.QUERIES['auth-service'])
        self.assertNotIn('email AS', ''.join(m.QUERIES.values()))

    def test_result_does_not_claim_mailbox_or_atomic_identity_acceptance(self):
        with patch.object(m.history, 'az', side_effect=[{'id': m.history.SUB}, []]), \
             patch.object(m, 'capture_service', return_value={'aggregates': {}}):
            result = m.main()
        self.assertFalse(result['mailboxAccepted'])
        self.assertFalse(result['crossServiceIdentityEqualityProven'])
        self.assertTrue(result['readOnly'])


if __name__ == '__main__': unittest.main()
