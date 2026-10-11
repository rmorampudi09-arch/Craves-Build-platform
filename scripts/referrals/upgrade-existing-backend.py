"""Upgrade only the existing dormant referral app; never activate or provision it."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import zipfile

ROOT = Path(__file__).resolve().parents[2]
SUB = '4f897b61-9b52-44b4-8cf1-bdac281cc1aa'
RG = 'rg-craves-prodlow-centralindia'
APP = 'ca-craves-referral-prodlow'
VAULT = 'kvcravesprodlowl3ing6'
REGISTRY = 'cravesprodlowacr82121'
REPOSITORY = 'craves/referral-service'
SOURCE = '135df3d23c61bc14e1ce742f9cf9f5f25a09d0e1'
HOST = 'pg-craves-prodlow-l3ing6.postgres.database.azure.com'
DATABASE = 'craves_referral_db'
OWNER = 'craves_referral_owner'
RUNTIME = 'craves_referral_runtime'
RESOURCE = f'/subscriptions/{SUB}/resourceGroups/{RG}/providers/Microsoft.App/containerApps/{APP}'
IDENTITY = f'/subscriptions/{SUB}/resourceGroups/{RG}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-craves-referral-prodlow'
DB_URL = f'jdbc:postgresql://{HOST}:5432/{DATABASE}?sslmode=verify-full&sslrootcert=/etc/ssl/certs/ca-certificates.crt'
FLAGS = {'CRAVES_REFERRALS_' + suffix + '_ENABLED' for suffix in
         ('PUBLIC_ACCESS', 'WORKERS', 'AWARDS', 'SETTLEMENT', 'WITHDRAWALS', 'SPENDING')}
FLAGS.add('CRAVES_REFERRALS_ENABLED')
NEW_TABLES = ('chef_membership', 'chef_reward', 'chef_month', 'chef_posting', 'chef_reward_review', 'chef_cap_decision')
VERSIONS = ['1', '1.1', '2', '3', '4', '5', '6', '7', '8', '9', '10']


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


backup = load('referral_backup', 'scripts/release/inspect-backup-metadata.py')
history = load('referral_history', 'scripts/email/inspect-applied-email-history.py')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def run(args, *, env=None, timeout=120):
    result = subprocess.run(args, cwd=ROOT, env=env, capture_output=True, text=True, timeout=timeout)
    require(result.returncode == 0, 'COMMAND_UNAVAILABLE_DETAILS_SUPPRESSED')
    return result.stdout


def az(*args):
    # Only hard-coded commands below call this private helper. No user Azure args.
    result = run(['az', *args, '--only-show-errors', '--output', 'json'])
    return json.loads(result) if result.strip() else None


def immutable_image(image):
    return isinstance(image, str) and bool(re.fullmatch(
        re.escape(REGISTRY + '.azurecr.io/' + REPOSITORY + '@sha256:') + '[a-f0-9]{64}', image))


def fingerprint(app):
    template = copy.deepcopy(app['properties']['template'])
    template.pop('revisionSuffix', None)
    for container in template['containers']:
        container.pop('image', None)
    data = {'template': template, 'configuration': app['properties']['configuration'],
            'identity': app['identity'], 'environment': app['properties']['managedEnvironmentId']}
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()


def validate_app(app):
    require(app['id'].lower() == RESOURCE.lower() and app['name'] == APP, 'WRONG_APP')
    p = app['properties']
    require(p['provisioningState'] == 'Succeeded' and p['latestRevisionName'] == p['latestReadyRevisionName'], 'APP_NOT_SETTLED')
    ingress = p['configuration']['ingress']
    require(ingress['external'] is False and ingress['allowInsecure'] is False and ingress['targetPort'] == 8080, 'PRIVATE_INGRESS_REQUIRED')
    traffic = ingress.get('traffic', [])
    require(len(traffic) == 1 and traffic[0].get('latestRevision') is True and traffic[0].get('weight') == 100, 'LATEST_REVISION_TRAFFIC_REQUIRED')
    require(p['configuration']['activeRevisionsMode'] == 'Single', 'SINGLE_REVISION_REQUIRED')
    scale = p['template']['scale']
    require(scale['minReplicas'] == 1 and scale['maxReplicas'] == 1, 'ONE_REPLICA_REQUIRED')
    identities = app['identity'].get('userAssignedIdentities', {})
    require({x.lower() for x in identities} == {IDENTITY.lower()}, 'EXISTING_IDENTITY_REQUIRED')
    containers = p['template']['containers']
    require(len(containers) == 1 and immutable_image(containers[0]['image']), 'PINNED_SINGLE_CONTAINER_REQUIRED')
    env = {v['name']: v for v in containers[0].get('env', [])}
    require(len(env) == len(containers[0].get('env', [])), 'DUPLICATE_ENVIRONMENT')
    require(FLAGS.issubset(env), 'DORMANT_FLAGS_MISSING')
    enabled = {k: v for k, v in env.items() if k.startswith('CRAVES_REFERRALS_') and k.endswith('_ENABLED')}
    require(all(v.get('value') == 'false' and not v.get('secretRef') for v in enabled.values()), 'PROGRAM_MUST_REMAIN_DISABLED')
    require(env['CRAVES_REFERRALS_AUTH_VERIFICATION_MODE'].get('value') == 'AUTH_HTTP', 'AUTH_MODE_CHANGED')
    expected = {'REFERRAL_DB_URL': 'referral-db-url', 'REFERRAL_DB_USER': 'referral-db-user',
                'REFERRAL_DB_PASSWORD': 'referral-db-password'}
    for key, reference in expected.items():
        require(env[key].get('secretRef') == reference and not env[key].get('value'), 'DB_BINDING_CHANGED')
    refs = {s['name']: s for s in p['configuration']['secrets']}
    for reference, name in [('referral-db-url', 'craves-referral-db-url'),
                            ('referral-db-user', 'craves-referral-db-user'),
                            ('referral-db-password', 'craves-referral-db-runtime-password')]:
        secret = refs[reference]
        require(bool(re.fullmatch(re.escape(f'https://{VAULT}.vault.azure.net/secrets/{name}') + r'(?:/[a-fA-F0-9]+)?', secret.get('keyVaultUrl', ''))), 'DB_VAULT_CHANGED')
        require(secret.get('identity', '').lower() == IDENTITY.lower(), 'DB_SECRET_IDENTITY_CHANGED')
    return fingerprint(app)


def show():
    return az('containerapp', 'show', '-g', RG, '-n', APP)


def secret(name):
    require(name in {'craves-referral-db-owner-password', 'craves-referral-db-url', 'craves-referral-db-user'}, 'SECRET_OUTSIDE_SCOPE')
    return az('keyvault', 'secret', 'show', '--vault-name', VAULT, '--name', name)['value']


def database_env():
    require(secret('craves-referral-db-url') == DB_URL, 'UNEXPECTED_DATABASE')
    require(secret('craves-referral-db-user') == RUNTIME, 'UNEXPECTED_RUNTIME_ROLE')
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith('PG')}
    env.update(PGHOST=HOST, PGPORT='5432', PGDATABASE=DATABASE, PGUSER=OWNER,
               PGPASSWORD=secret('craves-referral-db-owner-password'), PGSSLMODE='verify-full',
               PGSSLROOTCERT='/etc/ssl/certs/ca-certificates.crt', PGCONNECT_TIMEOUT='10',
               PGOPTIONS='-c default_transaction_read_only=on', PGAPPNAME='craves-referral-upgrade-preflight')
    return env


def inspect_history(env):
    sql = """BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM
 (SELECT version, script, checksum, success, type FROM referral_schema.referral_flyway_history ORDER BY installed_rank LIMIT 30) t;
