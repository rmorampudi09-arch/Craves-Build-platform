#!/usr/bin/env python3
"""Pure fixture tests; no Azure, credentials, provider calls or live changes."""
import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('guard', Path(__file__).with_name('release-guard.py'))
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


def apps():
    return [
        {'name': guard.APP, 'identity': {'type': 'SystemAssigned'}, 'properties': {
            'latestRevisionName': 'auth--1', 'latestReadyRevisionName': 'auth--1',
            'template': {'revisionSuffix': '1', 'scale': {'minReplicas': 1, 'maxReplicas': 1}, 'containers': [{'image': 'old', 'env': [{'name': 'CRAVES_ACADEMY_ENABLED', 'value': 'true'}, {'name': 'DB_PASSWORD', 'secretRef': 'test-reference'}]}]},
            'configuration': {'activeRevisionsMode': 'Single', 'ingress': {'external': True, 'traffic': [{'latestRevision': True, 'weight': 100}]}}}},
        {'name': 'other-existing-app', 'properties': {'template': {'containers': [{'image': 'unchanged'}]}, 'configuration': {'activeRevisionsMode': 'Single'}}},
    ]


class ReleaseGuardTest(unittest.TestCase):
    def test_only_academy_auth_paths_are_allowed(self):
        self.assertTrue(guard.allowed_auth_change('services/auth-service/src/main/resources/academy/engineering/index.json'))
        for path in ['services/auth-service/pom.xml', 'services/auth-service/src/main/resources/db/migration/V9__change.sql', 'services/auth-service/src/main/java/in/craves/auth/security/CurrentUser.java', 'services/auth-service/src/main/resources/academy/../application.yml']:
            self.assertFalse(guard.allowed_auth_change(path))

    def test_image_only_change_passes(self):
        before = guard.snapshot(apps())
        changed = apps()
        changed[0]['properties']['template']['containers'][0]['image'] = 'new'
        changed[0]['properties']['template']['revisionSuffix'] = '2'
        changed[0]['properties']['latestRevisionName'] = 'auth--2'
        changed[0]['properties']['latestReadyRevisionName'] = 'auth--2'
        guard.compare(before, guard.snapshot(changed), 'new')

    def test_other_service_change_is_detected(self):
        before = guard.snapshot(apps())
        changed = apps()
        changed[1]['properties']['template']['containers'][0]['image'] = 'different'
        with self.assertRaises(ValueError):
            guard.compare(before, guard.snapshot(changed), 'old')

    def test_non_image_auth_change_is_detected(self):
        before = guard.snapshot(apps())
        changed = apps()
        changed[0]['properties']['template']['containers'][0]['env'][1]['secretRef'] = 'different'
        with self.assertRaises(ValueError):
            guard.compare(before, guard.snapshot(changed), 'old')

    def test_unapproved_scale_is_rejected(self):
        changed = apps()
        changed[0]['properties']['template']['scale']['maxReplicas'] = 2
        with self.assertRaises(ValueError):
            guard.snapshot(changed)

    def test_disabled_or_secret_backed_flag_is_rejected(self):
        for value in [{'name': 'CRAVES_ACADEMY_ENABLED', 'value': 'false'}, {'name': 'CRAVES_ACADEMY_ENABLED', 'secretRef': 'flag'}]:
            changed = apps()
            changed[0]['properties']['template']['containers'][0]['env'][0] = value
            with self.assertRaises(ValueError):
                guard.snapshot(changed)

    def test_unready_baseline_and_wrong_target_are_rejected(self):
        changed = apps()
        changed[0]['properties']['latestReadyRevisionName'] = 'auth--0'
        with self.assertRaises(ValueError):
            guard.snapshot(changed)
        before = guard.snapshot(apps())
        with self.assertRaises(ValueError):
            guard.compare(before, copy.deepcopy(before), 'wrong-image')

    def test_evidence_contains_no_environment_values_or_references(self):
        result = str(guard.snapshot(apps()))
        self.assertNotIn('DB_PASSWORD', result)
        self.assertNotIn('test-reference', result)
        self.assertIn('configurationHash', result)


if __name__ == '__main__':
    unittest.main()
