"""Exact-environment PDF source activation; no application image or other setting changes."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid

spec = importlib.util.spec_from_file_location('pdf_runtime', 'scripts/finance/shared_chef_finance_release.py')
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
FLAG = 'CRAVES_DOCUMENTS_SOURCES_ENABLED'
TARGETS = ('ca-craves-order-service-prodlow', 'ca-craves-integration-service-pr', 'ca-craves-subscription-service-p')
API_VERSION = '2025-07-01'
SURFACES = {'web': 'https://craves.in/', 'webVersion': 'https://craves.in/api/version',
            'paymentReadiness': 'https://craves.in/api/readiness/razorpay',
            'chefAuthBoundary': 'https://api.craves.in/api/v1/chef/application/readiness'}


def image(app):
    r.environment(app)  # Enforce one container and unique setting names.
    return app['properties']['template']['containers'][0]['image']


def env(app):
    r.environment(app)
    return app['properties']['template']['containers'][0].get('env', [])


def env_map(entries):
    value = {e['name']: e for e in entries}
    r.require(len(value) == len(entries), 'Duplicate source setting; stop')
    return value


def allowed_recovery_env(original, current):
    """Only the PDF flag and CLI-added empty values beside existing secret refs."""
    old, new = env_map(original), env_map(current)
    r.require(FLAG not in old, 'Original diagnostic must have absent PDF source flag')
    r.require(set(new) in (set(old), set(old) | {FLAG}), 'Unrelated source environment names changed')
    r.require(new.get(FLAG) in (None, {'name': FLAG, 'value': 'true'}), 'Unexpected PDF source flag')
    for name, entry in old.items():
        actual = new[name]
        permitted = entry.get('secretRef') and 'value' not in entry and actual == dict(entry, value='')
        r.require(actual == entry or permitted, 'Unrelated source setting changed: ' + name)


def original_guard(app, baseline, original):
    r.require(image(app) == baseline['image'], 'Original source image differs')
    reconstructed = copy.deepcopy(app)
    reconstructed['properties']['template']['containers'][0]['env'] = copy.deepcopy(original)
    r.require(r.signature(reconstructed) == baseline['runtimeHash'], 'Original non-environment runtime differs')


def exact_guard(app, baseline, original, expected_env):
    original_guard(app, baseline, original)
    r.require(env(app) == expected_env, 'Exact source environment differs; stop')


def non_target_guard(app, baseline):
    r.require(image(app) == baseline['image'] and r.signature(app) == baseline['runtimeHash']
              and app['properties']['latestReadyRevisionName'] == baseline['readyRevision']
              and app['properties']['latestRevisionName'] == baseline['readyRevision'],
              'Unrelated application changed: ' + app['name'])


def read_app(name):
    return r.active.az('containerapp', 'show', '-g', r.RG, '-n', name)


def read_revision(name, revision):
    return r.active.az('containerapp', 'revision', 'show', '-g', r.RG, '-n', name, '--revision', revision)


def probe(url):
    try:
        with urllib.request.build_opener(r.NoRedirect()).open(url, timeout=15) as response:
            return response.status, response.read(100_000)
    except urllib.error.HTTPError as error:
        return error.code, b''
    except Exception:
        return 0, b''


def healthy(app):
    code, body = probe(r.origin(app) + '/actuator/health')
    try:
        return code == 200 and json.loads(body).get('status') == 'UP'
    except Exception:
        return False


def payload(app, desired_env, suffix):
    r.require(app['name'] in TARGETS, 'PDF source app allowlist required')
    env_map(desired_env)
    containers = copy.deepcopy(app['properties']['template']['containers'])
    r.require(len(containers) == 1, 'Expected one existing container')
    containers[0]['env'] = copy.deepcopy(desired_env)
    return {'location': app['location'], 'properties': {'template': {'containers': containers, 'revisionSuffix': suffix}}}


def patch_env(app, desired_env, suffix):
    body = payload(app, desired_env, suffix)
    expected_id = '/subscriptions/' + r.SUB + '/resourceGroups/' + r.RG + '/providers/Microsoft.App/containerApps/' + app['name']
    r.require(app['id'].lower() == expected_id.lower(), 'Unexpected source resource ID')
    # A private temporary body avoids exposing current environment values as CLI arguments.
    with tempfile.TemporaryDirectory(prefix='pdf-env-patch-') as directory:
        path = Path(directory) / 'body.json'
        path.write_text(json.dumps(body)); path.chmod(0o600)
        result = subprocess.run(['az', 'rest', '--method', 'PATCH', '--url',
                                 'https://management.azure.com' + expected_id + '?api-version=' + API_VERSION,
                                 '--headers', 'Content-Type=application/json', '--body', '@' + str(path),
                                 '--only-show-errors', '-o', 'none'], capture_output=True, text=True, timeout=90)
        r.require(result.returncode == 0, 'Exact PDF environment PATCH failed; private output suppressed')


def wait_ready(name, baseline, original, desired_env, suffix, prior):
    deadline = time.monotonic() + 240
    while time.monotonic() < deadline:
        app = read_app(name)
        original_guard(app, baseline, original)
        if app['properties']['template'].get('revisionSuffix') != suffix:
            # ARM 202 may precede visibility. Only the exact known prior state may settle.
            r.require(r.signature(app) == r.signature(prior) and image(app) == image(prior)
                      and app['properties']['latestRevisionName'] == prior['properties']['latestRevisionName'],
                      'Concurrent source change while PATCH settles')
            time.sleep(5)
            continue
        exact_guard(app, baseline, original, desired_env)
        p = app['properties']
        r.require(p['latestRevisionName'] == name + '--' + suffix, 'Unexpected source revision owner')
        if p.get('provisioningState') == 'Succeeded' and p.get('runningStatus') == 'Running' and p.get('latestReadyRevisionName') == p['latestRevisionName']:
            revision = read_revision(name, p['latestReadyRevisionName'])['properties']
            if revision.get('active') is True and revision.get('healthState') == 'Healthy' and revision.get('trafficWeight') == 100 and healthy(app):
                return app
        time.sleep(5)
    raise ValueError('Exact PDF source revision did not become healthy')


def main():
    output = Path(os.environ['PDF_REPAIR_OUTPUT'])
    rows = json.loads(os.environ['PDF_EXPECTED_BASELINE'])
    baseline = {row['name']: row for row in rows}
    r.require(len(rows) == len(baseline) == 13 and set(TARGETS) <= set(baseline), 'Exact original 13-app baseline required')
    report = {'scope': 'Exact original environment plus three PDF source flags', 'changed': [], 'rollback': [],
              'originalBaseline': rows, 'result': 'PREPARING'}
    originals, known, attempted = {}, {}, []

    def save():
        output.write_text(json.dumps(report, indent=2))

    try:
        apps = r.inventory()
        r.require(set(apps) == set(baseline), 'Original application inventory changed')
        for name, app in apps.items():
            if name not in TARGETS:
                non_target_guard(app, baseline[name])
                continue
            # Revision responses may omit empty fields already present at baseline.
            # Prefer the exact current environment whenever removing only FLAG
            # reconstructs the original hash; consult the old revision only to
            # recover proven CLI serialization changes (observed on Subscription).
            candidate = copy.deepcopy(app)
            original = [copy.deepcopy(e) for e in env(app) if e['name'] != FLAG]
            candidate['properties']['template']['containers'][0]['env'] = original
            if image(app) != baseline[name]['image'] or r.signature(candidate) != baseline[name]['runtimeHash']:
                revision = read_revision(name, baseline[name]['readyRevision'])
                original = copy.deepcopy(revision['properties']['template']['containers'][0].get('env', []))
                r.require(revision['properties']['template']['containers'][0]['image'] == baseline[name]['image'], 'Original revision image differs')
            original_guard(app, baseline[name], original)
            allowed_recovery_env(original, env(app))
            r.require(app['properties']['configuration']['activeRevisionsMode'] == 'Single', 'Existing single revision mode required')
            r.require(app['properties']['latestRevisionName'] == app['properties']['latestReadyRevisionName'] and healthy(app), 'Existing source must be settled and healthy')
            originals[name], known[name] = original, app
        nenv = r.environment(apps['ca-craves-notification-service-p'])
        r.require(all(nenv.get(k, {}).get('value') == 'true' for k in ('CRAVES_DOCUMENTS_ENABLED', 'CRAVES_DOCUMENTS_WORKER_ENABLED')), 'Existing PDF API and worker required')
        for name, setting in zip(TARGETS, ('CRAVES_DOCUMENTS_ORDER_BASE_URL', 'CRAVES_DOCUMENTS_INTEGRATION_BASE_URL', 'CRAVES_DOCUMENTS_SUBSCRIPTION_BASE_URL')):
            r.require(nenv.get(setting, {}).get('value', '').rstrip('/') == r.origin(apps[name]), 'PDF source origin differs')
        report['preflight'] = 'PASS'
        report['existingSurfaceStatusBefore'] = {label: probe(url)[0] for label, url in SURFACES.items()}
        r.require(report['existingSurfaceStatusBefore']['web'] == 200 and all(report['existingSurfaceStatusBefore'].values()), 'Existing surfaces unavailable')
        save()
        for name in TARGETS:
            current = r.inventory()
            r.require(set(current) == set(baseline), 'Application inventory changed')
            for other, app in current.items():
                if other not in TARGETS:
                    non_target_guard(app, baseline[other])
                else:
                    exact_guard(app, baseline[other], originals[other], env(known[other]))
                    r.require(app['properties']['latestRevisionName'] == known[other]['properties']['latestRevisionName'], 'Concurrent source revision changed')
            before = read_app(name)
            exact_guard(before, baseline[name], originals[name], env(known[name]))
            r.require(before['properties']['latestRevisionName'] == known[name]['properties']['latestRevisionName'], 'Source changed before PATCH')
            desired = copy.deepcopy(originals[name]) + [{'name': FLAG, 'value': 'true'}]
            suffix = 'pdf-' + uuid.uuid4().hex[:12]
            attempted.append({'name': name, 'suffix': suffix, 'desired': desired, 'prior': before})
            print('Applying exact PDF source environment: ' + name, flush=True)
            patch_env(before, desired, suffix)
            ready = wait_ready(name, baseline[name], originals[name], desired, suffix, before)
            known[name] = ready
            report['changed'].append({'name': name, 'setting': FLAG, 'value': 'true', 'originalEnvironmentRestored': True,
                                      'imageReferencePreserved': True, 'unrelatedRuntimePreserved': True,
                                      'readyRevision': ready['properties']['latestReadyRevisionName']})
            save()
        after = r.inventory()
        r.require(set(after) == set(baseline), 'Final application inventory changed')
        for name, app in after.items():
            if name in TARGETS:
                exact_guard(app, baseline[name], originals[name], env(known[name]))
                r.require(app['properties']['latestReadyRevisionName'] == known[name]['properties']['latestReadyRevisionName']
                          and app['properties']['latestRevisionName'] == app['properties']['latestReadyRevisionName'], 'Source readiness changed')
            else:
                non_target_guard(app, baseline[name])
        report['existingSurfaceStatusAfter'] = {label: probe(url)[0] for label, url in SURFACES.items()}
        r.require(report['existingSurfaceStatusBefore'] == report['existingSurfaceStatusAfter'], 'Existing surface status changed')
        report.update(result='PASS', all13ImageReferencesPreserved=True, other10AppsUnchanged=True,
                      originalUnrelatedRuntimePreserved=True, originalNonPdfEnvironmentPreserved=True,
                      currentBaseline=[{'name': name, 'image': image(app), 'readyRevision': app['properties']['latestReadyRevisionName'],
                                        'runtimeHash': r.signature(app)} for name, app in sorted(after.items())])
    except Exception:
        for intent in reversed(attempted):
            name = intent['name']
            try:
                current = read_app(name)
                original_guard(current, baseline[name], originals[name])
                # Do not overwrite a revision or environment selected by somebody else.
                owned = current['properties']['template'].get('revisionSuffix') == intent['suffix']
                if owned:
                    exact_guard(current, baseline[name], originals[name], intent['desired'])
                    r.require(current['properties']['latestRevisionName'] == name + '--' + intent['suffix'], 'Rollback revision ownership differs')
                    suffix = 'pdf-rb-' + uuid.uuid4().hex[:12]
                    patch_env(current, originals[name], suffix)
                    wait_ready(name, baseline[name], originals[name], originals[name], suffix, current)
                    report['rollback'].append({'name': name, 'exactOriginalEnvironmentRestored': True})
                else:
                    r.require(r.signature(current) == r.signature(intent['prior'])
                              and current['properties']['latestRevisionName'] == intent['prior']['properties']['latestRevisionName'],
                              'Rollback refused: source changed outside this operation')
                    report['rollback'].append({'name': name, 'patchNotObserved': True})
            except Exception:
                report['rollback'].append({'name': name, 'manualReviewRequired': True})
        report['result'] = 'FAILED'
        raise
    finally:
        save()
        print(json.dumps(report, separators=(',', ':')), flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        raise SystemExit(str(error) if isinstance(error, ValueError) else 'PDF repair stopped; private details suppressed')
