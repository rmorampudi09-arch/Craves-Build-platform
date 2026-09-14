#!/usr/bin/env python3
"""Disposable command fixtures only: never contacts Azure, a provider or production."""
import json
import copy
import os
import pathlib
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SHA = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
AZ = r'''#!/usr/bin/env python3
import json, os, sys, pathlib
a=sys.argv[1:]; case=os.environ['READINESS_CASE']; sha=os.environ['EXPECTED_RELEASE_SHA']; digest='sha256:'+'a'*64; backend_sha=os.environ['BACKEND_FIXTURE_SHA']
assert not any(x in a for x in ['update','create','put','delete','patch','login']), 'A readiness check attempted a mutation'
def emit(value): print(json.dumps(value) if isinstance(value,(dict,list)) else value)
if a[:2]==['account','show']: emit('00000000-0000-0000-0000-000000000001')
elif a[:2]==['acr','show']: emit('fixture.azurecr.io')
elif a[:3]==['acr','repository','show']:
 image=a[a.index('--image')+1]; emit('sha256:'+'b'*64 if case=='digest' and image.endswith(':'+backend_sha) else digest)
elif a[:3]==['apim','api','list']:
 result=[{'path':'api/v1/admin/explorer','name':'craves-admin-explorer-v1'}]* (2 if case=='duplicate-api' else 1)
 result.append({'path':'api/v1','name':'legacy'})
 if case=='descendant':result.append({'path':'api/v1/admin/explorer/users','name':'shadow'})
 emit(result)
elif a[:4]==['apim','api','operation','list']:
 if a[a.index('--api-id')+1]=='legacy':emit([{'method':'POST','urlTemplate':'/*' if case=='ancestor-wildcard' else '/admin/explorer/users/query' if case=='ancestor-exact' else '/auth/sign-in'}])
 else:emit([{'method':'POST','urlTemplate':'/'+d+'/query'} for d in ['users','chefs','orders']]+([{'method':'POST','urlTemplate':'/*'}] if case=='wildcard' else []))
elif a[:2]==['apim','show']:
 sku='Consumption' if case=='consumption' else '' if case=='missing-sku' else 'Developer'
 emit(sku if '--query' in a and a[a.index('--query')+1]=='sku.name' else {'sku':{'name':sku},'gatewayUrl':'https://fixture.azure-api.net','hostnameConfigurations':[{'type':'Proxy','hostName':'api.example.test'}]})
elif a[:3]==['containerapp','replica','list']:emit([{}])
elif a[:2]==['containerapp','show']:
 name=a[a.index('-n')+1]; admin='admin-web' in name
 settings=[{'name':'CRAVES_ADMIN_PORTAL','value':'true'},{'name':'CRAVES_API_BASE_URL','value':'https://api.example.test/api/v1'}] if admin else [{'name':'CRAVES_ADMIN_EXPLORER_ENABLED','value':'false' if case=='disabled' else 'true'}]
 emit({'properties':{'latestRevisionName':'ready','latestReadyRevisionName':'ready','runningStatus':'Running','configuration':{'activeRevisionsMode':'Multiple' if case=='admin-mode' and admin else 'Single','ingress':{'fqdn':name+'.fixture.azurecontainerapps.io'}},'template':{'scale':{'minReplicas':1,'maxReplicas':2 if case=='replicas' else 1},'containers':[{'image':'fixture.azurecr.io/craves/'+name+(':'+sha if case=='mutable-backend' and not admin else '@'+digest),'env':settings}]}}})
elif a[:1]==['rest']:
 assert a[a.index('--method')+1]=='get'
 url=a[a.index('--url')+1]
 if '/products?' in url:emit({'value':[{'name':'fixture-product'}],**({'nextLink':'https://not-followed.invalid'} if case=='pagination' else {})})
 elif '/operations/' in url:
  domain=next(d for d in ['users','chefs','orders'] if '-'+d+'-query' in url)
  app={'users':'ca-craves-auth-service-prodlow','chefs':'ca-craves-user-chef-service-prod','orders':'ca-craves-order-service-prodlow'}[domain]
  if '/policies/' not in url:emit({'properties':{'method':'POST','urlTemplate':'/'+domain+'/query'}})
  else:
   origin='https://wrong.example.test' if case=='rewrite' else 'https://'+app+'.fixture.azurecontainerapps.io/api/v1/admin/explorer'
   policy=pathlib.Path(os.environ['READINESS_POLICY']).read_text().replace('__BACKEND_URL__',origin)
   if case=='marker-only':policy='<policies><!-- CRAVES_ADMIN_EXPLORER_V1 Authorization --><inbound><set-status code="401"/></inbound></policies>'
   emit(policy)
 elif '/policies/' in url:
  if case=='fragment':emit('<policies><inbound><include-fragment fragment-id="unchecked"/></inbound></policies>')
  else:emit('<policies><inbound><set-header name="Authorization"><value>replacement</value></set-header></inbound></policies>' if case=='product-auth' and '/products/' in url else '<policies><inbound><base/></inbound></policies>')
 else: emit({'properties':{'path':'api/v1/admin/explorer','subscriptionRequired':False}})
else: raise AssertionError('Unexpected Azure command')
'''
CURL = r'''#!/usr/bin/env python3
import sys
if '--write-out' in sys.argv: print('401',end='')
else: print('{}')
'''