ROLLBACK;
"""
    rows = json.loads(sql_read(sql, env))
    return validate_history(rows)


def sql_read(statement, env):
    require(env.get('PGOPTIONS') == '-c default_transaction_read_only=on', 'READ_ONLY_REQUIRED')
    result = subprocess.run(['psql', '-XqAt', '-v', 'ON_ERROR_STOP=1'], input=statement, env=env,
                            capture_output=True, text=True, timeout=25)
    require(result.returncode == 0 and len(result.stdout) < 100_000, 'HISTORY_READ_UNAVAILABLE')
    return result.stdout


def validate_history(rows):
    require(isinstance(rows, list) and 0 < len(rows) < 30, 'HISTORY_MISSING')
    expected = {}
    for path in (ROOT / 'services/referral-service/src/main/resources/db/referral_migration').glob('V*__*.sql'):
        expected[path.name.split('__')[0][1:].replace('_', '.')] = (path.name, history.crc(path.read_text(encoding='utf-8-sig')))
    applied = []
    for row in rows:
        require(row.get('success') is True, 'FAILED_MIGRATION')
        if row.get('type') == 'SCHEMA':
            continue
        require(row.get('type') == 'SQL' and row.get('version') in expected, 'UNKNOWN_MIGRATION')
        require((row.get('script'), row.get('checksum')) == expected[row['version']], 'MIGRATION_CHANGED')
        applied.append(row['version'])
    require(applied in (VERSIONS[:9], VERSIONS[:10], VERSIONS), 'NONSEQUENTIAL_HISTORY')
    return {'appliedVersions': applied, 'pendingVersions': VERSIONS[len(applied):]}


def migrate(image, env):
    require(immutable_image(image), 'PINNED_IMAGE_REQUIRED')
    run(['az', 'acr', 'login', '-n', REGISTRY, '--only-show-errors'])
    run(['docker', 'pull', image], timeout=300)
    with tempfile.TemporaryDirectory(prefix='craves-referral-migrate-') as directory:
        jar = Path(directory) / 'app.jar'
        container = run(['docker', 'create', image]).strip()
        require(bool(re.fullmatch('[a-f0-9]{64}', container)), 'INVALID_TEMP_CONTAINER')
        try:
            run(['docker', 'cp', container + ':/app/app.jar', str(jar)])
        finally:
            run(['docker', 'rm', container])
        with zipfile.ZipFile(jar) as archive:
            for name in archive.namelist():
                if name.startswith(('BOOT-INF/classes/', 'BOOT-INF/lib/')):
                    require('..' not in Path(name).parts and '\\' not in name, 'UNSAFE_JAR_PATH')
                    archive.extract(name, directory)
        migration_env = os.environ.copy()
        migration_env.update(REFERRAL_MIGRATION_DB_URL=DB_URL, REFERRAL_MIGRATION_DB_USER=OWNER,
                             REFERRAL_MIGRATION_DB_PASSWORD=env['PGPASSWORD'], REFERRAL_MIGRATION_CONFIRM='CREATE_REFERRAL_SCHEMA_ONLY')
        try:
            run(['java', '-cp', directory + '/BOOT-INF/classes:' + directory + '/BOOT-INF/lib/*',
                 'in.craves.referral.infra.ReferralMigrate'], env=migration_env, timeout=180)
        finally:
            migration_env.pop('REFERRAL_MIGRATION_DB_PASSWORD', None)
    # Extend the existing role to the six new tables only. No new roles or secret grants.
    grant_env = dict(env)
    grant_env.pop('PGOPTIONS')
    statement = 'BEGIN; SET LOCAL lock_timeout=\'5s\'; SET LOCAL statement_timeout=\'15s\'; '
    statement += 'GRANT SELECT,INSERT,UPDATE ON ' + ','.join('referral_schema.' + n for n in NEW_TABLES) + ' TO ' + RUNTIME + '; COMMIT;'
    try:
        result = subprocess.run(['psql', '-XqAt', '-v', 'ON_ERROR_STOP=1'], input=statement, env=grant_env,
                                capture_output=True, text=True, timeout=30)
        require(result.returncode == 0, 'SCOPED_TABLE_GRANT_FAILED')
    finally:
        grant_env.pop('PGPASSWORD', None)


def update_image(image):
    require(immutable_image(image), 'PINNED_IMAGE_REQUIRED')
    az('containerapp', 'update', '-g', RG, '-n', APP, '--image', image, '--no-wait')


def unchanged(app, original_fingerprint, expected_image):
    require(validate_app(app) == original_fingerprint, 'UNRELATED_RUNTIME_CHANGED')
    require(app['properties']['template']['containers'][0]['image'] == expected_image, 'CONCURRENT_IMAGE_CHANGE')


def wait_ready(image, original_fingerprint):
    for _ in range(90):
        app = show()
        require(fingerprint(app) == original_fingerprint, 'UNRELATED_RUNTIME_CHANGED')
        p = app['properties']
        if p['provisioningState'] == 'Failed':
            raise ValueError('REVISION_FAILED')
        if p['provisioningState'] == 'Succeeded' and p['latestRevisionName'] == p['latestReadyRevisionName']:
            require(p['template']['containers'][0]['image'] == image, 'UNEXPECTED_IMAGE')
            revision = az('containerapp', 'revision', 'show', '-g', RG, '-n', APP, '--revision', p['latestReadyRevisionName'])['properties']
            if revision.get('healthState') == 'Healthy' and revision.get('active') is True and revision.get('runningState') in ('Running', 'RunningAtMaxScale'):
                replicas = az('containerapp', 'replica', 'list', '-g', RG, '-n', APP, '--revision', p['latestReadyRevisionName'])
                require(isinstance(replicas, list) and len(replicas) == 1, 'EXACT_ONE_RUNNING_REPLICA_REQUIRED')
                validate_app(app)
                return p['latestReadyRevisionName']
        time.sleep(5)
    raise ValueError('READINESS_TIMEOUT')


def main(action):
    require(action in ('inspect', 'build', 'upgrade'), 'UNKNOWN_ACTION')
    if action == 'upgrade':
        require(os.environ.get('REFERRAL_UPGRADE_CONFIRMATION') == 'UPGRADE_EXISTING_DORMANT_REFERRAL', 'EXPLICIT_UPGRADE_REQUIRED')
        require(bool(re.fullmatch(r'sha256:[a-f0-9]{64}', os.environ.get('REFERRAL_UPGRADE_DIGEST', ''))), 'REVIEWED_DIGEST_REQUIRED')
    require(az('account', 'show')['id'] == SUB, 'WRONG_SUBSCRIPTION')
    require(subprocess.run(['git', 'diff', '--quiet', SOURCE, 'HEAD', '--', 'services/referral-service'], cwd=ROOT).returncode == 0, 'UNTESTED_APPLICATION_SOURCE')
    app = show()
    original = validate_app(app)
    previous = app['properties']['template']['containers'][0]['image']
    if action == 'build':
        tags = az('acr', 'repository', 'show-tags', '--name', REGISTRY, '--repository', REPOSITORY)
        require(isinstance(tags, list), 'TAG_INVENTORY_UNAVAILABLE')
        if SOURCE not in tags:
            run(['az', 'acr', 'build', '--registry', REGISTRY, '--image', REPOSITORY + ':' + SOURCE,
                 '--file', 'services/referral-service/Dockerfile', 'services/referral-service', '--only-show-errors'], timeout=1200)
        digest = az('acr', 'repository', 'show', '--name', REGISTRY, '--image', REPOSITORY + ':' + SOURCE)['digest']
        require(immutable_image(REGISTRY + '.azurecr.io/' + REPOSITORY + '@' + digest), 'INVALID_BUILT_DIGEST')
        unchanged(show(), original, previous)
        return {'builtSource': SOURCE, 'digest': digest, 'deployed': False}
    env = database_env()
    try:
        restricted_owner = sql_read("SELECT current_user='craves_referral_owner' AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication FROM pg_roles WHERE rolname=current_user;", env).strip()
        require(restricted_owner == 't', 'RESTRICTED_OWNER_REQUIRED')
        before_history = inspect_history(env)
        unchanged(show(), original, previous)
        if action == 'inspect':
            return {'readOnly': True, 'app': APP, 'image': app['properties']['template']['containers'][0]['image'],
                    'runtimeFingerprint': original, 'history': before_history, 'programmeEnabled': False}
        require(os.environ.get('REFERRAL_UPGRADE_CONFIRMATION') == 'UPGRADE_EXISTING_DORMANT_REFERRAL', 'EXPLICIT_UPGRADE_REQUIRED')
        report = backup.capture()
        require(report['completedBackupCount'] > 0 and report['latestCompletedBackupAgeSeconds'] <= 86400, 'RECENT_BACKUP_REQUIRED')
        digest = az('acr', 'repository', 'show', '--name', REGISTRY, '--image', REPOSITORY + ':' + SOURCE)['digest']
        require(digest == os.environ['REFERRAL_UPGRADE_DIGEST'], 'REVIEWED_DIGEST_CHANGED')
        image = REGISTRY + '.azurecr.io/' + REPOSITORY + '@' + digest
        require(immutable_image(image), 'INVALID_CANDIDATE_IMAGE')
        print(json.dumps({'previousImage': previous, 'candidateImage': image, 'backup': report, 'programmeEnabled': False}), flush=True)
        unchanged(show(), original, previous)
        migrate(image, env)
        require(inspect_history(env)['pendingVersions'] == [], 'MIGRATION_INCOMPLETE')
        permission_check = "SELECT NOT has_schema_privilege('craves_referral_runtime','referral_schema','CREATE') AND NOT has_table_privilege('craves_referral_runtime','referral_schema.referral_flyway_history','UPDATE') AND "
        permission_check += ' AND '.join(
            '(' + ' AND '.join("has_table_privilege('craves_referral_runtime','referral_schema." + name + "','" + privilege + "')" for privilege in ('SELECT', 'INSERT', 'UPDATE'))
            + " AND NOT has_table_privilege('craves_referral_runtime','referral_schema." + name + "','DELETE,TRUNCATE'))"
            for name in NEW_TABLES) + ';'
        require(sql_read(permission_check, env).strip() == 't', 'RUNTIME_PERMISSIONS_DIFFER')
        unchanged(show(), original, previous)
        try:
            update_image(image)
            revision = wait_ready(image, original)
        except Exception:
            # Never overwrite a concurrent settings change. Retain additive DB history.
            current = show()
            if fingerprint(current) == original and current['properties']['template']['containers'][0]['image'] == image:
                update_image(previous)
                wait_ready(previous, original)
                print('Previous referral image restored; additive migrations retained.', flush=True)
            raise
        return {'image': image, 'revision': revision, 'programmeEnabled': False, 'schemaVersions': VERSIONS,
                'runtimeFingerprint': original, 'newResourcesCreated': False}
    finally:
        env.pop('PGPASSWORD', None)


if __name__ == '__main__':
    try:
        print(json.dumps(main(sys.argv[1] if len(sys.argv) == 2 else 'inspect'), sort_keys=True))
    except Exception as error:
        code = str(error) if isinstance(error, ValueError) and re.fullmatch('[A-Z_]{3,80}', str(error)) else 'DETAILS_SUPPRESSED'
        print('REFERRAL_UPGRADE_STOPPED_' + code, file=sys.stderr)
        raise SystemExit(1)
