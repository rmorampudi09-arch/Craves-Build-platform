"""Chef referral programme in the live rmorampudi09 subscription (721906c9).

inspect  read-only state of the referral service, its database and the three source services
release  build the referral image from a reviewed GitHub main SHA, apply additive referral
         migrations, extend the runtime role to new tables, roll the image (flags unchanged)
activate record the owner-approved chef policy, then switch on the referral engine and the
         Auth, Integration and Order sources one at a time; each step rolls back on failure

Never prints secret values. Customer wallet awards, settlement, spending, referral cash-outs,
checkout benefits and referral payouts stay off.
"""
import base64
import hashlib
import json
import os
import re
import secrets
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path
from urllib.parse import urlparse

SUB = '721906c9-4a72-4606-830b-d3e7ace093ff'
RG = 'rg-craves-prodlow-centralindia'
ACR = 'cravesrm09prodlow6bf632'
VAULT = 'kvcravesprodlowkmqgfy'
PG_SERVER = 'pg-craves-prodlow-kmqgfy'
PG_HOST = PG_SERVER + '.postgres.database.azure.com'
DATABASE = 'craves_referral_db'
REPOSITORY = 'craves/referral-service'
REFERRAL = 'ca-craves-referral-prodlow'
AUTH = 'ca-craves-auth-service-prodlow'
ORDER = 'ca-craves-order-service-prodlow'
INTEGRATION = 'ca-craves-integration-service-pr'
IDENTITY = 'id-craves-referral-prodlow'
CHEF_POLICY = 'CHEF_COMMISSION_20260916'
OWNER_EMAIL = 'raviteja.m@craves.in'
# Maker of the policy draft: this release automation, acting on the owner's instruction.
# The owner's own admin identity is recorded as the approver (owner decision, 12 Oct 2026).
RELEASE_MAKER = 'c4e5f00d-0000-4000-8000-000000000001'
TERMS_VERSION = 'craves-chef-referral-terms-v1-2026-10-12'
APPROVALS = {
    'legalReviewRef': 'OWNER_DECISION_20261012 Raviteja approved launch; no external legal review yet',
    'termsVersion': TERMS_VERSION,
    'taxReviewRef': 'OWNER_DECISION_20261012 no CA review yet; TDS and GST on referral commission to be reviewed',
    'privacyReviewRef': 'OWNER_DECISION_20261012 hashed contact only; 30-day signed attribution accepted by owner',
    'fundingReviewRef': 'OWNER_DECISION_20261012 funded only from verified Craves commission; never the seller payable',
    'multiChefDecisionRef': 'docs/referrals/OWNER_CONFIRMED_CHEF_POLICY_20260916.md',
    'payoutReviewRef': 'OWNER_DECISION_20261012 paid through chef earnings and existing chef withdrawals only',
}
REFERRAL_ON = {'CRAVES_REFERRALS_ENABLED': 'true', 'CRAVES_REFERRALS_WORKERS_ENABLED': 'true',
               'CRAVES_REFERRALS_CHEF_EARNINGS_ENABLED': 'true', 'CRAVES_REFERRALS_PUBLIC_ACCESS_ENABLED': 'true'}
REFERRAL_STAY_OFF = ('CRAVES_REFERRALS_AWARDS_ENABLED', 'CRAVES_REFERRALS_SETTLEMENT_ENABLED',
                     'CRAVES_REFERRALS_WITHDRAWALS_ENABLED', 'CRAVES_REFERRALS_SPENDING_ENABLED')
SOURCE_STAY_OFF = ('CRAVES_REFERRAL_CHECKOUT_BENEFITS_ENABLED', 'CRAVES_REFERRAL_PAYOUT_EXECUTION_ENABLED')
CHEF_TABLES = ('chef_membership', 'chef_reward', 'chef_month', 'chef_posting', 'chef_reward_review', 'chef_cap_decision')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def log(message):
    print(message, flush=True)


def az(*args, check=True):
    result = subprocess.run(['az', *args, '--only-show-errors', '-o', 'json'], capture_output=True, text=True)
    if result.returncode:
        if check:
            raise ValueError(f'AZ_FAILED {" ".join(args[:3])}: {result.stderr.strip()[:300]}')
        return None
    return json.loads(result.stdout) if result.stdout.strip() else None


