import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET
import configure_chef_ifsc_apim as release
from configure_bank_runtime import GuardError

class ChefIfscGuardTests(unittest.TestCase):
    def test_foreign_or_ambiguous_leaf_cannot_be_overwritten(self):
        foreign={'name':'foreign','properties':{'path':release.PATH,'description':release.OWNER}}
        with self.assertRaises(GuardError):release.check_owner([foreign])
        owned={'name':release.API,'properties':{'path':release.PATH,'description':release.OWNER}}
        with self.assertRaises(GuardError):release.check_owner([owned,owned])
        self.assertEqual(owned,release.check_owner([owned]))
    def test_lookup_policy_preserves_authentication_and_private_response(self):
        root=ET.fromstring(release.policy('https://bank.example.com'))
        self.assertEqual('401',root.find('./inbound/choose/when/return-response/set-status').get('code'))
        self.assertEqual('false',root.find('./inbound/rewrite-uri').get('copy-unmatched-params'))
        self.assertEqual('private, no-store',root.find('./outbound/set-header/value').text)
        self.assertEqual('https://bank.example.com',root.find('./inbound/set-backend-service').get('base-url'))
    def test_unexpected_operations_and_overriding_policies_block_publication(self):
        item={'name':'ifsc-get','properties':{'method':'GET','urlTemplate':'/{ifsc}','templateParameters':[release.PARAM]}}
        with patch.object(release,'pages',return_value=[]):release.check_operations('https://management.azure.com/example',[item],True)
        with patch.object(release,'pages',return_value=[{'properties':{}}]):
            with self.assertRaises(GuardError):release.check_operations('https://management.azure.com/example',[item],True)
        with self.assertRaises(GuardError):release.check_operations('unused',[{'name':'bank-post','properties':{'method':'POST'}}])

if __name__=='__main__':unittest.main()
