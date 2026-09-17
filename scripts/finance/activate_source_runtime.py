"""Guarded first Finance cutover. No policy, customer-data or payment writes."""
import argparse
import copy
import hashlib
import hmac
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.error
import urllib.request

import configure_catalog_read_runtime as read
import configure_bank_runtime as shared

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('history', ROOT / 'scripts/email/inspect-applied-email-history.py')
history = importlib.util.module_from_spec(spec)
spec.loader.exec_module(history)
az, require, GuardError = shared.az, read.require, shared.GuardError
RG = read.RG
APPS = {**read.APPS, 'order': 'ca-craves-order-service-prodlow'}
FLAGS = {
    'order': {'CRAVES_FINANCE_SOURCE_ENABLED': 'true', 'CRAVES_FINANCE_SOURCE_DISPATCH_ENABLED': 'true',
              'CRAVES_DELIVERY_TARIFF_SOURCE_READY': 'true'},
    'integration': {'CRAVES_FINANCE_AUTHORITATIVE_SOURCE_READY': 'true', 'CRAVES_DELIVERY_TARIFF_SOURCE_READY': 'true'},
}
SOURCES = {'order': 'd13cd1a4620da67413179ad53960f4e72639574c',
           'integration': 'd13cd1a4620da67413179ad53960f4e72639574c',
           'catalog': 'aded9a92cba88e9d5559928abb458357e19f24fe'}
QUERIES = {
    'order': """SELECT json_build_object(
      'snapshots',(SELECT count(*) FROM order_schema.order_financial_snapshot),
      'events',(SELECT count(*) FROM order_schema.finance_source_outbox));""",
    'integration': """SELECT json_build_object(
      'policyRevision',(SELECT revision FROM payment_schema.finance_policy_head WHERE singleton),
      'snapshots',(SELECT count(*) FROM payment_schema.finance_issued_snapshot),
      'captures',(SELECT count(*) FROM payment_schema.finance_capture),
      'earnings',(SELECT count(*) FROM payment_schema.finance_earning_projection),
      'receipts',(SELECT count(*) FROM payment_schema.finance_source_receipt),
      'payouts',(SELECT count(*) FROM payment_schema.finance_payout_instruction));""",
}


def snapshot(role):
    app = az('containerapp', 'show', '-g', RG, '-n', APPS[role])
    require(app.get('name') == APPS[role], 'Unexpected service')
    shared.environment(app)
    require(app['properties']['configuration']['activeRevisionsMode'] == 'Single', 'Single revision required')
    require(app['properties']['template']['scale']['maxReplicas'] == 1, 'Replica bounds differ')
    return app


def ready(role, app):
    revision = app['properties'].get('latestRevisionName')
    if not revision or revision != app['properties'].get('latestReadyRevisionName'): return False
    rows = az('containerapp', 'revision', 'list', '-g', RG, '-n', APPS[role])
    replicas = az('containerapp', 'replica', 'list', '-g', RG, '-n', APPS[role], '--revision', revision)
    compared = copy.deepcopy(app)
    compared['properties']['template'] = read.readiness_defaults(compared['properties']['template'])
    for row in rows:
        if 'template' in row.get('properties', {}): row['properties']['template'] = read.readiness_defaults(row['properties']['template'])
    try:
        read.runtime.ready(compared, rows, replicas, validate=lambda _: None)
        return True
    except (ValueError, KeyError, TypeError): return False


def fingerprint(app, changed):
    value = copy.deepcopy(app)
    value['properties']['template'] = read.runtime.normalized_template(value['properties']['template'])
    value['properties']['configuration'].get('ingress', {}).pop('traffic', None)
    return shared.stable(value, set(changed), set())


def missing_flags(app, desired):
    env = shared.environment(app)
    for name in desired:
        item = env.get(name)
        require(item is None or (not item.get('secretRef') and item.get('value') in ('true', 'false')), 'Unexpected existing flag binding')
    return [name + '=true' for name in desired if env.get(name, {}).get('value') != 'true']


