"""F06 read-only Auth settings inventory; never probes credentials or changes gates."""
from datetime import datetime, timezone
import json
import re
import subprocess

SUB = '4f897b61-9b52-44b4-8cf1-bdac281cc1aa'
RG = 'rg-craves-prodlow-centralindia'
APP = 'ca-craves-auth-service-prodlow'
PREFIX = 'CRAVES_AUTH_RATE_LIMIT_'
SETTINGS = {
    PREFIX + 'ENABLED': ('boolean', False),
    PREFIX + 'MODE': ('mode', 'redis'),
    PREFIX + 'WINDOW_SECONDS': ('number', 60, 1, 3600),
    PREFIX + 'MAX_CONCURRENT': ('number', 6, 1, 32),
    PREFIX + 'GLOBAL_EXCHANGE_LIMIT': ('number', 120, 1, 10000),
    PREFIX + 'GLOBAL_REFRESH_LIMIT': ('number', 300, 1, 10000),
    PREFIX + 'CREDENTIAL_LIMIT': ('number', 10, 1, 1000),
    PREFIX + 'IDENTITY_REFRESH_LIMIT': ('number', 30, 1, 1000),
    'CRAVES_AUTH_REQUEST_IDLE_TIMEOUT_MS': ('number', 5000, 1000, 30000),
    'CRAVES_AUTH_REQUEST_BODY_TIMEOUT_MS': ('number', 10000, 1000, 60000),
}
OVERRIDES = {'JAVA_TOOL_OPTIONS', 'JDK_JAVA_OPTIONS', '_JAVA_OPTIONS', 'JAVA_OPTS',
             'SPRING_APPLICATION_JSON', 'SPRING_CONFIG_LOCATION', 'SPRING_CONFIG_ADDITIONAL_LOCATION',
             'SPRING_CONFIG_IMPORT', 'SPRING_PROFILES_ACTIVE'}
ALLOWED = {('account', 'show'), ('containerapp', 'show', '-g', RG, '-n', APP),
           ('containerapp', 'revision', 'list', '-g', RG, '-n', APP)}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def az(*args):
    require(args in ALLOWED, 'Only scoped read-only Auth metadata commands are permitted')
    result = subprocess.run(['az', *args, '--only-show-errors', '-o', 'json'],
                            capture_output=True, text=True, timeout=45)
    require(result.returncode == 0, 'Auth metadata read failed; raw output withheld')
    return json.loads(result.stdout.lstrip('\ufeff'))


def setting(entry, spec):
    if entry is None:
        return {'status': 'ABSENT', 'reviewedSourceDefault': spec[1], 'effectiveValueVerified': False}
    if entry.get('secretRef'):
        return {'status': 'SECRET_REFERENCE_NOT_RESOLVED', 'effectiveValueVerified': False}
    value = entry.get('value')
    kind = spec[0]
    if kind == 'boolean' and value in ('true', 'false'):
        parsed = value == 'true'
    elif kind == 'mode' and value in ('redis', 'postgres'):
        parsed = value
    elif kind == 'number' and isinstance(value, str) and re.fullmatch(r'[0-9]{1,5}', value):
        parsed = int(value)
        if not spec[2] <= parsed <= spec[3]:
            return {'status': 'OUT_OF_REVIEWED_RANGE', 'effectiveValueVerified': False}
    else:
        return {'status': 'UNRECOGNIZED_VALUE_WITHHELD', 'effectiveValueVerified': False}
    return {'status': 'EXPLICIT_ENVIRONMENT', 'value': parsed, 'effectiveValueVerified': False}


def template(value):
    containers = value.get('containers') or []
    require(len(containers) == 1, 'Expected one Auth container')
    container = containers[0]
    environment = container.get('env') or []
    require(all(isinstance(e.get('name'), str) for e in environment), 'Invalid Auth environment metadata')
    require(len({e['name'] for e in environment}) == len(environment), 'Duplicate Auth environment setting')
    indexed = {e['name']: e for e in environment}
    settings = {name: setting(indexed.get(name), spec) for name, spec in SETTINGS.items()}
    image = container.get('image', '')
    require(isinstance(image, str) and re.fullmatch(
        r'cravesprodlowacr82121\.azurecr\.io/craves/auth-service(?::[A-Za-z0-9_.-]+|@sha256:[a-f0-9]{64})', image),
        'Auth image reference not in expected registry/repository')
    return {'image': image, 'sourceProvenanceVerified': False,
            'settings': settings, 'possibleOverrideNames': sorted(OVERRIDES & indexed.keys()),
            'containerCommandPresent': bool(container.get('command')),
            'containerArgumentsPresent': bool(container.get('args')),
            'scale': {k: (value.get('scale') or {}).get(k) for k in ('minReplicas', 'maxReplicas')}}


def inspect():
    require(az('account', 'show').get('id') == SUB, 'Unexpected subscription')
    app = az('containerapp', 'show', '-g', RG, '-n', APP)
    revisions = az('containerapp', 'revision', 'list', '-g', RG, '-n', APP)
    active = [r for r in revisions if r.get('properties', {}).get('active')]
    properties = app['properties']
    require(len(active) == 1 and active[0]['name'] == properties.get('latestReadyRevisionName'),
            'Ambiguous active/ready Auth revision')
    revision = active[0]
    rp = revision['properties']
    desired = template(properties['template'])
    running = template(rp['template'])
    require(app == az('containerapp', 'show', '-g', RG, '-n', APP), 'Auth configuration changed during inspection')
    require(revisions == az('containerapp', 'revision', 'list', '-g', RG, '-n', APP),
            'Auth revision state changed during inspection')
    return {'readOnly': True, 'observedAt': datetime.now(timezone.utc).isoformat(),
            'app': APP, 'revision': revision['name'], 'healthState': rp.get('healthState'),
            'runningState': rp.get('runningState'), 'replicas': rp.get('replicas'),
            'desired': desired, 'running': running, 'reportedSettingsMatch': desired == running,
            'customerRequestsSent': 0, 'secretsResolved': False, 'activationPerformed': False,
            'activationAccepted': False,
            'limitations': ['Environment metadata is not effective Spring configuration or image-source proof.',
                            'Absent entries show reviewed source defaults, not independently verified running defaults.',
                            'Gateway enforcement and live bounded responses require separate evidence.']}


if __name__ == '__main__':
    try:
        print(json.dumps(inspect(), sort_keys=True))
    except Exception as error:
        # No raw cloud stderr, unrecognized setting value, secret binding or exception payload.
        raise SystemExit('Auth protection inspection stopped: ' +
                         (str(error) if isinstance(error, ValueError) and type(error) is ValueError else type(error).__name__))
