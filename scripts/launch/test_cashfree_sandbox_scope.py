"""Actual eight-path Cashfree follow-up predicate; no network or Azure writes."""
import ast
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

SCRIPT=Path(__file__).resolve().parents[1]/'referrals/verify-backend-scope.py'

class CashfreeSandboxScopeTest(unittest.TestCase):
 def setUp(self):
  tree=ast.parse(SCRIPT.read_text())
  names={'SANDBOX_BASE','SANDBOX_REQUIRED','SANDBOX_OPTIONAL'}
  nodes=[n for n in tree.body if (isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in names for t in n.targets))
         or (isinstance(n,ast.FunctionDef) and n.name=='reviewed_cashfree_sandbox_scope')]
  self.process=Mock(); self.scope={'subprocess':self.process}
  exec(compile(ast.Module(body=nodes,type_ignores=[]),str(SCRIPT),'exec'),self.scope)
  self.rows=[f'{state}\t{path}' for path,state in {**self.scope['SANDBOX_REQUIRED'],**self.scope['SANDBOX_OPTIONAL']}.items()]
 def check(self,rows=None,ancestor=True):
  self.process.run.return_value=SimpleNamespace(returncode=0 if ancestor else 1)
  self.process.check_output.return_value='\n'.join(self.rows if rows is None else rows)
  return self.scope['reviewed_cashfree_sandbox_scope']()
 def test_exact_named_paths_pass(self):
  self.assertTrue(self.check())
  self.assertEqual(len(self.rows),8)
  self.process.check_output.assert_called_once_with(['git','diff','--name-status','--no-renames',self.scope['SANDBOX_BASE'],'HEAD'],text=True)
 def test_no_workflow_or_runtime_script_change_allowed(self):
  for path in ('.github/workflows/launch-regression-ci.yml','azure-pipelines-email-readiness-status.yml'):
   with self.subTest(path=path):self.assertFalse(self.check(self.rows+['M\t'+path]))
 def test_no_applied_migration_change_allowed(self):
  self.assertFalse(self.check(self.rows+['M\tservices/integration-service/src/main/resources/db/migration/V108__provider_neutral_payments_and_razorpay.sql']))
 def test_both_guards_and_new_migration_and_tests_are_required(self):
  for path in self.scope['SANDBOX_REQUIRED']:
   with self.subTest(path=path):self.assertFalse(self.check([r for r in self.rows if not r.endswith('\t'+path)]))
 def test_deleted_or_renamed_file_is_rejected(self):
  for state in ('D','R100'):
   with self.subTest(state=state):self.assertFalse(self.check([state+'\t'+self.rows[0].split('\t')[1],*self.rows[1:]]))
 def test_referral_or_other_service_changes_are_rejected(self):
  for path in ('services/referral-service/pom.xml','services/order-service/src/main/java/Other.java','docs/announcement.md'):
   with self.subTest(path=path):self.assertFalse(self.check(self.rows+['A\t'+path]))
 def test_duplicate_and_empty_scope_rejected(self):
  self.assertFalse(self.check([]));self.assertFalse(self.check(self.rows+[self.rows[0]]))
 def test_unrelated_baseline_rejected_before_diff(self):
  self.assertFalse(self.check(ancestor=False));self.process.check_output.assert_not_called()
 def test_existing_protections_retained(self):
  source=SCRIPT.read_text()
  self.assertIn("ACCEPTED='075382779390902040e504466fe82345b3fecf92'",source)
  self.assertIn("BASE='d0c1245a3e1e02c43d1b70578491fbc54f2baf3c'",source)
  self.assertIn('reviewed_subscription_recovery_scope()',source)
  self.assertIn('Out of reviewed backend scope:',source)

if __name__=='__main__':unittest.main()
