#!/usr/bin/env python3
"""Exercise the real helper/wrapper offline. All provider/network clients are fakes."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[3]
OLD = 'registry/service@sha256:' + 'a' * 64
NEW = 'registry/service@sha256:' + 'b' * 64

FAKE_AZ = r'''#!/usr/bin/env python3
import copy, json, os, pathlib, sys
a = sys.argv[1:]
root = pathlib.Path(os.environ['FAKE_AZ_ROOT'])
with (root/'calls.jsonl').open('a') as f: f.write(json.dumps(a)+'\n')
def arg(name, short=None):
    for flag in [name, short]:
        if flag and flag in a: return a[a.index(flag)+1]
    return ''
name = arg('--name', '-n') or 'service'
scenario = os.environ.get('SCENARIO', 'success')
if os.environ.get('FAIL_APP') and name != os.environ['FAIL_APP']: scenario = 'success'
old_image = 'registry/'+name+'@sha256:'+'b'*64 if scenario=='resume_first' else os.environ['OLD_IMAGE']
p = root/('state-'+name+'.json')
s = json.loads(p.read_text()) if p.exists() else {'updates':0,'image':old_image,'revision':'old','postreads':0}
def save(): p.write_text(json.dumps(s))
if a[:3] == ['acr','repository','show']: print('{}'); sys.exit(0)
if a[:2] == ['containerapp','update']:
    forbidden = {'--set-env-vars','--remove-env-vars','--replace-env-vars','--min-replicas','--max-replicas','--revision-suffix'}
    assert not forbidden.intersection(a), a
    image=arg('--image'); s['updates']+=1
    if s['updates']==1 and scenario=='rejected': save(); sys.exit(2)
    if s['updates']==2 and scenario=='restore_failed': save(); sys.exit(2)
    s['image']=image; s['revision']='new' if s['updates']==1 else 'restored'; save()
    if scenario=='uncertain_accepted' and s['updates']==1: sys.exit(2)
    print('{}'); sys.exit(0)
if a[:3] == ['containerapp','secret','list']:
    secret={'name':'credential','keyVaultUrl':'https://fixture.vault.azure.net/secrets/credential','identity':'system'}
    if scenario=='pre_submit': secret.pop('keyVaultUrl')
    if s['updates']==1 and scenario=='secret_drift': secret['identity']='/subscriptions/concurrent/identity'
    print(json.dumps([secret])); sys.exit(0)
if a[:3] in [['containerapp','logs','show'],['containerapp','replica','list'],['containerapp','revision','list']]:
    print('[]'); sys.exit(0)
if a[:2] not in [['containerapp','show'],['containerapp','revision']]: sys.exit('Unexpected fake operation '+repr(a))
if a[:2]==['containerapp','show'] and s['updates']==2 and scenario=='restore_read_failure': sys.exit(3)
if a[:2]==['containerapp','show'] and scenario in ('receipt_missing','receipt_corrupt','receipt_wrong_identity'):
    receipt=root/'evidence'/'service-receipts'/(name+'.json')
    once=root/'receipt-corrupted'
    if receipt.exists() and not once.exists():
        data=json.loads(receipt.read_text())
        if data.get('status')=='deployment-verified':
            once.touch()
            if scenario=='receipt_missing': receipt.unlink()
            if scenario=='receipt_corrupt': receipt.write_text('{broken')
            if scenario=='receipt_wrong_identity':
                data.update(containerApp='wrong-app',status='restored',restoredRevision='other')
                receipt.write_text(json.dumps(data))
if a[:2]==['containerapp','show'] and scenario=='wrapper_verify_failure':
    receipt=root/'evidence'/'service-receipts'/(name+'.json')
    once=root/'wrapper-verification-failed'
    if receipt.exists() and json.loads(receipt.read_text()).get('status')=='deployment-verified' and not once.exists():
        once.touch(); sys.exit(3)
if a[:2]==['containerapp','show'] and s['updates']==1:
    s['postreads']+=1; save()
    if scenario=='postread_failure' and s['postreads']>=2: sys.exit(3)
    if scenario=='malformed_postread' and s['postreads']>=2: print('{}'); sys.exit(0)
    if scenario=='concurrent_image' and s['postreads']>=2: s['image']='registry/third-party@sha256:'+'c'*64; s['revision']='other'; save()
    if scenario=='concurrent_revision' and s['postreads']>=2: s['revision']='other'; save()
image=s['image']; revision=s['revision']
requested=arg('--revision')
if requested=='old': image=old_image; revision='old'
template={'containers':[{'name':'service','image':image,'env':[{'name':'CREDENTIAL','secretRef':'credential'}], 'resources':{'cpu':.5,'memory':'1Gi'}}], 'scale':{'minReplicas':0,'maxReplicas':1}}
if s['updates']==1 and scenario=='template_drift' and revision!='old': template['scale']['maxReplicas']=2
configuration={'activeRevisionsMode':'Single','ingress':{'external':scenario in ('smoke_failure','restore_failed','restore_read_failure','smoke_drift'),'fqdn':'fixture.invalid','targetPort':8080,'traffic':[{'latestRevision':True,'weight':100}]}}
identity={'type':'SystemAssigned','principalId':'fixture'}
if s['updates']==1 and scenario=='config_drift': configuration['ingress']['targetPort']=9090
if s['updates']==1 and scenario=='traffic_drift': configuration['ingress']['traffic'][0]['weight']=0
if s['updates']==1 and scenario=='identity_drift': identity['principalId']='concurrent'
if s['updates']==1 and scenario=='smoke_drift' and (root/'smoke-attempted').exists(): configuration['ingress']['targetPort']=9090
if a[:3]==['containerapp','revision','show']:
    if arg('--output')=='tsv': print(image); sys.exit(0)
    unhealthy=s['updates']==1 and scenario=='unhealthy'
    print(json.dumps({'name':revision,'properties':{'template':template,'active':True,'trafficWeight':100,'healthState':'Unhealthy' if unhealthy else 'Healthy','runningState':'Running','provisioningState':'Provisioned'}})); sys.exit(0)
if arg('--query')=='properties.template.containers[0].env': print('[{"name":"FIXTURE_FEATURE_ENABLED","value":"false"}]'); sys.exit(0)
if scenario=='ready_timeout' and s['updates']==1: revision='old'; template['containers'][0]['image']=os.environ['OLD_IMAGE']
print(json.dumps({'name':name,'identity':identity,'properties':{'latestRevisionName':revision,'latestReadyRevisionName':revision,'runningStatus':'Running','configuration':configuration,'template':template}}))
'''


class BackendRecoveryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        release = self.root/'scripts/release'
        release.mkdir(parents=True)
        for name in ('deploy-backend-release.sh', 'deploy-single-service-preserve-runtime.sh'):
            shutil.copy2(ROOT/'scripts/release'/name, release/name)
        (release/'smoke-containerapp-health.sh').write_text('exit 0\n')
        for name, content in [('az', FAKE_AZ), ('sleep', '#!/bin/sh\nexit 0\n'),
                              ('curl', '#!/bin/sh\ntouch "$FAKE_AZ_ROOT/smoke-attempted"\nprintf 503\n')]:
            p=self.root/name; p.write_text(content); p.chmod(0o755)
        self.receipt=self.root/'receipt.json'
        self.env=dict(os.environ, PATH=str(self.root)+os.pathsep+os.environ['PATH'],
                      FAKE_AZ_ROOT=str(self.root), OLD_IMAGE=OLD,
                      READY_ATTEMPTS='2', READY_SLEEP_SECONDS='1', SMOKE_ATTEMPTS='1',
                      SMOKE_SLEEP_SECONDS='0', STATUS_READ_FAILURE_LIMIT='1',
                      DEPLOY_RECEIPT_FILE=str(self.receipt))
        self.helper=release/'deploy-single-service-preserve-runtime.sh'

    def run_helper(self, scenario, **env):
        self.env.update(SCENARIO=scenario, **env)
        return subprocess.run(['bash', str(self.helper), 'test-rg', 'service', NEW, 'service'],
                              env=self.env, text=True, capture_output=True, timeout=20)

    def updates(self):
        calls=self.root/'calls.jsonl'
        return [a for a in map(json.loads, calls.read_text().splitlines()) if a[:2]==['containerapp','update']] if calls.exists() else []

    def status(self):
        return json.loads(self.receipt.read_text())['status']

    def test_success_receipt_is_sanitized(self):
        result=self.run_helper('success')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.status(), 'deployment-verified')
        self.assertEqual(len(self.updates()), 1)
        text=self.receipt.read_text()
        self.assertNotIn('keyVaultUrl', text)
        self.assertNotIn('principalId', text)

    def test_pre_submit_failure_has_no_update(self):
        result=self.run_helper('pre_submit')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.updates(), [])
        self.assertEqual(self.status(), 'not-submitted')

    def test_receipt_write_failure_prevents_submission(self):
        result=self.run_helper('success', DEPLOY_RECEIPT_FILE=str(self.root/'missing'/'receipt.json'))
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.updates(), [])

    def test_rejected_or_uncertain_submission_requires_operator(self):
        for scenario in ('rejected','uncertain_accepted','ready_timeout'):
            with self.subTest(scenario=scenario):
                self.setUp()
                result=self.run_helper(scenario)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(len(self.updates()), 1)
                self.assertEqual(self.status(), 'operator-required')

    def test_drift_or_unreadable_state_never_rolls_back(self):
        for scenario in ('template_drift','config_drift','traffic_drift','identity_drift','secret_drift',
                         'postread_failure','malformed_postread','concurrent_image','concurrent_revision','smoke_drift'):
            with self.subTest(scenario=scenario):
                self.setUp()
                result=self.run_helper(scenario)
                self.assertNotEqual(result.returncode, 0, result.stdout+result.stderr)
                self.assertEqual(len(self.updates()), 1, result.stdout+result.stderr)
                self.assertEqual(self.status(), 'operator-required')

    def test_failed_smoke_or_health_restores_with_original_guards(self):
        for scenario in ('smoke_failure','unhealthy'):
            with self.subTest(scenario=scenario):
                self.setUp()
                result=self.run_helper(scenario)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(len(self.updates()), 2, result.stdout+result.stderr)
                self.assertEqual(self.updates()[-1][self.updates()[-1].index('--image')+1], OLD)
                self.assertEqual(self.status(), 'restored')

    def test_failed_restore_is_unrecovered(self):
        result=self.run_helper('restore_failed')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(len(self.updates()), 2)
        self.assertEqual(self.status(), 'operator-required')

    def test_already_restored_recovery_is_idempotent(self):
        result=self.run_helper('smoke_failure')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.status(), 'restored')
        result=self.run_helper('smoke_failure', DEPLOY_RECOVERY_ONLY='true')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(self.updates()), 2)
        self.assertEqual(self.status(), 'restored')

    def test_unresolved_restore_is_not_submitted_again(self):
        self.run_helper('restore_failed')
        self.assertEqual(self.status(), 'operator-required')
        result=self.run_helper('restore_failed', DEPLOY_RECOVERY_ONLY='true')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(len(self.updates()), 2)

    def test_restore_read_failure_is_unrecovered(self):
        result=self.run_helper('restore_read_failure')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(len(self.updates()), 2)
        self.assertEqual(self.status(), 'operator-required')

    def test_recovery_does_not_overwrite_intervening_revision(self):
        result=self.run_helper('success')
        self.assertEqual(result.returncode, 0, result.stderr)
        state=self.root/'state-service.json'; value=json.loads(state.read_text()); value['revision']='third-party'; state.write_text(json.dumps(value))
        result=self.run_helper('success', DEPLOY_RECOVERY_ONLY='true')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(len(self.updates()), 1)
        self.assertEqual(self.status(), 'operator-required')

    def run_wrapper(self, scenario='config_drift', fail_app='notification', success=False):
        keys=['auth','notification','userChef','catalog','integration','subscription','order']
        pack={'azure':{'resourceGroup':'test-rg','containerRegistry':'registry','containerRegistryLoginServer':'registry'},
              'services':[{'key':k,'containerApp':k,'imageRepository':k} for k in keys],
              'stepOneDormantFlags':[{'serviceKey':'auth','name':'FIXTURE_FEATURE_ENABLED'}]}
        manifest={'schemaVersion':1,'registry':'registry','sourceSha':'a'*40,'releaseMode':'DEPLOY_BACKEND',
                  'images':[{'serviceKey':k,'repository':k,'digest':'sha256:'+'b'*64} for k in keys]}
        (self.root/'pack.json').write_text(json.dumps(pack)); (self.root/'images.json').write_text(json.dumps(manifest))
        evidence=self.root/'evidence'
        self.env.update(SCENARIO=scenario, FAIL_APP=fail_app, CONFIRM_DEPLOYMENT='DEPLOY_SEVEN_SERVICES', DATABASE_BACKUP_CONFIRMATION='DATABASE_BACKUP_VERIFIED')
        result=subprocess.run(['bash',str(self.helper.with_name('deploy-backend-release.sh')),'test-rg',str(self.root/'pack.json'),str(self.root/'images.json'),str(evidence),'a'*40],env=self.env,text=True,capture_output=True,timeout=30)
        if success:
            self.assertEqual(result.returncode, 0, result.stdout+result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)
        report=json.loads((evidence/'backend-deployment-manifest.json').read_text())
        self.assertEqual(report['releaseStatus'],'SUCCEEDED' if success else 'FAILED')
        return report, result

    def test_wrapper_seven_service_success(self):
        report, result=self.run_wrapper('success', success=True)
        self.assertEqual(report['unrecoveredServices'], [])
        self.assertEqual(len(report['mutationReceipts']), 7)
        self.assertTrue(all(v['status']=='deployment-verified' for v in report['mutationReceipts']))
        self.assertEqual(len(self.updates()), 7)
        self.assertTrue(any(v['phase']=='dormant-flag' and v['status']=='verified-false' for v in report['deploymentEvents']))
        self.assertFalse(any(v['phase']=='rollback' for v in report['deploymentEvents']))

    def test_wrapper_resumes_already_ready_service_without_mutation_receipt(self):
        report, result=self.run_wrapper('resume_first', 'auth', success=True)
        self.assertEqual(report['unrecoveredServices'], [])
        self.assertEqual(len(report['mutationReceipts']), 6)
        self.assertNotIn('auth', [v['serviceKey'] for v in report['mutationReceipts']])
        self.assertEqual(len(self.updates()), 6)
        self.assertTrue(any(v['serviceKey']=='auth' and v['status']=='already-ready' for v in report['deploymentEvents']))

    def test_wrapper_accounts_current_mutated_service_and_restores_prior(self):
        report, result=self.run_wrapper()
        self.assertEqual(report['unrecoveredServices'],['notification'])
        receipts=report['mutationReceipts']
        self.assertEqual({v['serviceKey']:v['status'] for v in receipts},{'auth':'restored','notification':'operator-required'})
        updates=self.updates()
        self.assertEqual([a[a.index('--name')+1] for a in updates],['auth','notification','auth'])

    def test_wrapper_verification_failure_recovers_current_service(self):
        report, result=self.run_wrapper('wrapper_verify_failure', 'auth')
        self.assertEqual(report['unrecoveredServices'], [], result.stdout+result.stderr)
        self.assertEqual([(v['serviceKey'],v['status']) for v in report['mutationReceipts']], [('auth','restored')])
        self.assertEqual(len(self.updates()), 2)

    def test_wrapper_never_trusts_missing_corrupt_or_wrong_identity_receipts(self):
        for scenario in ('receipt_missing','receipt_corrupt','receipt_wrong_identity'):
            with self.subTest(scenario=scenario):
                self.setUp()
                report, result=self.run_wrapper(scenario, 'auth')
                self.assertIn('auth', report['unrecoveredServices'], result.stdout+result.stderr)
                self.assertNotIn('SUCCESS: backend services', result.stdout)
                auth=[v for v in report['mutationReceipts'] if v['serviceKey']=='auth']
                self.assertEqual(auth[0]['status'], 'operator-required')
                auth_updates=[a for a in self.updates() if a[a.index('--name')+1]=='auth']
                self.assertEqual(len(auth_updates), 1)

    def test_wrapper_does_not_repeat_helpers_successful_restore(self):
        report, result=self.run_wrapper('smoke_failure')
        self.assertEqual(report['unrecoveredServices'], [], result.stdout+result.stderr)
        self.assertEqual({v['serviceKey']:v['status'] for v in report['mutationReceipts']}, {'auth':'restored','notification':'restored'})
        self.assertEqual(len(self.updates()), 4)


if __name__ == '__main__':
    unittest.main()
