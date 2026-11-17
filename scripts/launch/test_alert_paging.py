"""Phone paging in infra/monitoring: paged codes have a rule, and the repo holds no phone number."""
import re
import unittest
from pathlib import Path

MONITORING = Path(__file__).resolve().parents[2] / "infra" / "monitoring"
BICEP = (MONITORING / "silent-failure-alerts.bicep").read_text(encoding="utf-8")


class AlertPagingTest(unittest.TestCase):
    def test_every_paged_code_has_a_rule(self):
        rules = set(re.findall(r"\{ code: '([A-Z_]+)'", BICEP))
        paged = re.findall(r"'([A-Z_]+)'", re.search(r"var pagedCodes = \[(.*?)\n\]", BICEP, re.S).group(1))
        self.assertTrue(paged)
        self.assertEqual(set(paged) - rules, set())

    def test_paging_is_off_until_a_number_is_passed(self):
        self.assertIn("param pagePhoneNumbers array = []\n", BICEP)
        self.assertIn("var paging = deployAlerts && !empty(pagePhoneNumbers)\n", BICEP)
        self.assertIn("= if (paging) {", BICEP)

    def test_no_phone_number_in_the_folder(self):
        for path in MONITORING.iterdir():
            self.assertIsNone(re.search(r"\d{10}", path.read_text(encoding="utf-8")), path.name)


if __name__ == "__main__":
    unittest.main()
