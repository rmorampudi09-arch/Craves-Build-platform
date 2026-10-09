"""Release only Chef onboarding in the existing rmorampudi09 production resources."""
import argparse
import copy
import json
import os
from pathlib import Path
import re
import time
from active_address_release import (SUBSCRIPTION, RG, CHEF, WEB, APIM, ACR, FIREBASE, app, azure, run,
    source_guard, build_image, verify_image, resolve_image, deploy_web, ready_web, environment, inspect, runtime, require)

BANK='ca-craves-integration-service-pr'
# Email verification codes are sent by Notification; released with the backend so it tracks reviewed main.
NOTIFICATION='ca-craves-notification-service-p'
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
    snapshots={name:app(name) for name in (BANK,CHEF,NOTIFICATION)}
    helper=source/'scripts/release/deploy-single-service-preserve-runtime.sh'
    guard_env=dict(os.environ,DEPLOY_PREFLIGHT_ONLY='true',READY_ATTEMPTS='150',READY_SLEEP_SECONDS='10')
    for name in (BANK,CHEF,NOTIFICATION):run('bash',str(helper),RG,name,image(snapshots[name]),'chef-onboarding',env=guard_env)
    run('az','acr','login','-n',ACR,'--only-show-errors')
    receipts=[]
    for name,service in ((BANK,'integration-service'),(CHEF,'user-chef-service'),(NOTIFICATION,'notification-service')):
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
    print('Chef, bank and notification images deployed; exact migrations and unchanged runtime verified.',flush=True)


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


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--operation',choices=('preflight','backend','apim','web','activate'),default='preflight')
    parser.add_argument('--sha',required=True);parser.add_argument('--regression-run',required=True)
    parser.add_argument('--confirm',action='store_true');parser.add_argument('--allow-bank-unavailable',action='store_true');parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();source=Path.cwd()
    require(args.operation=='preflight' or args.confirm,'Explicit Chef release confirmation required')
    source_guard(source,args.sha,args.regression_run);args.output.mkdir(parents=True,exist_ok=True)
    inspect.ROOT=source
    if args.operation=='preflight':
        report=preflight();(args.output/'chef-preflight.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
    elif args.operation=='backend':release_images(source,args.sha,args.regression_run,args.output/'chef-images.json')
    elif args.operation=='apim':
        applied(preflight())
        for name in (BANK,CHEF):verify_image(image(app(name)),args.sha)
        run('bash',str(source/'scripts/apim/configure-chef-onboarding-v2-apim.sh'),env=dict(os.environ,CONFIRM_APIM_WRITE='true'))
        run('python3',str(source/'scripts/finance/configure_chef_ifsc_apim.py'),'--apply','--expected-source-sha',args.sha,'--output',str(args.output/'chef-ifsc-apim.json'))
        print('Chef onboarding and authenticated IFSC operations published.',flush=True)
    elif args.operation=='web':
        applied(preflight());deploy_web(source,args.sha,args.regression_run,args.output/'chef-web.json')
        deploy_admin(source,args.sha,args.regression_run,args.output/'chef-admin.json')
    else:activate(args.sha,args.output/'chef-activation.json',args.allow_bank_unavailable)

if __name__=='__main__':
    try:main()
    except Exception as error:raise SystemExit(str(error) if isinstance(error,(ValueError,RuntimeError)) else 'Chef release stopped; private details suppressed')
