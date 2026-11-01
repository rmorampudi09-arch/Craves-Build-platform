#!/usr/bin/env python3
"""Static checks for the advanced-features gateway and contracts (the drift check against the code is ContractsIT).

- the single gateway API policy exists;
- every contract lists at least one path, only under /api/v1/advanced/, and every operation says who may call it (x-craves-auth).
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]


def main() -> int:
    errors = []
    if not (ROOT / 'infra/apim/advanced-features/api-policy.xml').is_file():
        errors.append('missing infra/apim/advanced-features/api-policy.xml')
    contracts = sorted((ROOT / 'contracts/openapi/advanced').glob('*-v1.yaml'))
    if not contracts:
        errors.append('no contracts in contracts/openapi/advanced')
    operations = 0
    for contract in contracts:
        text = contract.read_text()
        paths = re.findall(r'^  (/[^:]+):$', text, re.M)
        methods = re.findall(r'^    (get|post|put|patch|delete):$', text, re.M)
        auth = re.findall(r'^      x-craves-auth: (public|user|staff)$', text, re.M)
        if not paths:
            errors.append(f'{contract.name}: no paths')
        for path in paths:
            if not path.startswith('/api/v1/advanced/'):
                errors.append(f'{contract.name}: {path} is outside /api/v1/advanced/ (the gateway API would not route it)')
        if len(methods) != len(auth):
            errors.append(f'{contract.name}: {len(methods)} operations but {len(auth)} x-craves-auth markers')
        operations += len(methods)
    for error in errors:
        print('ERROR', error)
    print(f'{len(contracts)} contracts, {operations} operations checked')
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
