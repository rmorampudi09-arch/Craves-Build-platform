"""Exercise the actual named follow-up predicate; no GitHub/cloud access."""
import ast
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

SCRIPT=Path(__file__).resolve().parents[1]/'referrals/verify-backend-scope.py'

class SubscriptionRecoveryScopeTest(unittest.TestCase):
 def setUp(self):
  tree=ast.parse(SCRIPT.read_text())
  names={'FOLLOWUP_BASE','FOLLOWUP_REQUIRED','FOLLOWUP_OPTIONAL'}
  nodes=[n for n in tree.body if (isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in names for t in n.targets))
         or (isinstance(n,ast.FunctionDef) and n.name=='reviewed_subscription_recovery_scope')]
  self.process=Mock()
  self.scope={'subprocess':self.process}
  exec(compile(ast.Module(body=nodes,type_ignores=[]),str(SCRIPT),'exec'),self.scope)
  self.rows=[f'{state}\t{path}' for path,state in {**self.scope['FOLLOWUP_REQUIRED'],**self.scope['FOLLOWUP_OPTIONAL']}.items()]
 def check(self,rows=None,ancestor=True):
  self.process.run.return_value=SimpleNamespace(returncode=0 if ancestor else 1)
  self.process.check_output.return_value='\n'.join(self.rows if rows is None else rows)
  return self.scope['reviewed_subscription_recovery_scope']()
 def test_exact_six_path_followup_passes_with_pinned_ancestry(self):
  self.assertTrue(self.check())
  self.process.check_output.assert_called_once_with(['git','diff','--name-status','--no-renames',self.scope['FOLLOWUP_BASE'],'HEAD'],text=True)
 def test_no_workflow_change_is_allowed(self):
  self.assertFalse(self.check(self.rows+['M\t.github/workflows/launch-regression-ci.yml']))
 def test_no_applied_migration_change_is_allowed(self):
  self.assertFalse(self.check(self.rows+['M\tservices/integration-service/src/main/resources/db/migration/V144__chef_referral_earnings.sql']))
 def test_missing_recovery_tests_are_rejected(self):
  self.assertFalse(self.check([r for r in self.rows if 'RazorpayOrderRecoveryTest.java' not in r]))
 def test_deletion_or_rename_cannot_use_modified_allowance(self):
  for status in ('D','R100'):
   with self.subTest(status=status):
    self.assertFalse(self.check([self.rows[0].replace('M\t',status+'\t',1),*self.rows[1:]]))
 def test_unrelated_backend_and_document_additions_are_rejected(self):
  for path in ('services/order-service/src/main/java/Unreviewed.java','docs/new-announcement.md'):
   with self.subTest(path=path):self.assertFalse(self.check(self.rows+['A\t'+path]))
 def test_duplicate_paths_and_empty_diff_are_rejected(self):
  self.assertFalse(self.check(self.rows+[self.rows[0]]))
  self.assertFalse(self.check([]))
 def test_unrelated_baseline_never_reads_or_accepts_diff(self):
  self.assertFalse(self.check(ancestor=False))
  self.process.check_output.assert_not_called()
 def test_original_review_gate_and_compatibility_boundary_remain(self):
  source=SCRIPT.read_text()
  self.assertIn("ACCEPTED='075382779390902040e504466fe82345b3fecf92'",source)
  self.assertIn("BASE='d0c1245a3e1e02c43d1b70578491fbc54f2baf3c'",source)
  self.assertIn("Out of reviewed backend scope:",source)
  self.assertIn('full referral compatibility tests still required',source)

if __name__=='__main__':unittest.main()