def app(name):
    return az('containerapp', 'show', '-g', RG, '-n', name)


def env_of(value):
    entries = value['properties']['template']['containers'][0].get('env', [])
    env = {e['name']: e for e in entries}
    require(len(env) == len(entries), 'DUPLICATE_ENVIRONMENT')
    return env


def image_of(value):
    return value['properties']['template']['containers'][0]['image']


def fqdn(value):
    return value['properties']['configuration']['ingress']['fqdn']


def secret_value(app_name, ref):
    for item in az('containerapp', 'secret', 'list', '-g', RG, '-n', app_name):
        if item.get('name') == ref:
            if item.get('keyVaultUrl'):
                return az('keyvault', 'secret', 'show', '--id', item['keyVaultUrl'])['value']
            return az('containerapp', 'secret', 'show', '-g', RG, '-n', app_name, '--secret-name', ref)['value']
    raise ValueError(f'SECRET_NOT_FOUND {app_name}:{ref}')


def vault(name, check=True):
    value = az('keyvault', 'secret', 'show', '--vault-name', VAULT, '--name', name, check=check)
    return value['value'] if value else None


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()[:12]


def pg_env(database, user, password, read_only=True):
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith('PG')}
    env.update(PGHOST=PG_HOST, PGPORT='5432', PGDATABASE=database, PGUSER=user, PGPASSWORD=password,
               PGSSLMODE='verify-full', PGSSLROOTCERT='/etc/ssl/certs/ca-certificates.crt', PGCONNECT_TIMEOUT='10',
               PGAPPNAME='craves-chef-referral-release')
    env['PGOPTIONS'] = '-c statement_timeout=20000' + (' -c default_transaction_read_only=on' if read_only else '')
    return env


def psql(env, sql, variables=None):
    args = ['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1']
    for key, value in (variables or {}).items():
        args += ['-v', f'{key}={value}']
    result = subprocess.run(args, input=sql, env=env, capture_output=True, text=True, timeout=90)
    require(result.returncode == 0, 'SQL_FAILED ' + result.stderr.strip()[:300])
    return result.stdout.strip()


def owner_env(read_only=True):
    user = vault('craves-referral-db-owner-user', check=False) or 'craves_referral_owner'
    return pg_env(DATABASE, user, vault('craves-referral-db-owner-password'), read_only)


def runtime_role():
    return secret_value(REFERRAL, 'referral-db-user')


def source_db_env(name):
    env = env_of(app(name))
    url = urlparse(env['SPRING_DATASOURCE_URL']['value'].replace('jdbc:', '', 1))
    require(url.hostname == PG_HOST, 'UNEXPECTED_DATABASE_HOST')
    return pg_env(url.path.lstrip('/'), env['SPRING_DATASOURCE_USERNAME']['value'],
                  secret_value(name, env['SPRING_DATASOURCE_PASSWORD']['secretRef']))


def settled(name, value=None):
    value = value or app(name)
    p = value['properties']
    require(p['provisioningState'] == 'Succeeded' and p['latestRevisionName'] == p['latestReadyRevisionName'],
            f'APP_NOT_SETTLED {name}')
    return value


def probe(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'craves-chef-referral-release'})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code
    except Exception:
        return 0


def wait_healthy(name, expect, public_health=True):
    """Wait for a new healthy revision whose env/image satisfies expect(app)."""
    for _ in range(90):
        value = app(name)
        p = value['properties']
        if p['provisioningState'] == 'Failed':
            raise ValueError(f'REVISION_FAILED {name}')
        if p['provisioningState'] == 'Succeeded' and p['latestRevisionName'] == p['latestReadyRevisionName'] and expect(value):
            revision = az('containerapp', 'revision', 'show', '-g', RG, '-n', name, '--revision', p['latestReadyRevisionName'])['properties']
            if revision.get('healthState') == 'Healthy' and revision.get('runningState') in ('Running', 'RunningAtMaxScale'):
                if not public_health or probe(f'https://{fqdn(value)}/actuator/health') == 200:
                    return p['latestReadyRevisionName']
        time.sleep(10)
    raise ValueError(f'READINESS_TIMEOUT {name}')


