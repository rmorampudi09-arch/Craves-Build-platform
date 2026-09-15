#!/usr/bin/env python3
"""Configure existing Craves resources only. Plan by default; never print secret values.
Run a single release execution at a time. Azure changes are not a distributed transaction.
"""
from __future__ import annotations
import argparse
import base64
import copy
import hashlib
import json
import os
import re
import secrets
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlparse

APPS = {
    "integration": "ca-craves-integration-service-pr",
    "user-chef": "ca-craves-user-chef-service-prod",
    "order": "ca-craves-order-service-prodlow",
}
SECRET_NAMES = {
    "bank-internal": "craves-bank-onboarding-internal-v1",
    "bank-data-keyring": "craves-bank-onboarding-keyring-v1",
    "finance-internal": "craves-finance-source-internal-v1",
}
PURPOSE = "craves-bank-auto-v1"

class GuardError(RuntimeError):
    pass

def az(*args: str, output: str = "json"):
    """Capture stdout/stderr; raw Azure output can include unrelated runtime secrets."""
    result = subprocess.run(["az", *args, "--only-show-errors", "-o", output],
                            capture_output=True, text=True, timeout=1800, check=False)
    if result.returncode:
        raise GuardError("Azure command failed: " + " ".join(args[:2]) + "; inspect restricted Azure diagnostics")
    if output == "none":
        return None
    try:
        return json.loads(result.stdout) if result.stdout.strip() else None
    except ValueError as exc:
        raise GuardError("Azure response was not valid JSON") from exc

def environment(app: dict) -> dict:
    containers = app["properties"]["template"]["containers"]
    if len(containers) != 1:
        raise GuardError("Expected the existing single application container")
    values = containers[0].get("env", [])
    if len({item["name"] for item in values}) != len(values):
        raise GuardError("Duplicate environment variable names require reconciliation")
    return {item["name"]: item for item in values}

def origin(app: dict) -> str:
    host = app["properties"]["configuration"]["ingress"]["fqdn"]
    if not re.fullmatch(r"[A-Za-z0-9.-]+\.azurecontainerapps\.io", host):
        raise GuardError("Container App origin is not an Azure-provided hostname")
    return "https://" + host

def stable(app: dict, changed_env: set[str], changed_secrets: set[str]) -> str:
    """Hash every unrelated runtime setting, excluding provider-generated revision status."""
    value = {key: copy.deepcopy(app.get(key)) for key in ("location", "identity")}
    props = app["properties"]
    value["environment"] = props.get("environmentId", props.get("managedEnvironmentId"))
    template = copy.deepcopy(props["template"])
    template.pop("revisionSuffix", None)
    for container in template.get("containers", []):
        container["env"] = sorted([e for e in container.get("env", []) if e["name"] not in changed_env], key=lambda e: e["name"])
    config = copy.deepcopy(props["configuration"])
    config["secrets"] = sorted([s for s in config.get("secrets", []) if s["name"] not in changed_secrets], key=lambda s: s["name"])
    value.update(template=template, configuration=config)
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()

def select_vault(apps: dict[str, dict], explicit: str | None) -> str:
    names = set()
    for app in apps.values():
        for secret in app["properties"]["configuration"].get("secrets", []):
            host = urlparse(secret.get("keyVaultUrl", "")).hostname or ""
            if host.endswith(".vault.azure.net"):
                names.add(host.removesuffix(".vault.azure.net"))
    if explicit:
        if not re.fullmatch(r"[A-Za-z][A-Za-z0-9-]{1,22}[A-Za-z0-9]", explicit):
            raise GuardError("Invalid existing Key Vault name")
        if names and explicit not in names:
            raise GuardError("Selected vault differs from the existing application Key Vault references")
        return explicit
    if len(names) != 1:
        raise GuardError("Expected one unambiguous existing Key Vault reference; select an existing vault explicitly")
    return names.pop()

