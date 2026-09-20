import copy
from datetime import datetime, timezone
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('backup_metadata', Path(__file__).with_name('inspect-backup-metadata.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)
NOW = datetime(2026, 9, 18, 0, 0, tzinfo=timezone.utc)


def fixtures():
    return ({'id': probe.RESOURCE, 'properties': {'state': 'Ready', 'backup': {
        'backupRetentionDays': 7, 'geoRedundantBackup': 'Disabled',
        'earliestRestoreDate': '2026-09-11T00:00:00Z'}, 'administratorLogin': 'not-for-output'}},
        {'value': [{'id': probe.RESOURCE + '/backups/fixture', 'properties': {
            'backupType': 'Full', 'completedTime': '2026-09-17T22:00:00Z',
            'untrustedExtra': 'not-for-output'}}]})


class BackupMetadataTests(unittest.TestCase):
    def test_completed_metadata_only(self):
        server, backups = fixtures()
        result = probe.summarize(server, backups, NOW)
        self.assertEqual(7200, result['latestCompletedBackupAgeSeconds'])
        self.assertEqual(1, result['completedBackupCount'])
        self.assertFalse(result['restoreRehearsalPerformed'])
        self.assertNotIn('not-for-output', str(result))

    def test_empty_and_pending_are_not_successful_backups(self):
        server, backups = fixtures()
        backups['value'][0]['properties']['completedTime'] = None
        result = probe.summarize(server, backups, NOW)
        self.assertEqual(0, result['completedBackupCount'])
        self.assertEqual(1, result['incompleteBackupCount'])
        self.assertIsNone(result['latestCompletedBackupTimeUtc'])
        self.assertIsNone(probe.summarize(server, {'value': []}, NOW)['latestCompletedBackupAgeSeconds'])

    def test_wrong_resource_or_subscription_rejected(self):
        server, backups = fixtures()
        server['id'] = '/other/server'
        with self.assertRaises(ValueError): probe.summarize(server, backups, NOW)
        with patch.object(probe, 'read_azure', return_value='other') as call:
            with self.assertRaises(ValueError): probe.capture()
            self.assertEqual(1, call.call_count)

    def test_wrong_backup_or_partial_list_rejected(self):
        server, backups = fixtures()
        backups['value'][0]['id'] = '/other/backups/fixture'
        with self.assertRaises(ValueError): probe.summarize(server, backups, NOW)
        server, backups = fixtures()
        backups['nextLink'] = 'https://untrusted.invalid'
        with self.assertRaises(ValueError): probe.summarize(server, backups, NOW)

    def test_invalid_or_future_times_rejected(self):
        for value in ('bad', '2026-09-17T22:00:00', '2027-09-17T22:00:00Z'):
            with self.subTest(value=value):
                server, backups = fixtures()
                backups['value'][0]['properties']['completedTime'] = value
                with self.assertRaises(ValueError): probe.summarize(server, backups, NOW)

    def test_unknown_status_or_type_rejected(self):
        server, backups = fixtures()
        backups['value'][0]['properties']['backupType'] = 'unknown'
        with self.assertRaises(ValueError): probe.summarize(server, backups, NOW)
        server, backups = fixtures()
        server['properties']['state'] = 'Updating'
        with self.assertRaises(ValueError): probe.summarize(server, backups, NOW)

    def test_only_exact_read_commands_allowed(self):
        with patch.object(probe.subprocess, 'run') as run:
            for args in (('rest', '--method', 'POST', '--url', probe.SERVER_URL),
                         ('rest', '--method', 'GET', '--url', 'https://other.invalid'),
                         ('postgres', 'flexible-server', 'restore')):
                with self.assertRaises(ValueError): probe.read_azure(*args)
            run.assert_not_called()

    def test_runtime_change_rejected(self):
        server, backups = fixtures()
        after = copy.deepcopy(server)
        after['properties']['backup']['backupRetentionDays'] = 14
        with patch.object(probe, 'read_azure', side_effect=[probe.SUBSCRIPTION, server, backups, after]):
            with self.assertRaisesRegex(ValueError, 'CONFIGURATION_CHANGED'): probe.capture()


if __name__ == '__main__':
    unittest.main()
