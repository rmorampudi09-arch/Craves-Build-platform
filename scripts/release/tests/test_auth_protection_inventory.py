import copy
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('auth_inventory', Path(__file__).parents[1] / 'inspect-auth-protection.py')
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)


def fixture():
    template = {'containers': [{'image': 'cravesprodlowacr82121.azurecr.io/craves/auth-service:customer-email-' + 'a'*40,
                               'env': [{'name': m.PREFIX + 'ENABLED', 'value': 'false'},
                                       {'name': 'DATABASE_PASSWORD', 'value': 'PRIVATE_PASSWORD'},
                                       {'name': 'JAVA_TOOL_OPTIONS', 'value': 'PRIVATE_JVM_ARGUMENTS'}]}],
                'scale': {'minReplicas': 1, 'maxReplicas': 1}}
    app = {'properties': {'latestReadyRevisionName': m.APP + '--0000045', 'template': template}}
    revision = {'name': m.APP + '--0000045', 'properties': {'active': True, 'healthState': 'Healthy',
                'runningState': 'Running', 'replicas': 1, 'template': copy.deepcopy(template)}}
    return app, [revision]


class AuthProtectionInventoryTest(unittest.TestCase):
    def test_unscoped_mutating_and_secret_commands_do_not_run(self):
        with patch.object(m.subprocess, 'run') as run:
            for args in [('containerapp', 'update'), ('keyvault', 'secret', 'show'),
                         ('containerapp', 'show', '-g', m.RG, '-n', 'other')]:
                with self.assertRaises(ValueError): m.az(*args)
            run.assert_not_called()

    def test_safe_explicit_settings_and_source_defaults_distinguished(self):
        app, _ = fixture()
        result = m.template(app['properties']['template'])
        self.assertIs(False, result['settings'][m.PREFIX + 'ENABLED']['value'])
        self.assertEqual('ABSENT', result['settings'][m.PREFIX + 'MODE']['status'])
        self.assertFalse(result['sourceProvenanceVerified'])
        self.assertNotIn('PRIVATE', json.dumps(result))
        self.assertEqual(['JAVA_TOOL_OPTIONS'], result['possibleOverrideNames'])

    def test_secret_bound_allowed_setting_not_resolved_or_exported(self):
        result = m.setting({'secretRef': 'PRIVATE_BINDING', 'value': 'PRIVATE_VALUE'}, ('boolean', False))
        self.assertEqual('SECRET_REFERENCE_NOT_RESOLVED', result['status'])
        self.assertNotIn('PRIVATE', json.dumps(result))

    def test_malformed_values_are_withheld(self):
        for spec in m.SETTINGS.values():
            self.assertNotIn('PRIVATE', json.dumps(m.setting({'value': 'PRIVATE_VALUE'}, spec)))
        for value in ('0', '10001', '-1', '1e2', True, None, '9'*100):
            self.assertNotEqual('EXPLICIT_ENVIRONMENT', m.setting({'value': value}, ('number', 120, 1, 10000))['status'])

    def test_numeric_limits_and_modes(self):
        self.assertEqual(6, m.setting({'value': '6'}, ('number', 6, 1, 32))['value'])
        self.assertEqual('postgres', m.setting({'value': 'postgres'}, ('mode', 'redis'))['value'])

    def test_duplicate_environment_rejected(self):
        app, _ = fixture()
        template = app['properties']['template']
        template['containers'][0]['env'].append(template['containers'][0]['env'][0])
        with self.assertRaises(ValueError): m.template(template)

    def test_unrecognized_image_never_exported(self):
        app, _ = fixture()
        app['properties']['template']['containers'][0]['image'] = 'https://PRIVATE_CREDENTIAL@example.com/image'
        with self.assertRaisesRegex(ValueError, '^Auth image reference not in expected registry/repository$'):
            m.template(app['properties']['template'])

    def run_inspect(self, app=None, revisions=None, after_app=None, after_revisions=None):
        original_app, original_revisions = fixture()
        app = app if app is not None else original_app
        revisions = revisions if revisions is not None else original_revisions
        with patch.object(m, 'az', side_effect=[{'id': m.SUB}, app, revisions,
                         after_app if after_app is not None else app,
                         after_revisions if after_revisions is not None else revisions]):
            return m.inspect()

    def test_read_only_snapshot_not_activation_acceptance(self):
        result = self.run_inspect()
        self.assertTrue(result['readOnly'])
        self.assertFalse(result['activationAccepted'])
        self.assertFalse(result['activationPerformed'])
        self.assertEqual(0, result['customerRequestsSent'])
        self.assertTrue(result['reportedSettingsMatch'])
        self.assertNotIn('PRIVATE', json.dumps(result))

    def test_desired_running_setting_difference_visible(self):
        app, revisions = fixture()
        revisions[0]['properties']['template']['containers'][0]['env'][0]['value'] = 'true'
        self.assertFalse(self.run_inspect(app, revisions)['reportedSettingsMatch'])

    def test_configuration_and_revision_drift_stop(self):
        app, revisions = fixture()
        changed = copy.deepcopy(app)
        changed['properties']['template']['containers'][0]['env'][-1]['value'] = 'PRIVATE_CHANGED'
        with self.assertRaisesRegex(ValueError, 'configuration changed'): self.run_inspect(after_app=changed)
        changed_revisions = copy.deepcopy(revisions)
        changed_revisions[0]['properties']['replicas'] = 2
        with self.assertRaisesRegex(ValueError, 'revision state changed'): self.run_inspect(after_revisions=changed_revisions)

    def test_missing_or_multiple_active_revisions_stop(self):
        _, revisions = fixture()
        for active in ([], revisions + revisions):
            with self.assertRaisesRegex(ValueError, 'Ambiguous'): self.run_inspect(revisions=active)

    def test_wrong_subscription_stops_before_resource_read(self):
        with patch.object(m, 'az', return_value={'id': 'other'}) as az:
            with self.assertRaisesRegex(ValueError, 'Unexpected subscription'): m.inspect()
            self.assertEqual(1, az.call_count)


if __name__ == '__main__': unittest.main()
