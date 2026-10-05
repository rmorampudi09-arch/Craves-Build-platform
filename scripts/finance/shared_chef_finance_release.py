"""Guarded two-service release using established Azure identity and immutable runtime.

Never enables payouts, changes application settings, invents tax records, emits
credentials, or creates live orders. All database inspection is read-only.
"""
import argparse
import copy
from datetime import datetime, timezone
import hashlib
import hmac
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import time
from urllib.parse import urlparse
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[2]
SUB = "721906c9-4a72-4606-830b-d3e7ace093ff"
TENANT = "1e7e43ac-c7f5-4d47-a74f-289a7cc21508"
RG = "rg-craves-prodlow-centralindia"
LOGIN = "cravesrm09prodlow6bf632.azurecr.io"
APPS = {"user-chef-service": "ca-craves-user-chef-service-prod", "integration-service": "ca-craves-integration-service-pr"}
APPROVAL_PATH = "/internal/v1/chef-finance/approvals"
CATALOG_PATH = "/internal/v1/finance/catalog-eligibility"
API = "https://api.github.com/repos/rmorampudi09-arch/Craves-Build-platform"


def require(ok, message):
    if not ok: raise ValueError(message)


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    result = importlib.util.module_from_spec(spec); spec.loader.exec_module(result); return result


active = module("shared_active_preflight", "scripts/release/rmorampudi09_preflight.py")
evidence_reader = module("shared_release_evidence", "scripts/release/verify-web-release-evidence.py")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs): return None


def request_json(url, headers=None, data=None):
    request = urllib.request.Request(url, data=data, headers=headers or {})
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=25) as response:
        raw = response.read(2_000_001)
        require(len(raw) <= 2_000_000, "Read response exceeds bound")
        return json.loads(raw), response.headers, raw


def github(path):
    token = os.environ.get("GH_TOKEN")
    require(token, "Existing workflow read token required")
    return request_json(API + path, {"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json"})[0]


