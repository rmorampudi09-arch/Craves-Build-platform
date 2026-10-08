import copy
import sys
from pathlib import Path
import unittest
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

if __name__=='__main__':unittest.main()
