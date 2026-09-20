import importlib.util
import json
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('capture',Path(__file__).parents[1]/'capture-launch-runtime.py')
capture=importlib.util.module_from_spec(spec);spec.loader.exec_module(capture)


class RuntimeCaptureTest(unittest.TestCase):
    def test_azure_null_optional_collections(self):
        fixture={'name':'web','properties':{'configuration':{'secrets':None},
            'template':{'containers':[{'image':'web','env':None}],'scale':{'rules':None}}}}
        result=capture.summarize_app(fixture,[])
        self.assertEqual(result['secretReferenceCount'],0)
        self.assertEqual(result['containers'][0]['settings'],[])
        self.assertEqual(result['scale']['rules'],[])

    def test_secret_and_literal_values_are_never_exported(self):
        result=capture.containers([{'name':'auth','image':'registry/auth:abc','env':[
            {'name':'TOKEN','value':'CANARY-CREDENTIAL'},
            {'name':'CRAVES_PASSWORD_ENABLED','secretRef':'PRIVATE-REF','value':'CANARY'},
            {'name':'CRAVES_EMAIL_VERIFICATION_ENABLED','value':'true'}]}])
        encoded=json.dumps(result)
        self.assertNotIn('CANARY',encoded);self.assertNotIn('PRIVATE-REF',encoded)
        self.assertEqual(result[0]['settings'][0]['kind'],'booleanGate')
        self.assertTrue(result[0]['settings'][0]['value'])

    def test_mutations_and_secret_resolution_are_rejected_before_execution(self):
        for args in [('containerapp','update'),('keyvault','secret','show'),('rest','--method','post'),('acr','login')]:
            with self.subTest(args=args),self.assertRaises(ValueError):capture.az(*args)

    def test_active_worker_revisions_are_not_hidden_by_http_traffic(self):
        fixture={'name':'app','properties':{'template':{'containers':[]},'configuration':{},'latestRevisionName':'new','latestReadyRevisionName':'new'}}
        revisions=[{'name':name,'properties':{'active':active,'template':{'containers':[]}}} for name,active in [('old',True),('new',True),('inactive',False)]]
        result=capture.summarize_app(fixture,revisions)
        self.assertEqual([r['name'] for r in result['activeRevisions']],['new','old'])
        self.assertIn('NOT_VERIFIED',result['workerOwnership'])

    def test_sha_in_tag_is_only_an_unverified_hint(self):
        sha='a'*40
        result=capture.containers([{'image':'r/service:release-'+sha}])[0]
        self.assertEqual(result['sourceHintFromTag'],sha);self.assertFalse(result['sourceHintVerified'])

    def test_fingerprint_deterministic_and_sensitive_to_gate_change(self):
        self.assertEqual(capture.fingerprint({'b':2,'a':1}),capture.fingerprint({'a':1,'b':2}))
        self.assertNotEqual(capture.fingerprint({'gate':True}),capture.fingerprint({'gate':False}))


if __name__=='__main__':unittest.main()
