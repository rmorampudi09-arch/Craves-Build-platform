import copy
import importlib.util
import os
from pathlib import Path
import stat
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('email_runtime', Path(__file__).with_name('configure_email_runtime.py'))
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


def app(role='auth'):
    return {'location': 'centralindia', 'identity': {'type': 'SystemAssigned', 'principalId': 'existing-principal'},
            'properties': {'runningStatus': 'Running', 'latestRevisionName': 'ready', 'latestReadyRevisionName': 'ready',
                'template': {'containers': [{'name': 'app', 'image': runtime.IMAGES[role], 'env': [{'name': 'EXISTING', 'value': 'unchanged'}]}]},
                'configuration': {'ingress': {'fqdn': role + '.example.azurecontainerapps.io'},
                    'secrets': [{'name': 'database', 'keyVaultUrl': 'https://existing.vault.azure.net/secrets/db/version', 'identity': 'system'}]}}}


class EmailRuntimeTests(unittest.TestCase):
    def test_all_new_capability_gates_closed(self):
        wanted = runtime.desired({key: app(key) for key in runtime.APPS})
        gates = {key: value for env in wanted.values() for key, value in env.items() if key.endswith('_ENABLED') or key.endswith('_ALLOW_LOCAL_HTTP')}
        self.assertEqual(len(gates), 4)
        self.assertEqual(set(gates.values()), {'false'})
        self.assertNotIn('CRAVES_NOTIFICATION_EMAIL_ENABLED', wanted['notification'])

    def test_three_independent_scoped_keys(self):
        wanted = runtime.desired({key: app(key) for key in runtime.APPS})
        self.assertEqual(len(set(runtime.KEYS.values())), 3)
        self.assertEqual(runtime.used_secrets(wanted['auth']), set(runtime.KEYS))
        self.assertEqual(runtime.used_secrets(wanted['notification']), {'email-verification-transport'})
        self.assertEqual(runtime.used_secrets(wanted['user-chef']), {'email-projection-internal'})

    def test_key_provenance_disabled_or_expiry_fails(self):
        valid = {'id': 'known', 'enabled': True, 'expires': None, 'tags': {'craves-purpose': runtime.PURPOSE}}
        self.assertEqual(runtime.validate_metadata(valid), 'known')
        for changed in ({'enabled': False}, {'expires': 123}, {'tags': None}, {'tags': {'craves-purpose': 'another-module'}}):
            with self.assertRaises(runtime.guard.GuardError):
                runtime.validate_metadata({**valid, **changed})

    def test_identity_requires_existing_vault_binding(self):
        self.assertEqual(runtime.existing_vault_identity(app(), 'existing'), 'system')
        missing = app()
        missing['properties']['configuration']['secrets'] = []
        with self.assertRaises(runtime.guard.GuardError):
            runtime.existing_vault_identity(missing, 'existing')

    def test_conflicting_app_secret_is_not_overwritten(self):
        value = app()
        value['properties']['configuration']['secrets'].append({'name': 'email-verification-hmac', 'keyVaultUrl': 'different', 'identity': 'system'})
        with self.assertRaises(runtime.guard.GuardError):
            runtime.check_secret_slots(value, {'email-verification-hmac'}, {'email-verification-hmac': {'id': 'expected'}}, 'system')

    def test_azure_empty_value_on_matching_reference_is_allowed(self):
        value = app()
        value['properties']['configuration']['secrets'].append({'name': 'email-verification-hmac', 'keyVaultUrl': 'expected', 'identity': 'system', 'value': None})
        runtime.check_secret_slots(value, {'email-verification-hmac'}, {'email-verification-hmac': {'id': 'expected'}}, 'system')

    def test_concurrent_secret_creation_stops_before_write(self):
        name = runtime.KEYS['email-verification-hmac']
        with patch.object(runtime, 'az', return_value=['https://existing.vault.azure.net/secrets/' + name]) as azure:
            with self.assertRaises(runtime.guard.GuardError):
                runtime.create_missing_key('existing', name)
            self.assertEqual(azure.call_count, 1)

    def test_key_generation_uses_private_file_not_command_line(self):
        calls = []
        files = []
        def azure(*args, **kwargs):
            calls.append((args, kwargs))
            if args[:3] == ('keyvault', 'secret', 'list'):
                return []
            if args[:3] == ('keyvault', 'secret', 'set'):
                path = Path(args[args.index('--file') + 1])
                files.append(path)
                value = path.read_text()
                self.assertGreaterEqual(len(value), 64)
                if os.name == 'posix':
                    self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
                self.assertFalse(any(value in part for part in args))
                self.assertEqual(kwargs['output'], 'none')
                return None
            if args[:3] == ('keyvault', 'secret', 'show'):
                self.assertNotIn('value', args[-1])
                return {'id': 'new-id'}
            raise AssertionError('Unexpected Azure command')
        with patch.object(runtime, 'az', side_effect=azure):
            self.assertEqual(runtime.create_missing_key('existing', 'test-key'), {'id': 'new-id'})
        self.assertEqual(len(calls), 3)
        self.assertFalse(files[0].exists())

    def test_plan_default_never_applies(self):
        with patch.object(runtime, 'preflight', return_value='plan'), patch.object(runtime, 'configure') as configure:
            runtime.main([])
            configure.assert_not_called()

    def test_apply_requires_reviewed_source_before_preflight(self):
        with patch.object(runtime.subprocess, 'check_output', return_value='a' * 40), patch.object(runtime, 'preflight') as preflight:
            with self.assertRaises(runtime.guard.GuardError):
                runtime.main(['--apply', '--expected-source-sha', 'b' * 40])
            preflight.assert_not_called()

    def test_unrelated_runtime_drift_is_detected(self):
        before = app()
        changed = copy.deepcopy(before)
        changed['properties']['template']['containers'][0]['image'] = 'other-image'
        self.assertNotEqual(runtime.guard.stable(before, set(), set()), runtime.guard.stable(changed, set(), set()))

    def test_existing_true_gate_is_not_silently_disabled(self):
        value = app()
        value['properties']['template']['containers'][0]['env'].append({'name': 'CRAVES_EMAIL_VERIFICATION_ENABLED', 'value': 'true'})
        with self.assertRaises(runtime.guard.GuardError):
            runtime.guard.check_env(value, {'CRAVES_EMAIL_VERIFICATION_ENABLED': 'false'})


if __name__ == '__main__':
    unittest.main()

