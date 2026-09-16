import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('history', Path(__file__).parents[1] / 'inspect-applied-email-history.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


class HistoryTests(unittest.TestCase):
    def test_crc_ignores_bom_and_line_endings_not_whitespace_or_content(self):
        a = m.crc('SELECT 1;\nSELECT 2;\n')
        self.assertEqual(a, m.crc('\ufeffSELECT 1;\r\nSELECT 2;\r\n'))
        self.assertNotEqual(a, m.crc('SELECT 1; \nSELECT 2;\n'))
        with self.assertRaises(ValueError): m.crc('SELECT ${secret};')

    def test_actual_migration_sets_include_current_numbering(self):
        for service in m.APPS:
            self.assertTrue(m.REQUIRED[service].issubset(m.expected(service)))

    def test_all_versions_and_exact_checksums_required(self):
        source = {'15': {'script':'V15__email.sql','checksum':123}, '16': {'script':'V16__limiter.sql','checksum':456}}
        rows = [{'version':v, **s, 'success':True, 'type':'SQL'} for v,s in source.items()]
        self.assertTrue(m.compare('auth-service', rows, source)['passed'])
        self.assertFalse(m.compare('auth-service', rows[:1], source)['passed'])
        for key,value in [('checksum',789), ('success',False), ('script','other.sql')]:
            changed = json.loads(json.dumps(rows)); changed[0][key] = value
            self.assertFalse(m.compare('auth-service', changed, source)['passed'])
        with self.assertRaises(ValueError): m.compare('auth-service', rows+rows[:1], source)
        baseline = [{'version':'15','script':'baseline','checksum':None,'success':True,'type':'BASELINE'}, rows[1]]
        self.assertFalse(m.compare('auth-service', baseline, source)['passed'])

    def test_binding_requires_current_scoped_host_and_tls(self):
        servers = [{'fullyQualifiedDomainName':'existing.postgres.database.azure.com'}]
        root = 'jdbc:postgresql://existing.postgres.database.azure.com/db'
        self.assertEqual(('existing.postgres.database.azure.com','db'), m.database_binding(root+'?sslmode=require', servers))
        for url in [root+'?sslmode=disable', root+'?options=write', root+'#fragment', root.replace('/db','/db/other'),
                    root.replace('existing.', 'attacker.'), root.replace('//', '//user:password@'), root.replace('.com/', '.com:1111/')]:
            with self.subTest(url=url), self.assertRaises(ValueError): m.database_binding(url, servers)

    def test_query_is_fixed_bounded_readonly_without_credentials_in_command(self):
        response = subprocess.CompletedProcess([], 0, '[]', '')
        with patch.object(m.subprocess, 'run', return_value=response) as run:
            m.sql('notification_schema', {'PGOPTIONS':'-c default_transaction_read_only=on', 'PGPASSWORD':'fixture-only'})
            args, kwargs = run.call_args
            self.assertNotIn('fixture-only', str(args))
            self.assertIn('BEGIN READ ONLY;', kwargs['input'])
            self.assertIn('ROLLBACK;', kwargs['input'])
            self.assertIn('LIMIT 251', kwargs['input'])
            self.assertIn('notification_schema.flyway_schema_history', kwargs['input'])
            self.assertEqual(25, kwargs['timeout'])
        with self.assertRaises(ValueError): m.sql('public; DELETE', {})
        with self.assertRaises(ValueError): m.sql('public', {})

    def test_database_errors_are_redacted_and_azure_writes_rejected(self):
        response = subprocess.CompletedProcess([], 1, '', 'fixture-password private-host')
        with patch.object(m.subprocess, 'run', return_value=response):
            with self.assertRaisesRegex(ValueError, '^Read-only migration history unavailable; no write attempted$'):
                m.sql('public', {'PGOPTIONS':'-c default_transaction_read_only=on'})
        with patch.object(m.subprocess, 'run') as run:
            for args in [('containerapp','update'), ('keyvault','secret','set'), ('postgres','flexible-server','create')]:
                with self.assertRaises(ValueError): m.az(*args)
            run.assert_not_called()


if __name__ == '__main__': unittest.main()