def sha():
    value = os.environ.get("EXPECTED_RELEASE_SHA", "")
    require(re.fullmatch("[0-9a-f]{40}", value), "Exact source SHA required")
    require(subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip() == value, "Checkout is stale")
    require(not subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=no"], cwd=ROOT, text=True).strip(), "Tracked release source changed")
    return value


def evidence():
    source = sha()
    for attempt in range(80):
        require(github("/branches/main")["commit"]["sha"] == source, "Main changed; release stopped")
        runs = github("/actions/runs?head_sha=" + source + "&event=push&per_page=100")["workflow_runs"]
        candidates = [r for r in runs if r.get("path") == ".github/workflows/launch-regression-ci.yml"]
        if candidates and candidates[0]["status"] == "completed":
            run = candidates[0]
            jobs = github("/actions/runs/" + str(run["id"]) + "/attempts/" + str(run["run_attempt"]) + "/jobs?per_page=100")
            artifacts = github("/actions/runs/" + str(run["id"]) + "/artifacts?per_page=100")
            return evidence_reader.validate_evidence(source, run, jobs, artifacts, github("/branches/main"))
        time.sleep(15)
    raise ValueError("Exact-main regression evidence is not ready")


def environment(app):
    containers = app["properties"]["template"]["containers"]
    require(len(containers) == 1, "Unexpected container count")
    rows = containers[0].get("env", [])
    result = {r["name"]: r for r in rows}
    require(len(result) == len(rows), "Duplicate runtime setting")
    return result


def signature(app):
    props = app["properties"]; template = copy.deepcopy(props["template"])
    template.pop("revisionSuffix", None)
    for container in template["containers"]: container.pop("image", None)
    configuration = copy.deepcopy(props["configuration"])
    configuration.get("ingress", {}).pop("traffic", None)
    return hashlib.sha256(json.dumps({"template": template, "configuration": configuration,
        "identity": app.get("identity"), "tags": app.get("tags")}, sort_keys=True).encode()).hexdigest()


def inventory():
    account = active.az("account", "show")
    require(account["id"] == SUB and account["tenantId"] == TENANT, "Wrong active Azure tenant/subscription")
    apps = active.az("containerapp", "list", "-g", RG)
    require(len({a["name"] for a in apps}) == len(apps), "Duplicate app inventory")
    for name in APPS.values(): require(any(a["name"] == name for a in apps), "Required existing app missing")
    return {a["name"]: a for a in apps}


def origin(app):
    host = app["properties"]["configuration"]["ingress"]["fqdn"]
    require(re.fullmatch(r"[a-z0-9.-]+\.azurecontainerapps\.io", host), "Unexpected private source origin")
    return "https://" + host


def secret(app, setting):
    entry = environment(app).get(setting, {})
    require(entry.get("secretRef") and not entry.get("value"), "Expected existing Key Vault secret reference for " + setting)
    refs = active.az("containerapp", "secret", "list", "-g", RG, "-n", app["name"])
    matches = [r for r in refs if r["name"] == entry["secretRef"]]
    require(len(matches) == 1, "Secret binding is missing")
    url = matches[0].get("keyVaultUrl", "")
    version = r"(?:/[a-f0-9]{32})?" if setting == "SPRING_DATASOURCE_PASSWORD" else r"/[a-f0-9]{32}"
    require(re.fullmatch(r"https://kvcravesprodlowkmqgfy\.vault\.azure\.net/secrets/[A-Za-z0-9-]+" + version, url),
            "Source credential must remain pinned in the existing active vault")
    require(matches[0].get("identity") == "system", "Existing source managed identity is required")
    return active.az("keyvault", "secret", "show", "--id", url)["value"]


def database(app, query):
    reader = active.history_module(); env = environment(app)
    host, name = reader.database_binding(env["SPRING_DATASOURCE_URL"]["value"],
        active.az("postgres", "flexible-server", "list", "-g", RG))
    username = env["SPRING_DATASOURCE_USERNAME"].get("value")
    require(username and not env["SPRING_DATASOURCE_USERNAME"].get("secretRef"), "Unexpected database user binding")
    password = secret(app, "SPRING_DATASOURCE_PASSWORD")
    settings = {k: v for k, v in os.environ.items() if not k.upper().startswith("PG")}
    settings.update(PGHOST=host, PGPORT="5432", PGDATABASE=name, PGUSER=username, PGPASSWORD=password,
        PGSSLMODE="verify-full", PGSSLROOTCERT="/etc/ssl/certs/ca-certificates.crt", PGCONNECT_TIMEOUT="10",
        PGOPTIONS="-c default_transaction_read_only=on", PGAPPNAME="craves-shared-finance-release-readonly")
    try:
        result = subprocess.run(["psql", "-X", "-qAt", "--set=ON_ERROR_STOP=1"],
            input="BEGIN READ ONLY; SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='2s';\n" + query + "\nROLLBACK;",
            env=settings, capture_output=True, text=True, timeout=25)
        require(result.returncode == 0 and len(result.stdout) < 200_000, "Read-only finance inspection unavailable")
        return json.loads(result.stdout)
    finally:
        settings.pop("PGPASSWORD", None); password = None


def validate_history(rows):
    reader = active.history_module(); reader.REQUIRED["integration-service"] = set()
    expected = reader.expected("integration-service"); applied = set()
    for row in rows:
        require(row.get("type") in {"SQL", "BASELINE", "SCHEMA"} and row.get("success") is True, "Failed or unknown migration history")
        if row["type"] != "SQL": continue
        require(row["version"] not in applied, "Duplicate applied migration")
        applied.add(row["version"]); candidate = expected.get(row["version"])
        require(candidate and row["script"] == candidate["script"] and row["checksum"] == candidate["checksum"], "Applied migration checksum differs")
    require(set(expected) - applied in (set(), {"147"}), "Only additive V147 may be pending")
    return applied


def policy_and_terms(app, deployed=False):
    query = """SELECT json_build_object('policyReady',EXISTS(
      SELECT 1 FROM payment_schema.finance_policy_head h JOIN payment_schema.finance_policy_version v ON v.id=h.policy_id
      WHERE (v.payload->>'ledgerEnabled')::boolean AND (v.payload->>'ledgerStartDate')::date <= (now() AT TIME ZONE 'Asia/Kolkata')::date),
      'reviewedRateCount',(SELECT count(DISTINCT (v.payload->>'withholdingRate')::numeric)
      FROM payment_schema.finance_chef_tax_head h JOIN payment_schema.finance_chef_tax_version v ON v.id=h.version_id
      WHERE v.payload->>'stateCode'='36' AND v.payload->>'supplyRegime'='RESTAURANT_ECO_9_5'
      AND nullif(v.payload->>'withholdingEvidence','') IS NOT NULL AND v.payload->>'financialYear'=
      extract(year FROM (now() AT TIME ZONE 'Asia/Kolkata')-interval '3 months')::int::text || '-' ||
      to_char((now() AT TIME ZONE 'Asia/Kolkata')-interval '3 months'+interval '1 year','YY')));
    """
    result = database(app, query)
    require(result["policyReady"], "Active common finance policy is required")
    if deployed:
        terms = database(app, "SELECT json_build_object('ready',EXISTS(SELECT 1 FROM payment_schema.finance_shared_chef_terms_head h JOIN payment_schema.finance_shared_chef_terms_version v ON v.id=h.version_id));")
        require(terms["ready"], "Shared reviewed finance terms are missing")
    else:
        require(result["reviewedRateCount"] == 1, "A unanimous existing reviewed common withholding basis is required")
    return {"commonPolicyReady": True, "sharedTermsReady": deployed or result["reviewedRateCount"] == 1}


def signed(app, key, path, stamp, signature_header):
    require(isinstance(key, str) and 32 <= len(key) <= 512, "Configured source key is invalid")
    request_id = str(uuid.uuid4()); raw = json.dumps({"requestId": request_id}, separators=(",", ":")).encode()
    timestamp = str(int(time.time()))
    def digest(direction, time_value, body):
        return hmac.new(key.encode(), (direction + "\n" + path + "\n" + time_value + "\n").encode() + body, hashlib.sha256).hexdigest()
    value, headers, response = request_json(origin(app) + path, {"Content-Type": "application/json",
        stamp: timestamp, signature_header: digest("POST", timestamp, raw)}, raw)
    response_time = headers.get(stamp, "")
    require(re.fullmatch(r"[0-9]{10}", response_time) and abs(int(time.time()) - int(response_time)) <= 15, "Stale signed source")
    require(hmac.compare_digest(digest("RESPONSE", response_time, response), headers.get(signature_header, "")), "Invalid source response signature")
    require(value.get("requestId") == request_id and value.get("complete") is True and "no-store" in headers.get("Cache-Control", ""), "Incomplete approval authority")
    return value


def source_bindings(apps):
    chef = apps[APPS["user-chef-service"]]; integration = apps[APPS["integration-service"]]
    require(environment(integration).get("CRAVES_BANK_USER_CHEF_BASE_URL", {}).get("value", "").rstrip("/") == origin(chef), "Finance approval source origin differs")
    first = secret(chef, "CRAVES_BANK_INTERNAL_KEY"); second = secret(integration, "CRAVES_BANK_INTERNAL_KEY")
    require(hmac.compare_digest(first, second), "Existing source credential bindings differ")
    return first


def preflight():
    apps = inventory(); source_bindings(apps)
    integration = apps[APPS["integration-service"]]
    for name in APPS.values():
        app = apps[name]; props = app["properties"]
        require(props["latestRevisionName"] == props["latestReadyRevisionName"], "Existing rollout is unsettled")
        require(props["configuration"]["activeRevisionsMode"] == "Single" and props["template"]["scale"]["maxReplicas"] == 1, "Existing revision/replica bounds differ")
        require(props["template"]["containers"][0]["image"].startswith(LOGIN + "/craves/"), "Current registry binding differs")
    rows = database(integration, "SELECT coalesce(json_agg(row_to_json(t)),'[]'::json) FROM (SELECT version,script,checksum,success,type FROM payment_schema.flyway_schema_history ORDER BY installed_rank LIMIT 251)t;")
    applied = validate_history(rows); terms = policy_and_terms(integration, deployed="147" in applied)
    secret(integration, "CRAVES_CATALOG_FINANCE_READ_KEY")
    require(inventory() == apps, "Azure runtime changed during inspection")
    return {"sourceSha": sha(), "readOnly": True, **terms,
        "apps": {name: {"signature": signature(app), "image": app["properties"]["template"]["containers"][0]["image"]} for name, app in apps.items()}}


def compare_inventory(before, current, changed):
    require(set(before["apps"]) == set(current), "Container App inventory changed")
    for name, app in current.items():
        require(signature(app) == before["apps"][name]["signature"], "Runtime configuration changed for " + name)
        wanted = changed.get(name, before["apps"][name]["image"])
        require(app["properties"]["template"]["containers"][0]["image"] == wanted, "Unexpected app image for " + name)


def deploy_checked(before, changed):
    source = sha(); require(before["sourceSha"] == source, "Preflight source differs")
    compare_inventory(before, inventory(), {})
    approval_count = 0
    for role, name in APPS.items():
        image = LOGIN + "/craves/" + role + ":finance-" + source
        settings = dict(os.environ, READY_ATTEMPTS="150", READY_SLEEP_SECONDS="10")
        changed[name] = image
        result = subprocess.run(["bash", "scripts/release/deploy-single-service-preserve-runtime.sh", RG, name, image, role],
            cwd=ROOT, env=settings, text=True, capture_output=True, timeout=2400)
        require(result.returncode == 0, "Runtime-preserving deployment failed for " + role)
        current = inventory(); compare_inventory(before, current, changed)
        key = source_bindings(current)
        approvals = signed(current[APPS["user-chef-service"]], key, APPROVAL_PATH, "X-Craves-Bank-Time", "X-Craves-Bank-Signature")
        approval_count = len(approvals["approvals"])
        if role == "integration-service":
            policy_and_terms(current[name], deployed=True)
            eligible = signed(current[name], secret(current[name], "CRAVES_CATALOG_FINANCE_READ_KEY"), CATALOG_PATH,
                "X-Craves-Catalog-Timestamp", "X-Craves-Catalog-Signature")
            approved = {a["chefId"] for a in approvals["approvals"] if a["stateCode"] == "36"}
            holds = database(current[name], "SELECT coalesce(json_agg(h.chef_identity_id),'[]'::json) FROM payment_schema.finance_chef_tax_head h JOIN payment_schema.finance_chef_tax_version v ON v.id=h.version_id WHERE v.payload->>'registrationStatus'='UNREGISTERED' AND (v.payload->>'declaredAggregateTurnover')::numeric>2000000 AND v.payload->>'financialYear'=extract(year FROM (now() AT TIME ZONE 'Asia/Kolkata')-interval '3 months')::int::text || '-' || to_char((now() AT TIME ZONE 'Asia/Kolkata')-interval '3 months'+interval '1 year','YY');")
            require(set(eligible["eligibleChefIds"]) == approved - set(holds), "Live Catalog authority differs from approved chefs and recorded exceptions")
    return {"sourceSha": source, "status": "VERIFIED", "approvedChefCount": approval_count,
        "eligibleChefCount": len(eligible["eligibleChefIds"]), "runtimePreserved": True, "moneyTransferred": False,
        "apps": [{"name": name, "image": image, "readyRevision": current[name]["properties"]["latestReadyRevisionName"]} for name, image in changed.items()]}


def rollback(before, changed):
    """Restore only this release's images, preserving the additive migration and every runtime setting."""
    current = inventory()
    for name, attempted in reversed(list(changed.items())):
        app = current[name]
        require(signature(app) == before["apps"][name]["signature"], "Concurrent runtime change prevents automatic rollback")
        image = app["properties"]["template"]["containers"][0]["image"]
        prior = before["apps"][name]["image"]
        if image == prior: continue
        require(image == attempted, "Concurrent image change prevents automatic rollback")
        result = subprocess.run(["bash", "scripts/release/deploy-single-service-preserve-runtime.sh", RG, name, prior, "shared-finance-rollback"],
            cwd=ROOT, env=dict(os.environ, READY_ATTEMPTS="150", READY_SLEEP_SECONDS="10"),
            capture_output=True, text=True, timeout=2400)
        require(result.returncode == 0, "Prior healthy image rollback did not verify")
        current = inventory()
    compare_inventory(before, current, {})


def deploy(before):
    changed = {}
    try: return deploy_checked(before, changed)
    except Exception:
        if changed: rollback(before, changed)
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=["evidence", "preflight", "deploy"])
    parser.add_argument("--output", required=True); parser.add_argument("--baseline")
    args = parser.parse_args()
    try:
        result = evidence() if args.phase == "evidence" else preflight() if args.phase == "preflight" else deploy(json.loads(Path(args.baseline).read_text()))
        output = Path(args.output); output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(result, sort_keys=True, indent=2) + "\n")
        print("Shared chef finance " + args.phase + " passed")
    except Exception as error:
        raise SystemExit("Shared chef finance release stopped: " + (str(error) if isinstance(error, ValueError) else "Unavailable; raw runtime details withheld"))