def existing_identity(app: dict, vault: str) -> str:
    refs = {s.get("identity") for s in app["properties"]["configuration"].get("secrets", [])
            if (urlparse(s.get("keyVaultUrl", "")).hostname or "") == vault + ".vault.azure.net"}
    refs.discard(None)
    if len(refs) == 1:
        return refs.pop()
    if not refs:
        identity = app.get("identity") or {}
        if "SystemAssigned" in identity.get("type", "") and identity.get("principalId"):
            return "system"
        assigned = identity.get("userAssignedIdentities") or {}
        if len(assigned) == 1:
            return next(iter(assigned))
    raise GuardError("One unambiguous existing managed identity is required; no new permissions are granted")

def desired(apps: dict[str, dict]) -> dict[str, dict[str, str]]:
    return {
        "integration": {
            "CRAVES_BANK_INTERNAL_KEY": "secretref:bank-internal",
            "CRAVES_BANK_DATA_KEYS_JSON": "secretref:bank-data-keyring",
            "CRAVES_BANK_DATA_ACTIVE_KEY_ID": "bank-v1",
            "CRAVES_BANK_USER_CHEF_BASE_URL": origin(apps["user-chef"]),
            "CRAVES_FINANCE_INTERNAL_KEY": "secretref:finance-internal",
            "CRAVES_BANK_WORKER_ENABLED": "true",
        },
        "user-chef": {"CRAVES_BANK_INTERNAL_KEY": "secretref:bank-internal"},
        "order": {"CRAVES_FINANCE_INTERNAL_KEY": "secretref:finance-internal",
                  "CRAVES_FINANCE_INTEGRATION_BASE_URL": origin(apps["integration"])},
    }

def check_env(app: dict, wanted: dict[str, str]) -> None:
    for key, value in wanted.items():
        previous = environment(app).get(key)
        expected = {"name": key, "secretRef": value.removeprefix("secretref:")} if value.startswith("secretref:") else {"name": key, "value": value}
        if previous is not None:
            previous = dict(previous)
            # Azure returns an unused empty/null value beside a secret reference.
            # Ignore it only when the nonempty reference already matches exactly.
            if expected.get("secretRef") and previous.get("secretRef") == expected["secretRef"] and previous.get("value") in (None, ""):
                previous.pop("value", None)
            elif "value" in expected and previous.get("secretRef") is None:
                previous.pop("secretRef", None)
        if previous is not None and previous != expected:
            raise GuardError("Existing setting differs for " + key + "; refusing a secret rotation or runtime override")

def ensure_secret(vault: str, name: str, known: set[str]) -> str:
    if name not in known:
        value = json.dumps({"bank-v1": base64.b64encode(secrets.token_bytes(32)).decode()}) if name == SECRET_NAMES["bank-data-keyring"] else secrets.token_urlsafe(48)
        with tempfile.TemporaryDirectory(prefix="craves-secret-") as folder:
            path = Path(folder) / "value"
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "w") as stream:
                stream.write(value)
            az("keyvault", "secret", "set", "--vault-name", vault, "--name", name,
               "--file", str(path), "--encoding", "utf-8", "--tags", "craves-purpose=" + PURPOSE,
               "--query", "id")
        known.add(name)
    metadata = az("keyvault", "secret", "show", "--vault-name", vault, "--name", name,
                  "--query", "{id:id,enabled:attributes.enabled,tags:tags}")
    if metadata.get("enabled") is not True or metadata.get("tags", {}).get("craves-purpose") != PURPOSE:
        raise GuardError("Existing secret has different provenance or is disabled; it was not replaced")
    return metadata["id"]

