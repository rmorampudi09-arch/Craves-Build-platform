import copy
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('referral_upgrade', Path(__file__).with_name('upgrade-existing-backend.py'))
target = importlib.util.module_from_spec(spec)
spec.loader.exec_module(target)
IMAGE = target.REGISTRY + '.azurecr.io/' + target.REPOSITORY + '@sha256:' + 'a' * 64


def app_fixture():
    env = [{'name': flag, 'value': 'false'} for flag in sorted(target.FLAGS)]
    env += [{'name': 'CRAVES_REFERRALS_AUTH_VERIFICATION_MODE', 'value': 'AUTH_HTTP'}]
    env += [{'name': key, 'secretRef': reference} for key, reference in
            [('REFERRAL_DB_URL', 'referral-db-url'), ('REFERRAL_DB_USER', 'referral-db-user'), ('REFERRAL_DB_PASSWORD', 'referral-db-password')]]
    refs = [{'name': reference, 'keyVaultUrl': f'https://{target.VAULT}.vault.azure.net/secrets/{name}', 'identity': target.IDENTITY}
            for reference, name in [('referral-db-url', 'craves-referral-db-url'), ('referral-db-user', 'craves-referral-db-user'), ('referral-db-password', 'craves-referral-db-runtime-password')]]
    return {'id': target.RESOURCE, 'name': target.APP, 'identity': {'userAssignedIdentities': {target.IDENTITY: {}}},
            'properties': {'provisioningState': 'Succeeded', 'latestRevisionName': 'r1', 'latestReadyRevisionName': 'r1',
                           'managedEnvironmentId': 'existing-environment', 'configuration': {
                               'activeRevisionsMode': 'Single', 'ingress': {'external': False, 'allowInsecure': False, 'targetPort': 8080, 'traffic': [{'latestRevision': True, 'weight': 100}]}, 'secrets': refs},
                           'template': {'containers': [{'name': 'referral-service', 'image': IMAGE, 'env': env, 'resources': {'cpu': 1, 'memory': '2Gi'}}],
                                        'scale': {'minReplicas': 1, 'maxReplicas': 1}}}}


def migration_fixture():
    rows = []
    directory = target.ROOT / 'services/referral-service/src/main/resources/db/referral_migration'
    files = {p.name.split('__')[0][1:].replace('_', '.'): p for p in directory.glob('V*__*.sql')}
    for version in target.VERSIONS:
        path = files[version]
        rows.append({'type': 'SQL', 'success': True, 'version': version, 'script': path.name,
                     'checksum': target.history.crc(path.read_text(encoding='utf-8-sig'))})
    return rows


