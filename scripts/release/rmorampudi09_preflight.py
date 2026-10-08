"""Inspect the active rebuilt environment without changing Azure or application data.

Only allowlisted Azure reads and a read-only Flyway history query are performed.
Runtime secret values and raw CLI errors never enter the report or logs.
"""
import argparse
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
from urllib.parse import urlparse
from urllib.request import urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[2]
RG = "rg-craves-prodlow-centralindia"
ACR = "cravesrm09prodlow6bf632"
TENANT = "1e7e43ac-c7f5-4d47-a74f-289a7cc21508"
READS = {
    ("account", "show"), ("acr", "show"), ("containerapp", "list"),
    ("containerapp", "show"), ("containerapp", "revision", "show"),
    ("containerapp", "secret", "list"), ("keyvault", "list"),
    ("keyvault", "secret", "show"), ("postgres", "flexible-server", "list"),
    ("apim", "list"), ("apim", "api", "list"), ("apim", "api", "operation", "list"),
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def az(*args):
    require(any(tuple(args[:len(prefix)]) == prefix for prefix in READS), "Azure write refused")
    result = subprocess.run(["az", *args, "--only-show-errors", "-o", "json"],
                            capture_output=True, text=True, timeout=120)
    require(result.returncode == 0, "Azure read unavailable: " + " ".join(args[:2]))
    return json.loads(result.stdout)


def one(items, prefix):
    matches = [item for item in items if item.get("name", "").startswith(prefix)]
    require(len(matches) == 1, "Expected exactly one resource for " + prefix)
    return matches[0]


def history_module():
    spec = importlib.util.spec_from_file_location("history_reader", ROOT / "scripts/email/inspect-applied-email-history.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def compare_history(rows, expected):
    """Only the approved V13/V14/V15 additions may be pending; applied SQL must match."""
    require(isinstance(rows, list) and 0 < len(rows) <= 250, "Flyway history is missing or excessive")
    versions = set()
    evidence = []
    for row in rows:
        require(row.get("type") == "SQL", "Non-SQL Flyway baseline needs explicit review")
        version = row.get("version")
        require(version not in versions, "Duplicate Flyway version")
        versions.add(version)
        source = expected.get(version)
        require(source is not None, "Database contains a migration absent from release source")
        require(row.get("success") is True, "Failed Flyway migration")
        require(row.get("script") == source["script"] and row.get("checksum") == source["checksum"],
                "Applied migration differs from release source at V" + str(version))
        evidence.append({"version": version, **source, "success": True})
    pending = set(expected) - versions
    approved = {"13"}
    require(expected.get("13", {}).get("script") == "V13__customer_address_label.sql", "Incorrect V13 source")
    if "14" in expected:
        require(expected["14"]["script"] == "V14__chef_onboarding_v2.sql", "Incorrect V14 source")
        approved.add("14")
    if "15" in expected:
        require(expected["15"]["script"] == "V15__chef_onboarding_all_chefs_selected_proof.sql", "Incorrect V15 source")
        require("14" in expected, "V15 requires V14 source")
        approved.add("15")
    if "16" in expected:
        require(expected["16"]["script"] == "V16__chef_onboarding_submission_contract.sql", "Incorrect V16 source")
        require("15" in expected, "V16 requires V15 source")
        approved.add("16")
    require(not ("16" in versions and "15" not in versions), "V16 cannot precede V15")
    require(pending <= approved and "12" in versions,
            "Only approved V13/V14 may be pending after V12")
    require(not ("14" in versions and "13" not in versions), "V14 cannot precede V13")
    require(not ("15" in versions and "14" not in versions), "V15 cannot precede V14")
    result = {"compatible": True, "v13": "PENDING" if "13" in pending else "APPLIED_MATCHING",
              "history": evidence, "pendingVersions": sorted(pending)}
    if "14" in expected:
        result["v14"] = "PENDING" if "14" in pending else "APPLIED_MATCHING"
    if "15" in expected:
        result["v15"] = "PENDING" if "15" in pending else "APPLIED_MATCHING"
    if "16" in expected:
        result["v16"] = "PENDING" if "16" in pending else "APPLIED_MATCHING"
    return result


def inspect_database(app, servers, vaults):
    reader = history_module()
    props = app["properties"]
    require(props["latestRevisionName"] == props["latestReadyRevisionName"], "User/Chef rollout is unsettled")
    containers = props["template"]["containers"]
    require(len(containers) == 1, "Unexpected User/Chef container count")
    entries = containers[0].get("env", [])
    env = {entry["name"]: entry for entry in entries}
    require(len(env) == len(entries), "Duplicate runtime variable")
    require(not any(key.startswith("SPRING_FLYWAY") for key in env), "Flyway override requires review")
    host, database = reader.database_binding(env["SPRING_DATASOURCE_URL"]["value"], servers)
    username = env["SPRING_DATASOURCE_USERNAME"].get("value")
    require(bool(username) and not env["SPRING_DATASOURCE_USERNAME"].get("secretRef"), "Unexpected database username binding")
    ref = env["SPRING_DATASOURCE_PASSWORD"].get("secretRef")
    require(ref and not env["SPRING_DATASOURCE_PASSWORD"].get("value"), "Database password must use an existing secret reference")
    refs = az("containerapp", "secret", "list", "-g", RG, "-n", app["name"])
    matching = [item for item in refs if item.get("name") == ref]
    require(len(matching) == 1, "Database secret metadata unavailable")
    url = matching[0].get("keyVaultUrl", "")
    allowed = {urlparse(vault["properties"]["vaultUri"]).hostname for vault in vaults}
    parsed = urlparse(url)
    require(parsed.scheme == "https" and parsed.hostname in allowed and not parsed.query and not parsed.fragment
            and not parsed.username and not parsed.password and parsed.port is None
            and re.fullmatch(r"/secrets/[A-Za-z0-9-]+(?:/[A-Za-z0-9]+)?", parsed.path),
            "Database secret is not in an existing scoped Key Vault")
    password = az("keyvault", "secret", "show", "--id", url)["value"]
    db_env = {key: value for key, value in os.environ.items() if not key.upper().startswith("PG")}
    db_env.update(PGHOST=host, PGPORT="5432", PGDATABASE=database, PGUSER=username, PGPASSWORD=password,
                  PGSSLMODE="verify-full", PGSSLROOTCERT="/etc/ssl/certs/ca-certificates.crt",
                  PGCONNECT_TIMEOUT="10", PGOPTIONS="-c default_transaction_read_only=on",
                  PGAPPNAME="craves-release-readonly-preflight")
    try:
        rows = reader.sql("public", db_env)
    finally:
        db_env.pop("PGPASSWORD", None)
        password = None
    require(az("containerapp", "show", "-g", RG, "-n", app["name"]) == app,
            "Runtime changed during migration inspection")
    result = compare_history(rows, reader.expected("user-chef-service"))
    server = next(item for item in servers if item["fullyQualifiedDomainName"] == host)
    backup = server.get("backup", server.get("properties", {}).get("backup", {}))
    result.update(server=server["name"], database=database, backupPolicy=backup,
                  restoreRehearsalPerformed=False)
    require(backup.get("earliestRestoreDate") and 7 <= backup.get("backupRetentionDays", 0) <= 35,
            "Backup retention/restore metadata is unavailable")
    return result


def runtime_summary(app):
    props = app["properties"]
    allowed = {"CRAVES_BUILD_SHA", "NEXT_PUBLIC_RAZORPAY_MODE", "CRAVES_API_BASE_URL"}
    return {"name": app["name"], "latestRevision": props.get("latestRevisionName"),
            "readyRevision": props.get("latestReadyRevisionName"), "runningStatus": props.get("runningStatus"),
            "containers": [{"name": c["name"], "image": c["image"],
                            "releaseSettings": {e["name"]: e.get("value") for e in c.get("env", []) if e["name"] in allowed},
                            "secretReferences": sorted({e["secretRef"] for e in c.get("env", []) if e.get("secretRef")})}
                           for c in props["template"]["containers"]]}


def probe(url):
    try:
        with urlopen(url, timeout=40) as response:
            body = response.read(200_000)
            return response.status, body
    except HTTPError as error:
        return error.code, error.read(200_000)


def capture():
    account = az("account", "show")
    require(account["tenantId"] == TENANT, "Unexpected Azure tenant")
    registry = az("acr", "show", "-g", RG, "-n", ACR)
    require(registry["id"].lower().startswith("/subscriptions/" + account["id"].lower() + "/"), "Registry belongs to another subscription")
    apps = az("containerapp", "list", "-g", RG)
    chef = one(apps, "ca-craves-user-chef-service")
    one(apps, "ca-craves-web-")
    report = {"readOnly": True, "observedAtUtc": datetime.now(timezone.utc).isoformat(),
              "sourceSha": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
              "account": {"subscriptionId": account["id"], "tenantId": account["tenantId"]},
              "resourceGroup": RG, "registry": registry["loginServer"],
              "apps": [runtime_summary(app) for app in apps if app["name"].startswith("ca-craves-")],
              "blockers": []}
    secret_metadata = az("containerapp", "secret", "list", "-g", RG, "-n", chef["name"])
    report["userChefSecretBindings"] = [{"name": item["name"],
        "keyVaultBacked": bool(item.get("keyVaultUrl")), "identityConfigured": bool(item.get("identity")),
        "identityKind": "system" if str(item.get("identity", "")).lower() == "system" else "user-assigned" if item.get("identity") else "missing"}
        for item in secret_metadata]
    try:
        report["database"] = inspect_database(az("containerapp", "show", "-g", RG, "-n", chef["name"]),
            az("postgres", "flexible-server", "list", "-g", RG), az("keyvault", "list", "-g", RG))
    except Exception as error:
        report["blockers"].append(str(error) if isinstance(error, ValueError) else "Database inspection unavailable (details suppressed)")
    apim = one(az("apim", "list", "-g", RG), "apim-craves-prodlow-")
    apis = az("apim", "api", "list", "-g", RG, "--service-name", apim["name"])
    owners = [api for api in apis if api.get("path") == "api/v1/chef/application"]
    report["apim"] = {"name": apim["name"], "chefApplicationOwners": [api["name"] for api in owners]}
    if len(owners) == 1:
        operations = az("apim", "api", "operation", "list", "-g", RG, "--service-name", apim["name"], "--api-id", owners[0]["name"])
        report["apim"]["operations"] = [{"id": op["name"], "method": op["method"], "path": op["urlTemplate"]} for op in operations]
    else:
        report["blockers"].append("Chef application API owner is missing or ambiguous")
    for key, url in {"publicWeb": "https://craves.in/api/version", "paymentReadiness": "https://craves.in/api/readiness/razorpay",
                     "chefReadiness": "https://api.craves.in/api/v1/chef/application/readiness"}.items():
        try:
            status, body = probe(url)
            report[key] = {"status": status}
            if key == "publicWeb" and status == 200:
                report[key]["commitSha"] = json.loads(body).get("commitSha")
            if key == "paymentReadiness" and status == 200:
                data = json.loads(body)
                report[key].update({field: data.get(field) for field in ("razorpayMode", "productionEligible")})
            if key == "chefReadiness" and status != 401:
                report["blockers"].append("Unsigned Chef readiness must return 401; observed " + str(status))
        except Exception:
            report["blockers"].append("Public probe unavailable: " + key)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        result = capture()
    except Exception as error:
        result = {"readOnly": True, "blockers": [str(error) if isinstance(error, ValueError) else "Preflight unavailable (details suppressed)"]}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    raise SystemExit(1 if result["blockers"] else 0)
