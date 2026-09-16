"""Bounded read-only email health aggregates; never return account-level data."""
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
from datetime import datetime, timezone

SPEC = importlib.util.spec_from_file_location('email_history', Path(__file__).with_name('inspect-applied-email-history.py'))
history = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(history)

QUERIES = {
    'auth-service': """SELECT json_build_object(
 'canonicalVerified', (SELECT count(*) FROM auth_identity WHERE email_revision>0 AND email_verified AND email_verified_at IS NOT NULL),
 'incompleteCanonicalState', (SELECT count(*) FROM auth_identity WHERE email_revision>0 AND (NOT email_verified OR email_verified_at IS NULL OR email IS NULL OR btrim(email)='')),
 'pendingProjections', (SELECT count(*) FROM auth_email_projection_outbox WHERE delivered_at IS NULL),
 'oldestPendingSeconds', (SELECT greatest(0,floor(extract(epoch FROM now()-min(created_at))))::bigint FROM auth_email_projection_outbox WHERE delivered_at IS NULL),
 'retryingProjections', (SELECT count(*) FROM auth_email_projection_outbox WHERE delivered_at IS NULL AND last_error_code IS NOT NULL),
 'activeLeases', (SELECT count(*) FROM auth_email_projection_outbox WHERE delivered_at IS NULL AND lease_expires_at>now()),
 'expiredLeases', (SELECT count(*) FROM auth_email_projection_outbox WHERE delivered_at IS NULL AND lease_expires_at<=now()),
 'challenges24h', (SELECT count(*) FROM auth_email_challenge WHERE created_at>=now()-interval '24 hours'),
 'unavailableDeliveries24h', (SELECT count(*) FROM auth_email_challenge WHERE created_at>=now()-interval '24 hours' AND delivery_status='UNAVAILABLE'),
 'unknownDeliveries24h', (SELECT count(*) FROM auth_email_challenge WHERE created_at>=now()-interval '24 hours' AND delivery_status='UNKNOWN'));
""",
    'user-chef-service': """SELECT json_build_object(
 'projectedIdentities', (SELECT count(*) FROM auth_email_projection),
 'customerProfileMismatches', (SELECT count(*) FROM auth_email_projection p JOIN customer_profile c USING(identity_id) WHERE c.email IS DISTINCT FROM p.email),
 'chefApplicationMismatches', (SELECT count(*) FROM auth_email_projection p JOIN chef_application c USING(identity_id) WHERE c.email IS DISTINCT FROM p.email),
 'projectionReceipts24h', (SELECT count(*) FROM auth_email_projection_receipt WHERE received_at>=now()-interval '24 hours'));
""",
    'notification-service': """SELECT json_build_object(
 'accepted24h', count(*) FILTER (WHERE status='ACCEPTED'),
 'failed24h', count(*) FILTER (WHERE status='FAILED'),
 'unknown24h', count(*) FILTER (WHERE status='UNKNOWN'),
 'expiredUnknown24h', count(*) FILTER (WHERE status='UNKNOWN' AND expires_at<=now()))
 FROM notification_schema.auth_email_verification_receipt WHERE created_at>=now()-interval '24 hours';
"""
}
FIELDS = {service: set(re.findall(r"'([A-Za-z][A-Za-z0-9]+)'\s*,", query)) for service, query in QUERIES.items()}


def validate(service, value):
    history.require(service in FIELDS and isinstance(value, dict) and set(value) == FIELDS[service], 'Unexpected aggregate fields')
    for name, count in value.items():
        history.require(type(count) is int and 0 <= count < 2**63, 'Aggregate must be a nonnegative integer count or age')
    return value


