import copy
import sys
from pathlib import Path
import unittest
from unittest.mock import Mock,patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import chef_onboarding_release as release

class ChefReleaseGuardTests(unittest.TestCase):
    def app(self):
        return {'name':release.CHEF,'identity':{'type':'SystemAssigned'},'properties':{'configuration':{'activeRevisionsMode':'Single','ingress':{'traffic':[]},'secrets':[]},'template':{'containers':[{'name':'chef','image':'image-v1','env':[{'name':release.FLAG,'value':'false'},{'name':'PAYOUT_ENABLED','value':'false'}]}],'scale':{'minReplicas':1,'maxReplicas':1}}}}
    def test_only_explicit_chef_flag_changes_are_permitted(self):
        before=self.app();current=copy.deepcopy(before);current['properties']['template']['containers'][0]['env'][0]['value']='true'
        release.flag_guard(before,current,{release.FLAG:'true'})
        current['properties']['template']['containers'][0]['env'][1]['value']='true'
        with self.assertRaises(ValueError):release.flag_guard(before,current,{release.FLAG:'true'})
    def test_concurrent_image_or_secret_reference_blocks_activation(self):
        before=self.app();current=copy.deepcopy(before);container=current['properties']['template']['containers'][0]
        container['env'][0]['value']='true';container['image']='concurrent'
        with self.assertRaises(ValueError):release.flag_guard(before,current,{release.FLAG:'true'})
        container['image']='image-v1';container['env'][0]={'name':release.FLAG,'secretRef':'private-flag'}
        with self.assertRaises(ValueError):release.flag_guard(before,current,{release.FLAG:'true'})
    def test_disabled_finance_controls_never_become_enabled_by_chef_activation(self):
        bank=self.app();container=bank['properties']['template']['containers'][0]
        container['env']=[{'name':k,'value':'true'} for k in ('CRAVES_BANK_PROVIDER_ENABLED','CRAVES_BANK_WORKER_ENABLED')]+[{'name':k,'secretRef':'existing'} for k in ('CRAVES_BANK_DATA_KEYS_JSON','CRAVES_BANK_DATA_ACTIVE_KEY_ID','CRAVES_RAZORPAYX_KEY_ID','CRAVES_RAZORPAYX_KEY_SECRET','CRAVES_RAZORPAYX_ACCOUNT_NUMBER')]
        report={'bank':{'controls':{'submissions_enabled':False,'validation_enabled':True}}}
        with self.assertRaisesRegex(ValueError,'controls are disabled'):release.bank_available(bank,report)
        report['bank']['controls']['submissions_enabled']=True;release.bank_available(bank,report)
        container['env'][0]['value']='false'
        with self.assertRaisesRegex(ValueError,'already be enabled'):release.bank_available(bank,report)

    def settled_app(self,name):
        value=self.app();value['name']=name
        value['properties'].update(runningStatus='Running',provisioningState='Succeeded',latestRevisionName='current',latestReadyRevisionName='current')
        value['properties']['configuration']['ingress']['fqdn']='owned.azurecontainerapps.io'
        value['properties']['template']['containers'][0]['env'][0]['value']='true'
        return value

    def test_web_waits_for_full_single_revision_readiness_not_just_http(self):
        current=self.settled_app(release.WEB)
        with patch.object(release,'app',return_value=current),patch.object(release.inspect,'probe',return_value=(200,{})),patch.object(release,'ready_web',side_effect=[ValueError('Exactly the current web revision must be active'),None]) as ready,patch.object(release.time,'sleep') as sleep:
            self.assertEqual(release.wait_flags(release.WEB,current,{release.FLAG:'true'}),current)
            self.assertEqual(ready.call_count,2);sleep.assert_called_once_with(10)

    def test_configuration_and_unknown_readiness_errors_fail_immediately(self):
        current=self.settled_app(release.WEB)
        for message in ('Running web image differs from desired image','Running web template differs from desired configuration','Web traffic is split','unrecognized readiness failure'):
            with self.subTest(message=message),patch.object(release,'app',return_value=current),patch.object(release.inspect,'probe',return_value=(200,{})),patch.object(release,'ready_web',side_effect=ValueError(message)),patch.object(release.time,'sleep') as sleep:
                with self.assertRaisesRegex(ValueError,message):release.wait_flags(release.WEB,current,{release.FLAG:'true'})
                sleep.assert_not_called()

    def test_persistent_settling_failure_times_out_without_accepting_http_health(self):
        current=self.settled_app(release.WEB)
        with patch.object(release,'app',return_value=current),patch.object(release.inspect,'probe',return_value=(200,{})),patch.object(release,'ready_web',side_effect=ValueError('Exactly the current web revision must be active')) as ready,patch.object(release.time,'sleep'):
            with self.assertRaisesRegex(ValueError,'did not become healthy'):release.wait_flags(release.WEB,current,{release.FLAG:'true'})
            self.assertEqual(ready.call_count,120)

    def test_backend_does_not_use_web_readiness_and_concurrent_runtime_still_blocks(self):
        current=self.settled_app(release.CHEF)
        with patch.object(release,'app',return_value=current),patch.object(release.inspect,'probe',return_value=(200,{})),patch.object(release,'ready_web') as ready:
            self.assertEqual(release.wait_flags(release.CHEF,current,{release.FLAG:'true'}),current);ready.assert_not_called()
        before=copy.deepcopy(current);current['properties']['template']['containers'][0]['env'][1]['value']='true'
        with patch.object(release,'app',return_value=current),patch.object(release.inspect,'probe') as probe,patch.object(release.time,'sleep') as sleep:
            with self.assertRaisesRegex(ValueError,'Unrelated runtime'):release.wait_flags(release.CHEF,before,{release.FLAG:'true'})
            probe.assert_not_called();sleep.assert_not_called()

    def test_failed_full_readiness_still_restores_only_changed_web_flag(self):
        bank=self.settled_app(release.BANK);chef=self.settled_app(release.CHEF);web=self.settled_app(release.WEB)
        previous=copy.deepcopy(web);previous['properties']['template']['containers'][0]['env'][0]['value']='false'
        output=Mock()
        with patch.object(release,'preflight',return_value={}),patch.object(release,'applied'),patch.object(release,'bank_available'),patch.object(release,'verify_image'),patch.object(release,'app',side_effect=[bank,bank,chef,previous,chef,previous,web]),patch.object(release,'wait_flags',side_effect=[chef,ValueError('Chef activation revision did not become healthy')]),patch.object(release,'azure') as azure:
            with self.assertRaisesRegex(RuntimeError,'previous flag values restored'):release.activate('a'*40,output)
            self.assertEqual(azure.call_count,3)
            self.assertEqual(azure.call_args.args,('containerapp','update','-g',release.RG,'-n',release.WEB,'--set-env-vars',release.FLAG+'=false'))
            output.write_text.assert_not_called()

if __name__=='__main__':unittest.main()
