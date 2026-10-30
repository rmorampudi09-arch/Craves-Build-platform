#!/usr/bin/env python3
"""Read-only live check of every advanced-features route through https://api.craves.in.

Routes come from the generated contracts (contracts/openapi/advanced/*.yaml, x-craves-auth per operation):
- user/staff routes called without a token must answer the service's own 401 envelope (route deployed and protected);
- public routes must answer 200 or the service's own error envelope (route deployed and reaching the database);
- /api/v1/advanced/features must list every module and show it available.
Nothing is created or changed. With --wait N it waits up to N minutes for a release to show every module.
If the gateway does not know /api/v1/advanced at all, the one-time setup has not run yet: it says so and exits 0.
"""
import argparse
import json
import pathlib
import sys
import time
import urllib.error
import urllib.request

import yaml

ROOT = pathlib.Path(__file__).resolve().parents[2]
API = 'https://api.craves.in'
PLACEHOLDER = '00000000-0000-4000-8000-000000000000'


def call(method, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(API + path, data=data, method=method,
                                     headers={'Accept': 'application/json', 'Content-Type': 'application/json',
                                              'User-Agent': 'craves-advanced-smoke/1'})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, response.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode('utf-8', 'replace')
    except Exception as error:  # network trouble is a failure, not a crash
        return 0, str(error)


def envelope(text):
    try:
        return json.loads(text).get('code')
    except Exception:
        return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--wait', type=int, default=0, help='minutes to wait for every module to be available')
    args = parser.parse_args()
    contracts = sorted((ROOT / 'contracts/openapi/advanced').glob('*-v1.yaml'))
    modules = [c.name[:-len('-v1.yaml')] for c in contracts if c.name != 'advanced-v1.yaml']

    deadline = time.time() + args.wait * 60
    while True:
        status, text = call('GET', '/api/v1/advanced/features')
        if status == 404 and envelope(text) is None:
            print('::warning::https://api.craves.in/api/v1/advanced is not published yet: run infra/advanced-features/setup-once.sh once.')
            return 0
        listed = {}
        if status == 200:
            listed = {f['id']: f for f in json.loads(text)}
        missing = [m for m in modules if not listed.get(m, {}).get('available')]
        if not missing or time.time() > deadline:
            break
        print(f'waiting for release: features status {status}, not yet available: {missing}')
        time.sleep(60)

    failures, passed = [], 0
    if missing:
        failures.append(f'features endpoint: not available {missing} (status {status})')
    for contract in contracts:
        spec = yaml.safe_load(contract.read_text())
        for path, operations in spec.get('paths', {}).items():
            url = path
            for parameter in [p for p in path.split('/') if p.startswith('{')]:
                url = url.replace(parameter, PLACEHOLDER)
            for method, operation in operations.items():
                auth = operation.get('x-craves-auth', 'user')
                body = {} if method in ('post', 'put', 'patch') else None
                status, text = call(method.upper(), url, body)
                code = envelope(text)
                ok = (status == 401 and code == 'AUTHENTICATION_REQUIRED') if auth in ('user', 'staff') \
                    else (status == 200 or (status in (400, 404, 422) and code is not None))
                if ok:
                    passed += 1
                else:
                    failures.append(f'{method.upper()} {url} [{auth}] -> {status} {code or text[:120]}')
    for failure in failures:
        print('FAIL', failure)
    print(f'{passed} routes passed, {len(failures)} failed')
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
