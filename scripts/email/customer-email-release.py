"""Narrow customer-email preflight/activation. No secret values, identities or codes are printed."""
import argparse
import copy
import importlib.util
import re
import time
import xml.etree.ElementTree as ET
from pathlib import Path

spec = importlib.util.spec_from_file_location('safe', Path(__file__).parents[1] / 'apim/device-safe-cart-routes.py')
safe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(safe)
REGISTRY = 'cravesprodlowacr82121.azurecr.io/craves/'
APPS = {'notification-service':'ca-craves-notification-service-p',
        'auth-service':'ca-craves-auth-service-prodlow', 'user-chef-service':'ca-craves-user-chef-service-prod'}
PREVIOUS = {
    'notification-service': REGISTRY+'notification-service@sha256:bb15cc81121173ef2c701f2edc4e967a7cf7ed4fb26f5e5cb4fae1d777145b44',
    'auth-service': REGISTRY+'auth-service:referral-151c36cb2afaaf7b8482ee784704d983f7d87324',
    'user-chef-service': REGISTRY+'user-chef-service@sha256:fa546c94af8eb329593d158589e0bffee96e19d6f84a55f937032de1f74fa93d'}
FLAGS = {'notification-service':['CRAVES_EMAIL_VERIFICATION_TRANSPORT_ENABLED'],
         'auth-service':['CRAVES_EMAIL_VERIFICATION_ENABLED','CRAVES_EMAIL_PROJECTION_WORKER_ENABLED'], 'user-chef-service':[]}
KEYS = {'notification-service':['CRAVES_EMAIL_VERIFICATION_INTERNAL_KEY'],
        'auth-service':['CRAVES_EMAIL_VERIFICATION_HMAC_KEY','CRAVES_EMAIL_VERIFICATION_INTERNAL_KEY','CRAVES_EMAIL_PROJECTION_INTERNAL_KEY'],
        'user-chef-service':['CRAVES_EMAIL_PROJECTION_INTERNAL_KEY']}
ROUTES = [('email-verification-state','GET','/email-verification'),
          ('email-verification-issue','POST','/email-verification/challenges'),
          ('email-verification-confirm','POST','/email-verification/verify'),
          ('email-verification-resend','POST','/email-verification/resend')]

def snapshot(service):
    return safe.az('containerapp','show','-g',safe.RG,'-n',APPS[service])

def env(app):
    return {item['name']:item for item in app['properties']['template']['containers'][0].get('env',[])}

def origin(app):
    return 'https://' + app['properties']['configuration']['ingress']['fqdn']

def normalized_env(container):
    # Azure's app/revision endpoints differ in ordering and omitted null fields.
    items=container.get('env',[])
    safe.require(len({item['name'] for item in items})==len(items), 'Duplicate environment names')
    return {item['name']:{key:value for key,value in item.items() if value is not None}
            for item in items}

def healthy(service, app, image):
    props=app['properties']
    safe.require(len(props['template']['containers'])==1, 'Unexpected multi-container app')
    safe.require(props['template']['containers'][0]['image']==image, 'Concurrent image change: '+service)
    safe.require(props['latestRevisionName']==props['latestReadyRevisionName'], 'Rollout is still pending: '+service)
    safe.require(props['configuration'].get('activeRevisionsMode')=='Single', 'Unexpected traffic mode')
    revision=safe.az('containerapp','revision','show','-g',safe.RG,'-n',APPS[service],'--revision',props['latestRevisionName'])
    actual=revision['properties']['template']['containers'][0]
    wanted=normalized_env(props['template']['containers'][0]); ready=normalized_env(actual)
    differences=sorted(key for key in wanted.keys() | ready.keys() if wanted.get(key)!=ready.get(key))
    safe.require(actual['image']==image and not differences,
        'Ready revision differs from requested runtime: '+service+'; image_matches='+str(actual['image']==image)+'; setting_names='+','.join(differences))
    safe.require(revision['properties']['healthState']=='Healthy', 'Revision is not healthy: '+service)
    safe.require(safe.http_status(origin(app)+'/actuator/health')==200, 'Health probe failed: '+service)

def preserved(app, service):
    template=copy.deepcopy(app['properties']['template'])
    template.pop('revisionSuffix',None)
    template['containers'][0]['env']=sorted((item for item in template['containers'][0].get('env',[]) if item['name'] not in FLAGS[service]),key=lambda item:item['name'])
    config=copy.deepcopy(app['properties']['configuration'])
    config.get('ingress',{}).pop('traffic',None)
    return template,config,app.get('identity')

def route_plan(app):
    base=f'https://management.azure.com/subscriptions/{safe.SUB}/resourceGroups/{safe.RG}/providers/Microsoft.ApiManagement/service/{safe.APIM}'
    safe.read_policies(base)
    apis=safe.az('apim','api','list','-g',safe.RG,'--service-name',safe.APIM)
    owners=[api for api in apis if api['path'].strip('/')=='api/v1/auth']
    safe.require(len(owners)==1 and owners[0]['name']=='craves-auth-v1', 'Auth API ownership changed')
    api=owners[0]; scope=base+'/apis/'+api['name']
    safe.require(api.get('subscriptionRequired') is False, 'Auth gateway security changed')
    safe.require(api['serviceUrl'].rstrip('/')==origin(app)+'/api/v1/auth', 'Auth API backend changed')
    safe.read_policies(scope)
    before=safe.rest('get',scope+'/operations')['value']
    for name,method,path in ROUTES:
        for op in before:
            p=op['properties']; same=p['method']==method and p['urlTemplate']==path
            safe.require(not same or op['name']==name, 'Email route owner conflict')
            safe.require(op['name']!=name or same, 'Operation id conflict')
            if same:
                policies=safe.read_policies(scope+'/operations/'+name)
                safe.require(len(policies)==1 and safe.canonical_policy(policies[0]['properties']['value'])==safe.canonical_policy(route_policy(origin(app),path)), 'Existing email policy differs')
    return scope,before

