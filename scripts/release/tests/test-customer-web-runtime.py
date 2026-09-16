#!/usr/bin/env python3
"""Pure JSON/command fixtures: no production or container calls."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import yaml

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / 'scripts/release/verify-customer-web-runtime.py'
SPEC = importlib.util.spec_from_file_location('web_runtime', SCRIPT)
runtime = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runtime)
IMAGE = 'existing.azurecr.io/craves/customer-web-next@sha256:' + 'a' * 64


def fixture():
    template = {'scale': {'minReplicas': 1, 'maxReplicas': 1}, 'containers': [{'name': 'web', 'image': IMAGE,
                'env': [{'name': 'NEXT_PUBLIC_RAZORPAY_MODE', 'value': 'production'},
                        {'name': 'DOCUMENT_TOKEN', 'secretRef': 'existing-document'}]}]}
    app = {'name': 'ca-craves-web-prodlow', 'identity': {'type': 'SystemAssigned', 'principalId': 'existing'},
           'location': 'centralindia', 'tags': {'owner': 'existing'}, 'properties': {
                'configuration': {'activeRevisionsMode': 'Single', 'secrets': [{'name': 'existing-document', 'keyVaultUrl': 'https://existing.vault.azure.net/secrets/document/version'}],
                                  'ingress': {'traffic': [{'revisionName': 'web--ready', 'weight': 100}]}},
                'template': template, 'latestRevisionName': 'web--ready', 'latestReadyRevisionName': 'web--ready',
                'provisioningState': 'Succeeded', 'runningStatus': 'Running'}}
    revisions = [{'name': 'web--ready', 'properties': {'active': True, 'healthState': 'Healthy', 'runningState': 'Running', 'trafficWeight': 100, 'template': copy.deepcopy(template)}}]
    return app, revisions, [{'name': 'one', 'properties': {'containers': [{'name': 'web', 'ready': True, 'started': True}]}}]


class CustomerWebRuntimeTest(unittest.TestCase):
    def test_entire_running_template_must_match_but_azure_unused_fields_may_differ(self):
        for kind in ('document-secret', 'literal-env', 'resource', 'scale', 'probe', 'extra-container'):
            app, revisions, replicas = fixture()
            template = revisions[0]['properties']['template']
            if kind == 'document-secret': template['containers'][0]['env'][1]['secretRef'] = 'different-document-secret'
            elif kind == 'literal-env': template['containers'][0]['env'].append({'name': 'OTHER_SETTING', 'value': 'changed'})
            elif kind == 'resource': template['containers'][0]['resources'] = {'cpu': 2}
            elif kind == 'scale': template['scale']['maxReplicas'] = 2
            elif kind == 'probe': template['containers'][0]['probes'] = [{'type': 'Readiness', 'httpGet': {'path': '/different'}}]
            elif kind == 'extra-container': template['containers'].append(copy.deepcopy(template['containers'][0]))
            with self.subTest(kind=kind), self.assertRaises(ValueError): runtime.ready(app, revisions, replicas)
        app, revisions, replicas = fixture()
        template = revisions[0]['properties']['template']
        template['revisionSuffix'] = 'azure-generated'
        template['containers'][0]['env'][0]['secretRef'] = None
        template['containers'][0]['env'][1]['value'] = ''
        template['containers'][0]['env'].reverse()
        self.assertEqual('web--ready', runtime.ready(app, revisions, replicas))

    def test_actual_container_readiness_cannot_be_absent_false_or_wrong_owner(self):
        for kind in ('missing-properties', 'missing-container', 'extra-container', 'wrong-name', 'ready', 'started', 'missing-ready', 'missing-started'):
            app, revisions, replicas = fixture()
            if kind == 'missing-properties': replicas[0].pop('properties')
            elif kind == 'missing-container': replicas[0]['properties']['containers'] = []
            elif kind == 'extra-container': replicas[0]['properties']['containers'].append({'name': 'unexpected', 'ready': True, 'started': True})
            else:
                container = replicas[0]['properties']['containers'][0]
                if kind == 'wrong-name': container['name'] = 'other'
                elif kind.startswith('missing-'): container.pop(kind.removeprefix('missing-'))
                else: container[kind] = False
            with self.subTest(kind=kind), self.assertRaises(ValueError): runtime.ready(app, revisions, replicas)

    def test_actual_revision_traffic_is_required_even_when_ingress_is_implicit(self):
        for traffic in ([], [{'revisionName': 'web--ready', 'weight': 100}]):
            for weight in (None, 0, 50, True, '100'):
                app, revisions, replicas = fixture()
                app['properties']['configuration']['ingress']['traffic'] = traffic
                if weight is None: revisions[0]['properties'].pop('trafficWeight')
                else: revisions[0]['properties']['trafficWeight'] = weight
                with self.subTest(traffic=traffic, weight=weight), self.assertRaises(ValueError): runtime.ready(app, revisions, replicas)
        app, revisions, replicas = fixture()
        app['properties']['configuration']['ingress']['traffic'] = []
        self.assertEqual('web--ready', runtime.ready(app, revisions, replicas))

    def test_ready_requires_candidate_healthy_image_traffic_and_one_replica(self):
        app, revisions, replicas = fixture()
        self.assertEqual('web--ready', runtime.ready(app, revisions, replicas))
        for kind in ('candidate', 'health', 'revision-image', 'multiple-active', 'traffic', 'replicas', 'running-mode'):
            a, r, p = copy.deepcopy((app, revisions, replicas))
            if kind == 'candidate': a['properties']['latestRevisionName'] = 'web--starting'
            elif kind == 'health': r[0]['properties']['healthState'] = 'Unhealthy'
            elif kind == 'revision-image': r[0]['properties']['template']['containers'][0]['image'] = 'old-image'
            elif kind == 'multiple-active': r.append(copy.deepcopy(r[0]))
            elif kind == 'traffic': a['properties']['configuration']['ingress']['traffic'][0]['revisionName'] = 'old-revision'
            elif kind == 'replicas': p.append({'name': 'two'})
            elif kind == 'running-mode': r[0]['properties']['template']['containers'][0]['env'][0]['value'] = 'sandbox'
            with self.subTest(kind=kind), self.assertRaises(ValueError): runtime.ready(a, r, p)

    def test_single_revision_one_replica_and_existing_production_mode_are_required(self):
        for kind in ('multiple', 'minimum', 'maximum', 'extra-container', 'duplicate-env', 'sandbox', 'secret-mode'):
            app, _, _ = fixture()
            props = app['properties']
            if kind == 'multiple': props['configuration']['activeRevisionsMode'] = 'Multiple'
            elif kind == 'minimum': props['template']['scale']['minReplicas'] = 0
            elif kind == 'maximum': props['template']['scale']['maxReplicas'] = 2
            elif kind == 'extra-container': props['template']['containers'].append(copy.deepcopy(props['template']['containers'][0]))
            elif kind == 'duplicate-env': props['template']['containers'][0]['env'].append(copy.deepcopy(props['template']['containers'][0]['env'][0]))
            elif kind == 'sandbox': props['template']['containers'][0]['env'][0]['value'] = 'sandbox'
            elif kind == 'secret-mode': props['template']['containers'][0]['env'][0]['secretRef'] = 'mode'
            with self.subTest(kind=kind), self.assertRaises(ValueError): runtime.production(app)

    def test_identity_firebase_document_payment_and_runtime_settings_are_preserved(self):
        app, _, _ = fixture()
        baseline = runtime.stable(app)
        changed = copy.deepcopy(app)
        changed['properties']['template']['containers'][0]['image'] = 'new-image'
        changed['properties']['template']['revisionSuffix'] = 'new-revision'
        self.assertEqual(baseline, runtime.stable(changed))
        for kind in ('identity', 'secret', 'env', 'mode', 'resource', 'tag'):
            a = copy.deepcopy(app)
            if kind == 'identity': a['identity']['principalId'] = 'changed'
            elif kind == 'secret': a['properties']['configuration']['secrets'][0]['keyVaultUrl'] += 'changed'
            elif kind == 'env': a['properties']['template']['containers'][0]['env'].append({'name': 'FIREBASE', 'value': 'changed'})
            elif kind == 'mode': a['properties']['template']['containers'][0]['env'][0]['value'] = 'sandbox'
            elif kind == 'resource': a['properties']['template']['containers'][0]['resources'] = {'cpu': 2}
            elif kind == 'tag': a['tags']['owner'] = 'changed'
            with self.subTest(kind=kind): self.assertNotEqual(baseline, runtime.stable(a))

    def test_cli_guards_concurrent_changes_verifies_digest_and_limits_rollback(self):
        app, revisions, replicas = fixture()
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            def invoke(mode, expected=None):
                for name, value in (('app', app), ('revisions', revisions), ('replicas', replicas)):
                    (root / (name + '.json')).write_text(json.dumps(value))
                args = [sys.executable, str(SCRIPT), mode, '--app', str(root / 'app.json'), '--revisions', str(root / 'revisions.json'),
                        '--replicas', str(root / 'replicas.json'), '--baseline', str(root / 'baseline.json')]
                if expected: args += ['--expected-image', expected]
                return subprocess.run(args, text=True, capture_output=True)
            self.assertEqual(0, invoke('capture').returncode)
            self.assertEqual(0, invoke('guard').returncode)
            self.assertEqual(0, invoke('verify', IMAGE).returncode)
            self.assertNotEqual(0, invoke('verify', 'existing.azurecr.io/web:tag').returncode)
            self.assertEqual(0, invoke('rollback-allowed', IMAGE).returncode)
            app['properties']['template']['containers'][0]['image'] = 'another-release'
            self.assertNotEqual(0, invoke('guard').returncode)
            self.assertNotEqual(0, invoke('rollback-allowed', IMAGE).returncode)
            app['properties']['template']['containers'][0]['image'] = IMAGE
            app['identity']['principalId'] = 'another-identity'
            self.assertNotEqual(0, invoke('verify', IMAGE).returncode)
            self.assertNotEqual(0, invoke('rollback-allowed', IMAGE).returncode)

    def test_pipeline_keeps_existing_settings_and_deploys_verified_digest_only(self):
        pipeline = yaml.safe_load((ROOT / 'azure-pipelines-razorpay-customer-web.yml').read_text())
        self.assertEqual('none', pipeline['trigger'])
        self.assertEqual('none', pipeline['pr'])
        parameters = {entry['name']: entry for entry in pipeline['parameters']}
        self.assertEqual('production', parameters['targetEnvironment']['default'])
        self.assertEqual('$(Build.SourceVersion)', parameters['imageTag']['default'])
        self.assertEqual('NOT_SELECTED', parameters['expectedReleaseSha']['default'])
        self.assertFalse(parameters['confirmReplaceCurrentCustomerWeb']['default'])
        self.assertEqual('NOT_SELECTED', parameters['regressionRunId']['default'])
        task = next(step for step in pipeline['steps'] if step.get('task') == 'AzureCLI@2')
        source = task['inputs']['inlineScript']
        self.assertEqual('${{ parameters.expectedReleaseSha }}', task['env']['EXPECTED_RELEASE_SHA'])
        for name in ('NEXT_PUBLIC_FIREBASE_API_KEY', 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
                     'NEXT_PUBLIC_FIREBASE_APP_ID', 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'):
            self.assertEqual('$(' + name + ')', task['env'][name])
            self.assertIn('--build-arg ' + name, source)
        self.assertIn('resolve-reviewed-service-image.sh', source)
        self.assertIn('verify-reviewed-service-source.sh', source)
        self.assertIn('verify-reviewed-service-image.sh', source)
        self.assertIn('verify_runtime guard', source)
        self.assertIn('verify_runtime verify --expected-image "$image"', source)
        self.assertIn('verify_runtime rollback-allowed --expected-image "$image"', source)
        self.assertNotIn('--set-env-vars', source)
        self.assertNotIn('--replace-env-vars', source)
        self.assertIn('--build-arg NEXT_PUBLIC_RAZORPAY_MODE=', source)
        self.assertIn('--build-arg NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK=false', source)
        self.assertIn('verify-web-release-evidence.py --sha', source)
        self.assertIn('--image "$rollback_image"', source)
        self.assertIn('Recovery verified:', source)
        self.assertIn('--origin https://craves.in', source)
        result = subprocess.run(['bash', '-n'], input=source, text=True, capture_output=True)
        self.assertEqual(0, result.returncode, result.stderr)


if __name__ == '__main__':
    unittest.main()
