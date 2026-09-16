"""Guarded Auth-only activation. Never disables protection or edits other owners."""
import argparse
import copy
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import time
import urllib.error
import urllib.request
import uuid


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


runtime = module('auth_shared_runtime', 'verify-customer-web-runtime.py')
inventory = module('auth_inventory', 'inspect-auth-protection.py')
require = runtime.require
APP, RG, SUB = inventory.APP, inventory.RG, inventory.SUB
SETTINGS = {name: str(spec[1]).lower() for name, spec in inventory.SETTINGS.items()}
SETTINGS.update(CRAVES_AUTH_RATE_LIMIT_ENABLED='true', CRAVES_AUTH_RATE_LIMIT_MODE='postgres')
IMAGE = r'cravesprodlowacr82121\.azurecr\.io/craves/auth-service@sha256:[a-f0-9]{64}'


def valid_image(image):
    require(isinstance(image, str) and re.fullmatch(IMAGE, image), 'Immutable Auth image required')


def update_args(image):
    valid_image(image)
    return ('containerapp', 'update', '-g', RG, '-n', APP, '--image', image,
            '--set-env-vars', *(name + '=' + value for name, value in sorted(SETTINGS.items())), '--no-wait')


def az(*args):
    reads = {('account', 'show'), ('containerapp', 'show', '-g', RG, '-n', APP),
             ('containerapp', 'revision', 'list', '-g', RG, '-n', APP)}
    replica = (len(args) == 9 and args[:7] == ('containerapp', 'replica', 'list', '-g', RG, '-n', APP)
               and args[7] == '--revision' and re.fullmatch(re.escape(APP) + r'--[a-z0-9-]+', args[8]))
    write = len(args) > 8 and args == update_args(args[7]) if args[:2] == ('containerapp', 'update') else False
    require(args in reads or replica or write, 'Command outside scoped Auth activation')
    result = subprocess.run(['az', *args, '--only-show-errors', '-o', 'json'],
                            capture_output=True, text=True, timeout=60)
    require(result.returncode == 0, 'Auth cloud command failed; raw output withheld')
    return json.loads(result.stdout.lstrip('\ufeff')) if result.stdout.strip() else None


def production(app):
    require(app.get('name') == APP, 'Wrong Auth app')
    props = app['properties']
    require(props['configuration']['activeRevisionsMode'] == 'Single', 'Auth must use Single revision mode')
    template = props['template']
    require(template['scale']['minReplicas'] == template['scale']['maxReplicas'] == 1, 'Auth replica bounds changed')
    inventory.template(template)
    container = template['containers'][0]
    require(not container.get('command') and not container.get('args'), 'Unexpected Auth command override')
    env = {entry['name']: entry for entry in runtime.normalized_template(template)['containers'][0].get('env', [])}
    overrides = inventory.OVERRIDES & env.keys()
    require(overrides <= {'SPRING_PROFILES_ACTIVE'}, 'Unexpected Spring/JVM override')
    if 'SPRING_PROFILES_ACTIVE' in env:
        require(env['SPRING_PROFILES_ACTIVE'] == {'name': 'SPRING_PROFILES_ACTIVE', 'value': 'prod'},
                'Only reviewed prod profile permitted')
    # Catch alternate spellings of the properties which relaxed Spring binding could accept.
    for name in env:
        compact = re.sub('[^A-Z0-9]', '', name.upper())
        if compact.startswith(('CRAVESAUTHRATELIMIT', 'CRAVESAUTHREQUEST')):
            require(name in SETTINGS, 'Unreviewed Auth protection override')


def fingerprint(app):
    production(app)
    value = copy.deepcopy(app)
    container = value['properties']['template']['containers'][0]
    container['env'] = [e for e in container.get('env', []) if e['name'] not in SETTINGS]
    return runtime.stable(value)


def explicit_settings(app):
    env = {e['name']: e for e in runtime.normalized_template(app['properties']['template'])['containers'][0].get('env', [])}
    require(all(env.get(k) == {'name': k, 'value': v} for k, v in SETTINGS.items()),
            'Protected settings differ from reviewed activation')


def snapshot():
    app = az('containerapp', 'show', '-g', RG, '-n', APP)
    revisions = az('containerapp', 'revision', 'list', '-g', RG, '-n', APP)
    revision = app['properties'].get('latestReadyRevisionName')
    require(isinstance(revision, str), 'Auth has no ready revision')
    replicas = az('containerapp', 'replica', 'list', '-g', RG, '-n', APP, '--revision', revision)
    return app, revisions, replicas


def ready(values):
    return runtime.ready(*values, validate=production)


