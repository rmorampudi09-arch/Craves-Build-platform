#!/usr/bin/env python3
"""Source-only tests for the narrowly reviewed automatic-validation exception."""
import copy
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import yaml

ROOT = Path(__file__).resolve().parents[3]
ADMIN = 'azure-pipelines-admin-dashboard.yml'


class PipelineValidationTest(unittest.TestCase):
    def run_validation(self, document=None, filename=ADMIN, raw=None):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            release=root/'scripts/release'; release.mkdir(parents=True)
            shutil.copy2(ROOT/'scripts/release/validate-pipeline-yaml.py', release)
            (root/filename).parent.mkdir(parents=True, exist_ok=True)
            (root/filename).write_text(raw if raw is not None else yaml.safe_dump(document, sort_keys=False))
            return subprocess.run(['python3',str(release/'validate-pipeline-yaml.py')],text=True,capture_output=True,timeout=10)

    def admin(self):
        return yaml.safe_load((ROOT/ADMIN).read_text())

    def test_reviewed_validation_and_manual_production_contract_passes(self):
        result=self.run_validation(self.admin())
        self.assertEqual(result.returncode,0,result.stderr)

    def test_unguarded_automatic_deployment_rejected(self):
        data=self.admin(); data['stages'][2]['condition']='succeeded()'
        self.assertNotEqual(self.run_validation(data).returncode,0)

    def test_manual_main_and_confirmation_cannot_be_removed(self):
        for index in (1,2):
            for part in ("eq('${{ parameters.deployProduction }}', 'true')", "eq(variables['Build.Reason'], 'Manual')", "eq(variables['Build.SourceBranch'], 'refs/heads/main')"):
                with self.subTest(stage=index,guard=part):
                    data=self.admin(); data['stages'][index]['condition']=data['stages'][index]['condition'].replace(part,'true')
                    self.assertNotEqual(self.run_validation(data).returncode,0)

    def test_production_default_true_rejected(self):
        data=self.admin(); data['parameters'][0]['default']=True
        self.assertNotEqual(self.run_validation(data).returncode,0)

    def test_exact_source_and_evidence_invocation_cannot_be_removed(self):
        for token in ('verify-web-release-evidence.py', 'git rev-parse HEAD', 'BUILD_SOURCEVERSION', 'BUILD_REASON'):
            with self.subTest(token=token):
                data=self.admin(); data['stages'][0]['jobs'][0]['steps'][1]['script']=data['stages'][0]['jobs'][0]['steps'][1]['script'].replace(token,'removed_guard')
                self.assertNotEqual(self.run_validation(data).returncode,0)

    def test_unreviewed_trigger_stage_or_script_edit_rejected(self):
        for mutation in ('trigger','stage','script','job','dependency'):
            with self.subTest(mutation=mutation):
                data=self.admin()
                if mutation=='trigger': data['trigger']['branches']['include'].append('unreviewed')
                if mutation=='stage': data['stages'].append({'stage':'HiddenDeploy','jobs':[{'job':'deploy','steps':[{'script':'az containerapp update'}]}]})
                if mutation=='script': data['stages'][0]['jobs'][0]['steps'].append({'script':'az containerapp update'})
                if mutation=='job': data['stages'][0]['jobs'].append({'job':'HiddenDeploy','steps':[{'script':'docker push'}]})
                if mutation=='dependency': data['stages'][2]['dependsOn']=[]
                self.assertNotEqual(self.run_validation(data).returncode,0)

    def test_missing_triggers_cannot_fall_back_to_implied_ci(self):
        data=self.admin(); data.pop('trigger'); data.pop('pr')
        data['stages'][2]['condition']='succeeded()'
        self.assertNotEqual(self.run_validation(data).returncode,0)

    def test_filename_alone_does_not_authorize_an_exception(self):
        data={'trigger':{'branches':{'include':['main']}},'steps':[{'script':'az containerapp update'}]}
        self.assertNotEqual(self.run_validation(data).returncode,0)
        self.assertNotEqual(self.run_validation(self.admin(),filename='azure-pipelines-other.yml').returncode,0)

    def test_existing_manual_azure_pipeline_is_unchanged(self):
        result=self.run_validation({'trigger':'none','pr':'none','steps':[{'script':'echo manual'}]},filename='azure-pipelines-manual.yml')
        self.assertEqual(result.returncode,0,result.stderr)

    def test_github_workflow_behavior_is_unchanged(self):
        result=self.run_validation({'on':['push'],'jobs':{'test':{'steps':[{'run':'echo test'}]}}},filename='.github/workflows/test.yml')
        self.assertEqual(result.returncode,0,result.stderr)

    def test_duplicate_guard_keys_rejected(self):
        text=(ROOT/ADMIN).read_text().replace('    condition: and(succeeded()', '    condition: always()\n    condition: and(succeeded()',1)
        self.assertNotEqual(self.run_validation(raw=text).returncode,0)


if __name__ == '__main__':
    unittest.main()
