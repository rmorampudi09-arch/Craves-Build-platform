#!/usr/bin/env python3
"""Create one manual, bounded ACA smoke job; no existing app configuration changes."""
import json, pathlib, subprocess
RG='rg-craves-prodlow-centralindia'; SUB='4f897b61-9b52-44b4-8cf1-bdac281cc1aa'
APP='ca-craves-referral-prodlow'; JOB='cj-craves-referral-check-39033'
EXPECTED_IMAGE='cravesprodlowacr82121.azurecr.io/craves/referral-service@sha256:9b110d10541e976462c792e1d8b749754b2d8ba214fa85c7875d9d8346a2f2d0'
def az(*args):
    p=subprocess.run(['az',*args,'--only-show-errors','-o','json'],capture_output=True,text=True)
    if p.returncode: raise RuntimeError(p.stderr[:600])
    return json.loads(p.stdout) if p.stdout.strip() else None
assert az('account','show')['id']==SUB
app=az('containerapp','show','-g',RG,'-n',APP)
p=app['properties']; assert p['provisioningState']=='Succeeded'
assert p['latestReadyRevisionName']==p['latestRevisionName']
revision=az('containerapp','revision','show','-g',RG,'-n',APP,'--revision',p['latestRevisionName'])['properties']
assert revision.get('healthState')=='Healthy' and revision.get('runningState') in ('Running','RunningAtMaxScale')
assert p['configuration']['ingress']['external'] is False
assert p['template']['containers'][0]['image']==EXPECTED_IMAGE
flags=[e for e in p['template']['containers'][0]['env'] if e['name'].startswith('CRAVES_REFERRALS_') and e['name'].endswith('_ENABLED')]
assert len(flags)==7 and all(e.get('value')=='false' for e in flags)
assert not any(j['name']==JOB for j in az('containerapp','job','list','-g',RG))
identity=next(iter(app['identity']['userAssignedIdentities']))
script=pathlib.Path(__file__).with_name('smoke-private-backend.sh').read_text()
body={'location':'centralindia','identity':{'type':'UserAssigned','userAssignedIdentities':{identity:{}}},
      'tags':{'purpose':'referral-private-read-only-smoke','release':'39033'},
      'properties':{'environmentId':p['managedEnvironmentId'],
          'configuration':{'triggerType':'Manual','replicaTimeout':150,'replicaRetryLimit':0,
              'manualTriggerConfig':{'parallelism':1,'replicaCompletionCount':1},
              'registries':[{'server':'cravesprodlowacr82121.azurecr.io','identity':identity}]},
          'template':{'containers':[{'name':'smoke','image':EXPECTED_IMAGE,'command':['/bin/bash'],'args':['-c',script],
              'env':[{'name':'REFERRAL_SMOKE_HOST','value':p['configuration']['ingress']['fqdn']}],
              'resources':{'cpu':0.5,'memory':'1Gi'}}]}}}
path=pathlib.Path('/tmp/referral-private-smoke-job.json'); path.write_text(json.dumps(body))
url=f'https://management.azure.com/subscriptions/{SUB}/resourceGroups/{RG}/providers/Microsoft.App/jobs/{JOB}?api-version=2025-01-01'
az('rest','--method','put','--url',url,'--body','@'+str(path))
run=az('containerapp','job','start','-g',RG,'-n',JOB)
print(json.dumps({'job':JOB,'execution':run['name'],'image':EXPECTED_IMAGE,'noBusinessWrites':True}))
