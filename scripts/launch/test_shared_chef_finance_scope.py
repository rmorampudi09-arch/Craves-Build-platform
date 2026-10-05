"""Verify the exact shared-finance follow-up boundary without network access."""
import ast
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

SCRIPT = Path(__file__).resolve().parents[1] / 'referrals/verify-backend-scope.py'


class SharedChefFinanceScopeTest(unittest.TestCase):
    def setUp(self):
        names = {'SHARED_FINANCE_BASE', 'SHARED_FINANCE_REQUIRED'}
        nodes = [n for n in ast.parse(SCRIPT.read_text()).body
                 if (isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id in names for t in n.targets))
                 or (isinstance(n, ast.FunctionDef) and n.name == 'reviewed_shared_chef_finance_scope')]
        self.process = Mock(); self.scope = {'subprocess': self.process}
        exec(compile(ast.Module(body=nodes, type_ignores=[]), str(SCRIPT), 'exec'), self.scope)
        self.rows = [state + '\t' + path for path, state in self.scope['SHARED_FINANCE_REQUIRED'].items()]

    def check(self, rows=None, ancestor=True):
        self.process.run.return_value = SimpleNamespace(returncode=0 if ancestor else 1)
        self.process.check_output.return_value = '\n'.join(self.rows if rows is None else rows)
        return self.scope['reviewed_shared_chef_finance_scope']()

    def test_exact_named_finance_followup_is_accepted(self):
        self.assertTrue(self.check())
        self.process.check_output.assert_called_once_with(['git', 'diff', '--name-status', '--no-renames', self.scope['SHARED_FINANCE_BASE'], 'HEAD'], text=True)

    def test_every_approval_migration_and_financial_preservation_test_is_required(self):
        for row in self.rows:
            with self.subTest(row=row): self.assertFalse(self.check([r for r in self.rows if r != row]))

    def test_applied_migrations_and_referral_logic_cannot_change(self):
        for path in ('services/integration-service/src/main/resources/db/migration/V144__chef_referral_earnings.sql',
                     'services/referral-service/pom.xml', 'services/order-service/src/main/java/Other.java'):
            with self.subTest(path=path): self.assertFalse(self.check(self.rows + ['M\t' + path]))

    def test_frontend_and_other_release_workflows_cannot_change(self):
        for path in ('apps/customer-web-next/package.json', '.github/workflows/azure-foundation-deploy.yml'):
            with self.subTest(path=path): self.assertFalse(self.check(self.rows + ['M\t' + path]))

    def test_deletion_rename_duplicate_and_empty_changes_are_rejected(self):
        for status in ('D', 'R100'):
            with self.subTest(status=status): self.assertFalse(self.check([status + '\t' + self.rows[0].split('\t')[1], *self.rows[1:]]))
        self.assertFalse(self.check(self.rows + [self.rows[0]])); self.assertFalse(self.check([]))

    def test_wrong_ancestry_cannot_inspect_or_accept_changes(self):
        self.assertFalse(self.check(ancestor=False)); self.process.check_output.assert_not_called()

    def test_original_review_guards_and_full_compatibility_requirement_remain(self):
        source = SCRIPT.read_text()
        self.assertIn("ACCEPTED='075382779390902040e504466fe82345b3fecf92'", source)
        self.assertIn("BASE='d0c1245a3e1e02c43d1b70578491fbc54f2baf3c'", source)
        self.assertIn('Out of reviewed backend scope:', source)
        self.assertIn('full referral compatibility tests still required', source)


if __name__ == '__main__': unittest.main()
