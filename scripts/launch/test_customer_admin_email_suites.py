"""CP-12 requires provider-result and disposable queue-worker evidence."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("launch", Path(__file__).with_name("launch-regression.py"))
launch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launch)


class CustomerAdminEmailSuitesTest(unittest.TestCase):
    def test_exact_suites_are_required_and_fixture_is_wired(self):
        suites = json.loads((ROOT / "scripts/launch/required-suites.json").read_text())["services"]["notification-service"]
        self.assertEqual(60, suites["AcsEmailAdapterTest"])
        self.assertEqual(40, suites["CustomerAdminEmailDeliveryDatabaseTest"])
        workflow = (ROOT / ".github/workflows/launch-regression-ci.yml").read_text()
        self.assertIn("NOTIFICATION_DELIVERY_TEST_JDBC_URL: jdbc:postgresql://localhost:5432/notification_delivery_test", workflow)
        self.assertIn("NOTIFICATION_DELIVERY_TEST_CONFIRM: YES_DISPOSABLE_NOTIFICATION_DELIVERY_ONLY", workflow)
        self.assertIn("chef_onboarding_test notification_delivery_test; do", workflow)
        self.assertIn('test "$GITHUB_ACTIONS" = true', workflow)
        self.assertIn('test "$CRAVES_DISPOSABLE_TEST_DATABASE" = true', workflow)

    def test_missing_failed_skipped_or_short_queue_evidence_is_red(self):
        for outcome in ("missing", "failure", "skipped", "short"):
            with self.subTest(outcome=outcome), tempfile.TemporaryDirectory() as folder:
                reports = Path(folder)
                if outcome != "missing":
                    count = 39 if outcome == "short" else 40
                    cases = "".join(f'<testcase name="case-{n}">' +
                        (f"<{outcome}/>" if n == 0 and outcome in {"failure", "skipped"} else "") +
                        "</testcase>" for n in range(count))
                    (reports / "TEST-queue.xml").write_text(
                        f'<testsuite name="delivery.CustomerAdminEmailDeliveryDatabaseTest" tests="{count}" '
                        f'failures="{int(outcome == "failure")}" errors="0" skipped="{int(outcome == "skipped")}">{cases}</testsuite>')
                result = launch.java_result("notification-service", reports, {"CustomerAdminEmailDeliveryDatabaseTest": 40}, reports / "empty-source")
                self.assertEqual("RED", result["status"])


if __name__ == "__main__":
    unittest.main()
