"""The rider fleet APIM scripts: route table = contracts, policy rules, and configure/status/rollback against a fake az.

Run: python3 -m unittest discover -s scripts/apim/tests -p test_rider_fleet_apim.py -v
"""
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET

import yaml

ROOT = Path(__file__).resolve().parents[3]
FLEET = ROOT / 'infra/apim/rider-fleet'
SCRIPTS = ROOT / 'scripts/apim'
METHODS = {'get', 'post', 'put', 'delete', 'patch'}


def table(prefix):
    return [line.split('|')[1:] for line in (FLEET / 'routes.txt').read_text().splitlines() if line.startswith(prefix + '|')]


def contract(name, strip=''):
    spec = yaml.safe_load((ROOT / 'contracts/openapi' / name).read_text())
    return {(method.upper(), path[len(strip):]): op for path, item in spec['paths'].items() for method, op in item.items() if method in METHODS}


class RouteTableTest(unittest.TestCase):
    def test_every_contract_operation_is_published_once_and_nothing_else(self):
        routes = table('route')
        rider = {(m, t): k for api, _, m, t, k in routes if api == 'rider'}
        admin = {(m, t): k for api, _, m, t, k in routes if api == 'admin'}
        self.assertEqual(set(rider), set(contract('rider-v1.yaml')))
        self.assertEqual(set(admin), set(contract('admin-fleet-v1.yaml', '/api/v1/admin/fleet')))
        self.assertEqual(len(routes), len(rider) + len(admin))
        self.assertEqual(len({r[1] for r in routes}), len(routes), 'operation ids are unique')
        self.assertTrue(all(len(r[1]) <= 80 for r in routes))

    def test_the_shift_credential_route_policies_are_used_only_for_locations_devices_and_trip_steps(self):
        kinds = {(r[2], r[3]): r[4] for r in table('route') if r[0] == 'rider'}
        self.assertEqual({key for key, kind in kinds.items() if kind == 'location'}, {('POST', '/locations'), ('POST', '/devices')})
        self.assertEqual({key for key, kind in kinds.items() if kind == 'trip'}, {('POST', '/trips/{tripId}/{action}')})
        for (method, path), op in contract('rider-v1.yaml').items():
            multipart = 'multipart/form-data' in op.get('requestBody', {}).get('content', {})
            credential = {'shiftCredential': []} in op.get('security', [])
            self.assertEqual(credential, kinds[(method, path)] in ('location', 'trip'), path)
            if kinds[(method, path)] not in ('location', 'trip'):
                self.assertEqual(kinds[(method, path)], 'upload' if multipart else 'json', path)
        self.assertEqual({r[4] for r in table('route') if r[0] == 'admin'}, {'admin'})

    def test_apis_are_the_rider_and_admin_fleet_paths(self):
        self.assertEqual(table('api'), [['rider', 'api/v1/rider', 'craves-rider-v1', 'Craves Rider API'],
                                        ['admin', 'api/v1/admin/fleet', 'craves-admin-fleet-v1', 'Craves Admin Fleet API']])


