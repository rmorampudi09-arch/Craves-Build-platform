"""Execute the real activation Bash against an isolated, stateful fake Azure CLI.

No Azure login, network, credentials, or application requests are used. Run with
python3 -m unittest discover -s scripts/launch -p 'test_revocation_activation_preservation.py' -v
"""
from __future__ import annotations

import copy
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import textwrap
import unittest

ROOT = Path(__file__).resolve().parents[2]
PIPELINE = ROOT / "azure-pipelines-backend-redis-security-activation.yml"
PUBLISHER = "CRAVES_TOKEN_REVOCATION_PUBLISHER_ENABLED"
CONSUMER = "CRAVES_TOKEN_REVOCATION_ENABLED"
RATE_LIMIT = "CRAVES_AUTH_RATE_LIMIT_ENABLED"

FAKE_AZ = r'''
import json, os, re, sys
from pathlib import Path
args = sys.argv[1:]
state_file = Path(os.environ["FAKE_AZ_STATE"])
state = json.loads(state_file.read_text())
with open(os.environ["FAKE_AZ_CALLS"], "a") as log:
    log.write(json.dumps(args) + "\n")
def arg(*names):
    for name in names:
        if name in args:
            return args[args.index(name) + 1]
    return ""
if args[:2] not in (["containerapp", "show"], ["containerapp", "update"]):
    sys.exit("Unexpected Azure operation")
app = arg("--name", "-n")
if app not in state:
    sys.exit("Unexpected application")
if args[1] == "update":
    if os.environ.get("FAKE_AZ_FAIL_UPDATE") == "1":
        sys.exit(17)
    if "--set-env-vars" not in args or "--replace-env-vars" in args:
        sys.exit("Unexpected update mechanism")
    for entry in args[args.index("--set-env-vars") + 1:]:
        if entry.startswith("--"):
            break
        key, value = entry.split("=", 1)
        state[app]["env"][key] = {"value": value}
    state_file.write_text(json.dumps(state))
    sys.exit(0)
if arg("--output", "-o") == "none":
    sys.exit(0)
query = arg("--query")
if query.startswith("{"):
    print("{}")
    sys.exit(0)
match = re.search(r"env\[\?name=='([^']+)'\]\|\[0\]\.(value|secretRef)", query)
if match:
    print(state[app]["env"].get(match[1], {}).get(match[2], ""))
elif query in ("properties.latestRevisionName", "properties.latestReadyRevisionName"):
    print(app + "--fixture-ready")
elif query == "properties.runningStatus":
    print("Running")
else:
    sys.exit("Unexpected metadata query")
'''


