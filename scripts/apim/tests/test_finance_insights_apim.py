import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
REL = "scripts/apim/configure-finance-insights-apim.sh"  # relative: Windows bash cannot take C:\ paths
SCRIPT = ROOT / REL
CONTROLLER = ROOT / "services/integration-service/src/main/java/in/craves/integration/web/FinanceInsightsController.java"
FQDN = "ca-craves-integration-prod.example.centralindia.azurecontainerapps.io"

# A stand-in for az that answers the way Cloud Shell's az answered on 14 Nov 2026: a policy read prints the XML itself
# (a byte-order mark, then CRLF and tabs) with a note on stderr, a missing policy is a non-zero exit, and a policy PUT
# prints the XML.
FAKE_AZ = r'''
import json, os, re, sys
a = sys.argv[1:]; state_file = os.environ["FAKE_AZ_STATE"]; mode = os.environ.get("FAKE_AZ_MODE", "ok")
state = json.load(open(state_file))
def opt(name): return a[a.index(name) + 1]
def done(text=""): json.dump(state, open(state_file, "w")); sys.stdout.buffer.write(text.encode("utf-8")); sys.exit(0)
BOM = "\ufeff"  # every policy read starts with one (seen 14 Nov 2026); it is invisible in a terminal
host = "other.example" if mode == "other-backend" else os.environ["FAKE_FQDN"]
API = ('<policies>\r\n\t<inbound>\r\n\t\t<base />\r\n\t\t<choose>\r\n\t\t\t<when condition="@(!context.Request.Headers.GetValueOrDefault(&quot;Authorization&quot;, &quot;&quot;).StartsWith(&quot;Bearer &quot;))">'
       '\r\n\t\t\t\t<return-response>\r\n\t\t\t\t\t<set-status code="401" reason="Unauthorized" />\r\n\t\t\t\t</return-response>\r\n\t\t\t</when>\r\n\t\t</choose>'
       '\r\n\t\t<set-backend-service base-url="https://' + host + '" />\r\n\t</inbound>\r\n\t<backend>\r\n\t\t<base />\r\n\t</backend>\r\n\t<outbound>\r\n\t\t<base />'
       '\r\n\t\t<set-header name="Cache-Control" exists-action="override">\r\n\t\t\t<value>private, no-store, max-age=0</value>\r\n\t\t</set-header>\r\n\t</outbound>'
       '\r\n\t<on-error>\r\n\t\t<base />\r\n\t</on-error>\r\n</policies>')
extra = '\r\n\t\t<set-header name="X-Debug" exists-action="override"><value>1</value></set-header>' if mode == "other-source" else ""
SOURCE = ('<policies>\r\n\t<inbound>\r\n\t\t<base />\r\n\t\t<rewrite-uri template="/api/v1/admin/finance/source-status" copy-unmatched-params="false" />' + extra
          + '\r\n\t</inbound>\r\n\t<backend>\r\n\t\t<base />\r\n\t</backend>\r\n\t<outbound>\r\n\t\t<base />\r\n\t</outbound>\r\n\t<on-error>\r\n\t\t<base />\r\n\t</on-error>\r\n</policies>')
if a[:2] == ["account", "show"]: done(("00000000-0000-0000-0000-000000000000" if mode == "other-subscription" else "34eefd95-1a19-416f-b9df-92b326500615") + "\n")
if a[:3] == ["apim", "api", "show"]: done("api/v1/admin/finance\n")
if a[:2] == ["containerapp", "show"]:
    done(json.dumps({"properties": {"runningStatus": "Running", "latestRevisionName": "rev1", "latestReadyRevisionName": "rev1",
                                    "configuration": {"ingress": {"fqdn": os.environ["FAKE_FQDN"]}}}}))
if a[:3] == ["containerapp", "revision", "show"]: done("Healthy\n")
if a[:4] == ["apim", "api", "operation", "show"]:
    op = state["operations"].get(opt("--operation-id"))
    if op is None: sys.exit(3)
    done(json.dumps(op))
if a[0] == "rest":
    url = opt("--url"); assert "/apis/craves-finance-admin-v1" in url and "api-version=2022-08-01" in url, url
    found = re.search(r"/operations/([^/?]+)(/policies/policy)?\?", url)
    if opt("--method") == "get":
        assert "format=rawxml" in url, url
        sys.stderr.write('Not a json response, outputting to stdout. For binary data suggest use "--output-file" to write to a file\n')
        if not found: done(BOM + API)
        if found.group(1) == "source-status-get": done(BOM + SOURCE)
        if found.group(1) in state["policies"]: done(BOM + state["policies"][found.group(1)].replace("><", ">\r\n\t<"))
        sys.stderr.write('Not Found({"error":{"code":"ResourceNotFound","message":"PoliciesConfiguration not found.","details":null}})\n'); sys.exit(3)
    assert opt("--method") == "put" and found, a
    body = json.load(open(opt("--body").lstrip("@")))
    state["writes"].append(url.split("/apis/craves-finance-admin-v1")[1].split("?")[0])
    if found.group(2):
        assert body["properties"]["format"] == "rawxml"
        state["policies"][found.group(1)] = body["properties"]["value"]; done(body["properties"]["value"])
    state["operations"][found.group(1)] = body["properties"]; done()
sys.exit("unexpected az call: " + " ".join(a))
'''


def script_text():
    return SCRIPT.read_text(encoding="utf-8")


def rows():
    block = re.search(r"OPERATIONS=\((.*?)\n\)", script_text(), re.S).group(1)
    return [row.split("|") for row in re.findall(r'"([^"]+)"', block)]


