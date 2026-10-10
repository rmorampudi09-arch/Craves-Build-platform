"""Bounded, private, read-only correlation of canonical email and projections.

Account rows exist in process memory only. No identifiers, addresses, digests,
credentials or raw subprocess output are returned in the receipt.
"""
import hashlib
import hmac
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
from datetime import datetime, timezone

spec = importlib.util.spec_from_file_location('correlation_history', Path(__file__).with_name('inspect-applied-email-history.py'))
history = importlib.util.module_from_spec(spec)
spec.loader.exec_module(history)
MAX_ROWS = 10_000
SERVICES = ('auth-service', 'user-chef-service')
SELECTS = {
    'auth-service': """SELECT id::text AS identity, email, email_revision AS revision,
 email_verified AS verified,
 to_char(email_verified_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US') AS verified_at,
 false AS customer_mismatch, false AS chef_mismatch
 FROM public.auth_identity WHERE email_revision>0 ORDER BY id LIMIT 10001""",
    'user-chef-service': """SELECT p.identity_id::text AS identity, p.email, p.email_revision AS revision,
 true AS verified,
 to_char(p.verified_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US') AS verified_at,
 EXISTS(SELECT 1 FROM public.customer_profile c WHERE c.identity_id=p.identity_id AND c.email IS DISTINCT FROM p.email) AS customer_mismatch,
 EXISTS(SELECT 1 FROM public.chef_application c WHERE c.identity_id=p.identity_id AND c.email IS DISTINCT FROM p.email) AS chef_mismatch
 FROM public.auth_email_projection p ORDER BY p.identity_id LIMIT 10001"""
}
FIELDS = {'identity', 'email', 'revision', 'verified', 'verified_at', 'customer_mismatch', 'chef_mismatch'}


def private_rows(service, env):
    history.require(service in SERVICES, 'Unknown correlation service')
    history.require(env.get('PGOPTIONS') == '-c default_transaction_read_only=on', 'Read-only connection required')
    statement = ("BEGIN READ ONLY;\nSET LOCAL statement_timeout='10s';\nSET LOCAL lock_timeout='2s';\n"
                 + "SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM (" + SELECTS[service] + ") t;\nROLLBACK;\n")
    result = subprocess.run(['psql', '-X', '-qAt', '--set=ON_ERROR_STOP=1'], input=statement,
                            env=env, capture_output=True, text=True, timeout=25)
    history.require(result.returncode == 0, 'Correlation read unavailable')
    history.require(len(result.stdout.encode('utf-8')) <= 8_000_000, 'Correlation size limit')
    rows = json.loads(result.stdout)
    history.require(isinstance(rows, list) and len(rows) <= MAX_ROWS, 'Correlation row limit')
    return rows