class ExistingReferralUpgradeTests(unittest.TestCase):
    def test_dormant_existing_app_is_accepted(self):
        self.assertEqual(64, len(target.validate_app(app_fixture())))

    def test_unknown_action_never_contacts_azure(self):
        with patch.object(target, 'az') as azure:
            with self.assertRaises(ValueError): target.main('activate')
            azure.assert_not_called()

    def test_upgrade_requires_confirmation_and_reviewed_digest_before_azure(self):
        for env in ({}, {'REFERRAL_UPGRADE_CONFIRMATION': 'UPGRADE_EXISTING_DORMANT_REFERRAL'},
                    {'REFERRAL_UPGRADE_CONFIRMATION': 'UPGRADE_EXISTING_DORMANT_REFERRAL', 'REFERRAL_UPGRADE_DIGEST': 'latest'}):
            with patch.dict(target.os.environ, env, clear=True), patch.object(target, 'az') as azure:
                with self.assertRaises(ValueError): target.main('upgrade')
                azure.assert_not_called()

    def test_health_check_rejects_concurrent_runtime_change(self):
        original_app = app_fixture()
        modified = copy.deepcopy(original_app)
        modified['properties']['template']['scale']['maxReplicas'] = 2
        with patch.object(target, 'show', return_value=modified), patch.object(target, 'az') as azure:
            with self.assertRaisesRegex(ValueError, 'UNRELATED_RUNTIME_CHANGED'):
                target.wait_ready(IMAGE, target.fingerprint(original_app))
            azure.assert_not_called()

    def test_ready_revision_requires_actual_health(self):
        app = app_fixture()
        revision = {'properties': {'healthState': 'Healthy', 'runningState': 'Running', 'active': True}}
        with patch.object(target, 'show', return_value=app), patch.object(target, 'az', side_effect=[revision, [{}]]):
            self.assertEqual('r1', target.wait_ready(IMAGE, target.fingerprint(app)))

    def test_traffic_cannot_remain_on_an_old_or_split_revision(self):
        for traffic in ([], [{'revisionName': 'old', 'weight': 100}], [{'latestRevision': True, 'weight': 50}]):
            app = app_fixture()
            app['properties']['configuration']['ingress']['traffic'] = traffic
            with self.assertRaisesRegex(ValueError, 'LATEST_REVISION_TRAFFIC_REQUIRED'): target.validate_app(app)

    def test_healthy_revision_still_requires_exact_replica_count(self):
        app = app_fixture()
        revision = {'properties': {'healthState': 'Healthy', 'runningState': 'Running', 'active': True}}
        for replicas in ([], [{}, {}]):
            with patch.object(target, 'show', return_value=app), patch.object(target, 'az', side_effect=[revision, replicas]):
                with self.assertRaisesRegex(ValueError, 'EXACT_ONE_RUNNING_REPLICA_REQUIRED'):
                    target.wait_ready(IMAGE, target.fingerprint(app))

    def test_never_provisions_another_app(self):
        app = app_fixture()
        app['id'] += '-other'
        with self.assertRaises(ValueError): target.validate_app(app)

    def test_public_or_insecure_ingress_rejected(self):
        for key in ('external', 'allowInsecure'):
            app = app_fixture()
            app['properties']['configuration']['ingress'][key] = True
            with self.assertRaises(ValueError): target.validate_app(app)

    def test_active_rewards_or_workers_rejected(self):
        for flag in (*target.FLAGS, 'CRAVES_REFERRALS_CHEF_EARNINGS_ENABLED'):
            app = app_fixture()
            env = app['properties']['template']['containers'][0]['env']
            env[:] = [v for v in env if v['name'] != flag] + [{'name': flag, 'value': 'true'}]
            with self.assertRaises(ValueError): target.validate_app(app)

    def test_duplicate_or_missing_flags_rejected(self):
        app = app_fixture()
        env = app['properties']['template']['containers'][0]['env']
        env.append(copy.deepcopy(env[0]))
        with self.assertRaises(ValueError): target.validate_app(app)
        app = app_fixture()
        app['properties']['template']['containers'][0]['env'].pop(0)
        with self.assertRaises(ValueError): target.validate_app(app)

    def test_secret_scope_or_identity_change_rejected(self):
        for key, value in [('keyVaultUrl', 'https://other.vault.azure.net/secrets/password'), ('identity', '/other-identity')]:
            app = app_fixture()
            app['properties']['configuration']['secrets'][0][key] = value
            with self.assertRaises(ValueError): target.validate_app(app)

    def test_replica_increase_or_unsettled_state_rejected(self):
        app = app_fixture()
        app['properties']['template']['scale']['maxReplicas'] = 2
        with self.assertRaises(ValueError): target.validate_app(app)
        app = app_fixture()
        app['properties']['latestRevisionName'] = 'r2'
        with self.assertRaises(ValueError): target.validate_app(app)

    def test_mutable_or_other_repository_image_rejected(self):
        for image in ('registry/image:latest', IMAGE.replace('referral-service', 'auth-service'), IMAGE + ' --arg'):
            self.assertFalse(target.immutable_image(image))
            with patch.object(target, 'az') as azure:
                with self.assertRaises(ValueError): target.update_image(image)
                azure.assert_not_called()

    def test_fingerprint_preserves_configuration_not_image(self):
        app = app_fixture()
        original = target.fingerprint(app)
        app['properties']['template']['containers'][0]['image'] = IMAGE[:-1] + 'b'
        self.assertEqual(original, target.fingerprint(app))
        with self.assertRaisesRegex(ValueError, 'CONCURRENT_IMAGE_CHANGE'):
            target.unchanged(app, original, IMAGE)
        app['properties']['template']['containers'][0]['resources']['cpu'] = 2
        self.assertNotEqual(original, target.fingerprint(app))

    def test_sequential_old_and_current_history(self):
        rows = migration_fixture()
        self.assertEqual(['9', '10'], target.validate_history(rows[:9])['pendingVersions'])
        self.assertEqual(['10'], target.validate_history(rows[:10])['pendingVersions'])
        self.assertEqual([], target.validate_history(rows)['pendingVersions'])

    def test_modified_failed_or_unknown_history_rejected(self):
        for field, value in [('checksum', 0), ('success', False), ('type', 'BASELINE'), ('version', '999')]:
            rows = migration_fixture()
            rows[0][field] = value
            with self.assertRaises(ValueError): target.validate_history(rows)

    def test_partial_duplicate_or_missing_history_rejected(self):
        rows = migration_fixture()
        for invalid in ([], rows[:5], rows[:9] + rows[:1], rows[:8] + rows[9:]):
            with self.assertRaises(ValueError): target.validate_history(invalid)

    def test_read_query_requires_readonly_connection(self):
        with patch.object(target.subprocess, 'run') as run:
            with self.assertRaises(ValueError): target.sql_read('SELECT 1', {})
            run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