def run(mode="ok", **env):
    """Runs the script against the stand-in gateway. Returns (process, state)."""
    with tempfile.TemporaryDirectory() as fake:
        state = Path(fake) / "state.json"
        state.write_text(json.dumps({"operations": {}, "policies": {}, "writes": []}))
        (Path(fake) / "fake_az.py").write_text(FAKE_AZ)
        for name, body in (("az", f'exec "{sys.executable}" "{fake}/fake_az.py" "$@"'), ("curl", "printf 401")):
            file = Path(fake) / name
            file.write_text("#!/bin/sh\n" + body + "\n", newline="\n")
            file.chmod(0o755)
        full = {**os.environ, "PATH": fake + os.pathsep + os.environ["PATH"], "FAKE_AZ_STATE": str(state), "FAKE_AZ_MODE": mode,
                "FAKE_FQDN": FQDN, "CONFIRM_APIM_WRITE": "true", **env}
        full.pop("DRY_RUN", None)
        process = subprocess.run([shutil.which("bash"), REL], cwd=ROOT, env=full, capture_output=True, text=True)
        return process, json.loads(state.read_text())


class FinanceInsightsApimTest(unittest.TestCase):
    def test_operations_match_the_controller(self):
        java = CONTROLLER.read_text(encoding="utf-8")
        base = re.search(r'@RequestMapping\("(/api/v1/admin/finance)(/[^"]*)"\)', java)
        self.assertIn("API_PATH=" + base.group(1).lstrip("/") + "\n", script_text())
        # One route per @GetMapping; a route forwards its query string exactly when its method reads request parameters.
        methods = re.findall(r'@GetMapping\("([^"]+)"\)(.*?)\n    }', java, re.S)
        expected = {(base.group(2) + path, "true" if "@RequestParam" in body else "false") for path, body in methods}
        self.assertEqual({(row[1], row[2]) for row in rows()}, expected)
        self.assertEqual(len(rows()), 5)
        self.assertNotRegex(java, r"@(Post|Put|Patch|Delete)Mapping")

    def test_names_are_the_production_ones(self):
        text = script_text()
        for name in ("apim-craves-prod-34eefd", "rg-craves-shared-prod", "ca-craves-integration-prod", "rg-craves-integration-prod",
                     "craves-finance-admin-v1", "34eefd95-1a19-416f-b9df-92b326500615", "https://api.craves.in"):
            self.assertIn(name, text)
        for old in ("kmqgfy", "prodlow", "721906c9"):
            self.assertNotIn(old, text)

    def test_script_parses(self):
        self.assertEqual(subprocess.run([shutil.which("bash"), "-n", REL], cwd=ROOT).returncode, 0)

    def test_nothing_runs_without_confirmation_and_a_dry_run_calls_nothing(self):
        env = {k: v for k, v in os.environ.items() if k not in ("CONFIRM_APIM_WRITE", "DRY_RUN")}
        with tempfile.TemporaryDirectory() as empty:
            env["PATH"] = empty  # no az, jq or curl here; bash itself is called by absolute path
            refused = subprocess.run([shutil.which("bash"), REL], cwd=ROOT, env=env, capture_output=True, text=True)
            dry = subprocess.run([shutil.which("bash"), REL], cwd=ROOT, env={**env, "DRY_RUN": "true"}, capture_output=True, text=True)
        self.assertNotEqual(refused.returncode, 0)
        self.assertTrue("CONFIRM_APIM_WRITE" in refused.stderr and "DRY_RUN" in refused.stderr, refused.stderr)
        self.assertEqual(dry.returncode, 0, dry.stderr)
        for row in rows():
            self.assertIn(row[1], dry.stdout)

    @unittest.skipUnless(shutil.which("jq"), "jq is needed to run the script")
    def test_publishes_exactly_five_operations_each_rewritten_to_its_own_backend_path(self):
        process, state = run()
        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertIn("SUCCESS", process.stdout)
        self.assertNotIn("<policies", process.stdout + process.stderr)  # az output is never echoed
        expected_writes = [path for row in rows() for path in (f"/operations/{row[0]}", f"/operations/{row[0]}/policies/policy")]
        self.assertEqual(state["writes"], expected_writes)
        for op_id, template, forward, display in rows():
            operation = state["operations"][op_id]
            self.assertEqual((operation["method"], operation["urlTemplate"], operation["displayName"]), ("GET", template, display))
            self.assertEqual([p["name"] for p in operation["templateParameters"]], re.findall(r"\{([A-Za-z]+)\}", template))
            self.assertEqual(state["policies"][op_id],
                             f'<policies><inbound><base /><rewrite-uri template="/api/v1/admin/finance{template}" copy-unmatched-params="{forward}" />'
                             '</inbound><backend><base /></backend><outbound><base /></outbound><on-error><base /></on-error></policies>')
        # Running it again writes the same ten things and nothing else.
        again, state_again = run()
        self.assertEqual(again.returncode, 0, again.stderr)
        self.assertEqual(state_again["policies"], state["policies"])

    @unittest.skipUnless(shutil.which("jq"), "jq is needed to run the script")
    def test_writes_nothing_when_the_gateway_is_not_as_expected(self):
        for mode, reason in (("other-subscription", "Wrong Azure subscription"), ("other-backend", "review it by hand"),
                             ("other-source", "review it by hand")):
            process, state = run(mode)
            self.assertNotEqual(process.returncode, 0, mode)
            self.assertIn(reason, process.stderr, mode)
            self.assertIn("othing written", process.stderr, mode)
            self.assertEqual(state["writes"], [], mode)


if __name__ == "__main__":
    unittest.main()
