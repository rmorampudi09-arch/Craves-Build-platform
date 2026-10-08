"""Publish only authenticated IFSC lookup, preserving the existing bank enrollment APIs."""
import argparse
import json
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET
from configure_bank_apim import pages, url, put, privacy_guard, policy_structure, protected_status
from configure_bank_runtime import az, origin, GuardError

SUB = '721906c9-4a72-4606-830b-d3e7ace093ff'
TENANT = '1e7e43ac-c7f5-4d47-a74f-289a7cc21508'
RG = 'rg-craves-prodlow-centralindia'
APIM = 'apim-craves-prodlow-kmqgfy'
APP = 'ca-craves-integration-service-pr'
API = 'craves-bank-ifsc-v1'
PATH = 'api/v1/chef-onboarding/bank/ifsc'
OWNER = 'Craves authenticated Chef IFSC directory v1'
PARAM = {'name': 'ifsc', 'type': 'string', 'required': True}

def check_owner(apis):
    matches = [a for a in apis if a.get('name','').split(';')[0] == API or a.get('properties',{}).get('path','').strip('/') == PATH]
    if len(matches) > 1: raise GuardError('IFSC path ownership is ambiguous')
    if not matches: return None
    item = matches[0]
    if item['name'] != API or item['properties'].get('path','').strip('/') != PATH or item['properties'].get('description') != OWNER:
        raise GuardError('IFSC path belongs to another API')
    return item

def policy(backend):
    root=ET.Element('policies'); inbound=ET.SubElement(root,'inbound');ET.SubElement(inbound,'base')
    when=ET.SubElement(ET.SubElement(inbound,'choose'),'when',{'condition':'@(!context.Request.Headers.GetValueOrDefault("Authorization", "").StartsWith("Bearer "))'})
    response=ET.SubElement(when,'return-response');ET.SubElement(response,'set-status',{'code':'401','reason':'Unauthorized'})
    ET.SubElement(inbound,'set-backend-service',{'base-url':backend})
    ET.SubElement(inbound,'rewrite-uri',{'template':'@("/api/v1/chef-onboarding/bank/ifsc/" + context.Request.MatchedParameters["ifsc"])','copy-unmatched-params':'false'})
    ET.SubElement(ET.SubElement(root,'backend'),'base')
    outbound=ET.SubElement(root,'outbound');ET.SubElement(outbound,'base')
    ET.SubElement(ET.SubElement(outbound,'set-header',{'name':'Cache-Control','exists-action':'override'}),'value').text='private, no-store'
    ET.SubElement(ET.SubElement(root,'on-error'),'base')
    return ET.tostring(root,encoding='unicode')

def check_operations(base, operations, complete=False):
    if len(operations)>1 or complete and len(operations)!=1: raise GuardError('Unexpected IFSC operations')
    for item in operations:
        props=item['properties']
        if item['name']!='ifsc-get' or props.get('method')!='GET' or props.get('urlTemplate')!='/{ifsc}':
            raise GuardError('Unexpected IFSC operation contract')
        params=props.get('templateParameters',[])
        if len(params)!=1 or any(params[0].get(k)!=v for k,v in PARAM.items()): raise GuardError('IFSC parameter differs')
        if pages(url(base,'/operations/ifsc-get/policies')): raise GuardError('Unexpected IFSC operation policy')

def check_policies(existing, policies, expected, backend):
    """Allow only the exact known rawxml encoding defect on a still-gated owned API."""
    if len(policies)>1: raise GuardError('Unexpected IFSC policies')
    expected_structure=policy_structure(expected)
    legacy=ET.fromstring(expected)
    for node, attribute in ((legacy.find('./inbound/choose/when'),'condition'),
                            (legacy.find('./inbound/rewrite-uri'),'template')):
        node.set(attribute,node.get(attribute).replace('"','&quot;'))
    legacy_structure=policy_structure(ET.tostring(legacy,encoding='unicode'))
    for item in policies:
        actual=policy_structure(item['properties'].get('value'))
        if actual==expected_structure: continue
        props=(existing or {}).get('properties',{})
        if (props.get('subscriptionRequired') is not True or props.get('serviceUrl')!=backend
                or props.get('protocols')!=['https'] or actual!=legacy_structure):
            raise GuardError('Existing IFSC policy differs')

