import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts/apim/configure-admin-account-deletions-apim.sh"
REL = "scripts/apim/configure-admin-account-deletions-apim.sh"  # relative: Windows bash cannot take C:\ paths
POLICY = ROOT / "infra/apim/admin-account-deletions/authenticated-policy.xml"
CONTROLLER = ROOT / "services/auth-service/src/main/java/in/craves/auth/deletion/AdminAccountDeletionController.java"


def script_text():
    return SCRIPT.read_text(encoding="utf-8")


def render_policy(base, target):
    # the same two substitutions the script's sed makes
    return POLICY.read_text(encoding="utf-8").replace("__BACKEND_BASE_URL__", base).replace("__REWRITE_TEMPLATE__", target)


def norm(template):
    return re.sub(r"\{[A-Za-z]+\}", "{}", template)


class AdminAccountDeletionsApimTest(unittest.TestCase):
    def test_operations_match_the_auth_controller(self):
        block = re.search(r"OPERATIONS=\((.*?)\n\)", script_text(), re.S).group(1)
        rows = {(r[1], norm(r[2])) for r in (m.split("|") for m in re.findall(r"'([^']+)'", block))}
        java = CONTROLLER.read_text(encoding="utf-8")
        expected = {
            (verb.upper(), norm("/" + path.strip("/")) if path.strip("/") else "/")
            for verb, path in re.findall(r"@(Get|Post)Mapping(?:\(\"([^\"]*)\"\))?", java)
            for path in [path or ""]
        }
        self.assertEqual(rows, expected)
        self.assertEqual(rows, {("GET", "/"), ("GET", "/{}"), ("POST", "/{}/approve"), ("POST", "/{}/reject")})

    def test_defaults_are_the_new_production_names(self):
        text = script_text()
        for name in ("apim-craves-prod-34eefd", "ca-craves-auth-prod", "rg-craves-auth-prod",
                     "craves-admin-account-deletions-v1", "api/v1/admin/account-deletions"):
            self.assertIn(name, text)
        for old in ("kmqgfy", "prodlow", "rg-craves-prodlow-centralindia"):
            self.assertNotIn(old, text)
            self.assertNotIn(old, POLICY.read_text(encoding="utf-8"))

    def test_policy_allows_reason_bodies_and_requires_bearer(self):
        xml = render_policy("https://auth.example.azurecontainerapps.io", "/api/v1/admin/account-deletions/{requestId}/approve")
        root = ElementTree.fromstring(xml)
        self.assertGreaterEqual(int(root.find(".//validate-content").get("max-size")), 4096)
        self.assertIn("Bearer", xml)
        self.assertIn('code="401"', xml)
        self.assertNotIn("__BACKEND_BASE_URL__", xml)
        self.assertNotIn("__REWRITE_TEMPLATE__", xml)

    def test_script_parses(self):
        self.assertEqual(subprocess.run([shutil.which("bash"), "-n", REL], cwd=ROOT).returncode, 0)

    def test_writes_are_gated(self):
        env = {k: v for k, v in os.environ.items() if k not in ("CONFIRM_APIM_WRITE", "DRY_RUN")}
        with tempfile.TemporaryDirectory() as empty:
            # PATH holds only dirs without az; bash itself is called by absolute path
            bash = shutil.which("bash")
            env["PATH"] = empty
            r = subprocess.run([bash, REL], cwd=ROOT, env=env, capture_output=True, text=True)
        self.assertNotEqual(r.returncode, 0)
        self.assertTrue("CONFIRM_APIM_WRITE" in r.stderr and "DRY_RUN" in r.stderr, r.stderr)


if __name__ == "__main__":
    unittest.main()