def pseudonyms(rows, key):
    """Private keyed comparisons, not publishable hashes or a reusable identity index."""
    history.require(isinstance(key, bytes) and len(key) == 32, 'Ephemeral comparison key required')
    history.require(isinstance(rows, list) and len(rows) <= MAX_ROWS, 'Correlation row limit')
    result = {}
    for row in rows:
        history.require(isinstance(row, dict) and set(row) == FIELDS, 'Unexpected correlation shape')
        history.require(isinstance(row['identity'], str) and bool(re.fullmatch(
            r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}', row['identity'])), 'Invalid identity shape')
        history.require(type(row['revision']) is int and 0 < row['revision'] < 2**63, 'Invalid email revision')
        history.require(type(row['verified']) is bool and type(row['customer_mismatch']) is bool
                        and type(row['chef_mismatch']) is bool, 'Invalid comparison flags')
        # Incomplete canonical states are a failed capture, never clean equality.
        history.require(isinstance(row['email'], str) and 0 < len(row['email']) <= 254
                        and row['email'].strip() == row['email'], 'Invalid canonical email shape')
        history.require(isinstance(row['verified_at'], str) and bool(re.fullmatch(
            r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}', row['verified_at'])), 'Invalid verification time')
        datetime.strptime(row['verified_at'], '%Y-%m-%dT%H:%M:%S.%f')
        identity = hmac.digest(key, ('identity:' + row['identity']).encode(), hashlib.sha256)
        history.require(identity not in result, 'Duplicate correlation identity')
        fingerprint = hmac.digest(key, json.dumps([row['email'], row['revision'], row['verified_at'],
                                                  row['verified']], separators=(',', ':')).encode(), hashlib.sha256)
        result[identity] = (fingerprint, row['customer_mismatch'], row['chef_mismatch'], row['verified'])
    return result


def capture_service(service, servers, key):
    history.require(service in SERVICES, 'Unknown correlation service')
    app_name = history.APPS[service][0]
    app = history.az('containerapp', 'show', '-g', history.RG, '-n', app_name)
    props = app['properties']; containers = props['template']['containers']
    history.require(len(containers) == 1 and props['latestRevisionName'] == props['latestReadyRevisionName']
                    and props['provisioningState'] == 'Succeeded' and props['runningStatus'] == 'Running', 'Unsettled service')
    settings = containers[0].get('env', [])
    history.require(len({entry['name'] for entry in settings}) == len(settings), 'Duplicate setting')
    env = {entry['name']: entry for entry in settings}
    host, database = history.database_binding(env['SPRING_DATASOURCE_URL']['value'], servers)
    ref = env['SPRING_DATASOURCE_PASSWORD'].get('secretRef')
    history.require(ref and not env['SPRING_DATASOURCE_PASSWORD'].get('value'), 'Existing secret binding required')
    refs = history.az('containerapp', 'secret', 'list', '-g', history.RG, '-n', app_name)
    matching = [entry for entry in refs if entry.get('name') == ref]
    history.require(len(matching) == 1, 'Ambiguous secret reference')
    url = matching[0].get('keyVaultUrl', '')
    history.require(bool(re.fullmatch(re.escape(history.VAULT) + r'[A-Za-z0-9-]+(?:/[A-Za-z0-9]+)?', url)), 'Unexpected vault')
    username = env['SPRING_DATASOURCE_USERNAME'].get('value', '')
    history.require(username and not env['SPRING_DATASOURCE_USERNAME'].get('secretRef'), 'Unexpected username binding')
    password = history.az('keyvault', 'secret', 'show', '--id', url)['value']
    db_env = {k: v for k, v in os.environ.items() if not k.upper().startswith('PG')}
    db_env.update(PGHOST=host, PGPORT='5432', PGDATABASE=database, PGUSER=username, PGPASSWORD=password,
                  PGSSLMODE='verify-full', PGSSLROOTCERT='/etc/ssl/certs/ca-certificates.crt', PGCONNECT_TIMEOUT='10',
                  PGOPTIONS='-c default_transaction_read_only=on', PGAPPNAME='craves-readonly-email-correlation')
    try:
        rows = private_rows(service, db_env)
        comparison = pseudonyms(rows, key)
    finally:
        db_env.pop('PGPASSWORD', None)
        password = None
    rows.clear()
    history.require(history.az('containerapp', 'show', '-g', history.RG, '-n', app_name) == app, 'Runtime drift')
    # The private comparison never leaves this process. Revision metadata is safe.
    return {'private': comparison, 'revision': props['latestReadyRevisionName'], 'image': containers[0]['image']}


def compare_stable(auth_before, chef_before, auth_after, chef_after):
    history.require(auth_before == auth_after and chef_before == chef_after, 'Records changed during correlation')
    auth = auth_after['private']; chef = chef_after['private']
    common = auth.keys() & chef.keys()
    missing = len(auth.keys() - chef.keys()); orphaned = len(chef.keys() - auth.keys())
    differing = sum(auth[k][0] != chef[k][0] for k in common)
    customer = sum(v[1] for v in chef.values()); applications = sum(v[2] for v in chef.values())
    unverified = sum(not v[3] for v in auth.values())
    return {'canonicalCount': len(auth), 'projectionCount': len(chef), 'missingProjections': missing,
            'orphanedProjections': orphaned, 'emailVersionOrVerificationMismatches': differing,
            'customerProfileMismatches': customer, 'chefApplicationMismatches': applications,
            'unverifiedCanonicalRows': unverified, 'exercised': bool(auth),
            'observedRowsMatch': bool(auth) and not any((missing, orphaned, differing, customer, applications, unverified))}


def main():
    history.require(history.az('account', 'show').get('id') == history.SUB, 'Unexpected subscription')
    servers = history.az('postgres', 'flexible-server', 'list', '-g', history.RG)
    key = secrets.token_bytes(32)
    started = datetime.now(timezone.utc).isoformat()
    snapshots = [capture_service(service, servers, key) for service in (*SERVICES, *SERVICES)]
    result = compare_stable(*snapshots)
    return {'readOnly': True, 'startedAt': started, 'finishedAt': datetime.now(timezone.utc).isoformat(),
            'comparison': result, 'maxRowsPerService': MAX_ROWS, 'passesPerService': 2,
            'runtime': [{'service': name, 'revision': snapshot['revision'], 'image': snapshot['image']}
                        for name, snapshot in zip(SERVICES, snapshots[:2])],
            'crossDatabaseAtomicSnapshot': False, 'mailboxAccepted': False, 'publicLaunchAccepted': False,
            'limitations': ['Two stable observations are not a distributed atomic snapshot.',
                            'No zero-row success, auto-repair, identity digests or row data are exported.',
                            'Revocation, replacement and mailbox acceptance are separate journeys.']}


if __name__ == '__main__':
    try:
        report = main()
        print(json.dumps(report, sort_keys=True))
        if not report['comparison']['observedRowsMatch']:
            raise SystemExit('Email correlation found missing or mismatched evidence; no repair attempted')
    except Exception:
        # Even parser/driver exceptions may contain account data. Never render them.
        raise SystemExit('Email correlation is inconclusive: a scoped read, bound, shape or stability check failed; no write attempted') from None