def publish_policy(api_base, expected):
    # ElementTree encodes quotes in expressions. APIM xml decodes those entities;
    # rawxml instead retains them inside the expression and breaks its semantics.
    put(url(api_base,'/policies/policy'),{'properties':{'format':'xml','value':expected}})

def check_api(base,backend,subscription):
    item=az('rest','--method','get','--url',url(base,''),'--headers','Accept=application/json')
    check_owner([item]);props=item['properties']
    if props.get('serviceUrl')!=backend or props.get('protocols')!=['https'] or props.get('subscriptionRequired') is not subscription:
        raise GuardError('IFSC API configuration differs')

def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true');parser.add_argument('--expected-source-sha',required=True)
    parser.add_argument('--output',default='chef-ifsc-apim.json');args=parser.parse_args(argv)
    sha=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
    if sha!=args.expected_source_sha: raise GuardError('IFSC requires exact reviewed source')
    account=az('account','show')
    if account.get('id')!=SUB or account.get('tenantId')!=TENANT: raise GuardError('Wrong Azure account')
    app=az('containerapp','show','-g',RG,'-n',APP);props=app['properties']
    if props.get('runningStatus')!='Running' or props.get('latestRevisionName')!=props.get('latestReadyRevisionName'):
        raise GuardError('Bank service rollout is unsettled')
    backend=origin(app);service=az('apim','show','-g',RG,'-n',APIM)
    base=f'https://management.azure.com/subscriptions/{SUB}/resourceGroups/{RG}/providers/Microsoft.ApiManagement/service/{APIM}'
    api_base=base+'/apis/'+API;existing=check_owner(pages(url(base,'/apis')))
    privacy_guard(pages(url(base,'/policies')),pages(url(base,'/diagnostics')))
    policies=pages(url(api_base,'/policies')) if existing else []
    privacy_guard(policies,pages(url(api_base,'/diagnostics')) if existing else [])
    expected=policy(backend)
    check_policies(existing,policies,expected,backend)
    check_operations(api_base,pages(url(api_base,'/operations')) if existing else [])
    Path(args.output).write_text(json.dumps({'sourceSha':sha,'mode':'APPLY' if args.apply else 'PLAN_ONLY','api':API,'path':PATH,'backend':backend,'existingBankApisChanged':False},indent=2)+'\n')
    if not args.apply: return
    protected_status(backend+'/'+PATH+'/HDFC0001234')
    properties={'path':PATH,'displayName':API,'description':OWNER,'serviceUrl':backend,'protocols':['https'],'subscriptionRequired':True}
    if not existing: put(url(api_base,''),{'properties':properties},create=True)
    put(url(api_base,'/operations/ifsc-get'),{'properties':{'displayName':'Authenticated IFSC lookup','method':'GET','urlTemplate':'/{ifsc}','templateParameters':[PARAM],'responses':[]}})
    publish_policy(api_base,expected)
    check_api(api_base,backend,True if not existing else existing['properties']['subscriptionRequired'])
    check_operations(api_base,pages(url(api_base,'/operations')),complete=True)
    actual=pages(url(api_base,'/policies'))
    if len(actual)!=1 or policy_structure(actual[0]['properties'].get('value'))!=policy_structure(expected): raise GuardError('IFSC policy readback differs')
    properties['subscriptionRequired']=False;put(url(api_base,''),{'properties':properties});check_api(api_base,backend,False)
    protected_status(service['gatewayUrl'].rstrip('/')+'/'+PATH+'/HDFC0001234')
    print('Authenticated Chef IFSC lookup published; existing bank routes preserved.')

if __name__=='__main__':
    try: main()
    except Exception as error: raise SystemExit(str(error) if isinstance(error,GuardError) else 'IFSC publication stopped; private details suppressed')
