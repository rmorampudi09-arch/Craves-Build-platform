"""One dedicated Catalog/Finance read credential; existing resources only, plan by default."""
import argparse
from datetime import datetime, timezone
import hashlib
import hmac
import importlib.util
import copy
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid

import configure_bank_runtime as shared

RG = "rg-craves-prodlow-centralindia"
SUB = "4f897b61-9b52-44b4-8cf1-bdac281cc1aa"
APPS = {"integration": "ca-craves-integration-service-pr", "catalog": "ca-craves-catalog-service-prodlo"}
SECRET = "craves-catalog-finance-read-v1"
LOCAL = "catalog-finance-read"
SETTING = "CRAVES_CATALOG_FINANCE_READ_KEY"
PURPOSE = "craves-catalog-finance-read-v1"
PATH = "/internal/v1/finance/catalog-eligibility"
STAMP = "X-Craves-Catalog-Timestamp"
SIGNATURE = "X-Craves-Catalog-Signature"
az = shared.az
GuardError = shared.GuardError
_spec = importlib.util.spec_from_file_location("catalog_runtime_readiness", Path(__file__).resolve().parents[1] / "release" / "verify-customer-web-runtime.py")
runtime = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(runtime)


def require(ok, message):
    if not ok: raise GuardError(message)


def snapshot(role):
    app = az("containerapp", "show", "-g", RG, "-n", APPS[role])
    require(app.get("name") == APPS[role], "Unexpected application")
    shared.environment(app)
    props = app["properties"]
    require(props["configuration"]["activeRevisionsMode"] == "Single", "Single revision mode required")
    require(props["template"]["scale"].get("maxReplicas") == 1, "Existing replica bounds changed")
    return app


def wanted(apps):
    return {"integration": {SETTING: "secretref:" + LOCAL},
            "catalog": {SETTING: "secretref:" + LOCAL,
                        "CRAVES_CATALOG_FINANCE_ORIGIN": shared.origin(apps["integration"])}}


def fingerprint(app, settings):
    value = copy.deepcopy(app)
    value["properties"]["template"] = runtime.normalized_template(value["properties"]["template"])
    # Single-revision traffic metadata follows the new revision automatically;
    # ready() independently requires exactly 100% on the current healthy revision.
    value["properties"]["configuration"].get("ingress", {}).pop("traffic", None)
    return shared.stable(value, set(settings), {LOCAL})


def metadata(vault):
    names = az("keyvault", "secret", "list", "--vault-name", vault, "--query", "[].name")
    if SECRET not in names: return None
    item = az("keyvault", "secret", "show", "--vault-name", vault, "--name", SECRET,
              "--query", "{id:id,enabled:attributes.enabled,tags:tags}")
    require(item.get("enabled") is True and (item.get("tags") or {}).get("craves-purpose") == PURPOSE,
            "Existing read credential has different provenance or is disabled; not replaced")
    require(re.fullmatch(r"https://" + re.escape(vault) + r"\.vault\.azure\.net/secrets/" + SECRET + r"/[a-f0-9]{32}", item.get("id", "")),
            "Expected a versioned reference in the existing vault")
    return item["id"]


def ensure_secret(vault):
    current = metadata(vault)
    if current: return current
    # The value never enters arguments, logs or an artifact. No existing key is rotated.
    with tempfile.TemporaryDirectory(prefix="craves-catalog-key-") as folder:
        path = Path(folder) / "value"
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w") as stream: stream.write(secrets.token_urlsafe(48))
        az("keyvault", "secret", "set", "--vault-name", vault, "--name", SECRET,
           "--file", str(path), "--encoding", "utf-8", "--tags", "craves-purpose=" + PURPOSE, "--query", "id")
    current = metadata(vault)
    require(current is not None, "New read credential metadata not visible")
    return current


def check_reference(app, reference, identity):
    rows = [s for s in app["properties"]["configuration"].get("secrets", []) if s["name"] == LOCAL]
    require(len(rows) <= 1, "Duplicate read credential references")
    if rows:
        require(reference is not None and rows[0] == {"name": LOCAL, "keyVaultUrl": reference, "identity": identity},
                "Existing read credential reference differs; no overwrite allowed")
    return bool(rows)


