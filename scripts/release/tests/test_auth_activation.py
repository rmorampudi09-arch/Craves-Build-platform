import copy
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('auth_release', Path(__file__).parents[1] / 'release-auth-protection.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
IMAGE = 'cravesprodlowacr82121.azurecr.io/craves/auth-service@sha256:' + 'a' * 64


def fixture():
    return {'name': release.APP, 'properties': {
        'configuration': {'activeRevisionsMode': 'Single', 'ingress': {'external': False, 'traffic': []},
                          'secrets': [{'name': 'binding', 'keyVaultUrl': 'https://private.example/secret'}]},
        'template': {'scale': {'minReplicas': 1, 'maxReplicas': 1}, 'containers': [
            {'name': 'auth', 'image': IMAGE, 'resources': {'cpu': .5, 'memory': '1Gi'}, 'env': [
                {'name': 'SPRING_PROFILES_ACTIVE', 'value': 'prod'},
                {'name': 'CRAVES_AUTH_RATE_LIMIT_ENABLED', 'value': 'false'},
                {'name': 'EMAIL_ENABLED', 'value': 'true'},
                {'name': 'DB_PASSWORD', 'secretRef': 'binding'}]}]}}}


class AuthActivationTest(unittest.TestCase):
    def test_only_immutable_scoped_image(self):
        args = release.update_args(IMAGE)
        self.assertEqual(args[7], IMAGE)
        self.assertNotIn('--replace-env-vars', args)
        for image in [IMAGE.replace('/auth-service@', '/order-service@'), IMAGE.replace('@sha256:', ':')]:
            with self.assertRaises(ValueError): release.update_args(image)

    def test_write_shape_enforced_before_cli(self):
        with patch.object(release.subprocess, 'run') as run:
            run.return_value.returncode = 0
            run.return_value.stdout = '{}'
            release.az(*release.update_args(IMAGE))
            self.assertEqual(run.call_count, 1)
            for args in [('containerapp', 'delete', '-g', release.RG, '-n', release.APP),
                         ('containerapp', 'update', '-g', release.RG, '-n', release.APP, '--image', IMAGE,
                          '--set-env-vars', 'CRAVES_AUTH_RATE_LIMIT_ENABLED=false')]:
                with self.assertRaises(ValueError): release.az(*args)
            self.assertEqual(run.call_count, 1)

    def test_protected_change_preserves_other_settings(self):
        before = fixture()
        after = copy.deepcopy(before)
        env = after['properties']['template']['containers'][0]['env']
        env[:] = [e for e in env if e['name'] not in release.SETTINGS]
        env.extend({'name': name, 'value': value} for name, value in release.SETTINGS.items())
        release.explicit_settings(after)
        self.assertEqual(release.fingerprint(before), release.fingerprint(after))
        env.append({'name': 'UNRELATED_FLAG', 'value': 'changed'})
        self.assertNotEqual(release.fingerprint(before), release.fingerprint(after))

    def test_identity_ingress_and_secret_drift_detected(self):
        before = fixture()
        for mutate in [lambda a: a.update(identity={'type': 'changed'}),
                       lambda a: a['properties']['configuration']['ingress'].update(external=True),
                       lambda a: a['properties']['configuration']['secrets'][0].update(keyVaultUrl='changed')]:
            after = copy.deepcopy(before)
            mutate(after)
            self.assertNotEqual(release.fingerprint(before), release.fingerprint(after))

    def test_unreviewed_overrides_fail_closed(self):
        for entry in [{'name': 'JAVA_TOOL_OPTIONS', 'value': '-Dunknown=true'},
                      {'name': 'CRAVES_AUTH_RATE_LIMIT_UNKNOWN', 'value': '1'},
                      {'name': 'craves.auth.rate-limit.enabled', 'value': 'false'}]:
            app = fixture()
            app['properties']['template']['containers'][0]['env'].append(entry)
            with self.assertRaises(ValueError): release.production(app)

    def test_wrong_profile_and_duplicate_settings_rejected(self):
        for entry in [{'name': 'SPRING_PROFILES_ACTIVE', 'value': 'local'},
                      {'name': 'SPRING_PROFILES_ACTIVE', 'value': 'prod'}]:
            app = fixture()
            app['properties']['template']['containers'][0]['env'].append(entry)
            with self.assertRaises(ValueError): release.production(app)

    def test_null_secret_representation_accepted_not_value_changes(self):
        app = fixture()
        app['properties']['template']['containers'][0]['env'][0]['secretRef'] = None
        release.production(app)

    def test_disabled_and_missing_settings_rejected(self):
        with self.assertRaises(ValueError): release.explicit_settings(fixture())

    def test_smoke_exact_bound_without_provider_requests(self):
        sent = []
        def send(path, body):
            sent.append((path, body))
            n = len(sent)
            return {'status': 400 if n <= 2 else 429 if n == 13 else 401,
                    'code': 'AUTH_REQUEST_INVALID' if n <= 2 else 'AUTH_RATE_LIMITED' if n == 13 else 'INVALID_REFRESH_TOKEN',
                    'private': True, 'retryAfter': '45' if n == 13 else None}
        self.assertEqual(len(release.smoke(send, lambda: 120, lambda _: self.fail('Unexpected wait'))), 13)
        self.assertEqual(sent[0], ('/firebase/exchange', {}))
        self.assertEqual({p for p, body in sent if body}, {'/refresh'})
        self.assertEqual(len({b['refreshToken'] for _, b in sent if b}), 1)

    def test_smoke_stops_at_first_unexpected_response(self):
        calls = []
        def send(*args):
            calls.append(args)
            return {'status': 429, 'code': 'AUTH_RATE_LIMITED', 'private': True, 'retryAfter': '60'}
        with self.assertRaises(ValueError): release.smoke(send, lambda: 120)
        self.assertEqual(len(calls), 1)

    def test_smoke_stops_on_window_boundary(self):
        ticks = iter([120, 120, 180])
        calls = []
        def send(*args):
            calls.append(args)
            return {'status': 400, 'code': 'AUTH_REQUEST_INVALID', 'private': True}
        with self.assertRaises(ValueError): release.smoke(send, lambda: next(ticks))
        self.assertEqual(len(calls), 2)

    def test_pipeline_pins_tests_and_image_before_activation(self):
        source = (Path(__file__).parents[3] / 'pipelines/auth-protection-release-steps.yml').read_text()
        self.assertEqual(source.count('verify-web-release-evidence.py --sha'), 2)
        self.assertIn('inspect-applied-email-history.py', source)
        self.assertIn('org.opencontainers.image.revision=$EXPECTED_RELEASE_SHA', source)
        self.assertIn('resolve-reviewed-service-image.sh', source)
        self.assertLess(source.index('resolve-reviewed-service-image.sh'), source.index('release-auth-protection.py --image'))


if __name__ == '__main__': unittest.main()
