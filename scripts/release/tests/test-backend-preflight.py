#!/usr/bin/env python3
"""Release regression: invalid secret bindings must fail before any image update."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[3]


class BackendPreflightTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        release = self.root / 'scripts/release'
        release.mkdir(parents=True)
        for name in ('deploy-backend-release.sh', 'deploy-single-service-preserve-runtime.sh'):
            shutil.copy2(ROOT / 'scripts/release' / name, release / name)
        (release / 'smoke-containerapp-health.sh').write_text('exit 99\n')
        self.calls = self.root / 'azure-calls.jsonl'
        mock = self.root / 'az'
        mock.write_text('''#!/usr/bin/env python3
import json, os, sys
a = sys.argv[1:]
with open(os.environ['AZURE_CALL_LOG'], 'a') as f:
    f.write(json.dumps(a) + '\\n')
app = a[a.index('--name') + 1] if '--name' in a else ''
if a[:2] == ['containerapp', 'show']:
    print(json.dumps({'properties': {'latestReadyRevisionName': 'previous',
        'template': {'containers': [{'env': [{'name': 'CREDENTIAL', 'secretRef': 'credential'}]}]}}}))
elif a[:3] == ['containerapp', 'revision', 'show']:
    print('registry/service:previous')
elif a[:3] == ['containerapp', 'secret', 'list']:
    secret = {'name': 'credential'}
    if app != os.environ.get('BAD_APP'):
        secret.update(keyVaultUrl='https://existing.vault.azure.net/secrets/credential', identity='system')
    print(json.dumps([secret]))
elif a[:3] == ['acr', 'repository', 'show']:
    print('{}')
else:
    sys.exit('Unexpected Azure operation: ' + repr(a))
''')
        mock.chmod(0o755)
        self.env = dict(os.environ, PATH=str(self.root) + os.pathsep + os.environ['PATH'],
                        AZURE_CALL_LOG=str(self.calls), DEPLOY_PREFLIGHT_ONLY='true')
        self.helper = release / 'deploy-single-service-preserve-runtime.sh'

    def run_helper(self):
        return subprocess.run(['bash', str(self.helper), 'test-rg', 'notification',
                               'registry/service:previous', 'notification'],
                              env=self.env, text=True, capture_output=True)

    def assert_no_mutation(self):
        calls = [json.loads(line) for line in self.calls.read_text().splitlines()]
        self.assertFalse(any(a[:2] == ['containerapp', 'update'] for a in calls))
        self.assertFalse(any('--show-values' in a for a in calls))

    def test_valid_preflight_allows_already_deployed_image_without_mutation(self):
        result = self.run_helper()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('deployment preflight passed', result.stdout)
        self.assert_no_mutation()

    def test_local_secret_still_fails_key_vault_guard(self):
        self.env['BAD_APP'] = 'notification'
        result = self.run_helper()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('not Key Vault-backed', result.stderr)
        self.assert_no_mutation()

    def test_second_service_failure_prevents_first_service_deployment(self):
        keys = ['auth', 'notification', 'userChef', 'catalog', 'integration', 'subscription', 'order']
        pack = {'azure': {'resourceGroup': 'test-rg', 'containerRegistry': 'registry',
                          'containerRegistryLoginServer': 'registry'},
                'services': [{'key': key, 'containerApp': key, 'imageRepository': key} for key in keys],
                'stepOneDormantFlags': []}
        manifest = {'schemaVersion': 1, 'registry': 'registry', 'sourceSha': 'a' * 40,
                    'releaseMode': 'DEPLOY_BACKEND',
                    'images': [{'serviceKey': key, 'repository': key, 'digest': 'sha256:' + 'b' * 64}
                               for key in keys]}
        pack_path, manifest_path = self.root / 'pack.json', self.root / 'images.json'
        pack_path.write_text(json.dumps(pack))
        manifest_path.write_text(json.dumps(manifest))
        evidence = self.root / 'evidence'
        self.env.update(BAD_APP='notification', DEPLOY_PREFLIGHT_ONLY='false',
                        CONFIRM_DEPLOYMENT='DEPLOY_SEVEN_SERVICES',
                        DATABASE_BACKUP_CONFIRMATION='DATABASE_BACKUP_VERIFIED')
        result = subprocess.run(['bash', str(self.helper.with_name('deploy-backend-release.sh')),
                                 'test-rg', str(pack_path), str(manifest_path), str(evidence), 'a' * 40],
                                env=self.env, text=True, capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Deployment prerequisites failed for notification', result.stderr)
        report = json.loads((evidence / 'backend-deployment-manifest.json').read_text())
        self.assertEqual(report['releaseStatus'], 'FAILED')
        self.assertEqual(report['rollbackMap'], [])
        self.assertEqual([(e['serviceKey'], e['status']) for e in report['deploymentEvents']],
                         [('auth', 'passed'), ('notification', 'failed')])
        self.assert_no_mutation()


if __name__ == '__main__':
    unittest.main()
