"""Exercise bootstrap and retry against APIM's unique-display-name constraint."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts/apim/configure-chef-onboarding-v2-apim.sh"
AZ = '''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
args = sys.argv[1:]
path = Path(os.environ["MOCK_APIM_STATE"])
state = json.loads(path.read_text())
def value(flag): return args[args.index(flag) + 1]
if args[:2] == ["account", "show"]:
    print(json.dumps({"id": "721906c9-4a72-4606-830b-d3e7ace093ff",
                      "tenantId": "1e7e43ac-c7f5-4d47-a74f-289a7cc21508"}))
elif args[:2] == ["containerapp", "show"]:
    print(json.dumps({"properties": {"runningStatus": "Running", "latestRevisionName": "ready",
        "latestReadyRevisionName": "ready", "configuration": {"ingress": {"fqdn": "chef.example.invalid"}}}}))
elif args[:2] == ["apim", "show"]: pass
elif args[:3] == ["apim", "api", "list"]:
    for api in state["apis"]:
        if value("--query") == "[?path=='" + api["path"] + "'].name": print(api["id"])
elif args[:3] == ["apim", "api", "create"]:
    name = value("--display-name")
    if any(api["displayName"] == name for api in state["apis"]):
        sys.exit("ValidationError: API with specified name already exists")
    state["apis"].append({"id": value("--api-id"), "path": value("--path"), "displayName": name})
elif args[:4] == ["apim", "api", "operation", "show"]: pass
elif args[:1] == ["rest"] and value("--method") == "put":
    state["writes"].append({"url": value("--url"),
        "body": json.loads(Path(value("--body")[1:]).read_text())})
else: sys.exit("Unexpected Azure command: " + " ".join(args))
path.write_text(json.dumps(state))
'''


class ChefOnboardingApimTests(unittest.TestCase):
    def test_unique_names_bootstrap_and_partial_retry_preserve_scoped_routes(self):
        self.assertIsNotNone(shutil.which("jq"), "jq is required by the deployment script")
        chef = {"id": "craves-chef-onboarding-v2", "path": "api/v1/chef/onboarding",
                "displayName": "Craves Chef Onboarding v2"}
        legacy = {"id": "craves-chef-onboarding", "path": "api/v1/chef-onboarding",
                  "displayName": "Craves Chef Onboarding"}
        for existing in ([], [chef], [legacy], [legacy, chef]):
            with self.subTest(existing=existing), tempfile.TemporaryDirectory() as directory:
                folder = Path(directory)
                state = folder / "state.json"
                state.write_text(json.dumps({"apis": existing, "writes": []}))
                (folder / "az").write_text(AZ)
                (folder / "curl").write_text('#!/bin/sh\nprintf \'{"status":"UP"}\\n\'\n')
                for binary in ("az", "curl"):
                    (folder / binary).chmod(0o755)
                result = subprocess.run(["bash", str(SCRIPT)], text=True, capture_output=True,
                    env={**os.environ, "PATH": directory + os.pathsep + os.environ["PATH"],
                         "CONFIRM_APIM_WRITE": "true", "MOCK_APIM_STATE": str(state)}, timeout=30)
                self.assertEqual(result.returncode, 0, result.stderr)
                actual = json.loads(state.read_text())
                scoped = [api for api in actual["apis"] if api["id"].endswith("-v2")]
                self.assertEqual(len(scoped), 2)
                self.assertEqual(len({api["displayName"] for api in actual["apis"]}), len(actual["apis"]))
                self.assertEqual({api["path"] for api in scoped},
                    {"api/v1/chef/onboarding", "api/v1/backoffice/chef-onboarding"})
                if legacy in existing:
                    self.assertIn(legacy, actual["apis"])
                operations = [write for write in actual["writes"] if "/policies/" not in write["url"]]
                policies = [write for write in actual["writes"] if "/policies/" in write["url"]]
                self.assertEqual(len(operations), 14)
                self.assertEqual(len(policies), 14)
                for write in actual["writes"]:
                    self.assertIn("/apis/craves-chef-onboarding", write["url"])
                for write in policies:
                    policy = write["body"]["properties"]["value"]
                    self.assertIn('code="401"', policy)
                    self.assertIn("AUTHENTICATION_REQUIRED", policy)
                    self.assertIn("private, no-store", policy)


if __name__ == "__main__":
    unittest.main()
