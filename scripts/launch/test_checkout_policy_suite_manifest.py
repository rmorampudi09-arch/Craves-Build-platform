"""Keep prepared-checkout policy evidence mandatory after replacing the old aspect."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("launch_checkout_policy", Path(__file__).with_name("launch-regression.py"))
LAUNCH = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(LAUNCH)
REQUIRED = {
    "LaunchPolicyCheckoutCompositionDatabaseTest": 23,
    "LaunchPolicyCheckoutDatabaseTest": 47,
    "LaunchPolicyCheckoutValidatorTest": 2,
}
RETIRED = "LaunchPolicyCheckoutAspectTest"


class CheckoutPolicySuiteManifestTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="checkout-policy-evidence-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.reports = self.root / "reports"
        self.sources = self.root / "sources"
        self.reports.mkdir()
        self.sources.mkdir()
        manifest = json.loads((ROOT / "scripts/launch/required-suites.json").read_text())
        self.order_required = manifest["services"]["order-service"]
        self.required = {name: self.order_required[name] for name in REQUIRED}

    def write_report(self, name, tests, outcome=None):
        counts = {"tests": tests, "failures": 0, "errors": 0, "skipped": 0}
        if outcome:
            counts[{"failure": "failures", "error": "errors", "skipped": "skipped"}[outcome]] = 1
        suite = ET.Element("testsuite", name="fixture." + name, **{key: str(value) for key, value in counts.items()})
        for number in range(tests):
            case = ET.SubElement(suite, "testcase", name="case" + str(number))
            if outcome and number == 0:
                ET.SubElement(case, outcome)
        ET.ElementTree(suite).write(self.reports / ("TEST-" + name + ".xml"), encoding="unicode")

    def passing_reports(self):
        for report in self.reports.glob("*.xml"):
            report.unlink()
        for name, minimum in REQUIRED.items():
            self.write_report(name, minimum)

    def result(self):
        return LAUNCH.java_result("order-service", self.reports, self.required, self.sources)

    def test_manifest_names_and_exact_reviewed_minima(self):
        self.assertNotIn(RETIRED, self.order_required)
        self.assertEqual(REQUIRED, self.required)

    def test_replacement_source_and_retired_source_match_manifest(self):
        source = ROOT / "services/order-service/src/test/java/in/craves/order"
        for name in REQUIRED:
            self.assertEqual(1, len(list(source.rglob(name + ".java"))), name)
        self.assertEqual([], list(source.rglob(RETIRED + ".java")))

    def test_all_reviewed_cases_pass_without_a_retired_report(self):
        self.passing_reports()
        result = self.result()
        self.assertEqual("GREEN", result["status"], result["issues"])
        self.assertEqual(72, result["counts"]["tests"])
        self.assertEqual(0, result["counts"]["skipped"])

    def test_each_missing_suite_is_rejected(self):
        for name in REQUIRED:
            with self.subTest(name=name):
                self.passing_reports()
                (self.reports / ("TEST-" + name + ".xml")).unlink()
                result = self.result()
                self.assertEqual("RED", result["status"])
                self.assertTrue(any(name in issue for issue in result["issues"]))

    def test_each_undercount_is_rejected(self):
        for name, minimum in REQUIRED.items():
            with self.subTest(name=name):
                self.passing_reports()
                self.write_report(name, minimum - 1)
                self.assertEqual("RED", self.result()["status"])

    def assert_outcome_rejected(self, outcome):
        for name, minimum in REQUIRED.items():
            with self.subTest(name=name):
                self.passing_reports()
                self.write_report(name, minimum, outcome)
                self.assertEqual("RED", self.result()["status"])

    def test_each_skipped_suite_is_rejected(self):
        self.assert_outcome_rejected("skipped")

    def test_each_failed_suite_is_rejected(self):
        self.assert_outcome_rejected("failure")

    def test_each_errored_suite_is_rejected(self):
        self.assert_outcome_rejected("error")

    def test_retired_report_cannot_replace_the_new_validator_report(self):
        self.passing_reports()
        (self.reports / "TEST-LaunchPolicyCheckoutValidatorTest.xml").unlink()
        self.write_report(RETIRED, 2)
        result = self.result()
        self.assertEqual("RED", result["status"])
        self.assertTrue(any("LaunchPolicyCheckoutValidatorTest" in issue for issue in result["issues"]))


if __name__ == "__main__":
    unittest.main()
