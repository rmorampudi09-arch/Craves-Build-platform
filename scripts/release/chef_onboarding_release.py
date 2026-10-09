"""Release only Chef onboarding in the existing rmorampudi09 production resources."""
import argparse
import copy
import json
import os
from pathlib import Path
import re
import tempfile
import time
from active_address_release import (SUBSCRIPTION, RG, CHEF, WEB, APIM, ACR, FIREBASE, app, azure, run,
    source_guard, build_image, verify_image, resolve_image, deploy_web, ready_web, environment, inspect, runtime, require)

BANK='ca-craves-integration-service-pr'
# Sends email verification codes. Image-only update: its ACS secret is a plain app secret, which the
# preserve-runtime backend helper refuses, and an image swap never touches secrets or settings.
NOTIFICATION='ca-craves-notification-service-p'
CATALOG='ca-craves-catalog-service-prodlo'
MEDIA_ACCOUNT='stcravesmediakmqgfy'
MEDIA_CONTAINER='media'
MEDIA_SECRET='media-storage'
MEDIA_ENV={'CRAVES_STORAGE_ENDPOINT_VALUE':'secretref:'+MEDIA_SECRET,'CRAVES_STORAGE_MEDIA_CONTAINER':MEDIA_CONTAINER}
FLAG='CRAVES_CHEF_ONBOARDING_V2_ENABLED'
BASE='CRAVES_BANK_INTEGRATION_BASE_URL'

# Azure's latest-ready pointer can precede single-revision traffic/replica settlement.
# Retry only lifecycle readiness failures; configuration, image and runtime guards
# remain immediate failures and are never relaxed.
WEB_SETTLING_ERRORS=frozenset((
    'Exactly the current web revision must be active',
    'Active web revision is not healthy',
    'Actual web replica count must be one',
    'Actual web container must be ready and started',
    'Active web revision must report actual traffic weight 100',
))


def preflight():
    account=azure('account','show')
    require(account['id']==SUBSCRIPTION and account['tenantId']==inspect.TENANT,'Wrong Azure deployment account')
    servers=azure('postgres','flexible-server','list','-g',RG)
    vaults=azure('keyvault','list','-g',RG)
    return {key:inspect.inspect_database(app(name),servers,vaults,service) for key,name,service in (
        ('chef',CHEF,'user-chef-service'),('bank',BANK,'integration-service'))}


def image(value): return value['properties']['template']['containers'][0]['image']


def applied(report):
    require(report['chef'].get('v16')=='APPLIED_MATCHING' and report['bank'].get('v149')=='APPLIED_MATCHING',
            'Chef and bank migration readbacks must match the reviewed release')


def release_images(source,sha,run_id,output):
    preflight()
    snapshots={name:app(name) for name in (BANK,CHEF)}
    helper=source/'scripts/release/deploy-single-service-preserve-runtime.sh'
    guard_env=dict(os.environ,DEPLOY_PREFLIGHT_ONLY='true',READY_ATTEMPTS='150',READY_SLEEP_SECONDS='10')
    for name in (BANK,CHEF):run('bash',str(helper),RG,name,image(snapshots[name]),'chef-onboarding',env=guard_env)
    run('az','acr','login','-n',ACR,'--only-show-errors')
    receipts=[]
    for name,service in ((BANK,'integration-service'),(CHEF,'user-chef-service')):
        target=build_image(source,'services/'+service,'craves/'+service,sha)
        source_guard(source,sha,run_id)
        current=app(name)
        require(runtime.stable(current)==runtime.stable(snapshots[name]) and image(current)==image(snapshots[name]),'Concurrent backend runtime change; deployment stopped')
        deploy_env=dict(guard_env,DEPLOY_PREFLIGHT_ONLY='false',EXPECTED_PREVIOUS_IMAGE=image(current))
        if image(current)!=target:run('bash',str(helper),RG,name,target,'chef-onboarding',env=deploy_env)
        verify_image(image(app(name)),sha)
        receipts.append({'app':name,'sourceSha':sha,'image':target,'previousImage':image(current)})
    report=preflight();applied(report)
    output.write_text(json.dumps({'images':receipts,'migrations':report},indent=2)+'\n')
    print('Chef and bank images deployed; exact migrations and unchanged runtime verified.',flush=True)


