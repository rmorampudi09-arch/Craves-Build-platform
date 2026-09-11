#!/usr/bin/env python3
"""Exercise the real pipeline image script against isolated Git and ACR fixtures."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

import yaml

ROOT = Path(__file__).resolve().parents[3]


class ImageReuseTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.keys = ['auth', 'notification', 'userChef', 'catalog', 'integration', 'subscription', 'order']
        self.pack = {'azure': {'containerRegistry': 'fixtureacr'}, 'services': []}
        for key in self.keys:
            path = self.root / 'services' / key
            path.mkdir(parents=True)
            (path / 'Dockerfile').write_text('FROM scratch\n')
            self.pack['services'].append({'key': key, 'path': 'services/' + key, 'imageRepository': key})
        self.git('init', '-q')
        self.git('config', 'user.email', 'fixture@example.invalid')
        self.git('config', 'user.name', 'Release fixture')
        self.git('add', 'services')
        self.git('commit', '-qm', 'Verified service contexts')
        self.baseline = self.git('rev-parse', 'HEAD')
        (self.root / 'services/integration/Dockerfile').write_text('FROM scratch\nLABEL revision="changed"\n')
        self.git('add', 'services')
        self.git('commit', '-qm', 'Change integration context')
        self.current = self.git('rev-parse', 'HEAD')
        (self.root / 'pack.json').write_text(json.dumps(self.pack))
        self.calls = self.root / 'calls.jsonl'
        mock = self.root / 'az'
        mock.write_text('''#!/usr/bin/env python3
import json, os, sys
a=sys.argv[1:]
with open(os.environ['AZURE_CALL_LOG'], 'a') as f: f.write(json.dumps(a)+'\\n')
if a[:3]==['acr','repository','show']: print('sha256:'+'b'*64)
elif a[:2]!=['acr','build']: sys.exit('Unexpected Azure call')
''')
        mock.chmod(0o755)
        self.env = dict(os.environ, PATH=str(self.root) + os.pathsep + os.environ['PATH'],
                        AZURE_CALL_LOG=str(self.calls))
        pipeline = yaml.safe_load((ROOT / 'azure-pipelines-backend-completion.yml').read_text())
        stage = next(s for s in pipeline['stages'] if s['stage'] == 'ImageBuild')
        task = next(s for s in stage['jobs'][0]['steps'] if s.get('task') == 'AzureCLI@2')
        self.script = task['inputs']['inlineScript']

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.root, text=True).strip()

    def execute(self, baseline=None):
        replacements = {'$(backendPack)': 'pack.json',
                        '${{ parameters.containerRegistryName }}': 'fixtureacr',
                        '${{ parameters.releaseMode }}': 'BUILD_CHANGED_AND_DEPLOY',
                        '${{ parameters.reuseSourceSha }}': baseline or self.baseline,
                        '$(Build.SourceVersion)': self.current,
                        '$(Build.ArtifactStagingDirectory)': str(self.root / 'artifacts'),
                        '$(Build.BuildId)': 'fixture'}
        script = self.script
        for key, value in replacements.items():
            script = script.replace(key, value)
        return subprocess.run(['bash', '-c', script], cwd=self.root, env=self.env,
                              text=True, capture_output=True)

    def test_builds_changed_context_and_reuses_only_identical_contexts(self):
        result = self.execute()
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = [json.loads(l) for l in self.calls.read_text().splitlines()]
        builds = [c for c in calls if c[:2] == ['acr', 'build']]
        self.assertEqual(len(builds), 1)
        self.assertEqual(builds[0][builds[0].index('--image') + 1], 'integration:' + self.current)
        manifest = json.loads((self.root / 'artifacts/backend-image-manifest/manifest.json').read_text())
        self.assertEqual(len(manifest['images']), 7)
        for image in manifest['images']:
            self.assertEqual(image['sourceSha'], self.current if image['serviceKey'] == 'integration' else self.baseline)
        self.assertFalse(manifest['deploymentExecuted'])

    def test_unknown_baseline_fails_before_build_or_image_lookup(self):
        result = self.execute('a' * 40)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('reuseSourceSha commit is not available', result.stderr)
        self.assertFalse(self.calls.exists())


if __name__ == '__main__':
    unittest.main()
