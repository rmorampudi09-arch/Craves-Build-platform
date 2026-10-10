"""Mutation tests for the exact reviewed checkout contract, entirely in temporary local files."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
PREFIX = Path('services/order-service/src/main/resources/db/migration')
GUARD = Path('scripts/release/verify-customer-checkout-contract.py')
MANIFEST = Path('scripts/release/device-cart-live-contract.json')
V33 = PREFIX / 'V33__checkout_operation_recovery.sql'
V34 = PREFIX / 'V34__composite_refund_completion.sql'


class CustomerCheckoutContractGuardTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='checkout-contract-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        files = set(json.loads((ROOT / MANIFEST).read_text())['files'])
        files.update(map(str, [GUARD, MANIFEST, V33, V34]))
        for name in files:
            destination = self.root / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, destination)

    def run_guard(self):
        return subprocess.run([sys.executable, str(self.root / GUARD)], text=True, capture_output=True)

    def assert_blocked(self, message):
        result = self.run_guard()
        self.assertNotEqual(0, result.returncode)
        self.assertIn(message, result.stdout + result.stderr)

    def change(self, path):
        with (self.root / path).open('a') as output:
            output.write('\n-- synthetic contract mutation\n')

    def test_exact_reviewed_candidate_passes(self):
        result = self.run_guard()
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn('exact reviewed V33 and V34 additions only', result.stdout)

    def test_modified_v33_is_rejected(self):
        self.change(V33)
        self.assert_blocked('Reviewed checkout migration changed: ' + str(V33))

    def test_modified_v34_is_rejected(self):
        self.change(V34)
        self.assert_blocked('Reviewed checkout migration changed: ' + str(V34))

    def test_extra_v35_is_rejected(self):
        (self.root / PREFIX / 'V35__unreviewed.sql').write_text('SELECT 1;\n')
        self.assert_blocked('Unreviewed checkout migration set')

    def test_arbitrary_extra_migration_is_rejected(self):
        (self.root / PREFIX / 'V999__unreviewed.sql').write_text('SELECT 1;\n')
        self.assert_blocked('Unreviewed checkout migration set')

    def test_missing_v33_is_rejected(self):
        (self.root / V33).unlink()
        self.assert_blocked('Unreviewed checkout migration set')

    def test_missing_v34_is_rejected(self):
        (self.root / V34).unlink()
        self.assert_blocked('Unreviewed checkout migration set')

    def test_historical_migration_change_is_rejected(self):
        path = PREFIX / 'V1__order_schema.sql'
        self.change(path)
        self.assert_blocked('Live contract changed: ' + str(path))

    def test_protected_source_change_is_rejected(self):
        files = json.loads((ROOT / MANIFEST).read_text())['files']
        path = next(name for name in files if '/db/migration/' not in name)
        self.change(path)
        self.assert_blocked('Live contract changed: ' + path)


if __name__ == '__main__':
    unittest.main()
