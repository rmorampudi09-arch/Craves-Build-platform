#!/usr/bin/env python3
"""Offline release tests: mocked registry/Docker commands, disposable Git checkout."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


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
                     'resolve-reviewed-service-image.sh'):
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


if __name__ == '__main__': unittest.main()