def image_check(role, app):
    service = role + '-service'
    same = subprocess.run(['git', 'diff', '--quiet', SOURCES[role], 'HEAD', '--', 'services/' + service], cwd=ROOT).returncode
    require(same == 0, 'Deployed service source differs from reviewed build context')
    repository = 'cravesprodlowacr82121.azurecr.io/craves/' + service
    digest = az('acr', 'repository', 'show', '--name', 'cravesprodlowacr82121', '--image', 'craves/' + service + ':' + SOURCES[role], '--query', 'digest')
    require(isinstance(digest, str) and re.fullmatch(r'sha256:[0-9a-f]{64}', digest), 'Invalid registry digest')
    require(app['properties']['template']['containers'][0]['image'] in (repository + ':' + SOURCES[role], repository + '@' + digest), 'Service image is not the reviewed release')


def secret(app, setting):
    env = shared.environment(app)
    item = env.get(setting, {})
    require(item.get('secretRef') and not item.get('value'), 'Existing secret reference required')
    refs = [s for s in app['properties']['configuration'].get('secrets', []) if s.get('name') == item['secretRef']]
    require(len(refs) == 1 and re.fullmatch(re.escape(history.VAULT) + r'[A-Za-z0-9-]+(?:/[A-Za-z0-9]+)?', refs[0].get('keyVaultUrl', '')), 'Secret is not in the existing vault')
    value = az('keyvault', 'secret', 'show', '--id', refs[0]['keyVaultUrl'], '--query', 'value')
    require(isinstance(value, str) and value, 'Existing secret unavailable')
    return value


def sql(statement, env):
    require(env.get('PGOPTIONS') == '-c default_transaction_read_only=on', 'Read-only connection required')
    result = subprocess.run(['psql', '-X', '-qAt', '--set=ON_ERROR_STOP=1'],
        input="BEGIN READ ONLY; SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='2s';\n" + statement + '\nROLLBACK;',
        env=env, capture_output=True, text=True, timeout=35)
    require(result.returncode == 0 and len(result.stdout) < 200000, 'Bounded read-only database check failed')
    return json.loads(result.stdout)


def empty_cutover(role, app, servers):
    env = shared.environment(app)
    host, database = history.database_binding(env['SPRING_DATASOURCE_URL']['value'], servers)
    db = {k: v for k, v in os.environ.items() if not k.upper().startswith('PG')}
    db.update(PGHOST=host, PGPORT='5432', PGDATABASE=database, PGUSER=env['SPRING_DATASOURCE_USERNAME']['value'],
        PGPASSWORD=secret(app, 'SPRING_DATASOURCE_PASSWORD'), PGSSLMODE='verify-full',
        PGSSLROOTCERT='/etc/ssl/certs/ca-certificates.crt', PGCONNECT_TIMEOUT='10',
        PGOPTIONS='-c default_transaction_read_only=on', PGAPPNAME='craves-finance-cutover-readonly')
    schema = 'order_schema' if role == 'order' else 'payment_schema'
    try:
        rows = sql("SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM (SELECT version,script,checksum,success,type FROM " + schema + '.flyway_schema_history ORDER BY installed_rank LIMIT 251) t;', db)
        sources = {}
        for path in (ROOT / 'services' / (role + '-service') / 'src/main/resources/db/migration').glob('V*__*.sql'):
            sources[path.name.split('__')[0][1:].replace('_', '.')] = {'script': path.name, 'checksum': history.crc(path.read_text(encoding='utf-8-sig'))}
        versions = set()
        for row in rows:
            require(row['success'] is True, 'Failed applied migration')
            if row['type'] in ('BASELINE', 'SCHEMA'): continue
            require(row['type'] == 'SQL' and row['version'] not in versions and sources.get(row['version']) == {'script': row['script'], 'checksum': row['checksum']}, 'Applied migration differs from reviewed source')
            versions.add(row['version'])
        require(versions == set(sources), 'Source migrations are not all installed')
        counts = sql(QUERIES[role], db)
        expected = {'snapshots', 'events'} if role == 'order' else {'policyRevision', 'snapshots', 'captures', 'earnings', 'receipts', 'payouts'}
        require(isinstance(counts, dict) and set(counts) == expected and all(type(v) is int and v == 0 for v in counts.values()), 'Existing finance activity requires reconciliation before first cutover')
        print(json.dumps({'service': role, 'appliedMigrationsVerified': len(versions), 'emptyFinancialCutover': True}), flush=True)
    finally: db.pop('PGPASSWORD', None)


