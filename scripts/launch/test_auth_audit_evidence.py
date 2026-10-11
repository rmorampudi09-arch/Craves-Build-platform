import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("launch", Path(__file__).with_name("launch-regression.py"))
launch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launch)
SUITE = "FailedLoginAuditDatabaseTest"


class FailedLoginAuditEvidenceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.reports = self.root / "reports"
        self.reports.mkdir()
        self.sources = self.root / "sources"
        self.sources.mkdir()
        self.minimum = json.loads(launch.MANIFEST.read_text())["services"]["auth-service"][SUITE]
        self.assertEqual(25, self.minimum)

    def report(self, tests=25, outcome=None, filename="TEST-audit.xml", summary_outcome=True):
        cases = ''.join('<testcase name="case%d">%s</testcase>' %
                        (index, '<%s/>' % outcome if outcome and index == 0 else '') for index in range(tests))
        counts = {"failure": 0, "error": 0, "skipped": 0}
        if outcome and summary_outcome:
            counts[outcome] = 1
        (self.reports / filename).write_text(
            '<testsuite name="in.craves.auth.service.%s" tests="%d" failures="%d" errors="%d" skipped="%d">%s</testsuite>' %
            (SUITE, tests, counts["failure"], counts["error"], counts["skipped"], cases))

    def result(self):
        return launch.java_result("auth-service", self.reports, {SUITE: self.minimum}, self.sources)

    def test_all_25_actual_passing_cases_are_required(self):
        self.report()
        self.assertEqual("GREEN", self.result()["status"])

    def test_missing_database_report_is_rejected(self):
        self.assertEqual("RED", self.result()["status"])

    def test_disabled_database_fixture_is_rejected(self):
        self.report(tests=1, outcome="skipped")
        self.assertEqual("RED", self.result()["status"])

    def test_failed_errored_or_skipped_case_is_rejected(self):
        for outcome in ("failure", "error", "skipped"):
            with self.subTest(outcome=outcome):
                self.report(outcome=outcome)
                self.assertEqual("RED", self.result()["status"])

    def test_fewer_cases_cannot_claim_completion(self):
        self.report(tests=24)
        self.assertEqual("RED", self.result()["status"])

    def test_skipped_child_cannot_hide_behind_zero_summary(self):
        self.report(outcome="skipped", summary_outcome=False)
        self.assertEqual("RED", self.result()["status"])

    def test_duplicate_reports_cannot_inflate_minimum(self):
        self.report(tests=13)
        self.report(tests=13, filename="TEST-audit-copy.xml")
        self.assertEqual("RED", self.result()["status"])

    def test_workflow_supplies_exact_loopback_disposable_fixture(self):
        workflow = (launch.ROOT / ".github/workflows/launch-regression-ci.yml").read_text()
        for line in (
            "      AUTH_AUDIT_TEST_JDBC_URL: jdbc:postgresql://127.0.0.1:5432/auth_audit_test",
            "      AUTH_AUDIT_TEST_DB_USER: postgres",
            "      AUTH_AUDIT_TEST_DB_PASSWORD: postgres",
            "      AUTH_AUDIT_TEST_CONFIRM: YES_LOCAL_DISPOSABLE_AUTH_AUDIT_ONLY",
        ):
            self.assertIn(line + "\n", workflow)
        database_loop = next(line for line in workflow.splitlines() if "for database in " in line)
        self.assertIn("auth_audit_test", database_loop.split())
        self.assertIn('test "$CRAVES_DISPOSABLE_TEST_DATABASE" = true', workflow)
        self.assertIn('test "$GITHUB_ACTIONS" = true', workflow)


if __name__ == "__main__":
    unittest.main()