class PolicyTest(unittest.TestCase):
    def policy(self, kind):
        return ET.parse(FLEET / f'{kind}-policy.xml').getroot()

    def test_every_policy_inherits_guards_routes_by_base_url_and_never_caches(self):
        for kind in ('json', 'upload', 'location', 'trip', 'admin'):
            root, text = self.policy(kind), (FLEET / f'{kind}-policy.xml').read_text()
            self.assertEqual(root.find('inbound')[0].tag, 'base', kind)
            self.assertEqual(root.find('inbound/set-backend-service').get('base-url'), '__BACKEND_URL__', kind)
            self.assertIn('Authorization', root.find('inbound/choose/when').get('condition'), kind)
            self.assertEqual(root.find('inbound/choose/when/return-response/set-status').get('code'), '401', kind)
            self.assertIn('no-store', root.find('outbound/set-header[@name="Cache-Control"]/value').text, kind)
            self.assertNotIn('cache-lookup', text)
            self.assertNotIn('backend-id', text)
            # The Consumption gateway rejects keyed rate limits (docs/admin/explorer/README.md).
            self.assertNotIn('rate-limit', text)

    def test_the_shift_credential_passes_only_the_location_and_trip_policies(self):
        def dropped(kind):
            return any(h.get('name') == 'X-Craves-Shift-Credential' and h.get('exists-action') == 'delete'
                       for h in self.policy(kind).iter('set-header'))
        self.assertEqual({k: dropped(k) for k in ('json', 'upload', 'location', 'trip', 'admin')},
                         {'json': True, 'upload': True, 'location': False, 'trip': False, 'admin': True})
        for kind in ('location', 'trip'):
            self.assertIn('X-Craves-Shift-Credential', self.policy(kind).find('inbound/choose/when').get('condition'), kind)
            # The concurrency key holds only the credential's first 12 characters, never the whole secret.
            self.assertIn('Substring(0, Math.Min(12, credential.Length))', self.policy(kind).find('backend/limit-concurrency').get('key'), kind)

    def test_rider_calls_are_bounded_per_caller(self):
        for kind, most in (('json', '4'), ('upload', '2'), ('location', '2'), ('trip', '2')):
            limit = self.policy(kind).find('backend/limit-concurrency')
            self.assertEqual(limit.get('max-count'), most, kind)
            self.assertIsNotNone(limit.find('forward-request'), kind)
        self.assertEqual(self.policy('location').find('inbound/validate-content').get('max-size'), '16384')

    def test_admin_policy_keeps_the_existing_admin_protections(self):
        admin = (FLEET / 'admin-policy.xml').read_text()
        existing = (ROOT / 'infra/apim/admin-operational-investigations/authenticated-policy.xml').read_text()
        for marker in ('cravesCorrelationId', 'X-Frame-Options', 'DENY', 'nosniff', 'no-store, no-cache, must-revalidate',
                       'A Bearer access token is required.'):
            self.assertIn(marker, existing)
            self.assertIn(marker, admin)

    def test_policy_expressions_brace_their_if_blocks(self):
        # APIM rejects `if (...) return x;` in @{ } expressions ("Expected a { but found a return"); 24 Oct release failure.
        for path in FLEET.glob('*-policy.xml'):
            for number, line in enumerate(path.read_text().splitlines(), 1):
                self.assertIsNone(re.search(r'\bif\s*\(.*\)\s*return\b', line), f'{path.name}:{number}')


