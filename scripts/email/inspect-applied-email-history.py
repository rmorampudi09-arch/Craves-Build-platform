"""Read-only Auth/User-Chef/Notification applied migration checksum evidence.

No migration execution/repair, account reads, message delivery or flag changes.
Passwords are resolved from the existing scoped Key Vault reference into memory
for the existing database only. Raw process failures and settings are withheld.
"""
import json
import os
from pathlib import Path
import re
import subprocess
from urllib.parse import urlparse, parse_qs
import zlib

ROOT = Path(__file__).resolve().parents[2]
SUB = '4f897b61-9b52-44b4-8cf1-bdac281cc1aa'
RG = 'rg-craves-prodlow-centralindia'
VAULT = 'https://kvcravesprodlowl3ing6.vault.azure.net/secrets/'
APPS = {'auth-service': ('ca-craves-auth-service-prodlow', 'public'),
        'user-chef-service': ('ca-craves-user-chef-service-prod', 'public'),
        'notification-service': ('ca-craves-notification-service-p', 'notification_schema')}
REQUIRED = {'auth-service': {'15', '16'}, 'user-chef-service': {'12'}, 'notification-service': {'7'}}


def require(value, message):
    if not value: raise ValueError(message)


def az(*args):
    allowed = (('account', 'show'), ('containerapp', 'show'), ('containerapp', 'secret', 'list'),
               ('containerapp', 'revision', 'show'), ('keyvault', 'secret', 'show'), ('postgres', 'flexible-server', 'list'))
    require(any(tuple(args[:len(prefix)]) == prefix for prefix in allowed), 'Read-only Azure operation required')
    result = subprocess.run(['az', *args, '--only-show-errors', '-o', 'json'], capture_output=True, text=True, timeout=45)
    require(result.returncode == 0, 'Azure metadata/secret read unavailable')
    return json.loads(result.stdout)


def crc(text):
    # Flyway ChecksumCalculator: UTF-8 lines excluding newline bytes and initial BOM.
    require('${' not in text, 'Placeholder migration needs its exact configured resolution')
    value = zlib.crc32(''.join(re.split(r'\r\n|\r|\n', text.removeprefix('\ufeff'))).encode('utf-8'))
    return value if value < 2**31 else value - 2**32


def expected(service):
    result = {}
    for path in (ROOT / 'services' / service / 'src/main/resources/db/migration').glob('V*__*.sql'):
        version = path.name.split('__', 1)[0][1:].replace('_', '.')
        require(version not in result, 'Duplicate source migration version')
        result[version] = {'script': path.name, 'checksum': crc(path.read_text(encoding='utf-8-sig'))}
    require(REQUIRED[service].issubset(result), 'Required email source migrations absent')
    return result


def compare(service, records, sources):
    require(isinstance(records, list) and 0 < len(records) <= 250, 'Missing or excessive history')
    versions = set(); evidence = []; good = True
    for row in records:
        require(set(row) == {'version', 'script', 'checksum', 'success', 'type'}, 'Unexpected history fields')
        # Baseline/schema records are explicit metadata, not proof a versioned SQL ran.
        if row['type'] in ('BASELINE', 'SCHEMA'):
            good = good and row['success'] is True
            evidence.append({'kind': row['type'], 'version': row['version'], 'success': row['success']})
            continue
        require(row['type'] == 'SQL' and row['version'] not in versions, 'Unknown or duplicate applied migration')
        version = row['version']; versions.add(version)
        source = sources.get(version)
        match = source is not None and row['checksum'] == source['checksum'] and row['script'] == source['script'] and row['success'] is True
        good = good and match
        evidence.append({'version': version, 'script': row['script'] if source and row['script'] == source['script'] else 'UNRECOGNIZED',
                         'appliedChecksum': row['checksum'], 'sourceChecksum': source['checksum'] if source else None,
                         'success': row['success'], 'matchesSource': match})
    missing = sorted(set(sources) - versions)
    return {'service': service, 'passed': good and not missing and REQUIRED[service].issubset(versions),
            'missingSourceVersions': missing, 'history': evidence}


def database_binding(url, servers):
    require(url.startswith('jdbc:postgresql://'), 'Unexpected database driver')
    parsed = urlparse(url[5:]); query = parse_qs(parsed.query, strict_parsing=True)
    hosts = {s.get('fullyQualifiedDomainName') for s in servers}
    require(parsed.hostname in hosts and parsed.hostname.endswith('.postgres.database.azure.com'), 'Database is not an existing scoped PostgreSQL server')
    require(not parsed.username and not parsed.password and not parsed.fragment and parsed.port in (None, 5432), 'Unsafe database URL shape')
    require(bool(re.fullmatch('/[A-Za-z0-9_]+', parsed.path)), 'Unexpected database name')
    require(set(query).issubset({'sslmode'}) and query.get('sslmode', ['require']) in (['require'], ['verify-full']), 'Unsupported database query settings')
    return parsed.hostname, parsed.path[1:]