def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resource-group", default="rg-craves-prodlow-centralindia")
    parser.add_argument("--vault-name")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--expected-source-sha", default="")
    parser.add_argument("--output", default="bank-runtime-plan.json")
    args = parser.parse_args(argv)
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    if args.apply and (not re.fullmatch(r"[0-9a-f]{40}", args.expected_source_sha) or head != args.expected_source_sha):
        raise GuardError("Apply requires the exact reviewed source SHA")
    account = az("account", "show", "--query", "{id:id,tenantId:tenantId}")
    apps = {role: az("containerapp", "show", "-g", args.resource_group, "-n", name) for role, name in APPS.items()}
    for app in apps.values():
        environment(app)
        if app["properties"]["template"].get("scale", {}).get("maxReplicas") != 1:
            raise GuardError("Expected current one-replica maximum; no scaling is performed")
    selected = args.vault_name
    has_reference = any(secret.get("keyVaultUrl") for app in apps.values()
                        for secret in app["properties"]["configuration"].get("secrets", []))
    if not selected and not has_reference:
        vaults = az("keyvault", "list", "--resource-group", args.resource_group, "--query", "[].name")
        if len(vaults) != 1:
            raise GuardError("Expected one existing Key Vault in the resource group")
        selected = vaults[0]
    vault = select_vault(apps, selected)
    az("keyvault", "show", "--name", vault, "--query", "id")
    identities = {role: existing_identity(app, vault) for role, app in apps.items()}
    wanted = desired(apps)
    for role, app in apps.items():
        check_env(app, wanted[role])
    plan = {"mode": "APPLY" if args.apply else "PLAN_ONLY", "sourceSha": head,
            "subscriptionId": account["id"], "resourceGroup": args.resource_group, "vault": vault,
            "apps": {role: {"name": APPS[role], "origin": origin(app), "environment": wanted[role]} for role, app in apps.items()},
            "providerCallsEnabledByThisScript": False, "newAzureResources": False,
            "notice": "No merchant credential is generated or replaced. APIM and actual runtime acceptance are separate checks."}
    Path(args.output).write_text(json.dumps(plan, indent=2) + "\n")
    if not args.apply:
        print("Read-only runtime plan written; no changes or provider requests made.")
        return 0
    known = {urlparse(item["id"]).path.split("/")[2] for item in az("keyvault", "secret", "list", "--vault-name", vault)}
    refs = {local: ensure_secret(vault, remote, known) for local, remote in SECRET_NAMES.items()}
    for role, before in apps.items():
        name = APPS[role]
        used = {value.removeprefix("secretref:") for value in wanted[role].values() if value.startswith("secretref:")}
        baseline = stable(before, set(wanted[role]), used)
        current = az("containerapp", "show", "-g", args.resource_group, "-n", name)
        if stable(current, set(wanted[role]), used) != baseline:
            raise GuardError("Concurrent unrelated change detected before configuring " + name)
        check_env(current, wanted[role])
        current_secrets = {item["name"]: item for item in current["properties"]["configuration"].get("secrets", [])}
        additions = []
        for local in used:
            expected = {"name": local, "keyVaultUrl": refs[local], "identity": identities[role]}
            existing = current_secrets.get(local)
            if existing is not None and existing != expected:
                raise GuardError("Existing Container App secret reference differs; no overwrite allowed")
            if existing is None:
                additions.append(local + "=keyvaultref:" + refs[local] + ",identityref:" + identities[role])
        if additions:
            az("containerapp", "secret", "set", "-g", args.resource_group, "-n", name, "--secrets", *additions)
        missing = [key + "=" + value for key, value in wanted[role].items() if key not in environment(current)]
        if missing:
            az("containerapp", "update", "-g", args.resource_group, "-n", name,
               "--container-name", before["properties"]["template"]["containers"][0]["name"], "--set-env-vars", *missing)
        after = az("containerapp", "show", "-g", args.resource_group, "-n", name)
        if stable(after, set(wanted[role]), used) != baseline:
            raise GuardError("Unrelated runtime drift detected after configuration; stop release")
        check_env(after, wanted[role])
        if not set(wanted[role]).issubset(environment(after)):
            raise GuardError("Required environment references were not materialized")
    print("Existing-resource references configured. Provider and financial activation flags were not enabled; verify deployed revisions and private routing.")
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (GuardError, subprocess.SubprocessError, OSError, KeyError, ValueError) as error:
        print("Release stopped safely: " + (str(error) if isinstance(error, GuardError) else type(error).__name__))
        raise SystemExit(1)
