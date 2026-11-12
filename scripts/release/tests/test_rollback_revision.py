"""Handbook 108: rollback-revision.sh moves traffic back to an earlier healthy revision, and refuses everything else."""
import json
import os
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'rollback-revision.sh'
SUBSCRIPTION = '34eefd95-1a19-416f-b9df-92b326500615'
FAKE_AZ = textwrap.dedent('''\
    #!/usr/bin/env python3
    import json, os, sys
    state_path, args = os.environ['FAKE_AZ_STATE'], sys.argv[1:]
    state = json.load(open(state_path))
    with open(os.environ['FAKE_AZ_LOG'], 'a') as log:
        log.write(' '.join(args) + '\\n')
    if args[:2] == ['account', 'show']:
        print(state['subscription'])
    elif args[:2] == ['containerapp', 'show']:
        print(state['mode'])
    elif args[:3] == ['containerapp', 'revision', 'list']:
        print(json.dumps(state['revisions']))
    elif args[:4] == ['containerapp', 'ingress', 'traffic', 'set']:
        target = args[args.index('--revision-weight') + 1].split('=')[0]
        for revision in state['revisions']:
            revision['properties']['trafficWeight'] = 100 if revision['name'] == target else 0
        json.dump(state, open(state_path, 'w'))
    else:
        sys.exit('unexpected az call: ' + ' '.join(args))
''')


def revision(name, created, weight=0, active=True, health='Healthy'):
    return {'name': name, 'properties': {'createdTime': created, 'trafficWeight': weight, 'active': active, 'healthState': health}}


class RollbackRevisionTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        root = Path(self.dir.name)
        (root / 'az').write_text(FAKE_AZ)
        (root / 'az').chmod(0o755)
        self.state, self.log = root / 'state.json', root / 'az.log'
        self.log.write_text('')
        self.env = {**os.environ, 'PATH': f'{root}:{os.environ["PATH"]}', 'FAKE_AZ_STATE': str(self.state), 'FAKE_AZ_LOG': str(self.log)}
        self.env.pop('CONFIRM_ROLLBACK', None)
        self.write(revisions=[
            revision('ca-craves-order-prod--r1', '2026-11-01T10:00:00Z'),
            revision('ca-craves-order-prod--r2', '2026-11-05T10:00:00Z', health='Unhealthy'),
            revision('ca-craves-order-prod--r3', '2026-11-09T10:00:00Z', weight=100),
            revision('ca-craves-order-prod--r0', '2026-10-01T10:00:00Z', active=False),
        ])

    def tearDown(self):
        self.dir.cleanup()

    def write(self, subscription=SUBSCRIPTION, mode='Multiple', revisions=None):
        state = json.loads(self.state.read_text()) if self.state.exists() else {}
        state.update({'subscription': subscription, 'mode': mode})
        if revisions is not None:
            state['revisions'] = revisions
        self.state.write_text(json.dumps(state))

    def run_script(self, *args, confirm=False):
        env = {**self.env, 'CONFIRM_ROLLBACK': 'true'} if confirm else self.env
        return subprocess.run(['bash', str(SCRIPT), *args], env=env, capture_output=True, text=True)

    def traffic_moves(self):
        return [line for line in self.log.read_text().splitlines() if 'traffic set' in line]

    def test_dry_run_names_the_newest_older_healthy_revision_and_changes_nothing(self):
        result = self.run_script('ca-craves-order-prod')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('all traffic on ca-craves-order-prod--r3; rollback target ca-craves-order-prod--r1', result.stdout)
        self.assertIn('-g rg-craves-order-prod -n ca-craves-order-prod', self.log.read_text())
        self.assertEqual(self.traffic_moves(), [])

    def test_confirmed_rollback_moves_all_traffic_and_reads_it_back(self):
        result = self.run_script('ca-craves-order-prod', confirm=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.traffic_moves(), [
            'containerapp ingress traffic set -g rg-craves-order-prod -n ca-craves-order-prod --revision-weight ca-craves-order-prod--r1=100 -o none'])
        self.assertIn('Undo: CONFIRM_ROLLBACK=true bash', result.stdout)
        self.assertIn('ca-craves-order-prod ca-craves-order-prod--r3', result.stdout)

    def test_refusals_change_nothing(self):
        for args, setup, message in [
            (['ca-craves-order'], {}, 'usage'),
            (['ca-craves-order-prodlow'], {}, 'usage'),
            (['ca-craves-order-prod'], {'subscription': '721906c9-0000-0000-0000-000000000000'}, 'Wrong Azure subscription'),
            (['ca-craves-order-prod'], {'mode': 'Single'}, 'not in multiple-revision mode'),
            (['ca-craves-order-prod', 'ca-craves-order-prod--r0'], {}, 'not an active, Healthy revision'),
            (['ca-craves-order-prod', 'ca-craves-order-prod--r2'], {}, 'not an active, Healthy revision'),
            (['ca-craves-order-prod', 'ca-craves-order-prod--r3'], {}, 'already takes all traffic'),
        ]:
            with self.subTest(args=args, setup=setup):
                self.write(**{'subscription': SUBSCRIPTION, 'mode': 'Multiple', **setup})
                result = self.run_script(*args, confirm=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(message, result.stderr)
                self.assertEqual(self.traffic_moves(), [])

    def test_resource_group_override_must_still_be_a_production_feature_group(self):
        self.env['RESOURCE_GROUP'] = 'rg-craves-web-prod'
        self.assertEqual(self.run_script('ca-craves-order-prod').returncode, 0)
        self.assertIn('-g rg-craves-web-prod -n ca-craves-order-prod', self.log.read_text())
        self.env['RESOURCE_GROUP'] = 'rg-craves-prodlow-centralindia'
        self.assertIn('RESOURCE_GROUP must be', self.run_script('ca-craves-order-prod', confirm=True).stderr)
        self.assertEqual(self.traffic_moves(), [])

    def test_split_traffic_or_no_older_healthy_revision_is_refused(self):
        self.write(revisions=[
            revision('ca-craves-order-prod--r1', '2026-11-01T10:00:00Z', weight=10),
            revision('ca-craves-order-prod--r3', '2026-11-09T10:00:00Z', weight=90),
        ])
        self.assertIn('no single revision', self.run_script('ca-craves-order-prod', confirm=True).stderr)
        self.write(revisions=[
            revision('ca-craves-order-prod--r1', '2026-11-01T10:00:00Z', health='Unhealthy'),
            revision('ca-craves-order-prod--r3', '2026-11-09T10:00:00Z', weight=100),
        ])
        self.assertIn('No active, Healthy revision older', self.run_script('ca-craves-order-prod', confirm=True).stderr)
        self.assertEqual(self.traffic_moves(), [])


if __name__ == '__main__':
    unittest.main()
