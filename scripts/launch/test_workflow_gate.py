"""Exercise the actual inline required-check guard, not a second implementation."""
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest


class RequiredWorkflowGateTest(unittest.TestCase):
    def setUp(self):
        self.workflow = (Path(__file__).parents[2] / '.github/workflows/launch-regression-ci.yml').read_text()
        self.gate = self.workflow.split('  acceptance:\n', 1)[1]
        block = self.gate.split("python3 - <<'PY'\n", 1)[1].split('\n          PY', 1)[0]
        self.code = '\n'.join(line[10:] for line in block.splitlines())
        self.sha = 'a' * 40

    def invoke(self, results, sha=None):
        env = dict(os.environ, PREREQUISITES_JSON=json.dumps(results), EXPECTED_RELEASE_SHA=sha or self.sha)
        return subprocess.run([sys.executable, '-c', self.code], env=env, capture_output=True).returncode

    def valid(self):
        return {'source': {'result': 'success', 'outputs': {'release_sha': self.sha}},
                'backend': {'result': 'success'}, 'web': {'result': 'success'}}

    def test_required_gate_always_runs_and_pr_is_not_path_filtered(self):
        self.assertIn('if: ${{ always() }}', self.gate)
        self.assertNotIn('paths:', self.workflow.split('  pull_request:', 1)[1].split('permissions:', 1)[0])
        self.assertLess(self.gate.index('Reject failed'), self.gate.index('actions/checkout'))

    def test_only_complete_success_at_exact_head_passes(self):
        self.assertEqual(self.invoke(self.valid()), 0)
        self.assertNotEqual(self.invoke(self.valid(), 'b' * 40), 0)
        self.assertNotEqual(self.invoke(self.valid(), 'not-a-sha'), 0)

    def test_every_non_success_result_and_missing_job_fails(self):
        for name in ('source', 'backend', 'web'):
            for status in ('failure', 'skipped', 'cancelled', None):
                with self.subTest(name=name, status=status):
                    jobs = self.valid(); jobs[name]['result'] = status
                    self.assertNotEqual(self.invoke(jobs), 0)
            jobs = self.valid(); del jobs[name]
            self.assertNotEqual(self.invoke(jobs), 0)

    def test_source_without_exact_output_fails(self):
        jobs = self.valid(); jobs['source']['outputs'] = {}
        self.assertNotEqual(self.invoke(jobs), 0)


if __name__ == '__main__': unittest.main()
