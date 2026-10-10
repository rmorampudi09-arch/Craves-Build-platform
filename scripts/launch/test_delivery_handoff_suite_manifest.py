"""Require the reviewed cross-service handoff evidence and disposable-only CI fixture."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "launch_delivery_handoff", Path(__file__).with_name("launch-regression.py")
)
LAUNCH = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(LAUNCH)
REQUIRED = {
    "integration-service": {
        "BorzoPidgeHandoffContractDatabaseTest": 39,
        "DeliveryHandoffProofControllerTest": 3,
    },
    "order-service": {
        "DeliveryHandoffProofClientTest": 36,
        "DeliveryHandoffContractCompatibilityTest": 10,
        "DeliveryHandoffServiceBusSettlementTest": 3,
    },
}


class DeliveryHandoffSuiteManifestTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="delivery-handoff-evidence-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.sources = self.root / "sources"
        self.sources.mkdir()
        self.reports = {}
        manifest = json.loads((ROOT / "scripts/launch/required-suites.json").read_text())
        self.required = {}
        for service, names in REQUIRED.items():
            self.reports[service] = self.root / service
            self.reports[service].mkdir()
            self.required[service] = {
                name: manifest["services"][service][name] for name in names
            }
        self.workflow = (ROOT / ".github/workflows/launch-regression-ci.yml").read_text()
        self.backend = self.workflow.split("  backend:\n", 1)[1].split("  web:\n", 1)[0]
        fixture = self.backend.split(
            "      - name: Create isolated databases in this job's PostGIS container\n", 1
        )[1].split("      - name:", 1)[0]
        self.fixture = "\n".join(
            line[10:] for line in fixture.split("        run: |\n", 1)[1].splitlines()
        )

    def write_report(self, service, name, tests, outcome=None):
        counts = {"tests": tests, "failures": 0, "errors": 0, "skipped": 0}
        if outcome:
            counts[{"failure": "failures", "error": "errors", "skipped": "skipped"}[outcome]] = 1
        suite = ET.Element(
            "testsuite", name="fixture." + name,
            **{key: str(value) for key, value in counts.items()}
        )
        for number in range(tests):
            case = ET.SubElement(suite, "testcase", name="case" + str(number))
            if outcome and number == 0:
                ET.SubElement(case, outcome)
        ET.ElementTree(suite).write(
            self.reports[service] / ("TEST-" + name + ".xml"), encoding="unicode"
        )

    def passing_reports(self):
        for service, names in REQUIRED.items():
            for report in self.reports[service].glob("*.xml"):
                report.unlink()
            for name, minimum in names.items():
                self.write_report(service, name, minimum)

    def result(self, service):
        return LAUNCH.java_result(
            service, self.reports[service], self.required[service], self.sources
        )

    def test_manifest_keeps_exact_reviewed_minima_for_both_services(self):
        self.assertEqual(REQUIRED, self.required)
        self.assertEqual(91, sum(sum(names.values()) for names in REQUIRED.values()))

    def test_required_test_sources_exist_exactly_once(self):
        for service, names in REQUIRED.items():
            source = ROOT / "services" / service / "src/test/java"
            for name in names:
                with self.subTest(service=service, name=name):
                    self.assertEqual(1, len(list(source.rglob(name + ".java"))))

    def test_complete_reviewed_reports_pass(self):
        self.passing_reports()
        for service, names in REQUIRED.items():
            with self.subTest(service=service):
                result = self.result(service)
                self.assertEqual("GREEN", result["status"], result["issues"])
                self.assertEqual(sum(names.values()), result["counts"]["tests"])
                self.assertEqual(0, result["counts"]["skipped"])

    def test_each_missing_suite_is_rejected_even_with_unrelated_extra_cases(self):
        for service, names in REQUIRED.items():
            for name, minimum in names.items():
                with self.subTest(service=service, name=name):
                    self.passing_reports()
                    (self.reports[service] / ("TEST-" + name + ".xml")).unlink()
                    self.write_report(service, "UnrelatedPassingTest", minimum + 100)
                    result = self.result(service)
                    self.assertEqual("RED", result["status"])
                    self.assertTrue(any(name in issue for issue in result["issues"]))

    def test_each_undercount_is_rejected(self):
        for service, names in REQUIRED.items():
            for name, minimum in names.items():
                with self.subTest(service=service, name=name):
                    self.passing_reports()
                    self.write_report(service, name, minimum - 1)
                    self.assertEqual("RED", self.result(service)["status"])

    def assert_outcome_rejected(self, outcome):
        for service, names in REQUIRED.items():
            for name, minimum in names.items():
                with self.subTest(service=service, name=name):
                    self.passing_reports()
                    self.write_report(service, name, minimum, outcome)
                    result = self.result(service)
                    self.assertEqual("RED", result["status"])
                    self.assertTrue(any(name in issue for issue in result["issues"]))

    def test_each_skipped_suite_is_rejected(self):
        self.assert_outcome_rejected("skipped")

    def test_each_failed_suite_is_rejected(self):
        self.assert_outcome_rejected("failure")

    def test_each_errored_suite_is_rejected(self):
        self.assert_outcome_rejected("error")

    def test_handoff_fixture_is_wired_only_to_disposable_backend_ci(self):
        for variable, value in {
            "OF02_TEST_JDBC_URL": "jdbc:postgresql://localhost:5432/of02_handoff_test",
            "OF02_TEST_DB_USER": "postgres",
            "OF02_TEST_DB_PASSWORD": "postgres",
        }.items():
            self.assertIn("      " + variable + ": " + value, self.backend)
            self.assertEqual(1, self.workflow.count(variable + ":"))
        self.assertIn("CRAVES_DISPOSABLE_TEST_DATABASE: 'true'", self.backend)
        self.assertIn("image: postgis/postgis:16-", self.backend)
        databases = self.fixture.split("for database in ", 1)[1].split("; do", 1)[0].split()
        self.assertEqual(1, databases.count("of02_handoff_test"))
        self.assertIn('test "$GITHUB_ACTIONS" = true', self.fixture)
        self.assertIn('test "$CRAVES_DISPOSABLE_TEST_DATABASE" = true', self.fixture)
        self.assertNotIn("continue-on-error", self.backend)
        self.assertNotIn("-Dtest=", self.backend)

    def run_fixture(self, github_actions, disposable):
        # Execute the real workflow shell, but replace every DB command with a
        # recording stub. Nothing here can connect to PostgreSQL or a provider.
        binary = self.root / "bin"
        binary.mkdir(exist_ok=True)
        calls = self.root / "fixture-calls.log"
        calls.unlink(missing_ok=True)
        for name in ("createdb", "psql"):
            stub = binary / name
            stub.write_text(
                '#!/bin/sh\nset -eu\n'
                'printf "%s %s\\n" "${0##*/}" "$*" >> "$CALL_LOG"\n'
                'printf "TEST_ONLY_DATABASE_FIXTURE\\n"\n'
            )
            stub.chmod(0o755)
        env = {"PATH": str(binary) + os.pathsep + "/usr/bin:/bin", "CALL_LOG": str(calls)}
        if github_actions is not None:
            env["GITHUB_ACTIONS"] = github_actions
        if disposable is not None:
            env["CRAVES_DISPOSABLE_TEST_DATABASE"] = disposable
        result = subprocess.run(
            ["/bin/bash", "-c", self.fixture], cwd=self.root, env=env,
            capture_output=True, text=True, timeout=10
        )
        return result, calls.read_text().splitlines() if calls.exists() else []

    def test_real_fixture_shell_rejects_missing_or_false_ci_acknowledgements(self):
        for github, disposable in ((None, "true"), ("false", "true"), ("true", None),
                                   ("true", "false"), ("TRUE", "true"), ("true", "yes")):
            with self.subTest(github=github, disposable=disposable):
                result, calls = self.run_fixture(github, disposable)
                self.assertNotEqual(0, result.returncode)
                self.assertEqual([], calls, "No DB command may run before both explicit guards pass")

    def test_real_fixture_shell_creates_handoff_database_only_after_both_guards(self):
        result, calls = self.run_fixture("true", "true")
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual(1, calls.count("createdb of02_handoff_test"))
        self.assertTrue(any("--dbname=of02_handoff_test" in call for call in calls))


if __name__ == "__main__":
    unittest.main()
