import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('finance_preflight', Path(__file__).with_name('inspect-finance-migrations.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class FinanceMigrationPreflightTests(unittest.TestCase):
    def setUp(self):
        probe.history.REQUIRED = {'integration-service': set()}
        self.row = {'version': '144', 'script': 'V144__fixture.sql', 'checksum': 123, 'success': True, 'type': 'SQL'}
        self.sources = {'144': {'script': 'V144__fixture.sql', 'checksum': 123},
                        '145': {'script': 'V145__fixture.sql', 'checksum': 456}}

    def check(self, rows=None, sources=None):
        return probe.compare('integration-service', rows or [self.row], sources or self.sources)

    def test_matching_applied_with_later_pending_is_compatible(self):
        result = self.check()
        self.assertTrue(result['passed'])
        self.assertEqual(['145'], result['pendingMigrationsNotExecuted'])

    def test_changed_applied_checksum_is_never_accepted(self):
        self.row['checksum'] = 999
        self.assertFalse(self.check()['passed'])

    def test_unknown_future_history_rejected(self):
        self.row['version'] = '146'
        self.assertFalse(self.check()['passed'])

    def test_out_of_order_pending_rejected(self):
        self.sources['143'] = {'script': 'V143__fixture.sql', 'checksum': 1}
        self.assertFalse(self.check()['passed'])

    def test_failed_migration_rejected(self):
        self.row['success'] = False
        self.assertFalse(self.check()['passed'])

    def test_fully_applied_is_compatible(self):
        self.assertTrue(self.check(sources={'144': self.sources['144']})['passed'])

    def test_only_scoped_readonly_sql(self):
        with patch.object(probe.subprocess, 'run') as run:
            with self.assertRaises(ValueError): probe.sql('public', {})
            with self.assertRaises(ValueError): probe.sql('payment_schema', {})
            run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