FAKE_AZ = r'''#!/usr/bin/env python3
import json, os, sys
STATE = os.environ['FAKE_AZ_STATE']
s = json.load(open(STATE))
a = sys.argv[1:]
def arg(name):
    return a[a.index(name) + 1] if name in a else None
def save():
    json.dump(s, open(STATE, 'w'))
s['calls'].append(' '.join(a)); save()
q, cmd = arg('--query'), ' '.join(x for x in a[:4] if not x.startswith('-'))
if cmd.startswith('account show'):
    if os.environ.get('FAKE_AZ_ACCOUNT') == 'old':  # the idle subscription, production until 29 Oct 2026
        print('721906c9-4a72-4606-830b-d3e7ace093ff' if q == 'id' else '1e7e43ac-c7f5-4d47-a74f-289a7cc21508')
    else:
        print('34eefd95-1a19-416f-b9df-92b326500615' if q == 'id' else '182d6285-5895-47f8-9ade-77b10854ed0d')
elif cmd.startswith('apim show'):
    pass
elif cmd.startswith('containerapp revision show'):
    print(os.environ.get('FAKE_AZ_HEALTH', 'Healthy'))
elif cmd.startswith('containerapp show'):
    app = {'properties': {'configuration': {'ingress': {'fqdn': 'integration.example'}}, 'runningStatus': 'Running',
                          'latestRevisionName': 'r1', 'latestReadyRevisionName': 'r1'}}
    print('integration.example' if q else json.dumps(app))
elif cmd.startswith('apim api list'):
    print('\n'.join(f"{i}\t{api['path']}" for i, api in s['apis'].items()))
elif cmd.startswith('apim api show'):
    api = s['apis'].get(arg('--api-id'))
    if api is None: sys.exit(3)
    print('False' if q == 'subscriptionRequired' else json.dumps({'path': api['path'], 'subscriptionRequired': False}))
elif cmd.startswith('apim api create'):
    s['apis'][arg('--api-id')] = {'path': arg('--path'), 'ops': {}}; save()
elif cmd.startswith('apim api delete'):
    del s['apis'][arg('--api-id')]; save()
elif cmd.startswith('apim api operation list'):
    ops = s['apis'][arg('--api-id')]['ops']
    rows = [[n, o['method'], o['template']] for n, o in ops.items()]
    print('\n'.join(r[0] if q == '[].name' else '\t'.join([r[0], r[2]] if q == '[].[name,urlTemplate]' else r) for r in rows))
elif cmd.startswith('apim api operation delete'):
    del s['apis'][arg('--api-id')]['ops'][arg('--operation-id')]; save()
elif cmd.startswith('rest'):
    url = arg('--url').split('?')[0]
    parts = url.split('/apis/')
    if len(parts) == 1:
        sys.exit(1)  # no global policy
    rest = parts[1].split('/')
    api = s['apis'][rest[0]]
    if len(rest) == 3 and rest[1] == 'policies':
        sys.exit(1)  # no API-level policy
    op = rest[2]
    body = json.load(open(arg('--body')[1:]))['properties'] if arg('--method') == 'put' else None
    if len(rest) == 3:
        api['ops'][op] = {'method': body['method'], 'template': body['urlTemplate'], 'policy': ''}
    elif body is not None:
        api['ops'][op]['policy'] = body['value']
    else:
        print(api['ops'][op]['policy'])
    save()
else:
    sys.exit('fake az: unexpected ' + ' '.join(a))
'''

FAKE_CURL = '''#!/usr/bin/env bash
echo "$*" >>"$FAKE_CURL_LOG"
printf 401
'''