class RevocationActivationPreservationTest(unittest.TestCase):
    def setUp(self):
        if shutil.which("bash") is None:
            self.fail("Bash is required; activation safeguards must not be skipped")
        self.yaml = PIPELINE.read_text(encoding="utf-8")
        self.parameters = dict(re.findall(
            r"(?m)^  - name: (\w+)\n    type: [^\n]+\n    default: ([^\n]+)",
            self.yaml,
        ))
        self.parameters.update(confirmation="APPROVE_REDIS_SECURITY_ACTIVATION")
        self.auth = self.parameters["authContainerAppName"]
        self.initial = {
            value: {"env": {"SPRING_DATA_REDIS_URL": {"secretRef": "fixture-redis-reference"}},
                    "image": "fixture-image", "replicas": 1, "identity": "fixture-identity"}
            for key, value in self.parameters.items() if key.endswith("ContainerAppName")
        }
        self.initial[self.auth]["env"].update({
            PUBLISHER: {"value": "false"},
            CONSUMER: {"value": "true"},
            RATE_LIMIT: {"value": "true"},
            "CRAVES_AUTH_RATE_LIMIT_BACKEND": {"value": "postgres"},
            "CRAVES_AUTH_RATE_LIMIT_EXCHANGE_LIMIT": {"value": "23"},
            "CRAVES_AUTH_RATE_LIMIT_REFRESH_LIMIT": {"value": "11"},
            "CRAVES_TOKEN_REVOCATION_KEY_PREFIX": {"value": "fixture:custom:revocation"},
            "CRAVES_TOKEN_REVOCATION_FAIL_CLOSED": {"value": "true"},
            "UNRELATED_REFERENCE": {"secretRef": "fixture-private-reference"},
        })

    def execute(self, *, parameters=None, fail_update=False):
        values = {**self.parameters, **(parameters or {})}
        marker = "      inlineScript: |\n"
        self.assertEqual(self.yaml.count(marker), 1)
        body = textwrap.dedent(self.yaml.split(marker, 1)[1])
        script = re.sub(r"\$\{\{ parameters\.(\w+) \}\}", lambda m: values[m[1]], body)
        self.assertNotIn("${{", script)
        with tempfile.TemporaryDirectory(prefix="craves-activation-test-") as directory:
            temp = Path(directory)
            az = temp / "az"
            az.write_text(f"#!{sys.executable} -S\n" + FAKE_AZ, encoding="utf-8")
            az.chmod(0o700)
            state = temp / "state.json"
            calls = temp / "calls.jsonl"
            state.write_text(json.dumps(self.initial), encoding="utf-8")
            env = {"PATH": f"{temp}{os.pathsep}{os.environ.get('PATH', '')}",
                   "FAKE_AZ_STATE": str(state), "FAKE_AZ_CALLS": str(calls),
                   "FAKE_AZ_FAIL_UPDATE": "1" if fail_update else "0"}
            result = subprocess.run([shutil.which("bash"), "-eu", "-c", script],
                                    env=env, text=True, capture_output=True, timeout=20)
            recorded = [json.loads(line) for line in calls.read_text().splitlines()] if calls.exists() else []
            return result, json.loads(state.read_text()), recorded

    def require_publisher_only(self, **kwargs):
        result, after, calls = self.execute(**kwargs)
        self.assertEqual(result.returncode, 0, result.stderr)
        expected = copy.deepcopy(self.initial)
        expected[self.auth]["env"][PUBLISHER] = {"value": "true"}
        self.assertEqual(after, expected, "Publisher phase changed unrelated runtime settings")
        writes = [call for call in calls if call[:2] == ["containerapp", "update"]]
        self.assertEqual(len(writes), 1)
        values = writes[0][writes[0].index("--set-env-vars") + 1:]
        self.assertEqual(values, [PUBLISHER + "=true", "--output", "none"])
        return result, after

    def test_publisher_preserves_enabled_limits_consumers_and_custom_prefix(self):
        self.require_publisher_only()

    def test_publisher_preserves_disabled_controls_instead_of_enabling_them(self):
        for key in (CONSUMER, RATE_LIMIT, "CRAVES_TOKEN_REVOCATION_FAIL_CLOSED"):
            self.initial[self.auth]["env"][key] = {"value": "false"}
        self.require_publisher_only()

    def test_publisher_does_not_create_absent_controls(self):
        for key in (CONSUMER, RATE_LIMIT, "CRAVES_TOKEN_REVOCATION_KEY_PREFIX", "CRAVES_TOKEN_REVOCATION_FAIL_CLOSED"):
            self.initial[self.auth]["env"].pop(key)
        self.require_publisher_only()

    def test_publisher_rerun_does_not_downgrade_existing_protection(self):
        self.initial[self.auth]["env"][PUBLISHER] = {"value": "true"}
        self.require_publisher_only()

    def test_publisher_preserves_secret_references_and_does_not_print_them(self):
        self.initial[self.auth]["env"][RATE_LIMIT] = {"secretRef": "fixture-protected-flag"}
        result, _ = self.require_publisher_only()
        for marker in ("fixture-protected-flag", "fixture-private-reference", "fixture-redis-reference"):
            self.assertNotIn(marker, result.stdout + result.stderr)

    def test_confirmation_required_before_any_azure_call(self):
        result, after, calls = self.execute(parameters={"confirmation": "NOT_APPROVED"})
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls, [])
        self.assertEqual(after, self.initial)

    def test_missing_redis_reference_prevents_update(self):
        self.initial[self.auth]["env"].pop("SPRING_DATA_REDIS_URL")
        result, after, calls = self.execute()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(call[1] == "update" for call in calls))
        self.assertEqual(after, self.initial)

    def test_failed_update_is_not_retried_or_followed_by_disable(self):
        result, after, calls = self.execute(fail_update=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(sum(call[1] == "update" for call in calls), 1)
        self.assertEqual(after, self.initial)

    def test_consumer_phase_still_requires_publisher(self):
        result, after, calls = self.execute(parameters={"phase": "CONSUMERS"})
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(call[1] == "update" for call in calls))
        self.assertEqual(after, self.initial)

    def test_rate_limiter_phase_still_requires_explicit_positive_limits(self):
        self.initial[self.auth]["env"][PUBLISHER] = {"value": "true"}
        result, after, calls = self.execute(parameters={"phase": "RATE_LIMITER"})
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(call[1] == "update" for call in calls))
        self.assertEqual(after, self.initial)


if __name__ == "__main__":
    unittest.main()