def template_difference(desired, running):
    """Only paths/types, and explicitly non-secret probe/scale/resource values."""
    result = []
    def walk(left, right, path):
        if left == right: return
        if isinstance(left, dict) and isinstance(right, dict):
            for key in sorted(set(left) | set(right)): walk(left.get(key), right.get(key), path + "/" + key)
        elif isinstance(left, list) and isinstance(right, list) and len(left) == len(right):
            for index, (a, b) in enumerate(zip(left, right)): walk(a, b, path + "/" + str(index))
        else:
            row = {"path": path, "desiredType": type(left).__name__, "runningType": type(right).__name__}
            if path.startswith("/scale/") or re.fullmatch(r"/containers/[0-9]+/resources/[A-Za-z]+", path) or re.fullmatch(r"/containers/[0-9]+/probes/[0-9]+/(initialDelaySeconds|periodSeconds|timeoutSeconds|failureThreshold|successThreshold)", path):
                row.update(desired=left, running=right)
            result.append(row)
    walk(runtime.comparable_running_template(desired), runtime.comparable_running_template(running), "")
    return result[:50]


def ready(role, app, explain=False):
    props = app["properties"]
    revision = props.get("latestRevisionName")
    if not revision or revision != props.get("latestReadyRevisionName"):
        if explain: print(json.dumps({"app": APPS[role], "readinessFailure": "Latest revision is not ready"}), flush=True)
        return False
    rows = az("containerapp", "revision", "list", "-g", RG, "-n", APPS[role])
    replicas = az("containerapp", "replica", "list", "-g", RG, "-n", APPS[role], "--revision", revision)
    try:
        runtime.ready(app, rows, replicas, validate=lambda _: None)
        return True
    except (ValueError, KeyError, TypeError) as error:
        if explain:
            print(json.dumps({"app": APPS[role], "readinessFailure": str(error) if isinstance(error, ValueError) else type(error).__name__}), flush=True)
            active = [r for r in rows if r.get("name") == revision]
            if len(active) == 1:
                print(json.dumps({"app": APPS[role], "templateDifferences": template_difference(props["template"], active[0]["properties"]["template"])}), flush=True)
        return False


def configure(role, before, settings, reference, identity):
    baseline = fingerprint(before, settings)
    current = snapshot(role)
    require(fingerprint(current, settings) == baseline, "Concurrent unrelated change before configuration")
    shared.check_env(current, settings)
    if not check_reference(current, reference, identity):
        az("containerapp", "secret", "set", "-g", RG, "-n", APPS[role], "--secrets",
           LOCAL + "=keyvaultref:" + reference + ",identityref:" + identity, output="none")
    current = snapshot(role)
    require(fingerprint(current, settings) == baseline, "Unrelated change while setting reference")
    shared.check_env(current, settings)
    missing = [k + "=" + v for k, v in settings.items() if k not in shared.environment(current)]
    if missing:
        az("containerapp", "update", "-g", RG, "-n", APPS[role], "--container-name",
           current["properties"]["template"]["containers"][0]["name"], "--set-env-vars", *missing,
           "--no-wait", output="none")
    for attempt in range(60):
        after = snapshot(role)
        require(fingerprint(after, settings) == baseline, "Unrelated runtime drift after configuration")
        shared.check_env(after, settings)
        check_reference(after, reference, identity)
        if set(settings) <= shared.environment(after).keys() and ready(role, after):
            print(json.dumps({"app": APPS[role], "readyRevision": after["properties"]["latestReadyRevisionName"],
                              "unrelatedSettingsPreserved": True}), flush=True)
            return
        if attempt < 59: time.sleep(5)
    raise GuardError("Read connection revision did not become ready; do not activate Finance")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs): return None


def sign(key, direction, stamp, raw):
    return hmac.new(key.encode(), (direction + "\n" + PATH + "\n" + stamp + "\n").encode() + raw, hashlib.sha256).hexdigest()


