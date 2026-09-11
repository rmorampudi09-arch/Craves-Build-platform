import importlib.util
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET

spec=importlib.util.spec_from_file_location('pdf_apim',Path(__file__).with_name('configure-apim.py'))
module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)

class ApimPlanTests(unittest.TestCase):
    def test_route_allowlist_and_queries(self):
        plan=module.plan('example.region.azurecontainerapps.io')
        self.assertEqual(7,len(plan['operations']))
        self.assertEqual('api/v1/documents',plan['api']['properties']['path'])
        for item in plan['operations']:
            xml=ET.fromstring(item['policy']['properties']['value'])
            rewrite=xml.find('./inbound/rewrite-uri')
            self.assertEqual('true',rewrite.attrib['copy-unmatched-params'])
            self.assertNotIn('set-body',item['policy']['properties']['value'])
    def test_privacy_guards(self):
        for tag in ['cache-lookup','cache-store','set-body','log-to-eventhub','trace']:
            with self.assertRaises(RuntimeError): module.policy_safe(f'<policies><inbound><{tag}/></inbound></policies>')
        module.policy_safe('<policies><inbound><base/></inbound></policies>')
    def test_body_and_credential_logging_rejected(self):
        with self.assertRaises(RuntimeError): module.diagnostics_safe({'value':[{'properties':{'frontend':{'request':{'body':{'bytes':100}}}}}]})
        with self.assertRaises(RuntimeError): module.diagnostics_safe({'value':[{'properties':{'backend':{'request':{'headers':['Authorization']}}}}]})
        module.diagnostics_safe({'value':[{'properties':{'frontend':{'request':{'body':{'bytes':0}}}}}]})
    def test_untrusted_backend_host_rejected(self):
        for host in ['example.com','https://example.com','example.azurecontainerapps.io/path','example.azurecontainerapps.io?token=x']:
            with self.assertRaises(ValueError): module.plan(host)

if __name__=='__main__': unittest.main()
