#!/usr/bin/env python3
"""Plan/apply only the existing Integration refund gates with exact source/runtime guards."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

RG='rg-craves-prodlow-centralindia'
APP='ca-craves-integration-service-pr'
SUB='4f897b61-9b52-44b4-8cf1-bdac281cc1aa'
PROTOCOL='RAZORPAY_REFUND_IDEMPOTENCY_V1'
FLAGS={
 'consumer':'CRAVES_REFUND_CONSUMER_ENABLED','publisher':'CRAVES_REFUND_STATUS_PUBLISHER_ENABLED',
 'create':'CRAVES_REFUND_PROVIDER_EXECUTION_ENABLED','reconcile':'CRAVES_REFUND_RECONCILIATION_ENABLED',
 'createApproved':'CRAVES_REFUND_PRODUCTION_PROVIDER_EXECUTION_APPROVED',
 'reconcileApproved':'CRAVES_REFUND_PRODUCTION_RECONCILIATION_APPROVED',
}
class GuardError(Exception):pass

def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def az(*args):
 result=subprocess.run(['az',*args,'--only-show-errors','-o','json'],capture_output=True,text=True,timeout=90)
 if result.returncode:raise GuardError('AZURE_OPERATION_FAILED_DETAILS_SUPPRESSED')
 try:return json.loads(result.stdout)
 except Exception:raise GuardError('AZURE_RESPONSE_INVALID')
def show():return az('containerapp','show','-g',RG,'-n',APP)
def environment(app):
 containers=app.get('properties',{}).get('template',{}).get('containers',[])
 if len(containers)!=1:raise GuardError('SINGLE_CONTAINER_REQUIRED')
 result={}
 for entry in containers[0].get('env',[]):
  if entry['name'] in result:raise GuardError('DUPLICATE_ENVIRONMENT_NAME')
  result[entry['name']]=entry
 return result

def preservation(app):
 value=copy.deepcopy(app)
 template=value['properties']['template']
 template.pop('revisionSuffix',None)
 template['containers'][0]['env']=[e for e in template['containers'][0].get('env',[]) if e['name'] not in FLAGS.values()]
 config=value['properties']['configuration']
 return digest({'template':template,'identity':value.get('identity'),'configuration':config})

def inspect(app,expected_image):
 if app.get('name')!=APP or not app.get('id','').lower().startswith('/subscriptions/'+SUB.lower()+'/'):
  raise GuardError('RESOURCE_SCOPE_MISMATCH')
 env=environment(app);p=app['properties'];t=p['template'];c=p['configuration']
 if t['containers'][0].get('image')!=expected_image:raise GuardError('REVIEWED_IMAGE_MISMATCH')
 scale=t.get('scale',{})
 if scale.get('minReplicas')!=1 or scale.get('maxReplicas')!=1:raise GuardError('EXACT_ONE_REPLICA_REQUIRED')
 if c.get('activeRevisionsMode')!='Single':raise GuardError('SINGLE_REVISION_MODE_REQUIRED')
 return env

def changes(stage):
 if stage=='pause':return {FLAGS['create']:'false',FLAGS['reconcile']:'false',FLAGS['createApproved']:'false',FLAGS['reconcileApproved']:'false'}
 if stage=='downstream':return {FLAGS[k]:('true' if k in ('consumer','publisher') else 'false') for k in FLAGS}
 if stage=='reconciliation':return {FLAGS['create']:'false',FLAGS['createApproved']:'false',FLAGS['reconcile']:'true',FLAGS['reconcileApproved']:'true'}
 if stage=='provider_execution':return {FLAGS['create']:'true',FLAGS['createApproved']:'true'}
 raise GuardError('UNKNOWN_STAGE')

def validate_readiness(stage,readiness,expected):
 if stage=='pause':return
 if readiness.get('dispatchProtocol')!=PROTOCOL:raise GuardError('PATCHED_REFUND_PROTOCOL_REQUIRED')
 if readiness.get('paymentProvider')!='RAZORPAY' or readiness.get('paymentEnvironment')!='PRODUCTION':raise GuardError('RAZORPAY_PRODUCTION_REQUIRED')
 for name,count in expected.items():
  if type(readiness.get(name)) is not int or readiness[name]!=count:raise GuardError('REVIEWED_EXPOSURE_CHANGED_'+name)
 if stage=='provider_execution':
  if any(readiness.get(k)!=0 for k in ['unknownOutcomeCount','historicalModeMismatchCount','processingRefundCount','statusOutboxDeadLetterCount','requestInboxFailureCount']):
   raise GuardError('UNRESOLVED_FINANCIAL_EXPOSURE')
  if not readiness.get('downstreamReady') or not readiness.get('reconciliationReady') or not readiness.get('providerExecutionEligible'):
   raise GuardError('DOWNSTREAM_AND_RECONCILIATION_AND_ELIGIBILITY_REQUIRED')
 if stage=='reconciliation' and not readiness.get('downstreamReady'):raise GuardError('DOWNSTREAM_REQUIRED')

def healthy_runtime(app,revision):
 detail=az('containerapp','revision','show','-g',RG,'-n',APP,'--revision',revision)
 replicas=az('containerapp','replica','list','-g',RG,'-n',APP,'--revision',revision)
 state=detail.get('properties',{})
 if state.get('healthState')!='Healthy' or state.get('active') is not True or len(replicas)!=1:
  raise GuardError('HEALTHY_ACTIVE_SINGLE_REPLICA_REQUIRED')
 traffic=app['properties']['configuration'].get('ingress',{}).get('traffic',[])
 if len(traffic)!=1 or traffic[0].get('weight')!=100 or not (traffic[0].get('latestRevision') is True or traffic[0].get('revisionName')==revision):
  raise GuardError('HEALTHY_REVISION_TRAFFIC_REQUIRED')
 return {'readyRevision':revision,'replicas':len(replicas),'trafficPercent':100,'healthState':state['healthState'],'active':True}

class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):raise GuardError('READINESS_REDIRECT_REFUSED')

def internal_key(app):
 supplied=os.environ.get('CRAVES_INTERNAL_SMOKE_SECRET','')
 if supplied and not supplied.startswith('$('):return supplied
 entry=environment(app).get('CRAVES_INTERNAL_SERVICE_KEY',{})
 if entry.get('value'):return entry['value']
 ref=entry.get('secretRef')
 secrets={s['name']:s for s in (app['properties']['configuration'].get('secrets') or [])}
 url=secrets.get(ref,{}).get('keyVaultUrl','');p=urllib.parse.urlsplit(url)
 if p.scheme!='https' or p.hostname!='kvcravesprodlowl3ing6.vault.azure.net' or not re.fullmatch(r'/secrets/[A-Za-z0-9-]+(?:/[a-f0-9]+)?',p.path) or p.query or p.fragment:
  raise GuardError('EXISTING_SECURE_INTERNAL_REFERENCE_REQUIRED')
 value=az('keyvault','secret','show','--id',url).get('value')
 if not isinstance(value,str) or not value:raise GuardError('INTERNAL_REFERENCE_EMPTY')
 return value

def readiness(app):
 fqdn=app['properties']['configuration']['ingress']['fqdn']
 if not re.fullmatch(re.escape(APP)+r'\.[a-z0-9.-]+\.azurecontainerapps\.io',fqdn):raise GuardError('DISCOVERED_ORIGIN_GUARD')
 request=urllib.request.Request('https://'+fqdn+'/internal/v1/refund-production-readiness',headers={'X-Craves-Internal-Secret':internal_key(app)},method='GET')
 try:
  with urllib.request.build_opener(NoRedirect).open(request,timeout=20) as response:
   body=response.read(65537)
  if len(body)>65536:raise GuardError('READINESS_RESPONSE_BOUND')
  data=json.loads(body)
 except GuardError:raise
 except Exception:raise GuardError('AUTHENTICATED_READINESS_FAILED_DETAILS_SUPPRESSED')
 allowed={'paymentProvider','paymentEnvironment','dispatchProtocol','downstreamReady','providerExecutionEligible','providerExecutionReady','reconciliationReady',
  'consumerEnabled','statusPublisherEnabled','productionProviderExecutionApproved','productionReconciliationApproved','executableRefundCount',
  'reconcilableRefundCount','processingRefundCount','refundDeadLetterCount','statusOutboxPendingCount','statusOutboxDeadLetterCount',
  'requestInboxFailureCount','unknownOutcomeCount','historicalModeMismatchCount','historicalTestRefundCount','reconciliationExhaustedCount'}
 return {k:v for k,v in data.items() if k in allowed and isinstance(v,(str,bool,int))}

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--stage',choices=['pause','downstream','reconciliation','provider_execution'],required=True)
 parser.add_argument('--expected-release-sha',required=True)
 parser.add_argument('--expected-image',required=True)
 parser.add_argument('--expected-revision',required=True)
 parser.add_argument('--expected-exposure',type=Path,required=True)
 parser.add_argument('--apply',action='store_true')
 parser.add_argument('--reviewed-plan',type=Path)
 parser.add_argument('--output',type=Path,required=True)
 args=parser.parse_args()
 head=subprocess.run(['git','rev-parse','HEAD'],capture_output=True,text=True,check=True).stdout.strip()
 if not re.fullmatch('[a-f0-9]{40}',args.expected_release_sha) or head!=args.expected_release_sha:raise GuardError('EXACT_CHECKOUT_SHA_REQUIRED')
 if az('account','show').get('id')!=SUB:raise GuardError('SUBSCRIPTION_MISMATCH')
 app=show();env=inspect(app,args.expected_image)
 if app['properties'].get('latestReadyRevisionName')!=args.expected_revision or app['properties'].get('latestRevisionName')!=args.expected_revision:
  raise GuardError('REVIEWED_READY_REVISION_CHANGED')
 health=healthy_runtime(app,args.expected_revision)
 if args.stage!='pause' and not args.expected_image.endswith(':'+head):raise GuardError('RUNNING_IMAGE_RELEASE_SHA_REQUIRED')
 expected=json.loads(args.expected_exposure.read_text())
 names={'executableRefundCount','reconcilableRefundCount','processingRefundCount','refundDeadLetterCount','unknownOutcomeCount','historicalModeMismatchCount','statusOutboxDeadLetterCount','requestInboxFailureCount'}
 if set(expected)!=names or any(type(v) is not int or v<0 for v in expected.values()):raise GuardError('EXACT_EXPOSURE_COUNTS_REQUIRED')
 state={} if args.stage=='pause' else readiness(app)
 validate_readiness(args.stage,state,expected)
 plan={'releaseSha':head,'resourceGroup':RG,'containerApp':APP,'image':args.expected_image,'readyRevision':args.expected_revision,
  'stage':args.stage,'configurationSha256':digest(app['properties']),'preservationSha256':preservation(app),'changes':changes(args.stage),
  'expectedExposure':expected,'readiness':state,'replicas':{'min':1,'max':1},'runtimeHealth':health}
 args.output.mkdir(parents=True,exist_ok=True)
 (args.output/'refund-runtime-plan.json').write_text(json.dumps(plan,indent=2)+'\n')
 if not args.apply:print(json.dumps({'status':'PLAN_ONLY','planSha256':digest(plan)}));return
 if not args.reviewed_plan or json.loads(args.reviewed_plan.read_text())!=plan:raise GuardError('UNCHANGED_REVIEWED_PLAN_REQUIRED')
 fresh=show()
 if digest(fresh['properties'])!=plan['configurationSha256']:raise GuardError('RUNTIME_CHANGED_BEFORE_APPLY')
 if healthy_runtime(fresh,args.expected_revision)!=health:raise GuardError('RUNTIME_HEALTH_CHANGED_BEFORE_APPLY')
 az('containerapp','update','-g',RG,'-n',APP,'--set-env-vars',*[k+'='+v for k,v in plan['changes'].items()])
 latest=None
 for _ in range(36):
  latest=show();revision=latest['properties'].get('latestRevisionName')
  if latest['properties'].get('latestReadyRevisionName')==revision and revision!=args.expected_revision:break
  time.sleep(5)
 else:raise GuardError('REVISION_NOT_READY')
 inspect(latest,args.expected_image)
 if preservation(latest)!=plan['preservationSha256']:raise GuardError('NON_REFUND_CONFIGURATION_DRIFT')
 actual=environment(latest)
 if any(actual.get(k,{}).get('value')!=v for k,v in plan['changes'].items()):raise GuardError('GATE_READBACK_MISMATCH')
 revision=latest['properties']['latestReadyRevisionName']
 final_health=healthy_runtime(latest,revision)
 after={} if args.stage=='pause' else readiness(latest)
 if args.stage=='provider_execution' and not after.get('providerExecutionReady'):raise GuardError('EXECUTION_NOT_READY_AFTER_APPLY')
 receipt={'releaseSha':head,'planSha256':digest(plan),'readyRevision':revision,'previousReadyRevision':args.expected_revision,
  'image':args.expected_image,'replicas':final_health['replicas'],'trafficPercent':100,'healthState':final_health['healthState'],'enabledFlags':plan['changes'],'readiness':after}
 (args.output/'refund-runtime-apply.json').write_text(json.dumps(receipt,indent=2)+'\n')
 print(json.dumps({'status':'APPLIED_VERIFIED','receiptSha256':digest(receipt)}))

if __name__=='__main__':
 try:main()
 except Exception as error:
  print(json.dumps({'status':'FAILED','reason':str(error) if isinstance(error,GuardError) else type(error).__name__}),flush=True)
  raise SystemExit(1)
