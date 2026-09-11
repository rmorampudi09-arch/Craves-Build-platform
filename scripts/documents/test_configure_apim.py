import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
from types import SimpleNamespace
import xml.etree.ElementTree as ET

spec=importlib.util.spec_from_file_location('pdf_apim',Path(__file__).with_name('configure-apim.py'))
module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)

class ApimPlanTests(unittest.TestCase):
    def test_missing_api_cli_response_is_allowed_only_when_requested(self):
        response=SimpleNamespace(returncode=1,stdout='',stderr='ERROR: Not Found({"error":{"code":"ResourceNotFound","message":"Api not found."}})')
        with patch.object(module.subprocess,'run',return_value=response):
            self.assertIsNone(module.rest('GET','https://management.azure.com/test',absent_ok=True))
            with self.assertRaises(RuntimeError): module.rest('GET','https://management.azure.com/test')
        response.stderr='ERROR: Forbidden({"error":{"code":"AuthorizationFailed"}})'
        with patch.object(module.subprocess,'run',return_value=response):
            with self.assertRaises(RuntimeError): module.rest('GET','https://management.azure.com/test',absent_ok=True)

    def test_policy_json_with_utf8_bom(self):
        response=SimpleNamespace(returncode=0,stdout='\ufeff{"properties":{"value":"<policies/>"}}',stderr='')
        with patch.object(module.subprocess,'run',return_value=response):
            self.assertEqual('<policies/>',module.rest('GET','https://management.azure.com/test')['properties']['value'])

    def test_raw_policy_xml_response(self):
        xml='\ufeff<!-- Azure policy -->\n<policies><inbound/><backend><forward-request/></backend><outbound/></policies>'
        response=SimpleNamespace(returncode=0,stdout=xml,stderr='')
        with patch.object(module.subprocess,'run',return_value=response):
            policy=module.rest('GET','https://management.azure.com/service/policies/policy?api-version=2022-08-01')
            module.policy_safe(policy['properties']['value'])
            with self.assertRaises(ValueError): module.rest('GET','https://management.azure.com/service/apis?api-version=2022-08-01')

    def test_consumption_uses_supported_concurrency_guard(self):
        xml=ET.fromstring(module.policy_document('Consumption'))
        self.assertIsNone(xml.find('./inbound/rate-limit-by-key'))
        self.assertEqual('8',xml.find('./backend/limit-concurrency').attrib['max-count'])
        self.assertIsNotNone(xml.find('./backend/limit-concurrency/forward-request'))
        self.assertIsNotNone(ET.fromstring(module.policy_document('Standard')).find('./inbound/rate-limit-by-key'))

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