def stable_without(value,keys):
    result=copy.deepcopy(value)
    entries=result['properties']['template']['containers'][0].get('env',[])
    result['properties']['template']['containers'][0]['env']=[e for e in entries if e['name'] not in keys]
    return runtime.stable(result)


def flag_guard(before,current,values):
    require(stable_without(before,values)==stable_without(current,values) and image(before)==image(current),'Unrelated runtime or image changed during Chef activation')
    env=environment(current)
    require(all(not env.get(k,{}).get('secretRef') and env.get(k,{}).get('value')==v for k,v in values.items()),'Chef activation values differ')


def bank_available(bank,report):
    env=environment(bank)
    require(all(env.get(key,{}).get('value')=='true' and not env.get(key,{}).get('secretRef') for key in ('CRAVES_BANK_PROVIDER_ENABLED','CRAVES_BANK_WORKER_ENABLED')),
            'Existing bank provider and worker must already be enabled; no financial guard changed')
    require(all(env.get(key,{}).get('secretRef') or env.get(key,{}).get('value') for key in ('CRAVES_BANK_DATA_KEYS_JSON','CRAVES_BANK_DATA_ACTIVE_KEY_ID','CRAVES_RAZORPAYX_KEY_ID','CRAVES_RAZORPAYX_KEY_SECRET','CRAVES_RAZORPAYX_ACCOUNT_NUMBER')),'Existing bank provider bindings are incomplete')
    controls=report['bank']['controls']
    require(controls['submissions_enabled'] is True and controls['validation_enabled'] is True,'Bank enrollment controls are disabled; provider entitlement must be confirmed before enabling finance execution')


def wait_flags(name,before,values):
    for _ in range(120):
        current=app(name);flag_guard(before,current,values);props=current['properties']
        if props.get('runningStatus')=='Running' and props.get('provisioningState')=='Succeeded' and props.get('latestRevisionName')==props.get('latestReadyRevisionName'):
            code,body=inspect.probe('https://'+props['configuration']['ingress']['fqdn']+('/api/version' if name==WEB else '/actuator/health'))
            if code==200:
                if name==WEB:
                    try:ready_web(current)
                    except ValueError as error:
                        if str(error) not in WEB_SETTLING_ERRORS:raise
                    else:return current
                else:return current
        time.sleep(10)
    raise ValueError('Chef activation revision did not become healthy')


def activate(sha,output,allow_bank_unavailable=False):
    report=preflight();applied(report);bank=app(BANK)
    bank_ready=True
    try:bank_available(bank,report)
    except ValueError:
        if not allow_bank_unavailable:raise
        bank_ready=False
    for name in (BANK,CHEF,WEB):verify_image(image(app(name)),sha)
    origin='https://'+bank['properties']['configuration']['ingress']['fqdn']
    require(origin.endswith('.azurecontainerapps.io') and '/' not in origin[8:],'Unexpected bank service origin')
    updates=((CHEF,{FLAG:'true',BASE:origin}),(WEB,{FLAG:'true'}))
    receipts=[]
    for name,values in updates:
        before=app(name);env=environment(before)
        require(all(not env.get(k,{}).get('secretRef') for k in values),'Chef flag must use an explicit nonsecret runtime value')
        require(before['properties'].get('latestRevisionName')==before['properties'].get('latestReadyRevisionName'),'Chef rollout must be settled before activation')
        azure('containerapp','update','-g',RG,'-n',name,'--set-env-vars',*[k+'='+v for k,v in values.items()])
        try:
            current=wait_flags(name,before,values)
            receipts.append({'app':name,'enabled':True,'revision':current['properties']['latestReadyRevisionName'],'sourceSha':sha})
        except Exception:
            # Recover only the changed names if runtime and image still match this operation.
            current=app(name);flag_guard(before,current,values)
            previous=[k+'='+env[k].get('value','') for k in values if k in env]
            missing=[k for k in values if k not in env]
            args=['containerapp','update','-g',RG,'-n',name]
            if previous:args+=['--set-env-vars',*previous]
            if missing:args+=['--remove-env-vars',*missing]
            azure(*args)
            raise RuntimeError('Chef activation failed; previous flag values restored, verify Azure revision')
    output.write_text(json.dumps({'sourceSha':sha,'activation':receipts,'bankEnrollmentAvailable':bank_ready,'financeControlsChanged':False},indent=2)+'\n')
    print('Chef onboarding pages activated; healthy revisions and unrelated runtime verified. Bank enrollment available: '+str(bank_ready),flush=True)


