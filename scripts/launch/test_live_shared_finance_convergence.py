"""Guard the real applied delivery migration and the additive finance successor."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("history", ROOT / "scripts/email/inspect-applied-email-history.py")
history = importlib.util.module_from_spec(spec); spec.loader.exec_module(history)
spec = importlib.util.spec_from_file_location("release", ROOT / "scripts/finance/shared_chef_finance_release.py")
release = importlib.util.module_from_spec(spec); spec.loader.exec_module(release)


class LiveConvergenceTest(unittest.TestCase):
    def test_actual_live_v147_is_preserved_with_its_recorded_checksum(self):
        path = ROOT / "services/integration-service/src/main/resources/db/migration/V147__borzo_pidge_timed_handoff.sql"
        self.assertEqual(-837191910, history.crc(path.read_text()))
        self.assertFalse(path.with_name("V147__shared_chef_finance_terms.sql").exists())

    def test_only_shared_finance_v148_may_be_pending_after_the_live_prefix(self):
        history.REQUIRED["integration-service"] = set(); expected = history.expected("integration-service")
        rows = [{"version": v, "type": "SQL", "success": True, **data} for v, data in expected.items() if v != "148"]
        applied = release.validate_history(rows)
        self.assertIn("147", applied); self.assertNotIn("148", applied)
        self.assertEqual("V148__shared_chef_finance_terms.sql", expected["148"]["script"])
        with self.assertRaises(ValueError): release.validate_history([x for x in rows if x["version"] != "147"])
        delivery = next(x for x in rows if x["version"] == "147"); delivery["checksum"] += 1
        with self.assertRaises(ValueError): release.validate_history(rows)


if __name__ == "__main__": unittest.main()
