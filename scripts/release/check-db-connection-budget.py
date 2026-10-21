#!/usr/bin/env python3
"""Fail when the apps on the shared PostgreSQL server could open more than 45 connections.

Each replica can open its Hikari maximum-pool-size, so the worst case is the sum of pool x maxReplicas.
The prodlow server (Standard_B1ms) allows about 50; the rest is left for Flyway, psql and Azure.
Pool sizes come from each service's application.yml default (or the env value its bicep sets) and
max replicas from the bicep that creates its Container App.
"""
import argparse
import re
import sys
from pathlib import Path

LIMIT = 45
SHARED_INFRA = ('infra/main.bicep', 'infra/prodlow-rebuild/main.bicep')
# Every service whose database is on the shared server: (bicep files, containerApps entry name or None for a one-app bicep).
SERVICES = {
    'auth-service': (SHARED_INFRA, 'auth-service'),
    'user-chef-service': (SHARED_INFRA, 'user-chef-service'),
    'catalog-service': (SHARED_INFRA, 'catalog-service'),
    'order-service': (SHARED_INFRA, 'order-service'),
    'subscription-service': (SHARED_INFRA, 'subscription-service'),
    'integration-service': (SHARED_INFRA, 'integration-service'),
    'notification-service': (SHARED_INFRA, 'notification-service'),
    'referral-service': (('services/referral-service/deploy/main.bicep',), None),
}
POOL = re.compile(r'^\s*maximum-pool-size:\s*(?:\$\{(\w+):(\d+)\}|(\d+))\s*$', re.M)


def check(root):
    """Returns (report lines, problems)."""
    lines, problems, total = [], [], 0
    for service, (files, entry) in SERVICES.items():
        match = POOL.search((root / 'services' / service / 'src/main/resources/application.yml').read_text())
        if not match:
            problems.append(f'{service}: set spring.datasource.hikari.maximum-pool-size explicitly')
            continue
        env, default, literal = match.groups()
        texts = [(root / name).read_text() for name in files]
        overrides = [int(m) for text in texts if env for m in re.findall(rf"name: '{env}'\s+value: '(\d+)'", text)]
        pool = max(overrides or [int(literal or default)])
        # [^{}] keeps the match inside one containerApps entry.
        pattern = rf"name: '{re.escape(entry)}'[^{{}}]*?maxReplicas: (\d+)" if entry else r'maxReplicas: (\d+)'
        replicas = [int(m) for text in texts for m in re.findall(pattern, text)]
        if not replicas:
            problems.append(f'{service}: no maxReplicas found in {", ".join(files)}')
            continue
        total += pool * max(replicas)
        lines.append(f'{service:22} pool {pool:>2} x max replicas {max(replicas)} = {pool * max(replicas)}')
    lines.append(f'{"total":22} {total} (limit {LIMIT})')
    if total > LIMIT:
        problems.append(f'pool x max replicas is {total}, over the {LIMIT} connections the shared server can give')
    return lines, problems


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    lines, problems = check(parser.parse_args(argv).root)
    print('\n'.join(lines))
    for problem in problems:
        print('DB_CONNECTION_BUDGET:', problem, file=sys.stderr)
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
