import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("launch", Path(__file__).with_name("launch-regression.py"))
launch = importlib.util.module_from_spec(spec); spec.loader.exec_module(launch)


class LaunchEvidenceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name); self.reports = self.folder / "reports"; self.reports.mkdir()
        self.sources = self.folder / "sources"; self.sources.mkdir()

    def junit(self, name="RequiredTest", tests=2, failures=0, errors=0, skipped=0, file="TEST-required.xml"):
        (self.reports / file).write_text(f'<testsuite name="test.{name}" tests="{tests}" failures="{failures}" errors="{errors}" skipped="{skipped}"/>')

    def java(self):
        return launch.java_result("example", self.reports, {"RequiredTest": 2}, self.sources)

    def test_missing_reports_are_red(self):
        self.assertEqual("RED", self.java()["status"])

    def test_passing_required_reports_are_green(self):
        self.junit(); self.assertEqual("GREEN", self.java()["status"])

    def test_skipped_or_failed_required_cases_are_red(self):
        for kwargs in ({"skipped": 1}, {"failures": 1}, {"errors": 1}, {"tests": 1}):
            self.junit(**kwargs); self.assertEqual("RED", self.java()["status"])

    def test_new_source_test_cannot_be_omitted_from_execution(self):
        self.junit(); (self.sources / "NewUpgradeTest.java").write_text("class NewUpgradeTest {\n@Test void upgrade() {}\n}")
        result = self.java(); self.assertEqual("RED", result["status"])
        self.assertTrue(any("NewUpgradeTest" in issue for issue in result["issues"]))

    def test_duplicate_junit_cannot_inflate_required_counts(self):
        self.junit(tests=1); self.junit(tests=1, file="TEST-duplicate.xml")
        self.assertEqual("RED", self.java()["status"])

    def test_malformed_or_negative_counts_are_red(self):
        (self.reports / "TEST-bad.xml").write_text("<broken")
        self.assertEqual("RED", self.java()["status"])
        self.junit(tests=-1); self.assertEqual("RED", self.java()["status"])

    def web_files(self, skipped=0, failed=0, node_skipped=0):
        launch.save(self.folder / "vitest.json", {"success": not (skipped or failed), "numTotalTests": 106,
            "numPassedTests": 106-skipped-failed, "numFailedTests": failed, "numPendingTests": skipped})
        (self.folder / "node.tap").write_text(f"TAP version 13\n# tests 257\n# pass {257-node_skipped}\n# fail 0\n# cancelled 0\n# skipped {node_skipped}\n# todo 0\n")

    def web(self):
        return launch.web_result(self.folder / "vitest.json", self.folder / "node.tap", {"minimumVitestTests": 106, "minimumNodeTests": 257})

    def test_both_full_web_runners_are_required(self):
        self.assertEqual("RED", self.web()["status"])
        self.web_files(); self.assertEqual("GREEN", self.web()["status"])
        (self.folder / "node.tap").unlink(); self.assertEqual("RED", self.web()["status"])

    def test_web_skips_or_failures_are_not_green(self):
        for kwargs in ({"skipped": 1}, {"failed": 1}, {"node_skipped": 1}):
            self.web_files(**kwargs); self.assertEqual("RED", self.web()["status"])

    def test_required_web_file_cannot_hide_behind_high_total_count(self):
        self.web_files()
        required = {"minimumVitestTests": 106, "minimumNodeTests": 257, "requiredVitestFiles": {"email-verification-ui.vitest.ts": 14}}
        result = launch.web_result(self.folder / "vitest.json", self.folder / "node.tap", required)
        self.assertEqual("RED", result["status"])

    def test_new_web_test_file_requires_its_own_report(self):
        self.web_files(); (self.sources / "new-auth.vitest.ts").write_text("test source")
        result = launch.web_result(self.folder / "vitest.json", self.folder / "node.tap", {"minimumVitestTests": 106, "minimumNodeTests": 257}, self.sources)
        self.assertEqual("RED", result["status"])

    def components(self, sha="a" * 40):
        provenance = {"sourceSha": sha, "requiredManifestSha256": hashlib.sha256(launch.MANIFEST.read_bytes()).hexdigest(), "runId": "1", "runAttempt": "1", "status": "GREEN"}
        backend = {**provenance, "services": {s: {"status": "GREEN", "command": {"exitCode": 0}} for s in launch.SERVICES}, "roundtrip": {"status": "GREEN"}}
        web = {**provenance, "commands": {s: {"exitCode": 0} for s in ("install", "lint", "typecheck", "vitest", "node", "build")}, "tests": {"status": "GREEN"}, "buildId": "CI_BUILD"}
        launch.save(self.folder / "backend-summary.json", backend); launch.save(self.folder / "web-summary.json", web)
        return backend, web

    @patch.dict(os.environ, {"GITHUB_RUN_ID": "1", "GITHUB_RUN_ATTEMPT": "1"})
    def test_exact_sha_and_complete_components_are_required(self):
        self.components(); self.assertEqual("GREEN", launch.combine(self.folder, "a"*40)["status"])
        self.assertEqual("RED", launch.combine(self.folder, "b"*40)["status"])
        (self.folder / "web-summary.json").unlink(); self.assertEqual("RED", launch.combine(self.folder, "a"*40)["status"])

    @patch.dict(os.environ, {"GITHUB_RUN_ID": "1", "GITHUB_RUN_ATTEMPT": "1"})
    def test_claimed_green_cannot_hide_missing_module_or_command(self):
        backend, web = self.components(); del backend["services"]["auth-service"]
        launch.save(self.folder / "backend-summary.json", backend); self.assertEqual("RED", launch.combine(self.folder, "a"*40)["status"])
        backend, web = self.components(); del web["commands"]["build"]
        launch.save(self.folder / "web-summary.json", web); self.assertEqual("RED", launch.combine(self.folder, "a"*40)["status"])

    @patch.dict(os.environ, {"GITHUB_RUN_ID": "1", "GITHUB_RUN_ATTEMPT": "1"})
    def test_old_manifest_or_workflow_attempt_cannot_satisfy_release(self):
        backend, web = self.components(); backend["runAttempt"] = "0"
        launch.save(self.folder / "backend-summary.json", backend); self.assertEqual("RED", launch.combine(self.folder, "a"*40)["status"])
        backend, web = self.components(); backend["requiredManifestSha256"] = "old"
        launch.save(self.folder / "backend-summary.json", backend); self.assertEqual("RED", launch.combine(self.folder, "a"*40)["status"])

    def test_command_failure_retains_actual_log_and_exit(self):
        log = self.folder / "failure.log"
        result = launch.run_command([sys.executable, "-c", "print('synthetic failed command');raise SystemExit(7)"], self.folder, log, 5)
        self.assertEqual(7, result["exitCode"]); self.assertIn("synthetic failed command", log.read_text())

    def test_command_timeout_is_a_failure(self):
        result = launch.run_command([sys.executable, "-c", "import time;time.sleep(10)"], self.folder, self.folder / "timeout.log", 0.05)
        self.assertTrue(result["timedOut"]); self.assertIsNone(result["exitCode"])


if __name__ == "__main__": unittest.main()