def guard(before, current):
    require(fingerprint(before[0]) == fingerprint(current[0]), 'Unrelated Auth settings drifted')
    require(runtime.normalized_template(before[0]['properties']['template']) ==
            runtime.normalized_template(current[0]['properties']['template']), 'Auth template changed before activation')
    require(ready(before) == ready(current), 'Auth revision changed before activation')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs): return None


def probe(path, body):
    require(path in ('/firebase/exchange', '/refresh'), 'Unexpected Auth probe path')
    request = urllib.request.Request('https://api.craves.in/api/v1/auth' + path,
        data=json.dumps(body).encode(), method='POST',
        headers={'Content-Type': 'application/json', 'User-Agent': 'Craves-bounded-auth-acceptance'})
    try:
        response = urllib.request.build_opener(NoRedirect()).open(request, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        data = response.read(8193)
        require(len(data) <= 8192, 'Auth response exceeded bound')
        payload = json.loads(data)
        code = payload.get('code')
        require(isinstance(code, str) and re.fullmatch('[A-Z_]{1,80}', code), 'Unexpected Auth response shape')
        # Never print response bodies, cookies, identities or credentials.
        return {'status': response.code, 'code': code,
                'private': 'no-store' in response.headers.get('Cache-Control', '').lower(),
                'retryAfter': response.headers.get('Retry-After')}


def smoke(send=probe, clock=time.time, sleep=time.sleep):
    rows = []
    for path in ('/firebase/exchange', '/refresh'):
        result = send(path, {})
        require(result['status'] == 400 and result['code'] == 'AUTH_REQUEST_INVALID' and result['private'],
                'Active private Auth protection rejection not observed')
        rows.append({'path': path, **result})
    # One impossible random refresh token, <=11 attempts. Never use a real token or call Firebase.
    remaining = 60 - clock() % 60
    if remaining < 25: sleep(remaining + 1)
    window = int(clock() // 60)
    token = 'craves-invalid-release-check-' + uuid.uuid4().hex
    for attempt in range(1, 12):
        require(int(clock() // 60) == window, 'Probe window elapsed; no automatic retry')
        result = send('/refresh', {'refreshToken': token})
        require(int(clock() // 60) == window, 'Probe response crossed window; no automatic retry')
        require(result['private'], 'Authentication rejection may be cached')
        if attempt < 11:
            require(result['status'] == 401, 'Unexpected denial before credential limit; no automatic retry')
        else:
            require(result['status'] == 429 and result['code'] == 'AUTH_RATE_LIMITED'
                    and str(result['retryAfter']).isdigit() and 1 <= int(result['retryAfter']) <= 60,
                    'Credential limit and bounded Retry-After not observed')
        rows.append({'path': '/refresh', 'attempt': attempt, **result})
    return rows


def activate(image):
    valid_image(image)
    require(az('account', 'show').get('id') == SUB, 'Unexpected subscription')
    before = snapshot()
    ready(before)
    # Fresh reads directly before the only write; do not overwrite intervening changes.
    guard(before, snapshot())
    print(json.dumps({'phase': 'activating', 'app': APP, 'previousRevision': ready(before),
                      'image': image, 'settings': SETTINGS, 'unrelatedSettingsHash': fingerprint(before[0])}), flush=True)
    az(*update_args(image))
    for attempt in range(60):
        current = snapshot()
        require(fingerprint(current[0]) == fingerprint(before[0]), 'Unrelated Auth runtime drift after activation')
        explicit_settings(current[0])
        require(current[0]['properties']['template']['containers'][0]['image'] == image, 'Another Auth image selected')
        try:
            revision = ready(current)
            break
        except ValueError:
            if attempt == 59: raise
            time.sleep(5)
    rows = smoke()
    current = snapshot()
    require(ready(current) == revision and fingerprint(current[0]) == fingerprint(before[0]), 'Auth drifted during probes')
    explicit_settings(current[0])
    print(json.dumps({'phase': 'protected', 'observedAt': datetime.now(timezone.utc).isoformat(),
                      'app': APP, 'revision': revision, 'image': image, 'settings': SETTINGS,
                      'unrelatedSettingsPreserved': True, 'syntheticRequests': len(rows), 'probes': rows,
                      'realSignInAccepted': False, 'gatewayPolicyChanged': False}, sort_keys=True))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', required=True)
    args = parser.parse_args()
    try:
        activate(args.image)
    except Exception as error:
        # Fail closed: never auto-disable protection to turn a failed acceptance green.
        raise SystemExit('Auth activation stopped; inspect current revision before recovery. ' +
                         (str(error) if type(error) is ValueError else type(error).__name__))
