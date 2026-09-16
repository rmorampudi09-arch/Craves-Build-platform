"""Read APIM policy hashes only. Never export XML, named values or credentials."""
import argparse
import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

SUB = '4f897b61-9b52-44b4-8cf1-bdac281cc1aa'
RG = 'rg-craves-prodlow-centralindia'
APIM = 'apim-craves-prodlow-l3ing6'
BASE = f'https://management.azure.com/subscriptions/{SUB}/resourceGroups/{RG}/providers/Microsoft.ApiManagement/service/{APIM}'
VERSION = '2022-08-01'
SEGMENT = re.compile(r'[A-Za-z0-9_.;=-]{1,160}\Z')


def segment(value):
    if not isinstance(value, str) or not SEGMENT.fullmatch(value) or value in ('.', '..'):
        raise ValueError('Invalid resource identifier')
    return value


def read(suffix):
    # This is intentionally not a general-purpose REST helper.
    pattern = r'/(?:policies|apis(?:/[A-Za-z0-9_.;=-]+/(?:policies|operations(?:/[A-Za-z0-9_.;=-]+/policies)?))?)'
    if not re.fullmatch(pattern, suffix) or any(part in ('.', '..') for part in suffix.split('/')):
        raise ValueError('Only scoped policy and operation collections may be read')
    result = subprocess.run(['az', 'rest', '--method', 'get', '--url',
        BASE + suffix + '?api-version=' + VERSION, '--headers', 'Accept=application/json',
        '--only-show-errors', '-o', 'json'], capture_output=True, text=True, timeout=120)
    if result.returncode:
        raise RuntimeError('Gateway metadata read failed; raw output suppressed')
    data = json.loads(result.stdout.lstrip('\ufeff'))
    if data.get('nextLink'):
        raise ValueError('Paginated collection requires a separately reviewed reader; evidence incomplete')
    rows = data.get('value')
    if not isinstance(rows, list):
        raise ValueError('Unexpected collection response')
    return rows


def summarize(scope, rows):
    if len(rows) > 1:
        raise ValueError('Ambiguous policy collection')
    if not rows:
        return {'scope': scope, 'status': 'NO_LOCAL_POLICY', 'count': 0}
    row = rows[0]
    properties = row.get('properties') or {}
    xml = properties.get('value')
    if not isinstance(xml, str) or not xml.strip():
        raise ValueError('Empty or missing policy is not accepted as evidence')
    return {'scope': scope, 'status': 'READ', 'count': 1,
            'xmlSha256': hashlib.sha256(xml.encode('utf-8')).hexdigest(),
            'xmlBytes': len(xml.encode('utf-8')),
            'format': properties.get('format') if properties.get('format') in ('xml', 'rawxml') else 'UNRECOGNIZED',
            'etagSha256': hashlib.sha256(str(row.get('etag', '')).encode()).hexdigest()
                if row.get('etag') else None}


def capture():
    policies = [summarize('global', read('/policies'))]
    apis = read('/apis')
    if not apis:
        raise ValueError('Empty API inventory is not launch evidence')
    for api in sorted(apis, key=lambda row: row['name']):
        aid = segment(api['name'])
        prefix = '/apis/' + aid
        policies.append(summarize(prefix, read(prefix + '/policies')))
        for operation in sorted(read(prefix + '/operations'), key=lambda row: row['name']):
            scope = prefix + '/operations/' + segment(operation['name'])
            policies.append(summarize(scope, read(scope + '/policies')))
    return {'schemaVersion': 1, 'readOnly': True, 'accepted': False,
            'subscription': SUB, 'resourceGroup': RG, 'gateway': APIM,
            'finishedAt': datetime.now(timezone.utc).isoformat(), 'policies': policies,
            'limitations': ['Point-in-time sequential reads, not an atomic deployment snapshot.',
                'Product/workspace policies, fragments and named-value bindings require separate reconciliation.',
                'Hashes identify policy bytes but do not certify effective authorization or caching behavior.',
                'No policy XML, response bodies, named values or secret values are exported.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    try:
        result = capture()
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(result, sort_keys=True, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(result, sort_keys=True))
    except Exception as error:
        # Neither Azure stderr nor potentially sensitive XML/JSON parser errors are logged.
        raise SystemExit('Gateway fingerprint capture failed: ' + type(error).__name__)
