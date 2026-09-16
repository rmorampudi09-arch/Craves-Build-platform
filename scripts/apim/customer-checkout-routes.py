"""Publish only the atomic checkout operation read/write pair after the pinned Order rollout."""
import argparse
import importlib.util
from pathlib import Path
import xml.etree.ElementTree as ET

spec=importlib.util.spec_from_file_location('safe',Path(__file__).with_name('device-safe-cart-routes.py'))
safe=importlib.util.module_from_spec(spec);spec.loader.exec_module(safe)
ROUTES=[('execute-checkout-operation','POST'),('get-checkout-operation','GET')]
PATH='/operations/{operationId}'

def policy(origin):
    root=ET.fromstring(safe.policy(origin,PATH))
    root.find('inbound/set-backend-service').set('base-url',origin+'/api/v1/checkout')
    return ET.tostring(root,encoding='unicode')

def main(expected,apply=False):
    safe.require(safe.az('account','show')['id']==safe.SUB,'Wrong subscription')
    origin=safe.runtime(expected)
    base=f'https://management.azure.com/subscriptions/{safe.SUB}/resourceGroups/{safe.RG}/providers/Microsoft.ApiManagement/service/{safe.APIM}'
    safe.read_policies(base)
    owners=[api for api in safe.az('apim','api','list','-g',safe.RG,'--service-name',safe.APIM) if api['path'].strip('/')=='api/v1/checkout']
    safe.require(len(owners)==1 and owners[0]['name']=='craves-checkout-v1','Unexpected checkout API ownership')
    api=owners[0];scope=base+'/apis/'+api['name']
    safe.require(api.get('subscriptionRequired') is False,'Unexpected checkout gateway security')
    safe.require(api['serviceUrl'].rstrip('/')==origin+'/api/v1/checkout','Unexpected checkout backend')
    safe.read_policies(scope)
    before=safe.rest('get',scope+'/operations')['value'];rule=policy(origin)
    for name,method in ROUTES:
        for op in before:
            p=op['properties'];same=p['method']==method and p['urlTemplate']==PATH
            safe.require(not same or op['name']==name,'Checkout operation owner conflict')
            safe.require(op['name']!=name or same,'Checkout operation ID conflict')
            if same:
                policies=safe.read_policies(scope+'/operations/'+name)
                safe.require(len(policies)==1 and safe.canonical_policy(policies[0]['properties']['value'])==safe.canonical_policy(rule),'Existing checkout policy differs')
    print('CHECKOUT_PREFLIGHT_PASSED: pricing, payment and existing checkout operations untouched')
    if not apply:return
    safe.require(safe.runtime(expected)==origin,'Runtime changed')
    for name,method in ROUTES:
        safe.require(safe.http_status(origin+'/api/v1/checkout/operations/00000000-0000-4000-8000-000000000001',method) in (401,403),'Checkout auth guard absent')
        target=scope+'/operations/'+name
        safe.rest('put',target,{'properties':{'displayName':name.replace('-',' '),'method':method,'urlTemplate':PATH,
            'templateParameters':[{'name':'operationId','type':'string','required':True}],
            'responses':[{'statusCode':code} for code in (200,400,401,403,404,409,503)]}})
        safe.rest('put',target+'/policies/policy',{'properties':{'format':'xml','value':rule}})
        safe.require(safe.canonical_policy(safe.rest('get',target+'/policies/policy')['properties']['value'])==safe.canonical_policy(rule),'Checkout policy readback mismatch')
    after={op['name']:op['properties'] for op in safe.rest('get',scope+'/operations')['value']}
    owned={name for name,_ in ROUTES}
    safe.require(all(after.get(op['name'])==op['properties'] for op in before if op['name'] not in owned),'Unrelated checkout operation changed')
    for name,method in ROUTES:
        safe.require(after[name]['method']==method and after[name]['urlTemplate']==PATH,'Checkout route readback mismatch')
    print('CHECKOUT_GATEWAY_VERIFIED: no real checkout or payment created')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--expected-image',required=True);parser.add_argument('--apply',action='store_true')
    args=parser.parse_args();main(args.expected_image,args.apply)
