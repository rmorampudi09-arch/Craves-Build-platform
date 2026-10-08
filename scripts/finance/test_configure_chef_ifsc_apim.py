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

    def policy_fixture(self, subscription=True):
        backend='https://bank.example.com'
        expected=release.policy(backend)
        existing={'name':release.API,'properties':{'path':release.PATH,'description':release.OWNER,
                  'serviceUrl':backend,'protocols':['https'],'subscriptionRequired':subscription}}
        legacy=ET.fromstring(expected)
        for node,attribute in ((legacy.find('./inbound/choose/when'),'condition'),
                               (legacy.find('./inbound/rewrite-uri'),'template')):
            node.set(attribute,node.get(attribute).replace('"','&quot;'))
        return backend,expected,existing,ET.tostring(legacy,encoding='unicode')

    def test_publication_uses_xml_to_decode_expression_entities(self):
        backend,expected,_,_=self.policy_fixture()
        with patch.object(release,'put') as put:
            release.publish_policy('https://management.azure.com/example',expected)
        body=put.call_args.args[1]['properties']
        self.assertEqual('xml',body['format'])
        self.assertEqual(expected,body['value'])
        decoded=ET.fromstring(body['value'])
        self.assertNotIn('&quot;',decoded.find('./inbound/choose/when').get('condition'))
        self.assertNotIn('&quot;',decoded.find('./inbound/rewrite-uri').get('template'))

    def test_exact_known_encoding_defect_can_be_repaired_only_while_gated(self):
        backend,expected,existing,legacy=self.policy_fixture()
        release.check_policies(existing,[{'properties':{'value':legacy}}],expected,backend)
        release.check_policies(existing,[{'properties':{'value':expected}}],expected,backend)
        release.check_policies(None,[],expected,backend)
        for change in ({'subscriptionRequired':False},{'serviceUrl':'https://other.example.com'},
                       {'protocols':['http']},{'subscriptionRequired':None}):
            with self.subTest(change=change):
                modified={**existing,'properties':{**existing['properties'],**change}}
                with self.assertRaises(GuardError):release.check_policies(modified,[{'properties':{'value':legacy}}],expected,backend)
        with self.assertRaises(GuardError):release.check_policies(None,[{'properties':{'value':legacy}}],expected,backend)

    def test_other_policy_differences_and_duplicates_remain_blocked(self):
        backend,expected,existing,legacy=self.policy_fixture()
        changes=[legacy.replace('private, no-store','public'),legacy.replace('401','200'),
                 legacy.replace('Bearer ','Basic '),legacy.replace('/api/v1/','/other/'),
                 legacy.replace('https://bank.example.com','https://other.example.com'),
                 legacy.replace('<base />',''),expected.replace('private, no-store','no-store')]
        for changed in changes:
            with self.subTest(policy=changed):
                with self.assertRaises(GuardError):release.check_policies(existing,[{'properties':{'value':changed}}],expected,backend)
        with self.assertRaises(GuardError):release.check_policies(existing,[{'properties':{'value':expected}}]*2,expected,backend)

if __name__=='__main__':unittest.main()
