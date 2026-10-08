"""Restore only the three already-deployed PDF source gates; preserve all runtimes."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request

spec = importlib.util.spec_from_file_location('pdf_runtime', 'scripts/finance/shared_chef_finance_release.py')
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
FLAG = 'CRAVES_DOCUMENTS_SOURCES_ENABLED'
TARGETS = ('ca-craves-order-service-prodlow', 'ca-craves-integration-service-pr', 'ca-craves-subscription-service-p')
OUT = Path(os.environ['PDF_REPAIR_OUTPUT'])
report = {'scope': 'PDF source flags only', 'changed': [], 'rollback': []}

def image(app):
    return app['properties']['template']['containers'][0]['image']

def unchanged_except_flag(app):
    app = copy.deepcopy(app)
    container = app['properties']['template']['containers'][0]
    container['env'] = [e for e in container.get('env', []) if e['name'] != FLAG]
    return r.signature(app)

def guard(before, current, expected):
    r.require(image(before) == image(current), 'Application image changed; stop')
    r.require(unchanged_except_flag(before) == unchanged_except_flag(current), 'Unrelated runtime changed; stop')
    r.require(r.environment(current).get(FLAG) == expected, 'PDF source flag differs; stop')

def read_app(name):
    return r.active.az('containerapp', 'show', '-g', r.RG, '-n', name)

def probe(url):
    try:
        with urllib.request.build_opener(r.NoRedirect()).open(url, timeout=20) as response:
            return response.status, response.read(100_000)
    except urllib.error.HTTPError as error:
        return error.code, b''
    except Exception:
        return 0, b''

def health(app):
    code, body = probe(r.origin(app) + '/actuator/health')
    try:
        return code == 200 and json.loads(body).get('status') == 'UP'
    except Exception:
        return False

def update_flag(name, previous=None):
    r.require(name in TARGETS, 'PDF-only app allowlist required')
    command = ['az', 'containerapp', 'update', '-g', r.RG, '-n', name]
    if previous is None:
        command += ['--remove-env-vars', FLAG]
    else:
        r.require(previous == {'name': FLAG, 'value': previous.get('value')} and previous['value'] in ('true', 'false'), 'Unexpected previous flag')
        command += ['--set-env-vars', FLAG + '=' + previous['value']]
    result = subprocess.run(command + ['--only-show-errors', '-o', 'none'], capture_output=True, text=True, timeout=240)
    r.require(result.returncode == 0, 'PDF source setting update failed; private output suppressed')

def wait_ready(name, before, expected):
    for _ in range(80):
        app = read_app(name)
        guard(before, app, expected)
        p = app['properties']
        if p.get('provisioningState') == 'Succeeded' and p.get('runningStatus') == 'Running' and p.get('latestRevisionName') == p.get('latestReadyRevisionName') and health(app):
            revision = r.active.az('containerapp', 'revision', 'show', '-g', r.RG, '-n', name, '--revision', p['latestReadyRevisionName'])
            if revision['properties'].get('active') and revision['properties'].get('healthState') == 'Healthy' and revision['properties'].get('trafficWeight') == 100:
                return app
        time.sleep(8)
    raise ValueError('PDF source revision did not become healthy')

def main():
    before = r.inventory()
    expected = {x['name']: x for x in json.loads(os.environ['PDF_EXPECTED_BASELINE'])}
    r.require(set(before) == set(expected), 'App inventory changed since diagnostic; stop')
    for name, app in before.items():
        row = expected[name]
        r.require(image(app) == row['image'] and r.signature(app) == row['runtimeHash'] and app['properties']['latestReadyRevisionName'] == row['readyRevision'], 'Runtime changed since diagnostic: ' + name)
    notification = before['ca-craves-notification-service-p']
    nenv = r.environment(notification)
    r.require(all(nenv.get(k, {}).get('value') == 'true' for k in ('CRAVES_DOCUMENTS_ENABLED', 'CRAVES_DOCUMENTS_WORKER_ENABLED')), 'Existing PDF API and worker must remain enabled')
    for name, setting in zip(TARGETS, ('CRAVES_DOCUMENTS_ORDER_BASE_URL', 'CRAVES_DOCUMENTS_INTEGRATION_BASE_URL', 'CRAVES_DOCUMENTS_SUBSCRIPTION_BASE_URL')):
        app = before[name]
        r.require(nenv.get(setting, {}).get('value', '').rstrip('/') == r.origin(app), 'PDF source URL differs')
        r.require(r.environment(app).get(FLAG) in (None, {'name': FLAG, 'value': 'false'}), 'Source flag changed or uses an unexpected binding')
        r.require(app['properties']['configuration']['activeRevisionsMode'] == 'Single', 'Expected existing single-revision mode')
        r.require(app['properties']['latestRevisionName'] == app['properties']['latestReadyRevisionName'] and health(app), 'Existing source runtime must be healthy')
    report['preflight'] = 'PASS'
    report['baseline'] = list(expected.values())
    surfaces = {'web': 'https://craves.in/', 'webVersion': 'https://craves.in/api/version', 'paymentReadiness': 'https://craves.in/api/readiness/razorpay', 'chefAuthBoundary': 'https://api.craves.in/api/v1/chef/application/readiness'}
    initial_status = {label: probe(url)[0] for label, url in surfaces.items()}
    report['existingSurfaceStatusBefore'] = initial_status
    OUT.write_text(json.dumps(report, indent=2))
    attempted = []
    desired = {'name': FLAG, 'value': 'true'}
    try:
        for name in TARGETS:
            current = r.inventory()
            for app_name, app in current.items():
                if app_name in attempted:
                    guard(before[app_name], app, desired)
                else:
                    r.require(r.signature(before[app_name]) == r.signature(app) and image(before[app_name]) == image(app), 'Concurrent runtime change; stop')
            attempted.append(name)
            print('Enabling only ' + FLAG + ' on ' + name, flush=True)
            update_flag(name, desired)
            ready = wait_ready(name, before[name], desired)
            report['changed'].append({'name': name, 'setting': FLAG, 'previous': r.environment(before[name]).get(FLAG), 'current': 'true', 'imagePreserved': True, 'unrelatedRuntimePreserved': True, 'healthyRevision': ready['properties']['latestReadyRevisionName']})
            OUT.write_text(json.dumps(report, indent=2))
            print('Healthy PDF source revision; image and unrelated runtime preserved: ' + name, flush=True)
        after = r.inventory()
        r.require(set(after) == set(before), 'Application inventory changed during activation')
        for name, app in after.items():
            if name in TARGETS:
                guard(before[name], app, desired)
            else:
                r.require(r.signature(before[name]) == r.signature(app) and before[name]['properties']['template'] == app['properties']['template'] and before[name]['properties']['latestReadyRevisionName'] == app['properties']['latestReadyRevisionName'], 'Unrelated application changed during activation')
        report['all13ImagesPreserved'] = True
        report['other10AppsUnchanged'] = True
        report['existingSurfaceStatusAfter'] = {label: probe(url)[0] for label, url in surfaces.items()}
        r.require(initial_status == report['existingSurfaceStatusAfter'] and initial_status['web'] == 200, 'Existing surface status changed; rollback PDF flags')
        report['result'] = 'PASS'
    except Exception:
        for name in reversed(attempted):
            try:
                current = read_app(name)
                previous = r.environment(before[name]).get(FLAG)
                actual = r.environment(current).get(FLAG)
                guard(before[name], current, actual)
                r.require(actual in (previous, desired), 'PDF flag changed concurrently; automatic rollback stopped')
                if actual != previous:
                    update_flag(name, previous)
                    wait_ready(name, before[name], previous)
                report['rollback'].append({'name': name, 'previousFlagRestored': True})
            except Exception:
                report['rollback'].append({'name': name, 'manualReviewRequired': True})
        report['result'] = 'FAILED'
        raise
    finally:
        OUT.write_text(json.dumps(report, indent=2))
        print(json.dumps(report, separators=(',', ':')), flush=True)

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        raise SystemExit(str(error) if isinstance(error, ValueError) else 'PDF repair stopped; private details suppressed')