def probe(apps):
    key = secret(apps['order'], 'CRAVES_FINANCE_INTERNAL_KEY')
    require(len(key) >= 32 and hmac.compare_digest(key, secret(apps['integration'], 'CRAVES_FINANCE_INTERNAL_KEY')), 'Finance service credentials differ')
    require(shared.environment(apps['order']).get('CRAVES_FINANCE_INTEGRATION_BASE_URL', {}).get('value') == shared.origin(apps['integration']), 'Finance destination differs')
    body = b'{}'  # Rejected before quote allocation, writes or business identifiers.
    for signed, expected in ((False, 403), (True, 400)):
        headers = {'Content-Type': 'application/json'}
        if signed: headers['X-Craves-Finance-Signature'] = hmac.new(key.encode(), body, hashlib.sha256).hexdigest()
        request = urllib.request.Request(shared.origin(apps['integration']) + '/internal/v1/finance/quotes', data=body, headers=headers, method='POST')
        try:
            with urllib.request.build_opener(read.NoRedirect()).open(request, timeout=15) as response: status = response.status
        except urllib.error.HTTPError as error: status = error.code
        require(status == expected, 'Private Finance authentication/validation boundary failed')
    print(json.dumps({'financeAuthenticationVerified': True, 'quoteCreated': False}), flush=True)


def configure(role, before):
    baseline = fingerprint(before, FLAGS[role])
    current = snapshot(role)
    require(fingerprint(current, FLAGS[role]) == baseline, 'Concurrent unrelated runtime change')
    changes = missing_flags(current, FLAGS[role])
    if changes:
        az('containerapp', 'update', '-g', RG, '-n', APPS[role], '--container-name', current['properties']['template']['containers'][0]['name'], '--set-env-vars', *changes, '--no-wait', output='none')
    for attempt in range(150):
        current = snapshot(role)
        require(fingerprint(current, FLAGS[role]) == baseline, 'Unrelated runtime settings changed')
        if not missing_flags(current, FLAGS[role]) and ready(role, current):
            print(json.dumps({'service': role, 'readyRevision': current['properties']['latestReadyRevisionName'], 'unrelatedSettingsPreserved': True}), flush=True)
            return
        if attempt < 149: time.sleep(10)
    raise GuardError('Accounting revision not ready; leave policy inactive and inspect current rollout')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--expected-source-sha', default='')
    args = parser.parse_args()
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    require(not args.apply or args.expected_source_sha == head and bool(re.fullmatch('[0-9a-f]{40}', head)), 'Exact reviewed source required')
    require(az('account', 'show', '--query', 'id') == read.SUB, 'Unexpected subscription')
    apps = {role: snapshot(role) for role in APPS}
    for role, app in apps.items():
        image_check(role, app)
        require(ready(role, app), 'A prerequisite service is not ready')
    for role, settings in FLAGS.items(): missing_flags(apps[role], settings)
    for name in ('CRAVES_LEDGER_POSTING_ENABLED', 'CRAVES_FINANCE_FINALIZATION_ENABLED'):
        require(shared.environment(apps['integration']).get(name, {}).get('value') == 'true', 'Posting/finalization prerequisite disabled')
    require(shared.environment(apps['catalog']).get('CRAVES_PUBLIC_CATALOG_PRIVACY_ENFORCEMENT_ENABLED', {}).get('value') == 'true', 'Public Catalog privacy prerequisite disabled')
    servers = az('postgres', 'flexible-server', 'list', '-g', RG)
    for role in QUERIES: empty_cutover(role, apps[role], servers)
    probe(apps)
    print(json.dumps({'apply': args.apply, 'policyActivated': False, 'moneyMovementChanged': False}), flush=True)
    if not args.apply: return
    configure('order', apps['order'])
    # Recheck no financial business activity before declaring source wiring ready.
    for role in QUERIES: empty_cutover(role, snapshot(role), servers)
    configure('integration', apps['integration'])
    probe({role: snapshot(role) for role in APPS})


if __name__ == '__main__':
    try: main()
    except Exception as error:
        raise SystemExit('Finance cutover stopped: ' + (str(error) if isinstance(error, GuardError) else type(error).__name__)) from None