def validate_response(key, request_id, status, headers, raw, now):
    require(status == 200 and len(raw) <= 65536, "Signed read endpoint unavailable")
    stamp = headers.get(STAMP, "")
    require(re.fullmatch(r"[0-9]{10}", stamp) and abs(now - int(stamp)) <= 15, "Read response is stale")
    require(hmac.compare_digest(sign(key, "RESPONSE", stamp, raw), headers.get(SIGNATURE, "")), "Read signature mismatch")
    require("no-store" in headers.get("Cache-Control", "").lower(), "Private read response must not be cached")
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, "Duplicate read response field")
            result[key] = value
        return result
    data = json.loads(raw, object_pairs_hook=unique)
    require(isinstance(data, dict) and set(data) == {"requestId", "evaluatedAt", "complete", "policyId", "revision", "hash", "eligibleChefIds"}, "Unexpected read schema")
    require(data["requestId"] == request_id and data["complete"] is True, "Incomplete or replayed read authority")
    evaluated = datetime.fromisoformat(data["evaluatedAt"].replace("Z", "+00:00")).timestamp()
    require(int(evaluated) == int(stamp) and now - 15 <= evaluated <= now + 5, "Read evaluation time differs")
    require(type(data["revision"]) is int and data["revision"] >= 0 and re.fullmatch("[0-9a-f]{64}", data["hash"]), "Invalid policy revision")
    chefs = data["eligibleChefIds"]
    require(isinstance(chefs, list) and len(chefs) <= 1000 and len(set(chefs)) == len(chefs), "Invalid eligible chef list")
    require(all(isinstance(c, str) and str(uuid.UUID(c)) == c for c in chefs), "Invalid chef identifier")
    require((data["policyId"] is None and not chefs) or str(uuid.UUID(data["policyId"])) == data["policyId"], "Invalid policy identifier")
    # Do not expose identities or record content in pipeline logs.
    return {"signedReadVerified": True, "eligibleChefCount": len(chefs), "policyRevision": data["revision"]}


def probe(app, reference):
    key = az("keyvault", "secret", "show", "--id", reference, "--query", "value")
    require(isinstance(key, str) and 32 <= len(key) <= 512, "Invalid dedicated read credential")
    request_id = str(uuid.uuid4())
    raw = json.dumps({"requestId": request_id}, separators=(",", ":")).encode()
    stamp = str(int(time.time()))
    headers = {"Content-Type": "application/json", STAMP: stamp, SIGNATURE: sign(key, "POST", stamp, raw)}
    request = urllib.request.Request(shared.origin(app) + PATH, data=raw, headers=headers, method="POST")
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=10) as response:
            result = validate_response(key, request_id, response.status, response.headers, response.read(65537), time.time())
    except (urllib.error.URLError, TimeoutError):
        raise GuardError("Signed private read failed; no customer records changed") from None
    print(json.dumps(result), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--expected-source-sha", default="")
    args = parser.parse_args()
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    require(not args.apply or (re.fullmatch("[0-9a-f]{40}", args.expected_source_sha) and head == args.expected_source_sha), "Exact reviewed source required")
    require(az("account", "show", "--query", "id") == SUB, "Unexpected Azure subscription")
    apps = {role: snapshot(role) for role in APPS}
    settings = wanted(apps)
    vault = shared.select_vault(apps, None)
    az("keyvault", "show", "--name", vault, "--query", "id")
    identities = {role: shared.existing_identity(app, vault) for role, app in apps.items()}
    reference = metadata(vault)
    # Preflight BOTH destinations before any mutation, including creation of the key.
    for role, app in apps.items():
        shared.check_env(app, settings[role])
        check_reference(app, reference, identities[role])
        require(ready(role, app, explain=True), "Existing service is not ready; connection was not changed")
    print(json.dumps({"apply": args.apply, "source": head, "apps": APPS, "vault": vault,
                      "newPaidResources": False, "permissionsChanged": False, "financeActivation": False}), flush=True)
    if not args.apply: return
    reference = ensure_secret(vault)
    # Bring up the authority before connecting the menu consumer.
    configure("integration", apps["integration"], settings["integration"], reference, identities["integration"])
    probe(snapshot("integration"), reference)
    configure("catalog", apps["catalog"], settings["catalog"], reference, identities["catalog"])
    probe(snapshot("integration"), reference)


if __name__ == "__main__":
    try: main()
    except Exception as error:
        raise SystemExit("Read connection stopped: " + (str(error) if isinstance(error, GuardError) else type(error).__name__)) from None
