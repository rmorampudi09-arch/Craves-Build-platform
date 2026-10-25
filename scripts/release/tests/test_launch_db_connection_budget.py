"""The services sharing the prodlow PostgreSQL server must fit 45 connections at their max replicas.

Runs in launch regression CI (test_launch_*.py).
"""
import importlib.util
import shutil
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('budget', ROOT / 'scripts/release/check-db-connection-budget.py')
budget = importlib.util.module_from_spec(spec)
spec.loader.exec_module(budget)


class DbConnectionBudgetTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        names = set(budget.SHARED_INFRA) | {f'services/{s}/src/main/resources/application.yml' for s in budget.SERVICES}
        names |= {name for files, _ in budget.SERVICES.values() for name in files}
        for name in names:
            (self.root / name).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / name, self.root / name)

    def edit(self, name, old, new):
        path = self.root / name
        text = path.read_text()
        self.assertIn(old, text)
        path.write_text(text.replace(old, new))

    def test_repository_fits_the_budget(self):
        lines, problems = budget.check(ROOT)
        self.assertEqual(problems, [])
        self.assertEqual(len(lines), len(budget.SERVICES) + 1)

    def test_a_bigger_pool_fails(self):
        self.edit('services/order-service/src/main/resources/application.yml', 'MAX_POOL_SIZE:3}', 'MAX_POOL_SIZE:10}')
        _, problems = budget.check(self.root)
        self.assertTrue(any('over the 45' in p for p in problems), problems)

    def test_more_replicas_in_either_infra_template_fail(self):
        self.edit('infra/main.bicep', "name: 'integration-service'\n    containerName: 'integration-service'\n"
                  "    external: false\n    minReplicas: 0\n    maxReplicas: 2",
                  "name: 'integration-service'\n    containerName: 'integration-service'\n"
                  "    external: false\n    minReplicas: 0\n    maxReplicas: 5")
        lines, problems = budget.check(self.root)
        self.assertIn('integration-service    pool  4 x max replicas 5 = 20', lines)
        self.assertTrue(problems)

    def test_the_env_value_a_bicep_deploys_wins_over_the_default(self):
        self.edit('services/referral-service/deploy/main.bicep', "value: '4'", "value: '30'")
        lines, problems = budget.check(self.root)
        self.assertIn('referral-service       pool 30 x max replicas 1 = 30', lines)
        self.assertTrue(problems)

    def test_a_service_without_an_explicit_pool_fails(self):
        self.edit('services/integration-service/src/main/resources/application.yml',
                  'maximum-pool-size: ${SPRING_DATASOURCE_HIKARI_MAX_POOL_SIZE:4}', '')
        _, problems = budget.check(self.root)
        self.assertIn('integration-service: set spring.datasource.hikari.maximum-pool-size explicitly', problems)

    def test_cli_exit_code(self):
        self.assertEqual(budget.main(['--root', str(ROOT)]), 0)
        self.edit('services/notification-service/src/main/resources/application.yml', 'MAX_POOL_SIZE:2}', 'MAX_POOL_SIZE:20}')
        self.assertEqual(budget.main(['--root', str(self.root)]), 1)


if __name__ == '__main__':
    unittest.main()
