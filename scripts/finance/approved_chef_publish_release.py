"""Scoped Integration and web release; existing admin approval is publishing authority."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
def module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value); return value

finance = module("publishing_finance_release", "scripts/finance/shared_chef_finance_release.py")
web = module("publishing_web_release", "scripts/release/active_address_release.py")
require = finance.require
INTEGRATION = finance.APPS["integration-service"]
CHEF = finance.APPS["user-chef-service"]
WEB = web.WEB

def source():
    sha = finance.sha()
    proof = web.source_guard(ROOT, sha, os.environ["REGRESSION_RUN_ID"])
    return sha, proof

def rates(app):
    return finance.database(app, """SELECT json_build_object(
      'policyFingerprint',(SELECT md5(v.payload::text) FROM payment_schema.finance_policy_head h
         JOIN payment_schema.finance_policy_version v ON v.id=h.policy_id),
      'sharedTermsFingerprint',(SELECT md5(row_to_json(v)::text) FROM payment_schema.finance_shared_chef_terms_head h
         JOIN payment_schema.finance_shared_chef_terms_version v ON v.id=h.version_id),
      'individualTermsFingerprint',(SELECT md5(coalesce(string_agg(h.chef_identity_id::text||':'||h.version_id::text,',' ORDER BY h.chef_identity_id),''))
         FROM payment_schema.finance_chef_tax_head h));""")

def approval_status(apps, exact=False):
    key = finance.source_bindings(apps)
    approvals = finance.signed(apps[CHEF], key, finance.APPROVAL_PATH, "X-Craves-Bank-Time", "X-Craves-Bank-Signature")
    eligible = finance.signed(apps[INTEGRATION], finance.secret(apps[INTEGRATION], "CRAVES_CATALOG_FINANCE_READ_KEY"),
        finance.CATALOG_PATH, "X-Craves-Catalog-Timestamp", "X-Craves-Catalog-Signature")
    approved = {row["chefId"] for row in approvals["approvals"]}
    actual = set(eligible["eligibleChefIds"])
    require(len(approved) == len(approvals["approvals"]), "Duplicate admin approval authority")
    if exact:
        require(actual == approved, "Live publishing authority differs from all admin-approved chefs")
    return {"approvedChefCount": len(approved), "eligibleChefCount": len(actual),
        "approvedExcludedCount": len(approved - actual)}

def guard(baseline, apps, integration_image=None, web_image=None, web_sha=None):
    # Only the intended two images and the web's release stamp may change.
    expected = {INTEGRATION: integration_image} if integration_image else {}
    normalized = dict(apps)
    if web_image:
        web.web_guard(baseline["webRuntime"], apps[WEB], web_image, web_sha)
        normalized[WEB] = baseline["webRuntime"]
    finance.compare_inventory(baseline, normalized, expected)

def preflight():
    sha, proof = source()
    baseline = finance.preflight()
    apps = finance.inventory()
    guard(baseline, apps)
    web.ready_web(apps[WEB])
    baseline["webRuntime"] = apps[WEB]
    baseline["rates"] = rates(apps[INTEGRATION])
    baseline["approvalStatusBefore"] = approval_status(apps)
    baseline["regressionEvidence"] = proof
    helper = ROOT / "scripts/release/deploy-single-service-preserve-runtime.sh"
    web.run("bash", str(helper), finance.RG, INTEGRATION, baseline["apps"][INTEGRATION]["image"],
        "integration-service", cwd=ROOT, env=dict(os.environ, DEPLOY_PREFLIGHT_ONLY="true"))
    guard(baseline, finance.inventory())
    return baseline

def deploy(before, output):
    sha, proof = source()
    require(before["sourceSha"] == sha, "Preflight source differs")
    guard(before, finance.inventory())
    previous = web.resolve_image(before["apps"][INTEGRATION]["image"])
    web.run("az", "acr", "login", "-n", web.ACR, "--only-show-errors")
    image = web.build_image(ROOT, "services/integration-service", "craves/integration-service", sha)
    source()
    guard(before, finance.inventory())
    helper = ROOT / "scripts/release/deploy-single-service-preserve-runtime.sh"
    changed = False
    try:
        changed = True
        web.run("bash", str(helper), finance.RG, INTEGRATION, image, "integration-service", cwd=ROOT,
            env=dict(os.environ, EXPECTED_PREVIOUS_IMAGE=before["apps"][INTEGRATION]["image"],
                READY_ATTEMPTS="150", READY_SLEEP_SECONDS="10"))
        apps = finance.inventory()
        guard(before, apps, integration_image=image)
        require(rates(apps[INTEGRATION]) == before["rates"], "Existing finance policy or deduction terms changed")
        status = approval_status(apps, exact=True)
        source()
        web.deploy_web(ROOT, sha, os.environ["REGRESSION_RUN_ID"], output.parent / "web-release.json")
        apps = finance.inventory()
        web_image = apps[WEB]["properties"]["template"]["containers"][0]["image"]
        guard(before, apps, image, web_image, sha)
        require(rates(apps[INTEGRATION]) == before["rates"], "Existing finance policy or deduction terms changed")
        status = approval_status(apps, exact=True)
        return {"sourceSha": sha, "status": "VERIFIED", **status, "runtimePreserved": True,
            "financeTermsUnchanged": True, "regressionEvidence": proof,
            "apps": [{"name": name, "image": apps[name]["properties"]["template"]["containers"][0]["image"],
                "readyRevision": apps[name]["properties"]["latestReadyRevisionName"]} for name in (INTEGRATION, WEB)]}
    except Exception:
        if changed:
            apps = finance.inventory()
            require(finance.signature(apps[INTEGRATION]) == before["apps"][INTEGRATION]["signature"],
                "Concurrent Integration runtime change prevents rollback")
            actual = apps[INTEGRATION]["properties"]["template"]["containers"][0]["image"]
            require(actual in (image, before["apps"][INTEGRATION]["image"]), "Concurrent Integration image prevents rollback")
            if actual == image:
                web.run("bash", str(helper), finance.RG, INTEGRATION, previous, "publishing-rollback", cwd=ROOT,
                    env=dict(os.environ, EXPECTED_PREVIOUS_IMAGE=image, READY_ATTEMPTS="150", READY_SLEEP_SECONDS="10"))
        raise

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=("preflight", "deploy"))
    parser.add_argument("--baseline"); parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        result = preflight() if args.phase == "preflight" else deploy(json.loads(Path(args.baseline).read_text()), args.output)
        args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print("Approved chef publishing " + args.phase + " verified")
    except Exception as error:
        raise SystemExit(str(error) if isinstance(error, ValueError) else "Publishing release stopped; private diagnostics withheld")