def suffix(step):
    return re.sub('[^a-z0-9-]', '', f'ref-{os.environ.get("BUILD_BUILDID", "local")}-{step}'.lower())[:21]


def update_env(name, values, step, removals=()):
    """Set plain or secretref env values on one app; restore exactly on failure."""
    before = settled(name)
    previous = env_of(before)

    def matches(value):
        env = env_of(value)
        ok = all((env.get(k, {}).get('secretRef') == v[10:]) if v.startswith('secretref:') else (env.get(k, {}).get('value') == v and not env.get(k, {}).get('secretRef'))
                 for k, v in values.items())
        return ok and all(k not in env for k in removals) and image_of(value) == image_of(before)
    if matches(before):
        log(f'{name}: already configured')
        return before['properties']['latestReadyRevisionName']
    args = ['containerapp', 'update', '-g', RG, '-n', name, '--revision-suffix', suffix(step),
            '--set-env-vars', *[f'{k}={v}' for k, v in values.items()]]
    if removals:
        args += ['--remove-env-vars', *removals]
    az(*args)
    try:
        revision = wait_healthy(name, matches, public_health=name != REFERRAL)
        log(f'{name}: healthy revision {revision}')
        return revision
    except Exception:
        restore = [f'{k}=' + (('secretref:' + previous[k]['secretRef']) if previous[k].get('secretRef') else previous[k].get('value', ''))
                   for k in values if k in previous]
        added = [k for k in values if k not in previous]
        args = ['containerapp', 'update', '-g', RG, '-n', name, '--revision-suffix', suffix(step + 'rb')]
        if restore:
            args += ['--set-env-vars', *restore]
        if added:
            args += ['--remove-env-vars', *added]
        az(*args)
        log(f'{name}: FAILED, previous settings restored (verify revision health)')
        raise


# ---------------------------------------------------------------- inspect

