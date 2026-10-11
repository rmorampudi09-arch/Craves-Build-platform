#!/usr/bin/env python3
"""First deployment of the isolated private referral engine. Never enables programme flags."""
import base64, hashlib, json, os, pathlib, secrets, subprocess, tempfile, time, urllib.parse
RG='rg-craves-prodlow-centralindia'; SUB='4f897b61-9b52-44b4-8cf1-bdac281cc1aa'
APP='ca-craves-referral-prodlow'; IDENTITY='id-craves-referral-prodlow'; VAULT='kvcravesprodlowl3ing6'
SERVER='pg-craves-prodlow-l3ing6.postgres.database.azure.com'; DATABASE='craves_referral_db'
SOURCE='036b3211b2e81465699766f7d8104a4199c67723'; ACR='cravesprodlowacr82121'
OWNER='craves_referral_owner'; RUNTIME='craves_referral_runtime'
EVIDENCE=pathlib.Path(os.environ['BUILD_ARTIFACTSTAGINGDIRECTORY'])/'referral-deployment'; EVIDENCE.mkdir(parents=True,exist_ok=True)

def az(*args):
    p=subprocess.run(['az',*args,'--only-show-errors','-o','json'],capture_output=True,text=True)
    if p.returncode: raise RuntimeError('Azure operation failed: '+args[0]+' '+args[1]+'; '+p.stderr[:400])
    return json.loads(p.stdout) if p.stdout.strip() else None

def runtime_hash(a):
    p=a['properties']; return hashlib.sha256(json.dumps({'template':p['template'],'configuration':p['configuration'],'identity':a.get('identity')},sort_keys=True).encode()).hexdigest()

def sql(statement,database='postgres',user='cravesadmin',password=None):
    env=os.environ.copy();env.update(PGHOST=SERVER,PGPORT='5432',PGDATABASE=database,PGUSER=user,PGPASSWORD=password or admin_password,PGSSLMODE='verify-full',PGSSLROOTCERT='/etc/ssl/certs/ca-certificates.crt',PGCONNECT_TIMEOUT='15')
    p=subprocess.run(['psql','-XAtq','-v','ON_ERROR_STOP=1'],input=statement,env=env,capture_output=True,text=True)
    if p.returncode: raise RuntimeError('Database operation failed for '+database+'; sensitive diagnostics suppressed')
    return p.stdout.strip()

def secret(name,value=None):
    if name in secret_names:
        item=az('keyvault','secret','show','--vault-name',VAULT,'--name',name)
        if value is not None and item['value']!=value: raise RuntimeError('Existing referral secret differs: '+name)
        return item
    if value is None: value=secrets.token_urlsafe(48)
    with tempfile.NamedTemporaryFile(mode='w',delete=False) as f: f.write(value); path=f.name
    try: item=az('keyvault','secret','set','--vault-name',VAULT,'--name',name,'--file',path)
    finally: os.unlink(path)
    secret_names.add(name);return item

assert az('account','show')['id']==SUB
# Application source must be byte-identical to the candidate with completed database tests.
changed=subprocess.check_output(['git','diff','--name-only',SOURCE,'HEAD','--','services/referral-service/src','services/referral-service/pom.xml','services/referral-service/Dockerfile'],text=True)
assert not changed, 'Referral application changed after verified candidate'
baseline=az('containerapp','list','-g',RG); assert all(a['name']!=APP for a in baseline),'Refuse replacing an existing app'
baseline_hash={a['name']:runtime_hash(a) for a in baseline}
(EVIDENCE/'existing-app-baseline.json').write_text(json.dumps(baseline_hash,indent=2))
auth=next(a for a in baseline if a['name']=='ca-craves-auth-service-prodlow')
environment=az('containerapp','env','show','-g',RG,'-n','cae-craves-prodlow-l3ing6')
location=environment['location'].replace(' ','').lower()
assert location=='centralindia','Unexpected existing environment region'
vault=az('keyvault','show','-g',RG,'-n',VAULT);assert vault['properties'].get('enableRbacAuthorization') is True,'Per-secret RBAC required'
registry=az('acr','show','-n',ACR)
manifest=az('acr','repository','show','--name',ACR,'--image','craves/referral-service:'+SOURCE)
image=registry['loginServer']+'/craves/referral-service@'+manifest['digest'];assert manifest['digest'].startswith('sha256:')
secret_names={s['name'] for s in az('keyvault','secret','list','--vault-name',VAULT)}
# Privileged migration credentials remain in this job; the app identity receives no access to them.
admin_password=az('keyvault','secret','show','--vault-name',VAULT,'--name','craves-auth-db-password')['value']
assert sql('SELECT rolcreatedb AND rolcreaterole FROM pg_roles WHERE rolname=current_user')=='t'
owner_secret=secret('craves-referral-db-owner-password'); runtime_secret=secret('craves-referral-db-runtime-password')
for role,item in [(OWNER,owner_secret),(RUNTIME,runtime_secret)]:
    if not sql("SELECT rolname FROM pg_roles WHERE rolname='"+role+"'"):
        # Generated passwords contain only URL-safe characters; never interpolate user input as SQL.
        password=item['value'];assert all(c.isalnum() or c in '_-' for c in password)
        sql(f"CREATE ROLE {role} LOGIN PASSWORD '{password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT CONNECTION LIMIT 10;")
    assert sql(f"SELECT NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication FROM pg_roles WHERE rolname='{role}'")=='t'
