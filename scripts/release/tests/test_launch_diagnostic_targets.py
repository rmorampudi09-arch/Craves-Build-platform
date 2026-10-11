#!/usr/bin/env python3
"""Test source guards only. No diagnostic application or provider command runs."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import yaml

ROOT = Path(__file__).resolve().parents[3]
FILES = ('azure-pipelines-api-test-dashboard.yml', 'azure-pipelines-firebase-auth-test.yml')
GOOD = {'DIAGNOSTIC_RESOURCE_GROUP':'rg-fixture-test', 'DIAGNOSTIC_CONTAINER_APP':'ca-fixture-test',
        'DIAGNOSTIC_REGISTRY':'fixturetestacr', 'CONFIRM_ISOLATED_DIAGNOSTIC_TARGETS':'true',
        'DIAGNOSTIC_IMAGE_TAG':'fixture-build-123'}
BINDINGS = {'DIAGNOSTIC_RESOURCE_GROUP':'resourceGroup','DIAGNOSTIC_CONTAINER_APP':'containerAppName',
            'DIAGNOSTIC_REGISTRY':'acrName','CONFIRM_ISOLATED_DIAGNOSTIC_TARGETS':'confirmIsolatedDiagnosticTargets',
            'DIAGNOSTIC_IMAGE_TAG':'imageTag'}


class DiagnosticTargetTest(unittest.TestCase):
    def document(self, name):
        return yaml.safe_load((ROOT/name).read_text())

    def execute_guard(self, name, values):
        doc=self.document(name)
        self.assertTrue('script' in doc['steps'][1], 'A source-only guard must run before the first AzureCLI task')
        step=doc['steps'][1]
        self.assertEqual(step['env'], {key:'${{ parameters.'+value+' }}' for key,value in BINDINGS.items()})
        self.assertNotIn('${{',step['script'], 'Template parameters must be passed as data through env')
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); calls=root/'calls'
            for command in ('az','docker'):
                p=root/command; p.write_text('#!/bin/sh\necho forbidden >> "$FAKE_CALLS"\nexit 99\n'); p.chmod(0o755)
            result=subprocess.run(['bash','-c',step['script']],cwd=ROOT,text=True,capture_output=True,
                                  env=dict(os.environ,PATH=str(root)+os.pathsep+os.environ['PATH'],FAKE_CALLS=str(calls),**values),timeout=10)
            self.assertFalse(calls.exists(), 'Rejected targets must never authenticate, build, push or mutate')
            return result

    def test_defaults_fail_closed_before_any_provider_task(self):
        for name in FILES:
            with self.subTest(name=name):
                params={v['name']:v for v in self.document(name)['parameters']}
                for key in ('resourceGroup','containerAppName','acrName'):
                    self.assertEqual(params[key]['default'],'')
                self.assertIs(params['confirmIsolatedDiagnosticTargets']['default'],False)
                result=self.execute_guard(name,{key:str(params[param]['default']) for key,param in BINDINGS.items()})
                self.assertNotEqual(result.returncode,0)
                self.assertNotIn('variable=diagnosticTargetsValidated]true',result.stdout)

    def test_explicit_isolated_test_destinations_are_allowed(self):
        for name in FILES:
            result=self.execute_guard(name,GOOD)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertIn('variable=diagnosticTargetsValidated]true',result.stdout)

    def test_each_target_and_ack_is_required(self):
        for name in FILES:
            for key in GOOD:
                with self.subTest(name=name,key=key):
                    values=dict(GOOD); values[key]=''
                    self.assertNotEqual(self.execute_guard(name,values).returncode,0)

    def test_known_production_names_case_and_aliases_are_rejected(self):
        cases={'DIAGNOSTIC_CONTAINER_APP':['ca-craves-web-prodlow','CA-CRAVES-WEB-PRODLOW','ca-craves-admin-web-prodlow'],
               'DIAGNOSTIC_RESOURCE_GROUP':['rg-craves-prodlow-centralindia','RG-CRAVES-PRODLOW-CENTRALINDIA'],
               'DIAGNOSTIC_REGISTRY':['cravesprodlowacr82121','CRAVESPRODLOWACR82121','cravesprodlowacr82121.azurecr.io','https://cravesprodlowacr82121.azurecr.io']}
        for name in FILES:
            for key,values in cases.items():
                for value in values:
                    with self.subTest(name=name,key=key,value=value):
                        inputs=dict(GOOD); inputs[key]=value
                        self.assertNotEqual(self.execute_guard(name,inputs).returncode,0)

    def test_injection_shaped_and_blank_targets_are_only_data(self):
        for name in FILES:
            for key in BINDINGS:
                for value in (' ', '$(az login)', "x'; docker push forbidden; #", '\nazure-login', '--name=other'):
                    with self.subTest(name=name,key=key,value=value):
                        inputs=dict(GOOD); inputs[key]=value
                        self.assertNotEqual(self.execute_guard(name,inputs).returncode,0)

    def test_image_tag_shape_length_and_mutable_alias_reject_before_authentication(self):
        for name in FILES:
            for value in ('', 'latest', 'LATEST', 'a'*129, 'tag:other', 'tag/other', '-starts-with-hyphen'):
                with self.subTest(name=name,value=value):
                    inputs=dict(GOOD); inputs['DIAGNOSTIC_IMAGE_TAG']=value
                    self.assertNotEqual(self.execute_guard(name,inputs).returncode,0)

    def test_no_production_escape_parameter(self):
        for name in FILES:
            params=self.document(name)['parameters']
            self.assertFalse(any('production' in p['name'].lower() or 'allowprod' in p['name'].lower() for p in params))

    def test_every_azure_script_rechecks_targets_and_logs_require_validation(self):
        for name in FILES:
            tasks=[s for s in self.document(name)['steps'] if s.get('task')=='AzureCLI@2']
            self.assertEqual(len(tasks),3)
            for task in tasks:
                body=task['inputs']['inlineScript']
                self.assertTrue(body.startswith('set -euo pipefail\nbash scripts/release/validate-diagnostic-target.sh\n'))
                self.assertNotIn('${{ parameters.imageTag }}', body)
                if 'IMAGE=' in body:
                    self.assertIn(':${DIAGNOSTIC_IMAGE_TAG}', body)
                self.assertEqual(task['env'],{key:'${{ parameters.'+value+' }}' for key,value in BINDINGS.items()})
            self.assertEqual(tasks[-1]['condition'],"and(always(), eq(variables['diagnosticTargetsValidated'], 'true'))")


if __name__ == '__main__':
    unittest.main()