def sql(service, env):
    history.require(service in QUERIES, 'Unknown email service')
    history.require(env.get('PGOPTIONS') == '-c default_transaction_read_only=on', 'Read-only connection required')
    statement = "BEGIN READ ONLY;\nSET LOCAL statement_timeout='10s';\nSET LOCAL lock_timeout='2s';\n" + QUERIES[service] + '\nROLLBACK;\n'
    result = subprocess.run(['psql', '-X', '-qAt', '--set=ON_ERROR_STOP=1'], input=statement,
                            env=env, capture_output=True, text=True, timeout=25)
    history.require(result.returncode == 0, 'Read-only email aggregate unavailable; no write attempted')
    history.require(len(result.stdout) < 4000, 'Unexpected aggregate size')
    return validate(service, json.loads(result.stdout))


def capture_service(service, servers):
    app_name = history.APPS[service][0]
    app = history.az('containerapp', 'show', '-g', history.RG, '-n', app_name)
    props = app['properties']; containers = props['template']['containers']
    history.require(len(containers) == 1 and props['latestRevisionName'] == props['latestReadyRevisionName']
                    and props['provisioningState'] == 'Succeeded' and props['runningStatus'] == 'Running', 'Service deployment not settled')
    settings = containers[0].get('env', [])
    history.require(len({e['name'] for e in settings}) == len(settings), 'Duplicate environment setting')
    env = {e['name']: e for e in settings}
    host, database = history.database_binding(env['SPRING_DATASOURCE_URL']['value'], servers)
    ref = env['SPRING_DATASOURCE_PASSWORD'].get('secretRef')
    history.require(ref and not env['SPRING_DATASOURCE_PASSWORD'].get('value'), 'Existing password secret reference required')
    refs = history.az('containerapp', 'secret', 'list', '-g', history.RG, '-n', app_name)
    matching = [r for r in refs if r.get('name') == ref]
    history.require(len(matching) == 1, 'Database secret metadata unavailable')
    url = matching[0].get('keyVaultUrl', '')
    history.require(bool(re.fullmatch(re.escape(history.VAULT) + r'[A-Za-z0-9-]+(?:/[A-Za-z0-9]+)?', url)), 'Database secret outside existing vault')
    username = env['SPRING_DATASOURCE_USERNAME'].get('value', '')
    history.require(username and not env['SPRING_DATASOURCE_USERNAME'].get('secretRef'), 'Unexpected database username binding')
    password = history.az('keyvault', 'secret', 'show', '--id', url)['value']
    db_env = {k: v for k, v in os.environ.items() if not k.upper().startswith('PG')}
    db_env.update(PGHOST=host, PGPORT='5432', PGDATABASE=database, PGUSER=username, PGPASSWORD=password,
                  PGSSLMODE='verify-full', PGSSLROOTCERT='/etc/ssl/certs/ca-certificates.crt', PGCONNECT_TIMEOUT='10',
                  PGOPTIONS='-c default_transaction_read_only=on', PGAPPNAME='craves-readonly-email-health')
    try: counts = sql(service, db_env)
    finally: db_env.pop('PGPASSWORD', None); password = None
    history.require(history.az('containerapp', 'show', '-g', history.RG, '-n', app_name) == app, 'Runtime changed during inspection')
    return {'service': service, 'revision': props['latestReadyRevisionName'], 'image': containers[0]['image'], 'aggregates': counts}


def main():
    history.require(history.az('account', 'show').get('id') == history.SUB, 'Unexpected subscription')
    servers = history.az('postgres', 'flexible-server', 'list', '-g', history.RG)
    started = datetime.now(timezone.utc).isoformat()
    observations = [capture_service(service, servers) for service in QUERIES]
    return {'readOnly': True, 'startedAt': started, 'finishedAt': datetime.now(timezone.utc).isoformat(),
            'observations': observations, 'mailboxAccepted': False, 'crossServiceIdentityEqualityProven': False,
            'limitations': ['Aggregates are sequential, not a cross-database atomic snapshot.',
                            'Provider acceptance is not inbox delivery.', 'Zero records do not prove an exercised journey.',
                            'Profile mismatch counts cover existing authoritative projections only.']}


if __name__ == '__main__':
    try: print(json.dumps(main(), sort_keys=True))
    except Exception as error:
        raise SystemExit('Email health inspection stopped: ' + (str(error) if isinstance(error, ValueError) else type(error).__name__))
