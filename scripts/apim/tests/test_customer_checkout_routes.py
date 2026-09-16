import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

spec=importlib.util.spec_from_file_location('checkout',Path(__file__).resolve().parents[1]/'customer-checkout-routes.py')
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)

class CheckoutRoutesTest(unittest.TestCase):
    def test_only_operation_pair(self):
        self.assertEqual(c.ROUTES,[('execute-checkout-operation','POST'),('get-checkout-operation','GET')])
        self.assertEqual(c.PATH,'/operations/{operationId}')
    def test_policy_keeps_authentication_and_disables_cache(self):
        root=ET.fromstring(c.policy('https://order.example.test'))
        self.assertEqual(root.find('inbound')[0].tag,'base')
        self.assertEqual(root.find('inbound/set-backend-service').get('base-url'),'https://order.example.test/api/v1/checkout')
        self.assertEqual(root.find('inbound/rewrite-uri').get('template'),c.PATH)
        self.assertEqual(root.find('inbound/choose/when/return-response/set-status').get('code'),'401')
        self.assertIn('no-store',root.find('outbound/set-header/value').text)
    @patch.object(c.safe,'runtime')
    @patch.object(c.safe,'az',return_value={'id':'wrong'})
    def test_wrong_subscription_never_reaches_runtime(self,az,runtime):
        with self.assertRaisesRegex(RuntimeError,'Wrong subscription'):c.main('pinned',True)
        runtime.assert_not_called()
    @patch.object(c.safe,'rest')
    @patch.object(c.safe,'read_policies')
    @patch.object(c.safe,'runtime',return_value='https://order.example.test')
    @patch.object(c.safe,'az',side_effect=[{'id':c.safe.SUB},[]])
    def test_missing_api_never_writes(self,az,runtime,policies,rest):
        with self.assertRaisesRegex(RuntimeError,'ownership'):c.main('pinned',True)
        rest.assert_not_called()

if __name__=='__main__':unittest.main()
