"""Move the existing User/Chef bank key into its existing vault without rotation.

Planning is read only. Applying is a separate, explicitly confirmed operation.
No access grants, credential generation, image update or revision restart occurs.
"""
import copy
import hmac
import os
from pathlib import Path
import re
import tempfile
from urllib.parse import urlparse

REF = "bank-internal"
DESTINATION = "craves-user-chef-bank-internal-preserved-v1"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def stable(app):
    value = copy.deepcopy(app)
    configuration = value["properties"]["configuration"]
    configuration["secrets"] = [s for s in configuration.get("secrets", []) if s["name"] != REF]
    return {"identity": value.get("identity"), "configuration": configuration,
            "template": value["properties"]["template"]}


def target(metadata, vaults):
    baseline = next((s for s in metadata if s["name"] == "pg-pass"), {})
    require(baseline.get("identity") == "system", "Existing database binding must use system identity")
    parsed = urlparse(baseline.get("keyVaultUrl", ""))
    matches = [v for v in vaults if urlparse(v["properties"]["vaultUri"]).hostname == parsed.hostname]
    require(len(matches) == 1 and parsed.scheme == "https" and not parsed.query and not parsed.fragment
            and not parsed.username and not parsed.password and parsed.port is None
            and re.fullmatch(r"/secrets/[A-Za-z0-9-]+(?:/[A-Za-z0-9]+)?", parsed.path),
            "Existing scoped database vault is required")
    return matches[0]["name"], "https://" + parsed.hostname + "/secrets/" + DESTINATION


def inspect(azure, rg, name, app):
    metadata = azure("containerapp", "secret", "list", "-g", rg, "-n", name)
    refs = {e.get("secretRef") for c in app["properties"]["template"]["containers"] for e in c.get("env", [])}
    require(REF in refs, "Expected active bank secret reference is missing")
    bank = [s for s in metadata if s["name"] == REF]
    require(len(bank) == 1, "Expected one bank secret binding")
    vault, destination = target(metadata, azure("keyvault", "list", "-g", rg))
    require("SystemAssigned" in app.get("identity", {}).get("type", ""), "Existing system identity required")
    if bank[0].get("keyVaultUrl"):
        require(bank[0].get("identity") == "system", "Bank binding identity requires review")
        return {"repairRequired": False, "reference": REF, "vault": vault}, None
    require(not bank[0].get("identity"), "Unexpected direct-secret identity")
    values = azure("containerapp", "secret", "list", "-g", rg, "-n", name, "--show-values")
    value = next((s.get("value") for s in values if s["name"] == REF), None)
    require(isinstance(value, str) and bool(value), "Current bank secret value is unavailable")
    # Listing metadata distinguishes absent secrets from permission/network failures.
    existing = [s for s in azure("keyvault", "secret", "list", "--vault-name", vault)
                if s.get("name", s.get("id", "").rstrip("/").split("/")[-1]) == DESTINATION]
    require(len(existing) <= 1, "Ambiguous preserved bank secret")
    version_url = None
    if existing:
        saved = azure("keyvault", "secret", "show", "--id", destination)
        require(hmac.compare_digest(saved.get("value", "").encode(), value.encode()),
                "Preserved bank destination contains a different value; refusing overwrite")
        require(saved.get("attributes", {}).get("enabled") is not False, "Preserved bank secret is disabled")
        version_url = saved["id"]
    plan = {"repairRequired": True, "reference": REF, "vault": vault,
            "destinationName": DESTINATION, "existingValueMatches": bool(existing),
            "action": "bind-existing-version" if existing else "copy-exact-value-and-bind",
            "credentialRotation": False, "permissionChanges": False}
    return plan, (value, destination, version_url)


def apply(azure, rg, name, app_reader, confirmed=False):
    require(confirmed, "Explicit binding repair confirmation required")
    before = app_reader(name)
    plan, sensitive = inspect(azure, rg, name, before)
    if not plan["repairRequired"]:
        return plan
    value, destination, version_url = sensitive
    require(stable(app_reader(name)) == stable(before), "Runtime changed during binding inspection")
    if not version_url:
        # Never put a credential in process arguments, logs, reports or artifacts.
        with tempfile.TemporaryDirectory(prefix="craves-bank-preserve-") as directory:
            filename = Path(directory) / "value"
            fd = os.open(filename, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8", newline="") as stream:
                stream.write(value)
            saved = azure("keyvault", "secret", "set", "--vault-name", plan["vault"],
                          "--name", DESTINATION, "--file", str(filename), "--encoding", "utf-8")
        version_url = saved["id"]
    require(version_url.startswith(destination + "/") and
            re.fullmatch("[A-Za-z0-9]+", version_url[len(destination) + 1:]), "Version-pinned vault URL required")
    saved = azure("keyvault", "secret", "show", "--id", version_url)
    require(hmac.compare_digest(saved.get("value", "").encode(), value.encode()), "Copied value verification failed")
    # Re-read the source immediately before replacing only its storage binding.
    current_plan, current_sensitive = inspect(azure, rg, name, app_reader(name))
    require(current_plan["repairRequired"] and current_sensitive is not None
            and hmac.compare_digest(current_sensitive[0].encode(), value.encode())
            and stable(app_reader(name)) == stable(before), "Concurrent bank/runtime change; binding repair stopped")
    azure("containerapp", "secret", "set", "-g", rg, "-n", name, "--secrets",
          REF + "=keyvaultref:" + version_url + ",identityref:system")
    require(stable(app_reader(name)) == stable(before), "Unrelated runtime changed during repair")
    metadata = azure("containerapp", "secret", "list", "-g", rg, "-n", name)
    repaired = next((s for s in metadata if s["name"] == REF), {})
    require(repaired.get("keyVaultUrl") == version_url and repaired.get("identity") == "system",
            "Bank binding repair could not be verified")
    return {**plan, "verified": True, "repairRequired": False}