# admin.craves.in is served by this app (verified by identical static chunks before every deploy).
ADMIN='ca-craves-admin-r92-ffe80e7c'
ADMIN_HOST='https://admin.craves.in'
ADMIN_ROUTES=('/sign-in','/admin','/admin/chef-reviews','/admin/chef-onboarding')


def chunks(url):
    code,body=inspect.probe(url)
    require(code==200,'Admin route verification failed: '+url)
    found=sorted(set(re.findall(r'static/chunks/([A-Za-z0-9_~.-]+\.js)',body.decode('utf-8','replace'))))
    require(bool(found),'Admin page returned no application bundle: '+url)
    return found


def admin_settled(value,target):
    props=value['properties']
    return (props.get('provisioningState')=='Succeeded' and props.get('runningStatus')=='Running' and
            props.get('latestRevisionName')==props.get('latestReadyRevisionName') and image(value)==target)


def admin_verified(value):
    origin='https://'+value['properties']['configuration']['ingress']['fqdn']
    require(chunks(ADMIN_HOST+'/sign-in')==chunks(origin+'/sign-in'),'admin.craves.in does not serve '+ADMIN+' yet')
    for path in ADMIN_ROUTES:require(inspect.probe(origin+path)[0]==200,'Admin route verification failed: '+path)
    require(inspect.probe(origin+'/api/admin/me')[0]==401,'Signed-out admin identity guard must return 401')


def deploy_admin(source,sha,run_id,output):
    """Image-only update of the admin portal from the same reviewed source; runtime settings are preserved."""
    before=app(ADMIN)
    origin='https://'+before['properties']['configuration']['ingress']['fqdn']
    require(chunks(ADMIN_HOST+'/sign-in')==chunks(origin+'/sign-in'),'admin.craves.in is not served by '+ADMIN+'; deployment stopped')
    old=resolve_image(image(before))
    env=environment(app(WEB))
    public={key:env[key]['value'] for key in FIREBASE if env.get(key,{}).get('value') and not env[key].get('secretRef')}
    require(len(public)==len(FIREBASE),'Missing public admin build setting')
    public.update(NEXT_PUBLIC_RAZORPAY_MODE='production',NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK='false')
    if env.get('NEXT_PUBLIC_SYNCFUSION_LICENSE_KEY',{}).get('value'):public['NEXT_PUBLIC_SYNCFUSION_LICENSE_KEY']=env['NEXT_PUBLIC_SYNCFUSION_LICENSE_KEY']['value']
    target=build_image(source,'apps/customer-web-next','craves/admin-web',sha,public,dockerfile='Dockerfile.admin')
    source_guard(source,sha,run_id)
    current=app(ADMIN)
    require(runtime.stable(current)==runtime.stable(before) and image(current)==image(before),'Concurrent admin runtime change; deployment stopped')
    receipt={'app':ADMIN,'sourceSha':sha,'image':target,'previousImage':old}
    output.write_text(json.dumps(receipt,indent=2)+'\n')
    if image(current)!=target:azure('containerapp','update','-g',RG,'-n',ADMIN,'--image',target,'--no-wait')
    try:
        for attempt in range(120):
            current=app(ADMIN)
            require(runtime.stable(current)==runtime.stable(before),'Unrelated admin runtime setting changed; stop')
            if admin_settled(current,target):
                try:
                    admin_verified(current);verify_image(image(current),sha)
                    print(json.dumps({**receipt,'verified':True}),flush=True);return
                except ValueError:pass
            print('Waiting for the reviewed admin revision: '+str(attempt+1),flush=True);time.sleep(10)
        raise ValueError('Admin deployment did not become verifiable within twenty minutes')
    except Exception:
        print('Restoring the previous admin image; other settings remain unchanged.',flush=True)
        azure('containerapp','update','-g',RG,'-n',ADMIN,'--image',old,'--no-wait')
        raise RuntimeError('Admin release failed; previous admin image restore requested, verify Azure revisions')