class ReadinessTest(unittest.TestCase):
    def run_case(self, case, sha=SHA, configure=False):
        with tempfile.TemporaryDirectory(prefix='craves-readiness-fixture-') as folder:
            path = pathlib.Path(folder)
            for name, content in [('az', AZ), ('curl', CURL)]:
                file = path / name
                file.write_text(content)
                file.chmod(0o700)
            env = os.environ.copy()
            env['BACKEND_FIXTURE_SHA']=json.loads((ROOT/'docs/admin/explorer/backend-release.json').read_text())['source']
            env.update(PATH=str(path)+os.pathsep+env['PATH'], EXPECTED_RELEASE_SHA=sha, READINESS_CASE=case, READINESS_POLICY=str(ROOT/'infra/apim/admin-explorer/authenticated-policy.xml'))
            if configure:
                # The gateway fixture represents an already-reviewed clean checkout.
                git = path/'git'
                git.write_text('#!/usr/bin/env python3\nimport os,sys\na=sys.argv[1:]\nif a[:1]==["-C"]:a=a[2:]\nif a==["rev-parse","HEAD"]:print(os.environ["EXPECTED_RELEASE_SHA"])\nelif a!=["status","--porcelain","--untracked-files=no"]:raise AssertionError(a)\n')
                git.chmod(0o700)
                env['CONFIRM_APIM_WRITE']='true'
            script='scripts/apim/configure-admin-explorer-apim.sh' if configure else 'scripts/admin-explorer/verify-runtime-readiness.sh'
            return subprocess.run(['bash', str(ROOT/script)],
                                  cwd=ROOT, env=env, capture_output=True, text=True, timeout=30)

    def test_consumption_tier_passes_with_source_linked_backend_admission(self):
        result=self.run_case('consumption')
        self.assertEqual(0,result.returncode,result.stderr)

    def test_unverified_gateway_tier_fails_closed(self):
        for configure in [False, True]:
            with self.subTest(configure=configure):
                result=self.run_case('missing-sku',configure=configure)
                self.assertNotEqual(0,result.returncode)
                self.assertIn('tier could not be verified',result.stderr)

    def test_complete_source_linked_custom_domain_inventory_passes(self):
        result = self.run_case('ready')
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn('Authenticated success/role-denial acceptance is separate', result.stdout)

    def test_disabled_backend_cannot_open_admin(self):
        self.assertNotEqual(0, self.run_case('disabled').returncode)

    def test_changed_registry_digest_cannot_open_admin(self):
        self.assertNotEqual(0, self.run_case('digest').returncode)

    def test_wrong_route_or_replica_setting_cannot_open_admin(self):
        for case in ['rewrite', 'replicas']:
            with self.subTest(case=case):
                self.assertNotEqual(0, self.run_case(case).returncode)

    def test_mutable_backend_and_admin_mode_cannot_pass(self):
        for case in ['mutable-backend', 'admin-mode']:
            with self.subTest(case=case):
                self.assertNotEqual(0, self.run_case(case).returncode)

    def test_inherited_auth_marker_only_and_duplicate_routes_are_rejected(self):
        for case in ['product-auth', 'marker-only', 'duplicate-api', 'wildcard', 'fragment', 'descendant', 'ancestor-exact', 'ancestor-wildcard', 'pagination']:
            with self.subTest(case=case):
                self.assertNotEqual(0, self.run_case(case).returncode)

    def test_unreviewed_checkout_stops_before_runtime_checks(self):
        self.assertNotEqual(0, self.run_case('ready', '0'*40).returncode)

    def test_post_promotion_requires_unchanged_identity_secrets_configuration_and_one_replica(self):
        image='fixture.azurecr.io/craves/admin-web@sha256:'+'a'*64
        app={'identity':{'type':'UserAssigned','userAssignedIdentities':{'fixture-mi':{}}},'properties':{
            'latestRevisionName':'ready','latestReadyRevisionName':'ready','runningStatus':'Running',
            'configuration':{'activeRevisionsMode':'Single','secrets':[{'name':'fixture','keyVaultUrl':'https://fixture.invalid/reference'}],
                             'ingress':{'traffic':[{'latestRevision':True,'weight':100}]}},
            'template':{'scale':{'minReplicas':1,'maxReplicas':1},'containers':[{'image':image,'env':[{'name':'PRESERVED','value':'fixture'}]}]}}}
        with tempfile.TemporaryDirectory() as folder:
            path=pathlib.Path(folder); current=path/'app.json'; snapshot=path/'snapshot.json'; replicas=path/'replicas.json'
            current.write_text(json.dumps(app));replicas.write_text('[{}]')
            script=str(ROOT/'scripts/admin-explorer/verify-admin-runtime.py')
            subprocess.run(['python3',script,'capture',str(current),str(snapshot)],check=True,capture_output=True)
            def verify():
                return subprocess.run(['python3',script,'verify',str(current),str(snapshot),image,str(replicas)],capture_output=True).returncode
            self.assertEqual(0,verify())
            for kind in ['identity','secrets','environment','traffic']:
                changed=copy.deepcopy(app)
                if kind=='identity':changed['identity']['type']='SystemAssigned'
                if kind=='secrets':changed['properties']['configuration']['secrets'][0]['keyVaultUrl']='https://wrong.invalid/reference'
                if kind=='environment':changed['properties']['template']['containers'][0]['env'][0]['value']='changed'
                if kind=='traffic':changed['properties']['configuration']['ingress']['traffic']=[{'revisionName':'old','weight':100}]
                current.write_text(json.dumps(changed))
                self.assertNotEqual(0,verify(),kind)
            current.write_text(json.dumps(app));replicas.write_text('[{},{}]')
            self.assertNotEqual(0,verify())

if __name__ == '__main__':
    unittest.main()
