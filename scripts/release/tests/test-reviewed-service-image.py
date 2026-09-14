#!/usr/bin/env python3
"""Offline release tests: mocked registry/Docker commands, disposable Git checkout."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

import yaml

ROOT = Path(__file__).resolve().parents[3]
DIGEST = 'sha256:' + 'b' * 64
CONFIG_ID = 'sha256:' + 'c' * 64
PINNED = 'existingregistry.azurecr.io/craves/auth-service@' + DIGEST
SERVICES = ('auth', 'user-chef', 'order', 'catalog', 'integration', 'notification')


class ReviewedServiceImageTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.calls = self.root / 'calls.jsonl'
        self.repo = self.root / 'repo'
        self.repo.mkdir()
        for args in (('init', '-q'), ('config', 'user.name', 'Release fixture'),
                     ('config', 'user.email', 'fixture@example.invalid')):
            subprocess.run(['git', *args], cwd=self.repo, check=True, capture_output=True)
        (self.repo / 'source').write_text('reviewed source\n')
        subprocess.run(['git', 'add', 'source'], cwd=self.repo, check=True)
        subprocess.run(['git', 'commit', '-qm', 'Fixture'], cwd=self.repo, check=True)
        self.sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=self.repo, text=True).strip()
        self.helpers = self.root / 'helpers'
        self.helpers.mkdir()
        for name in ('verify-reviewed-service-source.sh', 'verify-reviewed-service-image.sh',
                     'resolve-reviewed-service-image.sh', 'deploy-single-service-preserve-runtime.sh'):
            shutil.copy2(ROOT / 'scripts/release' / name, self.helpers / name)
        command = '''#!/usr/bin/env python3
import json, os, pathlib, sys
name = pathlib.Path(sys.argv[0]).name
a = sys.argv[1:]
with open(os.environ['CALL_LOG'], 'a') as stream:
    stream.write(json.dumps([name, *a]) + '\\n')
if name == 'az' and a[:2] == ['acr', 'show']:
    print(os.environ.get('MOCK_LOGIN', 'existingregistry.azurecr.io'))
elif name == 'az' and a[:3] == ['acr', 'repository', 'show']:
    print(os.environ['MOCK_DIGEST'])
elif name == 'docker' and a[:1] == ['pull']:
    sys.exit(int(os.environ.get('MOCK_PULL_STATUS', '0')))
elif name == 'docker' and a[:2] == ['image', 'inspect']:
    print(os.environ['MOCK_CONFIG_ID'] if a[-1] == '{{.Id}}' else os.environ['MOCK_SOURCE'])
else:
    sys.exit('Unexpected command: ' + repr([name, *a]))
'''
        for name in ('az', 'docker'):
            (self.bin / name).write_text(command)
            (self.bin / name).chmod(0o755)
        self.env = dict(os.environ, PATH=str(self.bin) + os.pathsep + os.environ['PATH'],
                        CALL_LOG=str(self.calls), MOCK_DIGEST=DIGEST, MOCK_CONFIG_ID=CONFIG_ID,
                        MOCK_SOURCE=self.sha, EXPECTED_RELEASE_SHA=self.sha,
                        BUILD_SOURCEVERSION=self.sha, REQUESTED_IMAGE_TAG=self.sha)

    def run_script(self, name, *args):
        return subprocess.run(['bash', str(self.helpers / name), *args], cwd=self.repo,
                              env=self.env, text=True, capture_output=True)

    def resolve(self):
        return self.run_script('resolve-reviewed-service-image.sh', 'existingregistry',
                               'craves/auth-service', CONFIG_ID)

    def test_resolves_published_digest_and_checks_built_source_and_content(self):
        result = self.resolve()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), PINNED)
        calls = [json.loads(line) for line in self.calls.read_text().splitlines()]
        self.assertIn(['docker', 'pull', PINNED], calls)
        self.assertIn('craves/auth-service:' + self.sha, calls[1])
        self.assertEqual(len(calls), 5)

    def test_moved_same_sha_tag_cannot_replace_the_built_image(self):
        self.env['MOCK_CONFIG_ID'] = 'sha256:' + 'd' * 64
        result = self.resolve()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('differs from the locally built image', result.stderr)
        self.assertEqual(result.stdout, '')

    def test_wrong_or_missing_source_label_is_rejected(self):
        for source in ('', '<no value>', 'a' * 40):
            with self.subTest(source=source):
                self.env['MOCK_SOURCE'] = source
                result = self.resolve()
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('source label differs', result.stderr)
                self.assertEqual(result.stdout, '')

    def test_invalid_registry_digest_and_pull_failure_fail_closed(self):
        for key, value in (('MOCK_LOGIN', 'unapproved.invalid'), ('MOCK_DIGEST', 'latest'),
                           ('MOCK_PULL_STATUS', '1')):
            with self.subTest(key=key):
                previous = self.env.get(key)
                self.env[key] = value
                result = self.resolve()
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout, '')
                if previous is None:
                    del self.env[key]
                else:
                    self.env[key] = previous

    def test_wrong_checkout_build_sha_or_tag_fails_before_registry_access(self):
        for key, value in (('EXPECTED_RELEASE_SHA', 'a' * 40), ('EXPECTED_RELEASE_SHA', 'short'),
                           ('BUILD_SOURCEVERSION', 'd' * 40), ('REQUESTED_IMAGE_TAG', '12345')):
            with self.subTest(key=key, value=value):
                old = self.env[key]
                self.env[key] = value
                result = self.resolve()
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(self.calls.exists())
                self.env[key] = old
        self.env.update(EXPECTED_RELEASE_SHA='a' * 40, BUILD_SOURCEVERSION='a' * 40,
                        REQUESTED_IMAGE_TAG='a' * 40)
        result = self.resolve()
        self.assertIn('checkout differs', result.stderr)
        self.assertFalse(self.calls.exists())

    def test_tracked_source_change_fails_before_registry_access(self):
        (self.repo / 'source').write_text('unreviewed change\n')
        result = self.resolve()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('tracked source changes', result.stderr)
        self.assertFalse(self.calls.exists())

    def test_deployment_rechecks_saved_digest_without_tag_resolution(self):
        self.env['MOCK_DIGEST'] = 'sha256:' + 'd' * 64
        result = self.run_script('verify-reviewed-service-image.sh', PINNED)
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = [json.loads(line) for line in self.calls.read_text().splitlines()]
        self.assertEqual(calls[0], ['docker', 'pull', PINNED])
        self.assertTrue(all(call[0] == 'docker' for call in calls))

    def test_reviewed_deployment_rejects_mutable_image_before_any_azure_read(self):
        self.env['REQUIRE_REVIEWED_DIGEST'] = 'true'
        result = self.run_script('deploy-single-service-preserve-runtime.sh',
                                 'existing-rg', 'existing-app',
                                 'existingregistry.azurecr.io/craves/auth-service:' + self.sha, 'auth')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('immutable ACR image digest', result.stderr)
        self.assertFalse(self.calls.exists())

    def test_reviewed_deployment_rejects_wrong_published_source_before_azure(self):
        self.env.update(REQUIRE_REVIEWED_DIGEST='true', MOCK_SOURCE='a' * 40)
        result = self.run_script('deploy-single-service-preserve-runtime.sh',
                                 'existing-rg', 'existing-app', PINNED, 'auth')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('source label differs', result.stderr)
        calls = [json.loads(line) for line in self.calls.read_text().splitlines()]
        self.assertTrue(all(call[0] == 'docker' for call in calls))


class ReviewedPipelineContractTest(unittest.TestCase):
    def test_six_pipelines_bind_one_reviewed_source_and_carry_digest_to_deployment(self):
        for service in SERVICES:
            with self.subTest(service=service):
                pipeline = yaml.safe_load((ROOT / f'azure-pipelines-{service}-service.yml').read_text())
                self.assertEqual(pipeline['trigger'], 'none')
                self.assertEqual(pipeline['pr'], 'none')
                parameters = {p['name']: p for p in pipeline['parameters']}
                self.assertEqual(parameters['imageTag']['default'], '$(Build.SourceVersion)')
                self.assertEqual(parameters['expectedReleaseSha']['default'], 'NOT_SELECTED')
                steps = pipeline['steps']
                validation = next(s for s in steps if s.get('displayName') == 'Verify exact reviewed checkout and image tag')
                java = next(s for s in steps if s.get('task') == 'JavaToolInstaller@0')
                self.assertLess(steps.index(validation), steps.index(java))
                build = next(s for s in steps if s.get('displayName', '').startswith('Build and push immutable'))
                deploy = next(s for s in steps if s.get('displayName', '').startswith('Deploy '))
                for step in (validation, build, deploy):
                    self.assertEqual(step['env']['EXPECTED_RELEASE_SHA'], '${{ parameters.expectedReleaseSha }}')
                    self.assertEqual(step['env']['REQUESTED_IMAGE_TAG'], '${{ parameters.imageTag }}')
                build_script = build['inputs']['inlineScript']
                self.assertIn('--label "org.opencontainers.image.revision=$EXPECTED_RELEASE_SHA"', build_script)
                self.assertIn('resolve-reviewed-service-image.sh', build_script)
                self.assertIn('REVIEWED_SERVICE_IMAGE;isReadOnly=true', build_script)
                deploy_script = deploy['inputs']['inlineScript']
                self.assertIn('verify-reviewed-service-source.sh', deploy_script)
                self.assertIn('IMAGE="$REVIEWED_SERVICE_IMAGE"', deploy_script)
                self.assertNotIn('az acr', deploy_script)
                self.assertEqual(deploy['env']['REQUIRE_REVIEWED_DIGEST'], 'true')
                self.assertEqual(deploy['env']['REVIEWED_SERVICE_IMAGE'], '$(REVIEWED_SERVICE_IMAGE)')
                # Azure template substitution is not required to check Bash grammar.
                for script in (build_script, deploy_script):
                    result = subprocess.run(['bash', '-n'], input=script, text=True, capture_output=True)
                    self.assertEqual(result.returncode, 0, result.stderr)

    def test_legacy_callers_are_not_forced_into_new_reviewed_mode(self):
        helper = (ROOT / 'scripts/release/deploy-single-service-preserve-runtime.sh').read_text()
        self.assertIn('REQUIRE_REVIEWED_DIGEST=${REQUIRE_REVIEWED_DIGEST:-false}', helper)
        self.assertIn('"$REQUIRE_REVIEWED_DIGEST" == true && "$DEPLOY_PREFLIGHT_ONLY" == false', helper)
        for file in ('azure-pipelines-subscription-service.yml', 'scripts/release/deploy-backend-release.sh'):
            self.assertNotIn('REQUIRE_REVIEWED_DIGEST', (ROOT / file).read_text())


if __name__ == '__main__':
    unittest.main()
