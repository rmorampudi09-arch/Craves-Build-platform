"""Offline release acceptance negative tests. No cloud access."""
import copy
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('evidence', Path(__file__).parents[1] / 'verify-web-release-evidence.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
SHA = 'a' * 40


def fixtures():
    return ({'id': 123, 'run_attempt': 2, 'head_sha': SHA, 'repository': {'full_name': m.REPO},
             'path': '.github/workflows/launch-regression-ci.yml', 'event': 'push', 'head_branch': 'main',
             'status': 'completed', 'conclusion': 'success'},
            {'total_count': 4, 'jobs': [{'name': n, 'head_sha': SHA, 'status': 'completed', 'conclusion': 'success'} for n in m.JOBS]},
            {'artifacts': [{'name': 'launch-regression-summary-123-2', 'id': 456, 'expired': False, 'size_in_bytes': 200}]},
            {'commit': {'sha': SHA}})


class EvidenceTest(unittest.TestCase):
    def test_exact_complete_source_passes(self):
        self.assertTrue(m.validate_evidence(SHA, *fixtures())['passed'])

    def test_stale_fork_wrong_workflow_or_unmerged_is_rejected(self):
        for key, value in [('head_sha', 'b'*40), ('repository', {'full_name': 'fork/repo'}),
                           ('path', 'unrelated.yml'), ('event', 'pull_request'), ('head_branch', 'feature'),
                           ('status', 'in_progress'), ('conclusion', 'failure')]:
            run, jobs, artifacts, main = fixtures(); run[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError): m.validate_evidence(SHA, run, jobs, artifacts, main)
        run, jobs, artifacts, main = fixtures(); main['commit']['sha'] = 'b'*40
        with self.assertRaises(ValueError): m.validate_evidence(SHA, run, jobs, artifacts, main)

    def test_each_failed_skipped_cancelled_missing_duplicate_job_is_rejected(self):
        for index in range(4):
            for state in ('failure', 'skipped', 'cancelled', None):
                f = fixtures(); f[1]['jobs'][index]['conclusion'] = state
                with self.subTest(index=index, state=state), self.assertRaises(ValueError): m.validate_evidence(SHA, *f)
        for kind in ('missing', 'duplicate', 'stale'):
            f = fixtures()
            if kind == 'missing': f[1]['jobs'].pop()
            if kind == 'duplicate': f[1]['jobs'][0] = copy.deepcopy(f[1]['jobs'][1])
            if kind == 'stale': f[1]['jobs'][0]['head_sha'] = 'b'*40
            with self.subTest(kind=kind), self.assertRaises(ValueError): m.validate_evidence(SHA, *f)

    def test_expired_empty_or_previous_attempt_artifact_rejected(self):
        for key, value in [('name', 'launch-regression-summary-123-1'), ('expired', True), ('size_in_bytes', 0)]:
            f = fixtures(); f[2]['artifacts'][0][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError): m.validate_evidence(SHA, *f)

    def test_origin_guard_precedes_network_and_sandbox_refused(self):
        with patch.object(m, 'read_json') as read:
            with self.assertRaises(ValueError): m.smoke('https://untrusted.invalid')
            read.assert_not_called()
            read.return_value = {'service': 'craves-customer-web', 'razorpayMode': 'sandbox', 'productionEligible': True}
            with self.assertRaises(ValueError): m.smoke('https://craves.in')

    def test_private_denials_only_without_reading_bodies(self):
        class Response:
            code = 401
            headers = {'Cache-Control': 'private, no-store, max-age=0'}
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, *args): raise AssertionError('Customer body must not be read')
        with patch.object(m, 'read_json', return_value={'service':'craves-customer-web','razorpayMode':'production','productionEligible':True}), patch.object(m, 'request', return_value=Response()):
            self.assertEqual(4, len(m.smoke('https://craves.in')['emailDenials']))
            Response.code = 404
            with self.assertRaises(ValueError): m.smoke('https://craves.in')


if __name__ == '__main__': unittest.main()
