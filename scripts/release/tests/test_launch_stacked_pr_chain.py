#!/usr/bin/env python3
"""Offline fail-closed release-stack regression tests; gh and sleep are fakes."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[3]


def pr(number, mergeable=True, **overrides):
    data = dict(number=number, state='open', draft=True, mergeable=mergeable,
                base={'ref': 'main' if number == 1 else f'pr-{number - 1}',
                      'repo': {'full_name': 'test/repo'}, 'sha': f'{number - 1:040x}'},
                head={'ref': f'pr-{number}', 'repo': {'full_name': 'test/repo'}, 'sha': f'{number:040x}'})
    data.update(overrides)
    return data


class StackedPrChainTest(unittest.TestCase):
    def run_stack(self, responses, start='1', end='3'):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'responses.json').write_text(json.dumps(responses))
            fake = root / 'gh'
            fake.write_text('''#!/usr/bin/env python3
import json, os, pathlib, sys
root = pathlib.Path(os.environ['FAKE_GH_ROOT'])
assert sys.argv[1] == 'api', 'Only read-only API requests are supported'
number = sys.argv[2].split('/')[-1]
state = root / ('count-' + number)
count = int(state.read_text()) if state.exists() else 0
state.write_text(str(count + 1))
responses = json.loads((root / 'responses.json').read_text()).get(number, ['ERROR'])
response = responses[min(count, len(responses) - 1)]
if response == 'ERROR':
    sys.exit('API request failed')
print(response if isinstance(response, str) else json.dumps(response))
''')
            fake.chmod(0o755)
            sleep = root / 'sleep'
            sleep.write_text('#!/bin/sh\nexit 0\n')
            sleep.chmod(0o755)
            result = subprocess.run(['bash', str(ROOT / 'scripts/release/validate-stacked-pr-chain.sh'),
                                     'test/repo', start, end], text=True, capture_output=True,
                                    env=dict(os.environ, PATH=str(root) + os.pathsep + os.environ['PATH'],
                                             FAKE_GH_ROOT=str(root)), timeout=10)
            counts = {p.name[6:]: int(p.read_text()) for p in root.glob('count-*')}
            return result, counts

    def assert_rejected(self, responses, start='1', end='3'):
        result, counts = self.run_stack(responses, start, end)
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn('SUCCESS:', result.stdout + result.stderr)
        return counts

    def test_valid_chain(self):
        result, counts = self.run_stack({str(n): [pr(n)] for n in range(1, 4)})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('SUCCESS:', result.stdout)
        self.assertEqual(counts, {'1': 1, '2': 1, '3': 1})

    def test_conflict_is_rejected(self):
        self.assert_rejected({'1': [pr(1, False)]}, end='1')

    def test_unknown_retries_until_true(self):
        result, counts = self.run_stack({'1': [pr(1, None), pr(1)]}, end='1')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(counts, {'1': 2})

    def test_unknown_retry_is_bounded(self):
        counts = self.assert_rejected({'1': [pr(1, None)]}, end='1')
        self.assertEqual(counts, {'1': 3})

    def test_unknown_then_conflict(self):
        self.assert_rejected({'1': [pr(1, None), pr(1, False)]}, end='1')

    def test_api_error(self):
        self.assert_rejected({'1': ['ERROR']}, end='1')

    def test_missing_middle_never_claims_partial_success(self):
        self.assert_rejected({'1': [pr(1)], '2': ['ERROR'], '3': [pr(3)]})

    def test_empty_body(self):
        self.assert_rejected({'1': ['']}, end='1')

    def test_bad_chain(self):
        value = pr(2)
        value['base']['ref'] = 'unrelated'
        self.assert_rejected({'1': [pr(1)], '2': [value]}, end='2')

    def test_fork_branch_name_collision(self):
        value = pr(1)
        value['head']['repo']['full_name'] = 'fork/repo'
        self.assert_rejected({'1': [value], '2': [pr(2)]}, end='2')

    def test_changed_link_sha(self):
        value = pr(2)
        value['base']['sha'] = 'f' * 40
        self.assert_rejected({'1': [pr(1)], '2': [value]}, end='2')

    def test_malformed_or_incomplete_metadata(self):
        for data in ['not-json', {}, {'message': 'Not Found'}, pr(1, 'true'),
                     dict(pr(1), number=2), pr(1, draft='true'), pr(1, head={'ref': ''}),
                     pr(1, head={'ref': '  '}),
                     pr(1, base={'ref': 'main', 'repo': {'full_name': 'wrong/repo'}}),
                     {k: v for k, v in pr(1).items() if k != 'mergeable'}]:
            with self.subTest(data=data):
                self.assert_rejected({'1': [data]}, end='1')

    def test_open_draft_requirements_retained(self):
        for data in [pr(1, state='closed'), pr(1, draft=False)]:
            with self.subTest(data=data):
                self.assert_rejected({'1': [data]}, end='1')

    def test_empty_or_invalid_range(self):
        for start, end in [('', '1'), ('1', ''), ('2', '1'), ('0', '1'), ('abc', '1')]:
            with self.subTest(start=start, end=end):
                self.assert_rejected({}, start, end)


if __name__ == '__main__':
    unittest.main()