def inspect():
    require(az('account', 'show')['id'] == SUB, 'WRONG_SUBSCRIPTION')
    names = sorted(s['name'] for s in az('keyvault', 'secret', 'list', '--vault-name', VAULT))
    log('vault secrets (names only): ' + ', '.join(n for n in names if 'referral' in n or 'jwt' in n))
    server = az('postgres', 'flexible-server', 'show', '-g', RG, '-n', PG_SERVER)
    log(f"postgres backup: retention={server['backup'].get('backupRetentionDays')} earliestRestore={server['backup'].get('earliestRestoreDate')} geo={server['backup'].get('geoRedundantBackup')}")
    for name in (REFERRAL, AUTH, ORDER, INTEGRATION):
        value = app(name)
        p = value['properties']
        revision = az('containerapp', 'revision', 'show', '-g', RG, '-n', name, '--revision', p['latestReadyRevisionName'])['properties']
        env = env_of(value)
        flags = {k: (v.get('value') if not v.get('secretRef') else 'secretref') for k, v in env.items() if 'REFERRAL' in k}
        log(f"\n## {name} image={image_of(value)} revision={p['latestReadyRevisionName']} created={revision.get('createdTime')} "
            f"health={revision.get('healthState')} suffixTemplate={p['template'].get('revisionSuffix')}")
        log('  referral env: ' + json.dumps(flags, sort_keys=True))
        if name == REFERRAL:
            for s in p['configuration'].get('secrets', []):
                log(f"  secret {s['name']} -> {(s.get('keyVaultUrl') or 'app-secret').split('/secrets/')[-1]}")
    env = owner_env()
    log('\n## referral database (owner, read-only)')
    log('  history: ' + psql(env, "SELECT string_agg(version||':'||success, ', ' ORDER BY installed_rank) FROM referral_schema.referral_flyway_history WHERE version IS NOT NULL;"))
    log('  policies: ' + psql(env, "SELECT string_agg(p.id||':'||p.program_kind||':active='||(a.policy_id IS NOT NULL), ', ' ORDER BY p.id) FROM referral_schema.policy p LEFT JOIN referral_schema.policy_activation a ON a.policy_id=p.id;"))
    log('  counts: ' + psql(env, "SELECT 'members='||(SELECT count(*) FROM referral_schema.member)||' chefs='||(SELECT count(*) FROM referral_schema.chef_membership)"
                            "||' inbox='||coalesce((SELECT string_agg(status||':'||n, '/') FROM (SELECT status,count(*) n FROM referral_schema.inbox GROUP BY 1) i),'0')"
                            "||' outbox='||coalesce((SELECT string_agg(status||':'||n, '/') FROM (SELECT status,count(*) n FROM referral_schema.outbox GROUP BY 1) o),'0')"
                            "||' snapshots='||(SELECT count(*) FROM referral_schema.order_snapshot)||' chefPostings='||(SELECT count(*) FROM referral_schema.chef_posting);"))
    role = runtime_role()
    log(f'  runtime role {role} chef table privileges: ' + psql(env, "SELECT string_agg(t||'='||has_table_privilege(:'role','referral_schema.'||t,'SELECT,INSERT,UPDATE'), ', ') FROM unnest(string_to_array(:'tables',',')) t;",
                                                              {'role': role, 'tables': ','.join(CHEF_TABLES)}))
    auth = source_db_env(AUTH)
    log('\n## auth (read-only)')
    log('  owner admin: ' + psql(auth, "SELECT string_agg(a.id||' status='||a.status||' roles='||(SELECT string_agg(role_code,'+' ORDER BY role_code) FROM auth_identity_role r WHERE r.identity_id=a.id), '; ') FROM auth_identity a WHERE lower(a.email)=lower(:'email');",
                                 {'email': OWNER_EMAIL}))
    log('  owner admin candidates: ' + psql(auth, "SELECT string_agg(a.id||' name='||coalesce(a.display_name,'-')||' lastLogin='||coalesce(a.last_login_at::date::text,'-'), '; ' ORDER BY a.last_login_at DESC NULLS LAST) "
                            "FROM auth_identity a WHERE a.status='ACTIVE' AND (a.display_name ILIKE '%ravi%' OR a.display_name ILIKE '%teja%') "
                            "AND EXISTS(SELECT 1 FROM auth_identity_role r WHERE r.identity_id=a.id AND r.role_code IN ('PLATFORM_ADMIN','PAYMENTS_ADMIN'));"))
    log('  enrollments=' + psql(auth, 'SELECT count(*) FROM referral_enrollment;') + ' outbox=' + psql(auth, "SELECT coalesce(string_agg(status||':'||n,'/'),'0') FROM (SELECT status,count(*) n FROM referral_source_outbox GROUP BY 1) o;"))
    for name in (ORDER, INTEGRATION):
        env = source_db_env(name)
        schema = 'order_schema' if name == ORDER else 'payment_schema'
        log(f'## {name} referral outbox: ' + psql(env, f"SELECT coalesce(string_agg(status||':'||n,'/'),'0') FROM (SELECT status,count(*) n FROM {schema}.referral_source_outbox GROUP BY 1) o;"))
    log('\nINSPECTION_COMPLETE read_only=true')


# ---------------------------------------------------------------- release

def history(env):
    rows = psql(env, "SELECT version||'|'||script||'|'||success FROM referral_schema.referral_flyway_history WHERE version IS NOT NULL ORDER BY installed_rank;")
    return [line.split('|') for line in rows.splitlines() if line]


