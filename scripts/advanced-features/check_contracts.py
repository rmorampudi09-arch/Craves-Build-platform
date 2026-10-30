#!/usr/bin/env python3
"""Static checks for the advanced-features gateway table (the drift check against code is ContractsIT).

- every route belongs to a declared API, every API path is unique and under api/v1/,
- policies are user/admin/public and their XML files exist,
- every module contract file named by an API exists.
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
ROUTES = ROOT / 'infra/apim/advanced-features/routes.txt'
POLICIES = {'user', 'admin', 'public'}


def main() -> int:
    errors = []
    apis, paths, operations = {}, set(), set()
    for number, raw in enumerate(ROUTES.read_text().splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        parts = line.split('|')
        if parts[0] == 'api' and len(parts) == 5:
            _, api_id, path, _, module = parts
            if api_id in apis or path in paths:
                errors.append(f'line {number}: duplicate api id or path {api_id} {path}')
            if not path.startswith('api/v1/'):
                errors.append(f'line {number}: path must start with api/v1/: {path}')
            apis[api_id] = module
            paths.add(path)
            contract = ROOT / 'contracts/openapi/advanced' / f'{module}-v1.yaml'
            if not contract.is_file():
                errors.append(f'line {number}: missing contract {contract.relative_to(ROOT)}')
        elif parts[0] == 'route' and len(parts) == 6:
            _, api_id, operation, method, template, policy = parts
            if api_id not in apis:
                errors.append(f'line {number}: route for undeclared api {api_id}')
            if (api_id, operation) in operations:
                errors.append(f'line {number}: duplicate operation {operation}')
            operations.add((api_id, operation))
            if method not in {'GET', 'POST', 'PUT', 'PATCH', 'DELETE'} or not template.startswith('/'):
                errors.append(f'line {number}: bad method or template {method} {template}')
            if policy not in POLICIES:
                errors.append(f'line {number}: unknown policy {policy}')
        else:
            errors.append(f'line {number}: cannot parse: {line}')
    for policy in POLICIES:
        if not (ROOT / f'infra/apim/advanced-features/{policy}-policy.xml').is_file():
            errors.append(f'missing infra/apim/advanced-features/{policy}-policy.xml')
    if not operations:
        errors.append('no routes')
    for error in errors:
        print('ERROR', error)
    print(f'{len(apis)} APIs, {len(operations)} operations checked')
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