def route_policy(service_origin,path):
    root=ET.fromstring(safe.policy(service_origin,path))
    root.find('inbound/set-backend-service').set('base-url',service_origin+'/api/v1/auth')
    return ET.tostring(root,encoding='unicode')

def publish(app):
    scope,before=route_plan(app)
    for name,method,path in ROUTES:
        # These probes contain no customer credentials and cannot issue email.
        safe.require(safe.http_status(origin(app)+'/api/v1/auth'+path,method) in (401,403), 'Email backend auth guard not verified')
        target=scope+'/operations/'+name
        safe.rest('put',target,{'properties':{'displayName':name.replace('-',' '),'method':method,'urlTemplate':path,
            'responses':[{'statusCode':code} for code in (200,202,400,401,403,409,429,503)]}})
        policy=route_policy(origin(app),path)
        safe.rest('put',target+'/policies/policy',{'properties':{'format':'xml','value':policy}})
        safe.require(safe.canonical_policy(safe.rest('get',target+'/policies/policy')['properties']['value'])==safe.canonical_policy(policy), 'Email policy readback mismatch')
    after={op['name']:op['properties'] for op in safe.rest('get',scope+'/operations')['value']}
    owned={name for name,_,_ in ROUTES}
    safe.require(all(after.get(op['name'])==op['properties'] for op in before if op['name'] not in owned), 'Unrelated Auth route changed')
    for name,method,path in ROUTES:
        safe.require(after[name]['method']==method and after[name]['urlTemplate']==path, 'Email operation readback mismatch')
    print('EMAIL_GATEWAY_VERIFIED: four authenticated operations; no codes requested')

def set_flags(service, before, enabled):
    names=FLAGS[service]
    if not names: return before
    safe.require(preserved(snapshot(service),service)==preserved(before,service), 'Runtime drift before flag change')
    safe.az('containerapp','update','-g',safe.RG,'-n',APPS[service],'--set-env-vars',
        *[name+'='+str(enabled).lower() for name in names],'--no-wait',write=True)
    image=before['properties']['template']['containers'][0]['image']
    for attempt in range(120):
        app=snapshot(service)
        safe.require(preserved(app,service)==preserved(before,service), 'Unrelated runtime changed')
        props=app['properties']
        if props['latestRevisionName']==props['latestReadyRevisionName'] and all(env(app).get(name,{}).get('value')==str(enabled).lower() for name in names):
            try:
                healthy(service,app,image)
                print('EMAIL_FLAGS_VERIFIED: '+service+' enabled='+str(enabled).lower())
                return app
            except RuntimeError:
                pass
        if attempt % 12 == 0: print('Waiting for email feature readiness: '+service,flush=True)
        time.sleep(5)
    raise RuntimeError('Email flag rollout not verified: '+service)

def main(sha, activate=False):
    safe.require(safe.az('account','show')['id']==safe.SUB, 'Wrong subscription')
    safe.require(re.fullmatch('[0-9a-f]{40}',sha) is not None, 'Full source SHA required')
    apps={}
    for service in APPS:
        app=snapshot(service);apps[service]=app
        expected=REGISTRY+service+':customer-email-'+sha if activate else PREVIOUS[service]
        healthy(service,app,expected)
        settings=env(app)
        safe.require(all(settings.get(key,{}).get('secretRef') for key in KEYS[service]), 'Scoped key reference missing: '+service)
        safe.require(all(settings.get(key,{}).get('value')=='false' for key in FLAGS[service]), 'Email gates not closed before reviewed release')
    auth=env(apps['auth-service'])
    safe.require(auth.get('CRAVES_EMAIL_NOTIFICATION_BASE_URL',{}).get('value','').rstrip('/')==origin(apps['notification-service']), 'Wrong verification destination')
    safe.require(auth.get('CRAVES_EMAIL_USER_CHEF_BASE_URL',{}).get('value','').rstrip('/')==origin(apps['user-chef-service']), 'Wrong projection destination')
    safe.require(auth.get('CRAVES_EMAIL_VERIFICATION_ALLOW_LOCAL_HTTP',{}).get('value')=='false', 'Email HTTPS enforcement must remain enabled')
    safe.require(env(apps['notification-service']).get('CRAVES_NOTIFICATION_EMAIL_ENABLED',{}).get('value')=='true', 'Existing email provider disabled')
    route_plan(apps['auth-service'])
    print('EMAIL_PREFLIGHT_PASSED: pinned healthy services, scoped references, closed gates and exact origins')
    if not activate: return
    changed=[]
    try:
        for service in ('notification-service','auth-service'):
            changed.append(service)
            apps[service]=set_flags(service,apps[service],True)
        publish(apps['auth-service'])
    except Exception:
        for service in reversed(changed):
            try: set_flags(service,apps[service],False)
            except Exception: print('EMAIL_FLAG_RECOVERY_NOT_VERIFIED: '+service)
        raise
    print('EMAIL_RELEASE_READY_FOR_CUSTOMER_ACCEPTANCE; no production verification challenge was sent')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--source',required=True);parser.add_argument('--activate',action='store_true')
    args=parser.parse_args();main(args.source,args.activate)
