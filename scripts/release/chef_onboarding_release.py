"""Release only Chef onboarding in the existing rmorampudi09 production resources."""
import argparse
import copy
import json
import os
from pathlib import Path
import time
from active_address_release import (SUBSCRIPTION, RG, CHEF, WEB, APIM, ACR, app, azure, run,
    source_guard, build_image, verify_image, deploy_web, ready_web, environment, inspect, runtime, require)

BANK='ca-craves-integration-service-pr'
FLAG='CRAVES_CHEF_ONBOARDING_V2_ENABLED'
BASE='CRAVES_BANK_INTEGRATION_BASE_URL'


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
            if code==200:return current
        time.sleep(10)
    raise ValueError('Chef activation revision did not become healthy')


def activate(sha,output):
    report=preflight();applied(report);bank=app(BANK);bank_available(bank,report)
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
            if name==WEB:ready_web(current)
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
    output.write_text(json.dumps({'sourceSha':sha,'activation':receipts},indent=2)+'\n')
    print('Chef onboarding activated; both healthy revisions and unrelated runtime verified.',flush=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--operation',choices=('preflight','backend','apim','web','activate'),default='preflight')
    parser.add_argument('--sha',required=True);parser.add_argument('--regression-run',required=True)
    parser.add_argument('--confirm',action='store_true');parser.add_argument('--output',type=Path,required=True)
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
    elif args.operation=='web':applied(preflight());deploy_web(source,args.sha,args.regression_run,args.output/'chef-web.json')
    else:activate(args.sha,args.output/'chef-activation.json')

if __name__=='__main__':
    try:main()
    except Exception as error:raise SystemExit(str(error) if isinstance(error,(ValueError,RuntimeError)) else 'Chef release stopped; private details suppressed')