def migrate(image, source):
    files = sorted(p.name for p in (source / 'services/referral-service/src/main/resources/db/referral_migration').glob('V*__*.sql'))
    env = owner_env(read_only=False)
    before = history(env)
    require(all(row[2] == 't' for row in before), 'FAILED_MIGRATION_IN_HISTORY')
    require({row[1] for row in before} <= set(files), 'UNKNOWN_APPLIED_MIGRATION')
    pending = sorted(set(files) - {row[1] for row in before})
    log(f'referral migrations applied={len(before)} pending={pending}')
    if pending:
        subprocess.run(['az', 'acr', 'login', '-n', ACR, '--only-show-errors'], check=True)
        subprocess.run(['docker', 'pull', '-q', image], check=True, capture_output=True)
        with tempfile.TemporaryDirectory(prefix='referral-migrate-') as directory:
            container = subprocess.run(['docker', 'create', image], check=True, capture_output=True, text=True).stdout.strip()
            try:
                subprocess.run(['docker', 'cp', container + ':/app/app.jar', directory + '/app.jar'], check=True, capture_output=True)
            finally:
                subprocess.run(['docker', 'rm', container], capture_output=True)
            with zipfile.ZipFile(directory + '/app.jar') as archive:
                for name in archive.namelist():
                    if name.startswith(('BOOT-INF/classes/', 'BOOT-INF/lib/')):
                        require('..' not in Path(name).parts, 'UNSAFE_JAR_PATH')
                        archive.extract(name, directory)
            run_env = dict(os.environ, REFERRAL_MIGRATION_CONFIRM='CREATE_REFERRAL_SCHEMA_ONLY',
                           REFERRAL_MIGRATION_DB_URL=f'jdbc:postgresql://{PG_HOST}:5432/{DATABASE}?sslmode=verify-full&sslrootcert=/etc/ssl/certs/ca-certificates.crt',
                           REFERRAL_MIGRATION_DB_USER=env['PGUSER'], REFERRAL_MIGRATION_DB_PASSWORD=env['PGPASSWORD'])
            result = subprocess.run(['java', '-cp', f'{directory}/BOOT-INF/classes:{directory}/BOOT-INF/lib/*',
                                     'in.craves.referral.infra.ReferralMigrate'], env=run_env, capture_output=True, text=True, timeout=300)
            require(result.returncode == 0, 'MIGRATION_FAILED ' + result.stderr.strip()[-400:])
    after = history(env)
    require({row[1] for row in after} == set(files) and all(row[2] == 't' for row in after), 'MIGRATION_INCOMPLETE')
    role = runtime_role()
    require(re.fullmatch('[a-z_][a-z0-9_]{2,62}', role) is not None, 'UNEXPECTED_RUNTIME_ROLE')
    grants = [f'GRANT SELECT,INSERT,UPDATE ON referral_schema.{t} TO {role};' for t in CHEF_TABLES]
    grants.append(f'GRANT SELECT,INSERT ON referral_schema.order_exclusion TO {role};')
    psql(env, "BEGIN; SET LOCAL lock_timeout='5s';\n" + '\n'.join(grants) + '\nCOMMIT;')
    check = psql(env, f"SELECT bool_and(has_table_privilege('{role}','referral_schema.'||t,'SELECT,INSERT,UPDATE')) AND has_table_privilege('{role}','referral_schema.order_exclusion','SELECT,INSERT') "
                      f"AND NOT has_table_privilege('{role}','referral_schema.order_exclusion','UPDATE,DELETE,TRUNCATE') AND NOT has_schema_privilege('{role}','referral_schema','CREATE') "
                      f"FROM unnest(string_to_array('{','.join(CHEF_TABLES)}',',')) t;")
    require(check == 't', 'RUNTIME_PRIVILEGES_DIFFER')
    return [row[1] for row in after]