if not sql("SELECT datname FROM pg_database WHERE datname='"+DATABASE+"'"):
    sql(f'GRANT {OWNER} TO cravesadmin;')
    sql(f'CREATE DATABASE {DATABASE} OWNER {OWNER};')
assert sql(f"SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='{DATABASE}'")==OWNER
sql(f'REVOKE CONNECT,TEMPORARY ON DATABASE {DATABASE} FROM PUBLIC; GRANT CONNECT ON DATABASE {DATABASE} TO {RUNTIME};')
sql('REVOKE CREATE ON SCHEMA public FROM PUBLIC;',DATABASE,OWNER,owner_secret['value'])
print('Isolated database and non-administrator runtime role provisioned',flush=True)
# Extract the actual image artifact and run its separate Flyway entry point, never application startup DDL.
subprocess.run(['az','acr','login','-n',ACR,'--only-show-errors'],check=True,stdout=subprocess.DEVNULL)
subprocess.run(['docker','pull',image],check=True,stdout=subprocess.DEVNULL)
container=subprocess.check_output(['docker','create',image],text=True).strip()
with tempfile.TemporaryDirectory() as temp:
    try: subprocess.run(['docker','cp',container+':/app/app.jar',temp+'/app.jar'],check=True)
    finally: subprocess.run(['docker','rm',container],check=True,stdout=subprocess.DEVNULL)
    import zipfile
    with zipfile.ZipFile(temp+'/app.jar') as z:z.extractall(temp+'/unpacked')
    env=os.environ.copy();env.update(REFERRAL_MIGRATION_DB_URL=f'jdbc:postgresql://{SERVER}:5432/{DATABASE}?sslmode=verify-full&sslrootcert=/etc/ssl/certs/ca-certificates.crt',REFERRAL_MIGRATION_DB_USER=OWNER,REFERRAL_MIGRATION_DB_PASSWORD=owner_secret['value'],REFERRAL_MIGRATION_CONFIRM='CREATE_REFERRAL_SCHEMA_ONLY')
    subprocess.run(['java','-cp',temp+'/unpacked/BOOT-INF/classes:'+temp+'/unpacked/BOOT-INF/lib/*','in.craves.referral.infra.ReferralMigrate'],env=env,check=True)
sql(f'GRANT USAGE ON SCHEMA referral_schema TO {RUNTIME}; GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA referral_schema TO {RUNTIME}; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA referral_schema TO {RUNTIME}; REVOKE ALL ON referral_schema.referral_flyway_history FROM {RUNTIME};',DATABASE,OWNER,owner_secret['value'])
# No runtime DELETE, DDL, trigger-bypass, migration-history or other-owner-table permissions.
assert sql("SELECT string_agg(version,',' ORDER BY installed_rank) FROM referral_schema.referral_flyway_history WHERE type='SQL' AND success",DATABASE,OWNER,owner_secret['value'])=='1,1.1,2,3,4,5,6,7,8'
assert sql("SELECT count(*) FROM referral_schema.referral_flyway_history WHERE NOT success",DATABASE,OWNER,owner_secret['value'])=='0'
assert sql("SELECT count(*) FROM referral_schema.wallet",DATABASE,RUNTIME,runtime_secret['value'])=='0'
assert sql("SELECT has_schema_privilege(current_user,'referral_schema','CREATE')",DATABASE,RUNTIME,runtime_secret['value'])=='f'
assert sql("SELECT has_table_privilege(current_user,'referral_schema.referral_flyway_history','UPDATE')",DATABASE,RUNTIME,runtime_secret['value'])=='f'
assert sql(f"SELECT has_table_privilege('{RUNTIME}','public.auth_identity','SELECT')",'craves_auth_db')=='f'
print('All nine migrations and restricted runtime checks passed',flush=True)
refs={}
for key,name,value in [('dbUrl','craves-referral-db-url',f'jdbc:postgresql://{SERVER}:5432/{DATABASE}?sslmode=verify-full&sslrootcert=/etc/ssl/certs/ca-certificates.crt'),('dbUser','craves-referral-db-user',RUNTIME)]:refs[key]=secret(name,value)['id']
refs['dbPassword']=runtime_secret['id']
refs['jwtVerificationPem']=az('keyvault','secret','show','--vault-name',VAULT,'--name','craves-jwt-verification-pem-base64')['id']
for key,source in [('authHmac','auth'),('orderHmac','order'),('financeHmac','finance')]:
    name='craves-referral-'+source+'-hmac'; refs[key]=secret(name,base64.b64encode(secrets.token_bytes(48)).decode() if name not in secret_names else None)['id']