def deploy_image_only(name,label,service,source,sha,run_id,output):
    """Image-only update of one app from the reviewed source; secrets and settings are untouched."""
    before=app(name)
    require(before['properties']['configuration'].get('activeRevisionsMode')=='Single',label.capitalize()+' must run in single-revision mode for an image swap')
    old=resolve_image(image(before))
    target=build_image(source,'services/'+service,'craves/'+service,sha)
    source_guard(source,sha,run_id)
    current=app(name)
    require(runtime.stable(current)==runtime.stable(before) and image(current)==image(before),'Concurrent '+label+' runtime change; deployment stopped')
    receipt={'app':name,'sourceSha':sha,'image':target,'previousImage':old}
    output.write_text(json.dumps(receipt,indent=2)+'\n')
    if image(current)!=target:azure('containerapp','update','-g',RG,'-n',name,'--image',target,'--no-wait')
    try:
        for attempt in range(90):
            current=app(name)
            require(runtime.stable(current)==runtime.stable(before),'Unrelated '+label+' runtime setting changed; stop')
            if admin_settled(current,target):
                verify_image(image(current),sha);print(json.dumps({**receipt,'verified':True}),flush=True);return
            print('Waiting for the reviewed '+label+' revision: '+str(attempt+1),flush=True);time.sleep(10)
        raise ValueError(label.capitalize()+' revision did not become ready within fifteen minutes')
    except Exception:
        print('Restoring the previous '+label+' image; other settings remain unchanged.',flush=True)
        azure('containerapp','update','-g',RG,'-n',name,'--image',old,'--no-wait')
        raise RuntimeError(label.capitalize()+' release failed; previous '+label+' image restore requested, verify Azure revisions')


def deploy_notification(source,sha,run_id,output):
    # Its ACS secret is a plain app secret, which the preserve-runtime backend helper refuses.
    deploy_image_only(NOTIFICATION,'notification','notification-service',source,sha,run_id,output)


def deploy_catalog(source,sha,run_id,output):
    """Catalog image from the reviewed source, then its chef photo APIM operations (remove, set cover)."""
    deploy_image_only(CATALOG,'catalog','catalog-service',source,sha,run_id,output)
    run('bash',str(source/'scripts/apim/configure-chef-menu-media-apim.sh'),env=dict(os.environ,RG=RG,APIM=APIM,CATALOG_APP=CATALOG))
    print('Chef menu photo operations published.',flush=True)


