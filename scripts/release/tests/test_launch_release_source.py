"""Backend images are built only from GitHub main, and production code carries no test bypass.

See docs/runbooks/live-runtime-safety.md (rule 1). Runs in launch regression CI (test_launch_*.py).
"""
import os
import pathlib
import re
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
GUARD = 'scripts/release/require-main-image-source.sh'
MAIN = 'https://github.com/rmorampudi09-arch/Craves-Build-platform.git'
BYPASS = re.compile(r'TestBypass|CRAVES_[A-Z0-9_]*_TEST_(?:ENABLED|WHITELIST_JSON|CODE|EXPIRES_AT)\b')
# Commands that build or push an image from the pipeline's own checkout.
PUSH = re.compile(r'docker push|az acr (?:build|import)|scripts/referrals/upgrade-existing-backend\.py')
# The shared guard, or merged-main evidence for an exact SHA (verify-web-release-evidence.py).
PROOF = re.compile(re.escape(GUARD) + r'|scripts/release/verify-web-release-evidence\.py --sha')
# Web-only images, outside CH-10 (backend images); every other image push must prove its source.
WEB_IMAGES = {
    'apps/customer-web-next/azure-pipelines-ui-test.yml',
    'azure-pipelines-api-test-dashboard.yml',
    'azure-pipelines-customer-web-next-delivery-tracking.yml',
    'azure-pipelines-customer-web.yml',
    'azure-pipelines-delivery-intelligence-admin.yml',
    'azure-pipelines-firebase-auth-test.yml',
}


class NoTestBypassTest(unittest.TestCase):
    def test_production_code_has_no_test_bypass(self):
        for path in sorted((ROOT / 'services').glob('*/src/main/**/*')):
            if path.suffix in ('.java', '.yml', '.yaml', '.properties', '.txt'):
                with self.subTest(path=str(path.relative_to(ROOT))):
                    self.assertIsNone(BYPASS.search(path.read_text()), 'production code must not carry a test bypass')


class MainOnlyImagePushTest(unittest.TestCase):
    def test_every_backend_image_push_first_proves_main_source(self):
        pipelines = sorted({*ROOT.glob('azure-pipelines*.yml'), *ROOT.glob('pipelines/*.yml'),
                            *ROOT.glob('apps/*/azure-pipelines*.yml')})
        pushing = [p for p in pipelines if PUSH.search(p.read_text())]
        self.assertGreaterEqual(len(pushing), 15)
        for path in pushing:
            name = str(path.relative_to(ROOT))
            if name in WEB_IMAGES:
                continue
            with self.subTest(pipeline=name):
                text = path.read_text()
                proof = PROOF.search(text)
                self.assertTrue(proof and proof.start() < PUSH.search(text).start(),
                                f'run `bash {GUARD}` before the first image push in {name}')


class RequireMainImageSourceTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = pathlib.Path(tmp.name)
        self.config = self.root / 'gitconfig'
        self.redirect(self.root / 'github.git')
        self.env = {k: v for k, v in os.environ.items() if k != 'TF_BUILD' and not k.startswith(('BUILD_', 'GIT_'))}
        self.env.update(GIT_CONFIG_GLOBAL=str(self.config), GIT_CONFIG_NOSYSTEM='1')
        self.git(self.root, 'init', '-q', '--bare', '-b', 'main', 'github.git')
        work = self.root / 'work'
        self.git(self.root, 'clone', '-q', MAIN, 'work')
        self.a = self.commit(work, 'a')
        self.b = self.commit(work, 'b')
        self.git(work, 'push', '-q', 'origin', 'HEAD:main')
        self.git(work, 'checkout', '-q', '-b', 'feature')
        self.c = self.commit(work, 'c')
        self.git(work, 'push', '-q', 'origin', 'feature')

    def redirect(self, github):
        self.config.write_text(f'[user]\n\tname = Release fixture\n\temail = fixture@example.invalid\n'
                               f'[url "file://{github}"]\n\tinsteadOf = {MAIN}\n')

    def git(self, cwd, *args):
        return subprocess.run(['git', *args], cwd=cwd, env=self.env, check=True, text=True,
                              capture_output=True).stdout.strip()

    def commit(self, repo, content):
        (repo / 'source').write_text(content + '\n')
        self.git(repo, 'add', 'source')
        self.git(repo, 'commit', '-qm', content)
        return self.git(repo, 'rev-parse', 'HEAD')

    def clone(self, *args):
        target = self.root / f'clone{len(list(self.root.glob("clone*")))}'
        self.git(self.root, 'clone', '-q', *args, MAIN, str(target))
        return target

    def guard(self, repo, **azure):
        return subprocess.run(['bash', str(ROOT / GUARD)], cwd=repo, env=dict(self.env, **azure),
                              text=True, capture_output=True)

    def assert_refused(self, result, message):
        self.assertNotEqual(result.returncode, 0, result.stderr)
        self.assertIn(message, result.stderr)

    def test_main_head_passes_in_azure_main_run(self):
        result = self.guard(self.clone(), TF_BUILD='True', BUILD_REASON='Manual', BUILD_SOURCEBRANCH='refs/heads/main')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(f'Image source is on GitHub main: {self.b}', result.stderr)

    def test_older_main_commit_passes_for_rollback(self):
        repo = self.clone()
        self.git(repo, 'checkout', '-q', self.a)
        self.assertEqual(self.guard(repo).returncode, 0)

    def test_shallow_clone_of_main_passes(self):
        result = self.guard(self.clone('--depth', '1'))
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_branch_run_is_refused_before_fetch(self):
        repo = self.clone()
        self.redirect(self.root / 'missing.git')
        result = self.guard(repo, TF_BUILD='True', BUILD_REASON='Manual', BUILD_SOURCEBRANCH='refs/heads/feature')
        self.assert_refused(result, 'Images are pushed only from main, not refs/heads/feature.')

    def test_pull_request_run_is_refused(self):
        result = self.guard(self.clone(), TF_BUILD='True', BUILD_REASON='PullRequest',
                            BUILD_SOURCEBRANCH='refs/pull/1/merge')
        self.assert_refused(result, 'Pull request builds never push images.')

    def test_commit_not_on_github_main_is_refused(self):
        local = self.clone()
        unpushed = self.commit(local, 'local')
        self.assert_refused(self.guard(local), f'{unpushed} is not on GitHub main.')
        # Azure "main" can be another repository's main (Azure Repos); only GitHub main counts.
        self.assert_refused(self.guard(local, TF_BUILD='True', BUILD_REASON='Manual',
                                       BUILD_SOURCEBRANCH='refs/heads/main'), f'{unpushed} is not on GitHub main.')
        self.assert_refused(self.guard(self.clone('--depth', '1', '--branch', 'feature')),
                            f'{self.c} is not on GitHub main.')

    def test_tracked_change_is_refused(self):
        repo = self.clone()
        (repo / 'source').write_text('changed\n')
        self.assert_refused(self.guard(repo), 'The image source has tracked changes.')

    def test_unreachable_main_fails_closed(self):
        repo = self.clone()
        self.redirect(self.root / 'missing.git')
        self.assert_refused(self.guard(repo), 'GitHub main could not be read.')


if __name__ == '__main__':
    unittest.main()
