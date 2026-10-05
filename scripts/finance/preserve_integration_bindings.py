"""Preserve active Integration secret values in its existing Key Vault.

Only storage bindings change. No credential rotation, access grants, revision
restart, provider activation, database mutation or image update is performed.
Secret values remain in memory or mode-0600 temporary files, never logs/argv.
"""
import copy
import hmac
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("binding_release", ROOT / "scripts/finance/shared_chef_finance_release.py")
release = importlib.util.module_from_spec(spec); spec.loader.exec_module(release)
APP = release.APPS["integration-service"]
VAULT = "kvcravesprodlowkmqgfy"
PREFIX = "https://" + VAULT + ".vault.azure.net/secrets/"
REFS = frozenset({"razorpay-webhook-secret", "razorpay-key-secret", "bank-internal",
                 "finance-internal", "bank-data-keyring", "razorpay-key-id", "catalog-finance-read"})


def azure(*args):
    allowed = (("keyvault", "secret", "list"), ("keyvault", "secret", "set"),
               ("containerapp", "secret", "set"))
    if not any(tuple(args[:len(p)]) == p for p in allowed):
        return release.active.az(*args)
    result = subprocess.run(["az", *args, "--only-show-errors", "-o", "json"],
                            capture_output=True, text=True, timeout=180)
    release.require(result.returncode == 0, "Existing-vault binding operation unavailable")
    return json.loads(result.stdout)


def stable(app):
    value = copy.deepcopy(app)
    config = value["properties"]["configuration"]
    config["secrets"] = [x for x in config.get("secrets", []) if x["name"] not in REFS]
    return {"signature": release.signature(value),
            "image": value["properties"]["template"]["containers"][0]["image"],
            "latest": value["properties"]["latestRevisionName"],
            "ready": value["properties"]["latestReadyRevisionName"]}


def unchanged(before, after):
    release.require(set(before) == set(after), "Application inventory changed")
    for name in before:
        if name == APP:
            release.require(stable(before[name]) == stable(after[name]), "Integration runtime changed")
        else:
            release.require(before[name] == after[name], "Unrelated application changed")


def snapshot(app):
    release.require("SystemAssigned" in app.get("identity", {}).get("type", ""), "Existing system identity required")
    env = release.environment(app)
    metadata = azure("containerapp", "secret", "list", "-g", release.RG, "-n", APP)
    active = {x["secretRef"] for x in env.values() if x.get("secretRef")}
    direct = {x["name"] for x in metadata if x["name"] in active and not x.get("keyVaultUrl")}
    release.require(direct.issubset(REFS), "Unexpected direct secret reference")
    pg = [x for x in metadata if x["name"] == env.get("SPRING_DATASOURCE_PASSWORD", {}).get("secretRef")]
    release.require(len(pg) == 1 and pg[0].get("identity") == "system" and
        re.fullmatch(re.escape(PREFIX) + r"[A-Za-z0-9-]+(?:/[a-f0-9]{32})?", pg[0].get("keyVaultUrl", "")),
        "Existing scoped database vault required")
    values = azure("containerapp", "secret", "list", "-g", release.RG, "-n", APP, "--show-values")
    current = {x["name"]: x.get("value") for x in values if x["name"] in direct}
    release.require(set(current) == direct and all(isinstance(v, str) and bool(v) for v in current.values()),
                    "Current direct secret values unavailable")
    return metadata, current


def pinned(url, ref):
    destination = PREFIX + "craves-integration-" + ref + "-preserved-v1"
    release.require(re.fullmatch(re.escape(destination) + r"/[a-f0-9]{32}", url or ""),
                    "Exact existing-vault version required")
    return url


def equal(first, second):
    return isinstance(first, str) and isinstance(second, str) and hmac.compare_digest(first.encode(), second.encode())


def apply():
    before = release.inventory(); app = before[APP]
    release.validate_database_state(before)
    release.require(app["properties"]["latestRevisionName"] == app["properties"]["latestReadyRevisionName"],
                    "Existing Integration rollout must be settled")
    metadata, values = snapshot(app)
    if not values:
        return {"verified": True, "alreadyVaultBacked": True, "credentialRotation": False}
    release.require(equal(values.get("bank-internal"), release.secret(before[release.APPS["user-chef-service"]], "CRAVES_BANK_INTERNAL_KEY")),
                    "Existing chef and Integration signing values differ")
    destinations = azure("keyvault", "secret", "list", "--vault-name", VAULT)
    names = {x.get("name", x.get("id", "").rstrip("/").split("/")[-1]) for x in destinations}
    versions = {}
    for ref, value in sorted(values.items()):
        destination = "craves-integration-" + ref + "-preserved-v1"
        if destination in names:
            saved = azure("keyvault", "secret", "show", "--id", PREFIX + destination)
            release.require(equal(saved.get("value"), value) and saved.get("attributes", {}).get("enabled") is not False,
                            "Preserved destination differs or is disabled; refusing overwrite")
            versions[ref] = pinned(saved.get("id"), ref)
    # All collisions and runtime changes are rejected before any writes.
    unchanged(before, release.inventory())
    current_meta, current_values = snapshot(release.inventory()[APP])
    release.require(current_meta == metadata and set(current_values) == set(values) and
                    all(equal(current_values[k], v) for k, v in values.items()), "Concurrent secret change")
    for ref, value in sorted(values.items()):
        if ref not in versions:
            with tempfile.TemporaryDirectory(prefix="craves-integration-preserve-") as directory:
                filename = Path(directory) / "value"
                fd = os.open(filename, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                with os.fdopen(fd, "w", encoding="utf-8", newline="") as stream: stream.write(value)
                saved = azure("keyvault", "secret", "set", "--vault-name", VAULT,
                    "--name", "craves-integration-" + ref + "-preserved-v1", "--file", str(filename), "--encoding", "utf-8")
            versions[ref] = pinned(saved.get("id"), ref)
        saved = azure("keyvault", "secret", "show", "--id", versions[ref])
        release.require(equal(saved.get("value"), value) and saved.get("attributes", {}).get("enabled") is not False,
                        "Copied secret verification failed")
    current = release.inventory(); unchanged(before, current)
    current_meta, current_values = snapshot(current[APP])
    release.require(current_meta == metadata and set(current_values) == set(values) and
                    all(equal(current_values[k], v) for k, v in values.items()), "Concurrent secret change")
    azure("containerapp", "secret", "set", "-g", release.RG, "-n", APP, "--secrets",
          *[ref + "=keyvaultref:" + url + ",identityref:system" for ref, url in sorted(versions.items())])
    after = release.inventory(); unchanged(before, after)
    rows = azure("containerapp", "secret", "list", "-g", release.RG, "-n", APP)
    for ref, url in versions.items():
        match = [x for x in rows if x["name"] == ref]
        release.require(len(match) == 1 and match[0].get("keyVaultUrl") == url and match[0].get("identity") == "system",
                        "Storage binding could not be verified")
        release.require(equal(azure("keyvault", "secret", "show", "--id", url).get("value"), values[ref]),
                        "Post-binding value verification failed")
    return {"verified": True, "app": APP, "preservedReferences": sorted(versions), "runtimePreserved": True,
            "credentialRotation": False, "permissionChanges": False, "revisionRestarted": False}


if __name__ == "__main__":
    try: print(json.dumps(apply(), sort_keys=True))
    except Exception as error:
        print("Integration binding preservation stopped: " + (str(error) if isinstance(error, ValueError) else "operation unavailable"))
        raise SystemExit(1)
