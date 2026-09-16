import copy
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

spec=importlib.util.spec_from_file_location('release',Path(__file__).resolve().parents[1]/'customer-email-release.py')
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)

class ReleaseTests(unittest.TestCase):
    def app(self):
        return {'identity':{'type':'SystemAssigned'},'properties':{'latestRevisionName':'ready','latestReadyRevisionName':'ready',
            'template':{'revisionSuffix':'one','containers':[{'image':'pinned','env':[{'name':'CRAVES_EMAIL_VERIFICATION_ENABLED','value':'false'},{'name':'DATABASE','secretRef':'existing'}]}]},
            'configuration':{'activeRevisionsMode':'Single','ingress':{'fqdn':'auth.example.test','traffic':[{'latestRevision':True,'weight':100}]}}}}

    def test_only_four_owned_auth_routes(self):
        self.assertEqual(len(r.ROUTES),4)
        for _,method,path in r.ROUTES:
            self.assertIn(method,('GET','POST'));self.assertTrue(path.startswith('/email-verification'))
            policy=ET.fromstring(r.route_policy('https://auth.example.test',path))
            self.assertEqual(policy.find('inbound')[0].tag,'base')
            self.assertEqual(policy.find('inbound/set-backend-service').get('base-url'),'https://auth.example.test/api/v1/auth')
            self.assertEqual(policy.find('inbound/choose/when/return-response/set-status').get('code'),'401')
            self.assertIn('no-store',policy.find('outbound/set-header/value').text)

    def test_only_reviewed_flags_may_change(self):
        original=self.app();updated=copy.deepcopy(original)
        updated['properties']['template']['containers'][0]['env'][0]['value']='true'
        self.assertEqual(r.preserved(original,'auth-service'),r.preserved(updated,'auth-service'))
        updated['properties']['template']['containers'][0]['env'][1]['secretRef']='different'
        self.assertNotEqual(r.preserved(original,'auth-service'),r.preserved(updated,'auth-service'))

    def test_image_and_identity_must_be_preserved(self):
        original=self.app()
        for changed in ('image','identity'):
            updated=copy.deepcopy(original)
            if changed=='image':updated['properties']['template']['containers'][0]['image']='other'
            else:updated['identity']['type']='None'
            self.assertNotEqual(r.preserved(original,'auth-service'),r.preserved(updated,'auth-service'))

    @patch.object(r.safe,'http_status')
    @patch.object(r.safe,'az')
    def test_old_ready_revision_cannot_confirm_new_flags(self,az,http):
        requested=self.app();actual=copy.deepcopy(requested['properties']['template'])
        requested['properties']['template']['containers'][0]['env'][0]['value']='true'
        az.return_value={'properties':{'template':actual,'healthState':'Healthy'}}
        with self.assertRaisesRegex(RuntimeError,'Ready revision differs'):r.healthy('auth-service',requested,'pinned')
        http.assert_not_called()

    @patch.object(r.safe,'http_status',return_value=200)
    @patch.object(r.safe,'az')
    def test_azure_order_and_null_serialization_do_not_mean_runtime_drift(self,az,http):
        requested=self.app();actual=copy.deepcopy(requested['properties']['template'])
        actual['containers'][0]['env'].reverse()
        actual['containers'][0]['env'][0]['value']=None
        actual['containers'][0]['env'][1]['secretRef']=None
        az.return_value={'properties':{'template':actual,'healthState':'Healthy'}}
        r.healthy('auth-service',requested,'pinned')
        http.assert_called_once()

    def test_duplicate_environment_names_fail_closed(self):
        with self.assertRaisesRegex(RuntimeError,'Duplicate environment'):
            r.normalized_env({'env':[{'name':'A','value':'one'},{'name':'A','value':'two'}]})

    def test_observed_empty_secret_literal_matches_missing_but_not_changed_reference(self):
        a={'env':[{'name':'KEY','secretRef':'existing','value':''}]}
        b={'env':[{'name':'KEY','secretRef':'existing'}]}
        self.assertEqual(r.normalized_env(a),r.normalized_env(b))
        b['env'][0]['secretRef']='other'
        self.assertNotEqual(r.normalized_env(a),r.normalized_env(b))

    def test_nonsecret_empty_string_is_not_ignored(self):
        self.assertNotEqual(r.normalized_env({'env':[{'name':'FLAG','value':''}]}),r.normalized_env({'env':[{'name':'FLAG'}]}))

    def test_nonempty_literal_with_secret_reference_fails_closed(self):
        with self.assertRaisesRegex(RuntimeError,'Ambiguous secret'):
            r.normalized_env({'env':[{'name':'KEY','secretRef':'existing','value':'unexpected'}]})

    @patch.object(r.safe,'az',return_value={'id':'wrong'})
    @patch.object(r,'snapshot')
    def test_wrong_subscription_never_reads_or_writes_apps(self,snapshot,az):
        with self.assertRaisesRegex(RuntimeError,'Wrong subscription'):r.main('a'*40,True)
        snapshot.assert_not_called()

    @patch.object(r.safe,'az')
    @patch.object(r,'snapshot')
    def test_drift_stops_before_flag_write(self,snapshot,az):
        before=self.app();changed=copy.deepcopy(before);changed['identity']['type']='None';snapshot.return_value=changed
        with self.assertRaisesRegex(RuntimeError,'Runtime drift'):r.set_flags('auth-service',before,True)
        az.assert_not_called()

if __name__=='__main__':unittest.main()