def sql(schema, db_env):
    require(schema in {'public', 'notification_schema'}, 'Schema not in scope')
    statement = f"""BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '2s';
SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM
 (SELECT version, script, checksum, success, type FROM {schema}.flyway_schema_history ORDER BY installed_rank LIMIT 251) t;
ROLLBACK;
"""
    require(db_env.get('PGOPTIONS') == '-c default_transaction_read_only=on', 'Read-only database connection required')
    result = subprocess.run(['psql', '-X', '-qAt', '--set=ON_ERROR_STOP=1'], input=statement,
                            env=db_env, capture_output=True, text=True, timeout=25)
    require(result.returncode == 0, 'Read-only migration history unavailable; no write attempted')
    require(len(result.stdout) < 200_000, 'History response exceeded bound')
    return json.loads(result.stdout)


def capture():
    require(az('account', 'show').get('id') == SUB, 'Unexpected Azure subscription')
    servers = az('postgres', 'flexible-server', 'list', '-g', RG)
    receipts = []
    for service, (app_name, schema) in APPS.items():
        app = az('containerapp', 'show', '-g', RG, '-n', app_name)
        props = app['properties']; containers = props['template']['containers']
        require(len(containers) == 1 and props['latestRevisionName'] == props['latestReadyRevisionName'], 'Service deployment not settled')
        values = containers[0].get('env', [])
        require(len({e['name'] for e in values}) == len(values), 'Duplicate environment name')
        env = {e['name']: e for e in values}
        require(not any(k.startswith('SPRING_FLYWAY') for k in env), 'Flyway runtime override requires separate reconciliation')
        host, database = database_binding(env['SPRING_DATASOURCE_URL']['value'], servers)
        ref = env['SPRING_DATASOURCE_PASSWORD'].get('secretRef')
        require(ref and not env['SPRING_DATASOURCE_PASSWORD'].get('value'), 'Database password must use existing secret binding')
        refs = az('containerapp', 'secret', 'list', '-g', RG, '-n', app_name)
        matching = [r for r in refs if r.get('name') == ref]
        require(len(matching) == 1, 'Database secret metadata unavailable')
        url = matching[0].get('keyVaultUrl', '')
        require(bool(re.fullmatch(re.escape(VAULT) + r'[A-Za-z0-9-]+(?:/[A-Za-z0-9]+)?', url)), 'Database secret outside existing vault')
        username = env['SPRING_DATASOURCE_USERNAME'].get('value', '')
        require(bool(username) and not env['SPRING_DATASOURCE_USERNAME'].get('secretRef'), 'Unexpected database username binding')
        # Credentials are never printed, persisted, or passed on command lines.
        password = az('keyvault', 'secret', 'show', '--id', url)['value']
        db_env = {k: v for k, v in os.environ.items() if not k.upper().startswith('PG')}
        db_env.update(PGHOST=host, PGPORT='5432', PGDATABASE=database, PGUSER=username, PGPASSWORD=password,
                      PGSSLMODE='verify-full', PGSSLROOTCERT='/etc/ssl/certs/ca-certificates.crt', PGCONNECT_TIMEOUT='10',
                      PGOPTIONS='-c default_transaction_read_only=on', PGAPPNAME='craves-readonly-migration-evidence')
        try: rows = sql(schema, db_env)
        finally: db_env.pop('PGPASSWORD', None); password = None
        require(az('containerapp', 'show', '-g', RG, '-n', app_name) == app, 'Runtime changed during migration inspection')
        record = compare(service, rows, expected(service))
        record['image'] = containers[0]['image']; record['revision'] = props['latestReadyRevisionName']
        receipts.append(record)
    return {'readOnly': True, 'sourceSha': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
            'histories': receipts, 'allMatched': all(r['passed'] for r in receipts), 'canonicalProjectionAccepted': False}


if __name__ == '__main__':
    try:
        report = capture(); print(json.dumps(report, sort_keys=True))
        if not report['allMatched']: raise ValueError('Applied/source migration mismatch; no repair attempted')
    except Exception as error:
        raise SystemExit('Applied history inspection stopped: ' + (str(error) if isinstance(error, ValueError) else type(error).__name__))