def configure_media(output):
    """Dish photos: a separate storage account whose `media` container serves single photos publicly
    (no listing). The KYC documents account stays private. Catalog gets the connection as a plain app
    secret, like its other secrets; the value is passed by file, never in arguments or logs."""
    before=app(CATALOG)
    require(before['properties']['configuration'].get('activeRevisionsMode')=='Single','Catalog must run in single-revision mode')
    accounts={a['name']:a for a in azure('storage','account','list','-g',RG)}
    if MEDIA_ACCOUNT not in accounts:
        require(azure('storage','account','check-name','-n',MEDIA_ACCOUNT)['nameAvailable'] is True,'Photo storage name is taken outside Craves')
        azure('storage','account','create','-g',RG,'-n',MEDIA_ACCOUNT,'-l','centralindia','--sku','Standard_LRS','--kind','StorageV2',
              '--https-only','true','--min-tls-version','TLS1_2','--allow-blob-public-access','true',
              '--tags','project=craves','environment=prodlow','craves-purpose=dish-photos')
    else:require(accounts[MEDIA_ACCOUNT].get('allowBlobPublicAccess') is True,'Photo storage must allow public photo reads')
    exists=azure('storage','container-rm','exists','-g',RG,'--storage-account',MEDIA_ACCOUNT,'-n',MEDIA_CONTAINER)['exists']
    azure('storage','container-rm','update' if exists else 'create','-g',RG,'--storage-account',MEDIA_ACCOUNT,'-n',MEDIA_CONTAINER,'--public-access','blob')
    conn=run('az','storage','account','show-connection-string','-g',RG,'-n',MEDIA_ACCOUNT,'--query','connectionString','-o','tsv','--only-show-errors')
    require(conn.startswith('DefaultEndpointsProtocol=https;') and ';AccountName='+MEDIA_ACCOUNT+';' in conn,'Unexpected photo storage connection')
    # Prove anonymous single-photo reads work and listing stays closed before Catalog depends on it.
    probe=f'https://{MEDIA_ACCOUNT}.blob.core.windows.net/{MEDIA_CONTAINER}/health/probe.txt'
    with tempfile.TemporaryDirectory(prefix='craves-media-') as folder:
        body=Path(folder)/'probe.txt';body.write_text('craves')
        run('az','storage','blob','upload','-c',MEDIA_CONTAINER,'-n','health/probe.txt','-f',str(body),'--overwrite','--only-show-errors','-o','none',
            env=dict(os.environ,AZURE_STORAGE_CONNECTION_STRING=conn))
        secret=Path(folder)/'secret';secret.write_text(conn);secret.chmod(0o600)
        if MEDIA_SECRET not in {s['name'] for s in before['properties']['configuration'].get('secrets',[])}:
            run('az','containerapp','secret','set','-g',RG,'-n',CATALOG,'--secrets',MEDIA_SECRET+'=@'+str(secret),'--only-show-errors','-o','none')
    for attempt in range(6):  # container access changes can take ~30 s to apply
        if inspect.probe(probe)[0]==200:break
        time.sleep(10)
    else:raise ValueError('Photos are not publicly readable')
    require(inspect.probe(f'https://{MEDIA_ACCOUNT}.blob.core.windows.net/{MEDIA_CONTAINER}?restype=container&comp=list')[0] in (403,404),'Photo container must not be listable')
    def setting(entry):return 'secretref:'+entry['secretRef'] if entry.get('secretRef') else entry.get('value')
    env=environment(app(CATALOG))
    missing=[k+'='+v for k,v in MEDIA_ENV.items() if k not in env or setting(env[k])!=v]
    if missing:azure('containerapp','update','-g',RG,'-n',CATALOG,'--set-env-vars',*missing,'--no-wait')
    receipt={'app':CATALOG,'storageAccount':MEDIA_ACCOUNT,'container':MEDIA_CONTAINER,'publicRead':'blob','settingsAdded':[m.split('=')[0] for m in missing]}
    output.write_text(json.dumps(receipt,indent=2)+'\n')
    for attempt in range(90):
        current=app(CATALOG)
        require(image(current)==image(before),'Catalog image changed during photo storage setup; stop')
        if admin_settled(current,image(before)) and all(k in environment(current) for k in MEDIA_ENV):
            print(json.dumps({**receipt,'readyRevision':current['properties']['latestReadyRevisionName']}),flush=True);return
        print('Waiting for the Catalog revision with photo storage: '+str(attempt+1),flush=True);time.sleep(10)
    raise ValueError('Catalog revision with photo storage did not become ready within fifteen minutes')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--operation',choices=('preflight','backend','apim','web','activate','media','catalog'),default='preflight')
    parser.add_argument('--sha',required=True);parser.add_argument('--regression-run',required=True)
    parser.add_argument('--confirm',action='store_true');parser.add_argument('--allow-bank-unavailable',action='store_true');parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();source=Path.cwd()
    require(args.operation=='preflight' or args.confirm,'Explicit Chef release confirmation required')
    source_guard(source,args.sha,args.regression_run);args.output.mkdir(parents=True,exist_ok=True)
    inspect.ROOT=source
    if args.operation=='preflight':
        report=preflight();(args.output/'chef-preflight.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
    elif args.operation=='backend':
        release_images(source,args.sha,args.regression_run,args.output/'chef-images.json')
        deploy_notification(source,args.sha,args.regression_run,args.output/'notification.json')
    elif args.operation=='apim':
        applied(preflight())
        for name in (BANK,CHEF):verify_image(image(app(name)),args.sha)
        run('bash',str(source/'scripts/apim/configure-chef-onboarding-v2-apim.sh'),env=dict(os.environ,CONFIRM_APIM_WRITE='true'))
        run('python3',str(source/'scripts/finance/configure_chef_ifsc_apim.py'),'--apply','--expected-source-sha',args.sha,'--output',str(args.output/'chef-ifsc-apim.json'))
        print('Chef onboarding and authenticated IFSC operations published.',flush=True)
    elif args.operation=='web':
        applied(preflight());deploy_web(source,args.sha,args.regression_run,args.output/'chef-web.json')
        deploy_admin(source,args.sha,args.regression_run,args.output/'chef-admin.json')
    elif args.operation=='media':configure_media(args.output/'catalog-media.json')
    elif args.operation=='catalog':deploy_catalog(source,args.sha,args.regression_run,args.output/'catalog.json')
    else:activate(args.sha,args.output/'chef-activation.json',args.allow_bank_unavailable)

if __name__=='__main__':
    try:main()
    except Exception as error:raise SystemExit(str(error) if isinstance(error,(ValueError,RuntimeError)) else 'Chef release stopped; private details suppressed')