def release(source, sha):
    require(az('account', 'show')['id'] == SUB, 'WRONG_SUBSCRIPTION')
    require(re.fullmatch('[0-9a-f]{40}', sha) is not None, 'FULL_SHA_REQUIRED')
    require(subprocess.run(['git', '-C', str(source), 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip() == sha, 'SOURCE_NOT_AT_SHA')
    before = settled(REFERRAL)
    ingress = before['properties']['configuration']['ingress']
    require(ingress['external'] is False and before['properties']['configuration']['activeRevisionsMode'] == 'Single', 'PRIVATE_SINGLE_REVISION_REQUIRED')
    require({k.lower().rsplit('/', 1)[-1] for k in before['identity']['userAssignedIdentities']} == {IDENTITY}, 'REFERRAL_IDENTITY_CHANGED')
    server = az('postgres', 'flexible-server', 'show', '-g', RG, '-n', PG_SERVER)['backup']
    require(int(server.get('backupRetentionDays') or 0) >= 7, 'POINT_IN_TIME_BACKUP_REQUIRED')
    log(f"point-in-time restore available from {server.get('earliestRestoreDate')}")
    tags = az('acr', 'repository', 'show-tags', '-n', ACR, '--repository', REPOSITORY, check=False) or []
    if sha not in tags:
        result = subprocess.run(['az', 'acr', 'build', '-r', ACR, '-t', f'{REPOSITORY}:{sha}', '-f', 'Dockerfile', '.', '--only-show-errors'],
                                cwd=source / 'services/referral-service', capture_output=True, text=True, timeout=1800)
        require(result.returncode == 0, 'IMAGE_BUILD_FAILED ' + (result.stdout + result.stderr).strip()[-800:])
    image_digest = az('acr', 'repository', 'show', '-n', ACR, '--image', f'{REPOSITORY}:{sha}')['digest']
    image = f'{ACR}.azurecr.io/{REPOSITORY}@{image_digest}'
    log(f'image {image}')
    applied = migrate(image, source)
    previous = image_of(settled(REFERRAL))
    if previous != image:
        az('containerapp', 'update', '-g', RG, '-n', REFERRAL, '--image', image, '--revision-suffix', suffix('img'))
        try:
            revision = wait_healthy(REFERRAL, lambda v: image_of(v) == image, public_health=False)
        except Exception:
            az('containerapp', 'update', '-g', RG, '-n', REFERRAL, '--image', previous, '--revision-suffix', suffix('imgrb'))
            log('referral image FAILED; previous image restored, additive migrations kept')
            raise
    else:
        revision = before['properties']['latestReadyRevisionName']
    flags = {k: v.get('value') for k, v in env_of(app(REFERRAL)).items() if k.endswith('_ENABLED')}
    log(json.dumps({'sourceSha': sha, 'image': image, 'previousImage': previous, 'revision': revision,
                    'migrations': applied, 'flagsUnchanged': flags}, indent=1))


# ---------------------------------------------------------------- activate

def owner_identity():
    explicit = os.environ.get('REFERRAL_OWNER_IDENTITY', '').strip()
    if explicit:
        require(re.fullmatch('[0-9a-f-]{36}', explicit) is not None, 'INVALID_OWNER_IDENTITY')
        rows = psql(source_db_env(AUTH), "SELECT a.id FROM auth_identity a WHERE a.id=:'id'::uuid AND a.status='ACTIVE' "
                                         "AND EXISTS(SELECT 1 FROM auth_identity_role r WHERE r.identity_id=a.id AND r.role_code IN ('PLATFORM_ADMIN','PAYMENTS_ADMIN'));",
                    {'id': explicit}).splitlines()
        require(rows == [explicit], 'OWNER_IDENTITY_NOT_AN_ACTIVE_ADMIN')
        return explicit
    rows = psql(source_db_env(AUTH), "SELECT a.id FROM auth_identity a WHERE lower(a.email)=lower(:'email') AND a.status='ACTIVE' "
                                     "AND EXISTS(SELECT 1 FROM auth_identity_role r WHERE r.identity_id=a.id AND r.role_code IN ('PLATFORM_ADMIN','PAYMENTS_ADMIN'));",
                {'email': OWNER_EMAIL}).splitlines()
    require(len(rows) == 1, 'OWNER_ADMIN_IDENTITY_NOT_UNIQUE')
    return rows[0]


def activate_policy(approver):
    for key, value in APPROVALS.items():
        require(0 < len(value) <= 180, 'APPROVAL_REFERENCE_TOO_LONG ' + key)
    sql = """BEGIN;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(194726851,1);
CREATE TEMP TABLE chef_step ON COMMIT DROP AS SELECT NOT EXISTS(
 SELECT 1 FROM referral_schema.policy p JOIN referral_schema.policy_activation a ON a.policy_id=p.id WHERE p.program_kind='CHEF_COMMISSION_20260916') AS needed;
CREATE TEMP TABLE chef_draft(id BIGINT) ON COMMIT DROP;
WITH d AS (
 INSERT INTO referral_schema.policy(l1_bps,l2_bps,l3_bps,cap_bps,hold_days,minimum_paise,customer_bonus_paise,invitee_discount_paise,approvals,created_by,program_kind)
 SELECT 200,120,80,400,1,25000,0,0,:'approvals'::jsonb,:'maker'::uuid,'CHEF_COMMISSION_20260916' FROM chef_step WHERE needed RETURNING id)
INSERT INTO chef_draft SELECT id FROM d;
INSERT INTO referral_schema.audit(actor,action,target,detail)
 SELECT 'release:'||:'maker','POLICY_DRAFT_CREATED',id::text,jsonb_build_object('programKind','CHEF_COMMISSION_20260916','evidenceRef',:'evidence') FROM chef_draft;
INSERT INTO referral_schema.policy_activation(policy_id,effective_at,approved_by,activated_at)
 SELECT id,now(),:'approver'::uuid,now() FROM chef_draft;
INSERT INTO referral_schema.audit(actor,action,target,detail)
 SELECT :'approver','POLICY_ACTIVATED',id::text,jsonb_build_object('effectiveAt',now()::text,'evidenceRef',:'evidence') FROM chef_draft;
SELECT p.id||' '||a.effective_at FROM referral_schema.policy p JOIN referral_schema.policy_activation a ON a.policy_id=p.id
 WHERE p.program_kind='CHEF_COMMISSION_20260916' ORDER BY a.effective_at DESC LIMIT 1;
COMMIT;"""
    out = psql(owner_env(read_only=False), sql, {'approvals': json.dumps(APPROVALS, sort_keys=True), 'maker': RELEASE_MAKER,
                                                 'approver': approver, 'evidence': 'owner approval in Cowork chat 2026-10-12'})
    require(out.strip() != '', 'CHEF_POLICY_NOT_ACTIVE')
    log('chef policy active: ' + out.strip().splitlines()[-1])


def ensure_vault_key(name):
    value = vault(name, check=False)
    if value:
        return value
    value = base64.b64encode(secrets.token_bytes(32)).decode()
    result = subprocess.run(['az', 'keyvault', 'secret', 'set', '--vault-name', VAULT, '--name', name, '--value', value,
                             '--only-show-errors', '-o', 'none'], capture_output=True, text=True)
    require(result.returncode == 0, f'VAULT_WRITE_FAILED {name}: {result.stderr.strip()[:200]}')
    require(vault(name) == value, 'VAULT_READBACK_FAILED')
    log(f'created vault secret {name}')
    return value


def set_app_secrets(name, values):
    existing = {s['name'] for s in az('containerapp', 'secret', 'list', '-g', RG, '-n', name)}
    pending = {k: v for k, v in values.items() if k not in existing or secret_value(name, k) != v}
    if pending:
        # Values travel on the agent's command line only; never logged.
        result = subprocess.run(['az', 'containerapp', 'secret', 'set', '-g', RG, '-n', name, '--secrets',
                                 *[f'{k}={v}' for k, v in pending.items()], '--only-show-errors', '-o', 'none'], capture_output=True, text=True)
        require(result.returncode == 0, f'APP_SECRET_FAILED {name}')
    for k, v in values.items():
        require(secret_value(name, k) == v, f'APP_SECRET_READBACK_FAILED {name}:{k}')


def activate(source):
    require(az('account', 'show')['id'] == SUB, 'WRONG_SUBSCRIPTION')
    referral = settled(REFERRAL)
    env = env_of(referral)
    for key in REFERRAL_STAY_OFF:
        require(env.get(key, {}).get('value') == 'false', 'CUSTOMER_PROGRAMME_FLAG_NOT_OFF ' + key)
    require(env['CRAVES_REFERRALS_AUTH_VERIFICATION_MODE'].get('value') == 'AUTH_HTTP', 'AUTH_HTTP_REQUIRED')
    files = sorted(p.name for p in (source / 'services/referral-service/src/main/resources/db/referral_migration').glob('V*__*.sql'))
    require(len(files) >= 13 and {row[1] for row in history(owner_env())} == set(files), 'RUN_RELEASE_FIRST')
    keys = {'auth': secret_value(REFERRAL, 'referral-auth-hmac'), 'order': secret_value(REFERRAL, 'referral-order-hmac'),
            'finance': secret_value(REFERRAL, 'referral-finance-hmac')}
    require(len({*keys.values()}) == 3 and all(len(base64.b64decode(v)) >= 32 for v in keys.values()), 'SOURCE_KEYS_NOT_ISOLATED')
    for name in (AUTH, ORDER, INTEGRATION):
        current = env_of(settled(name))
        for key in SOURCE_STAY_OFF:
            require(current.get(key, {}).get('value') in (None, 'false'), 'BENEFIT_OR_PAYOUT_FLAG_ON ' + name)
    origin = 'https://' + fqdn(referral)
    require(origin.endswith('.internal.yellowdesert-9c7110ab.centralindia.azurecontainerapps.io'), 'UNEXPECTED_REFERRAL_ORIGIN')

    approver = owner_identity()
    log(f'owner approver identity {approver}')
    activate_policy(approver)

    update_env(REFERRAL, REFERRAL_ON, 'on')

    contact = ensure_vault_key('craves-referral-contact-hmac')
    attribution = ensure_vault_key('craves-referral-attribution-hmac')
    require(contact != attribution, 'ENROLLMENT_KEYS_MUST_DIFFER')
    sources = (
        (AUTH, {'referral-source-hmac': keys['auth'], 'referral-contact-hmac': contact, 'referral-attribution-hmac': attribution},
         {'CRAVES_REFERRAL_CONTACT_HMAC_BASE64': 'secretref:referral-contact-hmac',
          'CRAVES_REFERRAL_ATTRIBUTION_HMAC_BASE64': 'secretref:referral-attribution-hmac',
          'CRAVES_REFERRAL_TERMS_VERSION': TERMS_VERSION, 'CRAVES_REFERRAL_ATTRIBUTION_RETENTION_APPROVED': 'true'}),
        (INTEGRATION, {'referral-source-hmac': keys['finance']}, {}),
        (ORDER, {'referral-source-hmac': keys['order']}, {}),
    )
    for name, app_secrets, extra in sources:
        set_app_secrets(name, app_secrets)
        update_env(name, {'CRAVES_REFERRAL_SOURCE_ENABLED': 'true', 'CRAVES_REFERRAL_SERVICE_ORIGIN': origin,
                          'CRAVES_REFERRAL_SOURCE_HMAC_BASE64': 'secretref:referral-source-hmac', **extra}, name.split('-')[2][:5])
    verify()


def verify():
    referral = settled(REFERRAL)
    env = env_of(referral)
    require(all(env.get(k, {}).get('value') == v for k, v in REFERRAL_ON.items()), 'REFERRAL_FLAGS_NOT_ON')
    require(all(env.get(k, {}).get('value') == 'false' for k in REFERRAL_STAY_OFF), 'CUSTOMER_PROGRAMME_FLAG_ON')
    pairs = ((AUTH, 'referral-auth-hmac'), (ORDER, 'referral-order-hmac'), (INTEGRATION, 'referral-finance-hmac'))
    for name, ref in pairs:
        value = settled(name)
        source = env_of(value)
        require(source['CRAVES_REFERRAL_SOURCE_ENABLED'].get('value') == 'true', 'SOURCE_NOT_ENABLED ' + name)
        require(digest(secret_value(name, 'referral-source-hmac')) == digest(secret_value(REFERRAL, ref)), 'SOURCE_KEY_MISMATCH ' + name)
        require(probe(f'https://{fqdn(value)}/actuator/health') == 200, 'SOURCE_UNHEALTHY ' + name)
        log(f'{name}: source on, key matches referral {ref}, health 200')
    time.sleep(90)  # let the Finance consumer poll the referral outbox at least once
    owner = owner_env()
    claims = psql(owner, "SELECT count(*) FROM referral_schema.operation_receipt WHERE source='finance' AND created_at>now()-interval '10 minutes';")
    log(f'finance outbox claims accepted by referral in last 10 min: {claims}')
    require(int(claims or 0) > 0, 'FINANCE_TO_REFERRAL_NOT_FLOWING')
    log('  policy: ' + psql(owner, "SELECT string_agg(p.id||':'||p.program_kind||' effective '||a.effective_at, ', ') FROM referral_schema.policy p JOIN referral_schema.policy_activation a ON a.policy_id=p.id;"))
    log('ACTIVATION_VERIFIED chef_programme=on customer_wallet=off cashouts=off checkout_benefits=off referral_payouts=off')


if __name__ == '__main__':
    try:
        action = sys.argv[1]
        if action == 'inspect':
            inspect()
        elif action == 'release':
            release(Path(sys.argv[2]).resolve(), sys.argv[3])
        elif action == 'activate':
            activate(Path(sys.argv[2]).resolve())
        elif action == 'verify':
            verify()
        else:
            raise ValueError('UNKNOWN_ACTION')
    except ValueError as error:
        print('CHEF_REFERRAL_STOPPED ' + str(error)[:500], file=sys.stderr)
        raise SystemExit(1)