@unittest.skipUnless(shutil.which('jq') and shutil.which('bash'), 'needs jq and bash')
class ScriptsAgainstFakeAzTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        for name, text in (('az', FAKE_AZ), ('curl', FAKE_CURL)):
            (self.dir / name).write_text(text)
            (self.dir / name).chmod(0o755)
        self.state = self.dir / 'state.json'
        self.state.write_text(json.dumps({'apis': {'craves-orders-v1': {'path': 'api/v1/orders', 'ops': {}}}, 'calls': []}))

    def run_script(self, name, **env):
        return subprocess.run(['bash', str(SCRIPTS / name)], capture_output=True, text=True,
                              env={**os.environ, 'PATH': f'{self.dir}:{os.environ["PATH"]}', 'FAKE_AZ_STATE': str(self.state),
                                   'FAKE_CURL_LOG': str(self.dir / 'curl.log'), **env})

    def apis(self):
        return json.loads(self.state.read_text())['apis']

    def test_configure_is_idempotent_status_passes_and_rollback_restores_the_gateway(self):
        dry = self.run_script('configure-rider-fleet-apim.sh', DRY_RUN='true')
        self.assertEqual(dry.returncode, 0, dry.stderr)
        self.assertEqual(json.loads(self.state.read_text())['calls'], [], 'a dry run calls nothing')
        self.assertNotEqual(self.run_script('configure-rider-fleet-apim.sh').returncode, 0, 'a write needs CONFIRM_APIM_WRITE')

        for attempt in (1, 2):
            done = self.run_script('configure-rider-fleet-apim.sh', CONFIRM_APIM_WRITE='true')
            self.assertEqual(done.returncode, 0, done.stderr + done.stdout)
        apis = self.apis()
        self.assertEqual(len(apis['craves-rider-v1']['ops']), len([r for r in table('route') if r[0] == 'rider']))
        self.assertEqual(len(apis['craves-admin-fleet-v1']['ops']), len([r for r in table('route') if r[0] == 'admin']))
        locations = apis['craves-rider-v1']['ops']['rider-post-locations']['policy']
        self.assertIn('https://integration.example/api/v1/rider', locations)
        self.assertNotIn('__BACKEND_URL__', locations)
        status = self.run_script('status-rider-fleet-apim.sh')
        self.assertEqual(status.returncode, 0, status.stderr + status.stdout)
        self.assertIn('SUCCESS: Rider fleet APIM status is healthy.', status.stdout)

        state = json.loads(self.state.read_text())
        state['apis']['craves-rider-v1']['ops']['stale'] = {'method': 'GET', 'template': '/old', 'policy': ''}
        self.state.write_text(json.dumps(state))
        self.assertNotEqual(self.run_script('status-rider-fleet-apim.sh').returncode, 0, 'status sees an extra operation')
        self.assertEqual(self.run_script('configure-rider-fleet-apim.sh', CONFIRM_APIM_WRITE='true').returncode, 0)
        self.assertNotIn('stale', self.apis()['craves-rider-v1']['ops'], 'configure removes what routes.txt no longer lists')

        self.assertNotEqual(self.run_script('rollback-rider-fleet-apim.sh').returncode, 0, 'rollback needs CONFIRM_APIM_ROLLBACK')
        back = self.run_script('rollback-rider-fleet-apim.sh', CONFIRM_APIM_ROLLBACK='true')
        self.assertEqual(back.returncode, 0, back.stderr)
        self.assertEqual(set(self.apis()), {'craves-orders-v1'})

    def test_a_foreign_owner_or_a_parent_serving_the_prefix_stops_before_any_write(self):
        for apis in ({'other-rider': {'path': 'api/v1/rider', 'ops': {}}},
                     {'catch-all': {'path': 'api/v1', 'ops': {'all': {'method': 'GET', 'template': '/*', 'policy': ''}}}}):
            self.state.write_text(json.dumps({'apis': apis, 'calls': []}))
            done = self.run_script('configure-rider-fleet-apim.sh', CONFIRM_APIM_WRITE='true')
            self.assertNotEqual(done.returncode, 0)
            self.assertIn('No update applied', done.stderr)
            calls = json.loads(self.state.read_text())['calls']
            self.assertFalse([c for c in calls if 'create' in c or '--method put' in c or 'delete' in c], calls)

    def test_production_is_checked_by_account_and_revision_health_and_the_locked_backend_is_never_called(self):
        old = self.run_script('configure-rider-fleet-apim.sh', CONFIRM_APIM_WRITE='true', FAKE_AZ_ACCOUNT='old')
        self.assertNotEqual(old.returncode, 0, 'signed in to the idle subscription 721906c9, nothing is written')
        self.assertIn('Wrong Azure subscription or tenant', old.stderr)
        sick = self.run_script('configure-rider-fleet-apim.sh', CONFIRM_APIM_WRITE='true', FAKE_AZ_HEALTH='Unhealthy')
        self.assertNotEqual(sick.returncode, 0)
        self.assertIn("ready revision is not Healthy", sick.stderr)
        self.assertFalse([c for c in json.loads(self.state.read_text())['calls'] if 'create' in c or '--method put' in c])

        done = self.run_script('configure-rider-fleet-apim.sh', CONFIRM_APIM_WRITE='true')
        self.assertEqual(done.returncode, 0, done.stderr + done.stdout)
        calls = json.loads(self.state.read_text())['calls']
        self.assertTrue(any(c.startswith('containerapp revision show -g rg-craves-integration-prod -n ca-craves-integration-prod') for c in calls))
        puts = [c for c in calls if '--method put' in c]
        self.assertTrue(puts and all('/subscriptions/34eefd95-1a19-416f-b9df-92b326500615/resourceGroups/rg-craves-shared-prod/providers/'
                                     'Microsoft.ApiManagement/service/apim-craves-prod-34eefd/' in c for c in puts), puts[:2])
        curls = (self.dir / 'curl.log').read_text().splitlines()
        self.assertTrue(curls and all('https://api.craves.in/' in c for c in curls), 'only the public gateway is called')


if __name__ == '__main__':
    unittest.main()