identities=az('identity','list','-g',RG); identity=next((x for x in identities if x['name']==IDENTITY),None)
if identity is None:identity=az('identity','create','-g',RG,'-n',IDENTITY,'--location',environment['location'])
for scope,role in [(registry['id'],'AcrPull')]+[(vault['id']+'/secrets/'+urllib.parse.urlparse(url).path.split('/')[2],'Key Vault Secrets User') for url in refs.values()]:
    assignments=az('role','assignment','list','--scope',scope)
    if not any(a.get('principalId')==identity['principalId'] and a.get('roleDefinitionName')==role and a.get('scope','').lower()==scope.lower() for a in assignments):
        az('role','assignment','create','--assignee-object-id',identity['principalId'],'--assignee-principal-type','ServicePrincipal','--role',role,'--scope',scope)
values={'appName':APP,'location':location,'managedEnvironmentId':environment['id'],'userAssignedIdentityId':identity['id'],'registryServer':registry['loginServer'],'image':image,'authVerificationMode':'AUTH_HTTP','authBaseUrl':'https://'+auth['properties']['configuration']['ingress']['fqdn'],'secretReferences':refs}
parameters={'$schema':'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#','contentVersion':'1.0.0.0','parameters':{k:{'value':v} for k,v in values.items()}}
(EVIDENCE/'deployment-parameters.json').write_text(json.dumps(parameters,indent=2));(EVIDENCE/'inventory.json').write_text(json.dumps([{'id':a['id'],'name':a['name']} for a in baseline]))
subprocess.run(['python3','scripts/referrals/verify-release-plan.py',str(EVIDENCE/'deployment-parameters.json'),str(EVIDENCE/'inventory.json'),'--subscription',SUB,'--resource-group',RG],check=True)
whatif=az('deployment','group','what-if','-g',RG,'--template-file','services/referral-service/deploy/main.bicep','--parameters','@'+str(EVIDENCE/'deployment-parameters.json'),'--result-format','FullResourcePayloads','--no-pretty-print')
changes=whatif.get('changes',[]);target=f'/subscriptions/{SUB}/resourceGroups/{RG}/providers/Microsoft.App/containerApps/{APP}'
assert changes and any(x['changeType']=='Create' and x['resourceId'].lower()==target.lower() for x in changes)
assert all(x['changeType'] in ['NoChange','Ignore'] or (x['changeType']=='Create' and x['resourceId'].lower()==target.lower()) for x in changes),'Unexpected resource mutation in what-if'
(EVIDENCE/'what-if.json').write_text(json.dumps(whatif,indent=2))
# Recheck existing applications immediately before creating the new app.
assert {a['name']:runtime_hash(a) for a in az('containerapp','list','-g',RG)}==baseline_hash,'Existing deployment changed during provisioning; recheck before proceeding'
result=az('deployment','group','create','-g',RG,'-n','referral-backend-'+os.environ['BUILD_BUILDID'],'--template-file','services/referral-service/deploy/main.bicep','--parameters','@'+str(EVIDENCE/'deployment-parameters.json'))
app=az('containerapp','show','-g',RG,'-n',APP)
revision=app['properties']['latestRevisionName']
# ARM provisioning success alone can precede a failed Java startup. Require
# sustained probe health before recording a successful runtime deployment.
deadline=time.monotonic()+300; healthy_observations=0
while time.monotonic()<deadline:
    current=az('containerapp','revision','show','-g',RG,'-n',APP,'--revision',revision)['properties']
    if current.get('healthState')=='Healthy' and current.get('runningState') in ('Running','RunningAtMaxScale'):
        healthy_observations+=1
        if healthy_observations>=3: break
    else: healthy_observations=0
    time.sleep(10)
else: raise RuntimeError('Private referral revision failed sustained runtime health checks')
app=az('containerapp','show','-g',RG,'-n',APP)
assert app['properties']['latestReadyRevisionName']==revision
assert app['properties']['template']['containers'][0]['image']==image
assert not app['properties']['configuration']['ingress']['external']
flags={e['name']:e.get('value') for e in app['properties']['template']['containers'][0]['env'] if e['name'].startswith('CRAVES_REFERRALS_') and e['name'].endswith('_ENABLED')}
assert len(flags)==7 and set(flags.values())=={'false'}
after={a['name']:runtime_hash(a) for a in az('containerapp','list','-g',RG) if a['name']!=APP};assert after==baseline_hash
(EVIDENCE/'result.json').write_text(json.dumps({'app':APP,'source':SOURCE,'image':image,'privateOrigin':'https://'+app['properties']['configuration']['ingress']['fqdn'],'revision':revision,'state':app['properties']['provisioningState'],'healthy':True,'flags':flags,'existingAppsUnchanged':True,'migrations':9,'runtimeRole':RUNTIME},indent=2))
print('Private referral backend deployed; programme flags remain disabled',flush=True)
