#!/usr/bin/env python3
"""Plan/provision/activate existing Craves references. Never deploy images, change bank gates, or send provider requests.

Run one reviewed release at a time. Azure writes are not a cross-resource transaction.
The default is a read-only plan; every apply must match its saved plan and reviewed Git SHA.
"""
from __future__ import annotations
import argparse
import copy
import hashlib
import hmac
import json
import os
import re
import secrets
import signal
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "finance"))
import configure_bank_runtime as bank

GuardError = bank.GuardError
az = bank.az
RG = "rg-craves-prodlow-centralindia"
APPS = {**bank.APPS, "auth": "ca-craves-auth-service-prodlow", "notification": "ca-craves-notification-service-p",
        "catalog": "ca-craves-catalog-service-prodlo", "web": "ca-craves-web-prodlow"}
KEYS = {
    "email-hmac": ("CRAVES_EMAIL_VERIFICATION_HMAC_KEY", ("auth",), "email-verify-hmac", "craves-email-verification-hmac-v1"),
    "email-transport": ("CRAVES_EMAIL_VERIFICATION_INTERNAL_KEY", ("auth", "notification"), "email-verify-key", "craves-email-verification-internal-v1"),
    "email-projection": ("CRAVES_EMAIL_PROJECTION_INTERNAL_KEY", ("auth", "user-chef"), "email-projection-key", "craves-email-projection-internal-v1"),
    "catalog-read": ("CRAVES_CATALOG_FINANCE_READ_KEY", ("catalog", "integration"), "catalog-finance-read", "craves-catalog-finance-read-v1"),
}
GATES = {
    "auth": ("CRAVES_EMAIL_VERIFICATION_ENABLED", "CRAVES_EMAIL_PROJECTION_WORKER_ENABLED"),
    "notification": ("CRAVES_EMAIL_VERIFICATION_TRANSPORT_ENABLED",),
    "integration": ("CRAVES_FINANCE_FINALIZATION_ENABLED", "CRAVES_FINANCE_AUTHORITATIVE_SOURCE_READY", "CRAVES_LEDGER_POSTING_ENABLED", "CRAVES_MANUAL_SETTLEMENT_ENABLED"),
    "order": ("CRAVES_FINANCE_SOURCE_ENABLED", "CRAVES_FINANCE_SOURCE_DISPATCH_ENABLED"),
}
ACTIVATION = {
    "email-processing": {"notification": {"CRAVES_EMAIL_VERIFICATION_TRANSPORT_ENABLED": "true"}, "auth": {"CRAVES_EMAIL_PROJECTION_WORKER_ENABLED": "true"}},
    "email-capability": {"auth": {"CRAVES_EMAIL_VERIFICATION_ENABLED": "true"}},
    "finance-processing": {"integration": {key: "true" for key in GATES["integration"]}},
    "order-checkout": {"order": {key: "true" for key in GATES["order"]}},
}


class ReadinessPending(GuardError):
    """Only a read-only post-write observation may retry a transitioning revision."""


def template_hash(template: dict) -> str:
    value = copy.deepcopy(template)
    value.pop("revisionSuffix", None)
    for container in value.get("containers", []):
        env = []
        for item in container.get("env", []):
            env.append({"name": item["name"], "secretRef": item["secretRef"]} if item.get("secretRef")
                       else {"name": item["name"], "value": item.get("value", "")})
        container["env"] = sorted(env, key=lambda item: item["name"])
    return digest(value)


def digest(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def write_once(path: Path, value: dict) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        json.dump(value, stream, indent=2, sort_keys=True)
        stream.write("\n")


def load_json(path: str) -> dict:
    target = Path(path)
    if target.is_symlink() or not target.is_file() or target.stat().st_size > 512 * 1024:
        raise GuardError("Evidence must be a bounded regular JSON file")
    value = json.loads(target.read_text())
    if not isinstance(value, dict):
        raise GuardError("Evidence must be a JSON object")
    return value


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def literal(app: dict, name: str) -> str | None:
    value = bank.environment(app).get(name)
    if value is None:
        return None
    if value.get("secretRef") or not isinstance(value.get("value"), str):
        raise GuardError("Expected an explicit non-secret setting: " + name)
    return value["value"]


def settings_hash(app: dict, secret_values: list, changed_env: set, changed_secrets: set) -> str:
    """Hash all configuration/identity/tags and unrelated protected values; omit only documented computed status."""
    value = copy.deepcopy(app)
    value.pop("etag", None)
    system = value.get("systemData", {})
    for key in ("lastModifiedAt", "lastModifiedBy", "lastModifiedByType"):
        system.pop(key, None)
    props = value["properties"]
    for key in ("provisioningState", "runningStatus", "latestRevisionName", "latestReadyRevisionName", "latestRevisionFqdn", "eventStreamEndpoint", "outboundIpAddresses"):
        props.pop(key, None)
    props["template"].pop("revisionSuffix", None)
    for container in props["template"]["containers"]:
        container["env"] = sorted([entry for entry in container.get("env", []) if entry["name"] not in changed_env], key=lambda entry: entry["name"])
    config = props["configuration"]
    for entry in config.get("ingress", {}).get("traffic", []):
        if entry.get("weight") == 100 and entry.get("revisionName") == app["properties"].get("latestReadyRevisionName"):
            entry["revisionName"] = "__HEALTHY_CURRENT_REVISION__"
    config["secrets"] = sorted([entry for entry in config.get("secrets", []) if entry["name"] not in changed_secrets], key=lambda entry: entry["name"])
    value["protectedSecretState"] = sorted([entry for entry in secret_values if entry["name"] not in changed_secrets], key=lambda entry: entry["name"])
    return digest(value)


def check_app(app: dict, subscription: str, name: str) -> None:
    expected = f"/subscriptions/{subscription}/resourceGroups/{RG}/providers/Microsoft.App/containerApps/{name}"
    if app.get("id", "").lower() != expected.lower():
        raise GuardError("Resource is outside the reviewed existing app scope")
    bank.environment(app)
    scale = app["properties"]["template"].get("scale", {})
    if scale.get("minReplicas") != 1 or scale.get("maxReplicas") != 1:
        raise GuardError("Existing minReplicas and maxReplicas must both be exactly one")
    if app["properties"].get("provisioningState") != "Succeeded":
        raise ReadinessPending("Existing app provisioning is not healthy")
    if app["properties"]["configuration"].get("activeRevisionsMode") != "Single":
        raise GuardError("Existing revision mode must be Single; multiple running revisions are not allowed")
    if app["properties"]["configuration"].get("ingress", {}).get("allowInsecure") is True:
        raise GuardError("Insecure application ingress requires review")
    bank.origin(app)


def observe_revision(app: dict, name: str) -> dict:
    revisions = az("containerapp", "revision", "list", "-g", RG, "-n", name)
    active = [revision for revision in revisions if revision.get("properties", {}).get("active") is True]
    if len(active) != 1:
        raise ReadinessPending("Exactly one active revision is required before configuration")
    revision = active[0]
    props = revision["properties"]
    if props.get("healthState") != "Healthy" or props.get("runningState") not in ("Running", "RunningAtMaxScale"):
        raise ReadinessPending("Active revision is not healthy and running")
    traffic = app["properties"]["configuration"]["ingress"].get("traffic", [])
    receiving = [entry for entry in traffic if entry.get("weight", 0) > 0]
    if len(receiving) != 1 or receiving[0].get("weight") != 100:
        raise ReadinessPending("Reviewed revision must receive exactly 100 percent traffic")
    target = app["properties"].get("latestReadyRevisionName") if receiving[0].get("latestRevision") is True else receiving[0].get("revisionName")
    if target != revision["name"]:
        raise ReadinessPending("Traffic points outside the single healthy revision")
    replicas = az("containerapp", "replica", "list", "-g", RG, "-n", name, "--revision", revision["name"])
    if len(replicas) != 1:
        raise ReadinessPending("Actual active replica count must be exactly one")
    image = app["properties"]["template"]["containers"][0]["image"]
    if template_hash(props.get("template", {})) != template_hash(app["properties"]["template"]):
        raise ReadinessPending("Current configuration template differs from the running revision")
    registry = az("acr", "show", "--name", "cravesprodlowacr82121")
    scope = app["id"].split("/providers/", 1)[0]
    if registry.get("id", "").lower() != (scope + "/providers/Microsoft.ContainerRegistry/registries/cravesprodlowacr82121").lower():
        raise GuardError("Existing registry differs from the reviewed subscription and resource group")
    if not image.startswith(registry["loginServer"] + "/"):
        raise GuardError("Running image is outside the existing reviewed registry")
    manifest = az("acr", "repository", "show", "--name", registry["name"], "--image", image.split("/", 1)[1], "--query", "digest")
    if not isinstance(manifest, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", manifest):
        raise GuardError("Running image digest cannot be verified in the existing registry")
    if "@" in image and not image.endswith("@" + manifest):
        raise GuardError("Immutable image reference differs from the registry digest")
    return {"revision": revision["name"], "image": image, "imageDigest": manifest,
            "digestEvidence": "immutable-image-reference" if image.endswith("@" + manifest) else "existing-registry-resolution",
            "actualReplicas": 1, "trafficPercent": 100, "runningTemplateHash": template_hash(props["template"])}


def permission_for(vault: dict, principal: str, operation: str) -> None:
    """Check existing grants; never create a role assignment, policy, or identity."""
    props = vault["properties"]
    if props.get("enableRbacAuthorization") is not True:
        if any(policy.get("objectId") == principal and bool({operation, "all"}.intersection(x.lower() for x in policy.get("permissions", {}).get("secrets", [])))
               for policy in props.get("accessPolicies", [])):
            return
        raise GuardError("Existing vault access policy does not grant required secret " + operation)
    roles = az("role", "assignment", "list", "--assignee-object-id", principal, "--scope", vault["id"], "--include-inherited", "--fill-principal-name", "false")
    allowed = {"00482a5a-887f-4fb3-b363-3b7fe8e74483", "b86a8fe4-44ce-4948-aee5-eccb2c155cd7"}
    if operation == "get":
        allowed.add("4633458b-17de-408a-b874-0445c86b69e6")
    for role in roles:
        scope = role.get("scope", "").lower().rstrip("/")
        if (role.get("principalId") == principal and not role.get("condition") and scope
                and (vault["id"].lower() == scope or vault["id"].lower().startswith(scope + "/"))
                and role.get("roleDefinitionId", "").split("/")[-1].lower() in allowed):
            return
    raise GuardError("Existing vault data-plane grant is missing, conditional or requires a custom-role review")


def identity_for(app: dict, vault: dict) -> str:
    ref = bank.existing_identity(app, vault["name"])
    if ref == "system":
        if "SystemAssigned" not in app.get("identity", {}).get("type", ""):
            raise GuardError("Referenced system identity is not enabled")
        principal = app["identity"].get("principalId")
    else:
        assigned = app.get("identity", {}).get("userAssignedIdentities", {})
        if ref not in assigned:
            raise GuardError("Referenced user identity is not assigned to the existing app")
        principal = assigned[ref].get("principalId")
    if not principal:
        raise GuardError("Managed identity principal cannot be verified")
    permission_for(vault, principal, "get")
    return ref


def pinned_secret(url: str, vault: str) -> dict:
    parsed = urlparse(url)
    if (parsed.scheme != "https" or parsed.hostname != vault + ".vault.azure.net" or parsed.username or parsed.password or parsed.port
            or parsed.query or parsed.fragment or not re.fullmatch(r"/secrets/[A-Za-z0-9-]+/[0-9a-f]{32}", parsed.path)):
        raise GuardError("A pinned secret version in the existing vault is required")
    secret = az("keyvault", "secret", "show", "--id", url)
    if secret.get("id") != url or secret.get("attributes", {}).get("enabled") is not True:
        raise GuardError("Existing secret version is disabled or changed")
    expires = secret.get("attributes", {}).get("expires")
    if expires and datetime.fromisoformat(expires.replace("Z", "+00:00")) <= datetime.now(timezone.utc):
        raise GuardError("Existing secret is expired")
    if not isinstance(secret.get("value"), str) or not 32 <= len(secret["value"]) <= 512:
        raise GuardError("Existing dedicated internal key has incompatible length")
    return secret


def resolve_binding(app: dict, variable: str, vault: str) -> tuple[str, str, str] | None:
    binding = bank.environment(app).get(variable)
    if binding is None:
        return None
    if not binding.get("secretRef") or binding.get("value") not in (None, ""):
        raise GuardError("Dedicated keys require a compatible existing secret reference: " + variable)
    candidates = [secret for secret in app["properties"]["configuration"].get("secrets", []) if secret["name"] == binding["secretRef"]]
    if len(candidates) != 1:
        raise GuardError("Existing dedicated secret binding cannot be resolved")
    secret = pinned_secret(candidates[0].get("keyVaultUrl", ""), vault)
    return binding["secretRef"], secret["id"], secret["value"]


def key_plan(apps: dict, vault: dict) -> tuple[dict, dict]:
    known = {urlparse(item["id"]).path.split("/")[2] for item in az("keyvault", "secret", "list", "--vault-name", vault["name"])}
    planned, private = {}, {}
    for purpose, (variable, consumers, alias, remote) in KEYS.items():
        bindings = {role: resolve_binding(apps[role], variable, vault["name"]) for role in consumers}
        existing = [binding for binding in bindings.values() if binding]
        if existing and any(not hmac.compare_digest(existing[0][2], binding[2]) for binding in existing[1:]):
            raise GuardError("Conflicting existing shared key bindings: " + variable)
        reference, value = (existing[0][1], existing[0][2]) if existing else (None, None)
        if not existing and remote in known:
            secret = az("keyvault", "secret", "show", "--vault-name", vault["name"], "--name", remote)
            if secret.get("tags", {}).get("craves-purpose") != purpose:
                raise GuardError("An unbound secret name has different provenance; it was not overwritten")
            secret = pinned_secret(secret["id"], vault["name"])
            reference, value = secret["id"], secret["value"]
        aliases = {role: bindings[role][0] if bindings[role] else alias for role in consumers}
        for role in consumers:
            if not bindings[role] and any(secret["name"] == aliases[role] for secret in apps[role]["properties"]["configuration"].get("secrets", [])):
                raise GuardError("New app secret alias collides with an unrelated existing binding")
        planned[purpose] = {"variable": variable, "consumers": list(consumers), "aliases": aliases,
                            "vaultSecretName": remote, "versionReference": reference, "action": "REUSE" if reference else "CREATE_MISSING"}
        private[purpose] = value
    values = [value for value in private.values() if value is not None]
    if len(values) != len(set(values)):
        raise GuardError("Email hashing, transport, projection and Catalog read keys must be independent")
    return planned, private


def desired(apps: dict, keys: dict, phase: str) -> dict:
    wanted = {role: {} for role in APPS}
    if phase == "provision":
        for key in keys.values():
            for role in key["consumers"]:
                wanted[role][key["variable"]] = "secretref:" + key["aliases"][role]
        wanted["auth"].update(CRAVES_EMAIL_NOTIFICATION_BASE_URL=bank.origin(apps["notification"]),
                              CRAVES_EMAIL_USER_CHEF_BASE_URL=bank.origin(apps["user-chef"]), CRAVES_EMAIL_VERIFICATION_ALLOW_LOCAL_HTTP="false")
        wanted["catalog"]["CRAVES_CATALOG_FINANCE_ORIGIN"] = bank.origin(apps["integration"])
        for role, gates in GATES.items():
            for name in gates:
                previous = literal(apps[role], name)
                if previous not in (None, "false", "true"):
                    raise GuardError("Existing capability gate is not an explicit boolean: " + name)
                # Never stop committed reconciliation by resetting an existing gate.
                wanted[role][name] = previous if previous is not None else "false"
        for role in wanted:
            bank.check_env(apps[role], wanted[role])
    else:
        for role, settings in ACTIVATION[phase].items():
            for name, value in settings.items():
                if literal(apps[role], name) not in ("false", "true"):
                    raise GuardError("Provision and verify explicit closed gates before activation")
                wanted[role][name] = value
    return wanted


def create_key(vault: str, purpose: str, remote: str) -> str:
    # Re-read immediately before creation. Do not turn a race into a key rotation.
    known = {urlparse(item["id"]).path.split("/")[2] for item in az("keyvault", "secret", "list", "--vault-name", vault)}
    if remote in known:
        raise GuardError("Secret appeared after the reviewed plan; re-plan without overwriting it")
    with tempfile.TemporaryDirectory(prefix="craves-launch-secret-") as folder:
        path = Path(folder) / "value"
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w") as stream:
            stream.write(secrets.token_urlsafe(48))
        result = az("keyvault", "secret", "set", "--vault-name", vault, "--name", remote, "--file", str(path), "--encoding", "utf-8", "--tags", "craves-purpose=" + purpose, "--query", "id")
    return pinned_secret(result, vault)["id"]


def read_app(role: str, subscription: str) -> tuple[dict, list, dict]:
    app = az("containerapp", "show", "-g", RG, "-n", APPS[role])
    check_app(app, subscription, APPS[role])
    protected = az("containerapp", "secret", "list", "-g", RG, "-n", APPS[role], "--show-values")
    # ARM can omit the resolved value of a Key Vault-backed app secret. Hash the
    # actual current version/value too, including unrelated versionless references.
    for entry in protected:
        if entry.get("keyVaultUrl"):
            secret = az("keyvault", "secret", "show", "--id", entry["keyVaultUrl"])
            if secret.get("attributes", {}).get("enabled") is not True or not isinstance(secret.get("value"), str):
                raise GuardError("An existing Key Vault reference cannot be verified")
            entry["resolvedVersion"] = secret["id"]
            entry["resolvedValueHash"] = digest(secret["value"])
    return app, protected, observe_revision(app, APPS[role])


def read_ready_app(role: str, subscription: str, deadline_seconds: int = 60) -> tuple[dict, list, dict]:
    deadline = time.monotonic() + deadline_seconds
    def expired(_signal, _frame):
        raise GuardError("Updated app did not become one healthy matching revision within the readback deadline")
    previous = signal.signal(signal.SIGALRM, expired)
    signal.setitimer(signal.ITIMER_REAL, deadline_seconds)
    try:
        while True:
            try:
                return read_app(role, subscription)
            except ReadinessPending:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    expired(None, None)
                time.sleep(min(2, remaining))
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phase", choices=("provision", *ACTIVATION), default="provision")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--expected-release-sha", required=True)
    parser.add_argument("--approved-plan")
    parser.add_argument("--evidence")
    parser.add_argument("--output", default="public-launch-plan.json")
    args = parser.parse_args(argv)
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    if not re.fullmatch(r"[0-9a-f]{40}", args.expected_release_sha) or head != args.expected_release_sha:
        raise GuardError("Every plan and apply requires the exact reviewed checkout SHA")
    if subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=no"], text=True).strip():
        raise GuardError("Tracked source must be clean before release configuration")
    if args.apply and not args.approved_plan:
        raise GuardError("Apply requires the saved reviewed plan")
    from public_launch_evidence import validate_evidence, privacy_preflight, source_prerequisites, provision_activation_blockers
    account = az("account", "show")
    if account.get("state") != "Enabled" or not account.get("id") or not account.get("tenantId"):
        raise GuardError("An enabled existing Azure account is required")
    observations = {role: read_app(role, account["id"]) for role in APPS}
    apps = {role: observation[0] for role, observation in observations.items()}
    vault_name = bank.select_vault(apps, None)
    vault = az("keyvault", "show", "--name", vault_name)
    if vault.get("properties", {}).get("tenantId") != account["tenantId"]:
        raise GuardError("Existing vault tenant does not match the authenticated release account")
    identities = {role: identity_for(app, vault) for role, app in apps.items() if role != "web"}
    keys, private_keys = key_plan(apps, vault)
    wanted = desired(apps, keys, args.phase)
    privacy = privacy_preflight(account["id"])
    source = source_prerequisites(apps, vault_name, private_keys)
    evidence = load_json(args.evidence) if args.evidence else None
    blockers = validate_evidence(evidence, head, args.phase, observations, source, apps)
    if args.phase == "provision":
        blockers.extend(provision_activation_blockers(apps, wanted))
    if args.phase != "provision" and any(key["action"] != "REUSE" for key in keys.values()):
        blockers.append("Provision the missing dedicated secret references before activation")
    if args.phase != "provision":
        for purpose, key in keys.items():
            for role in key["consumers"]:
                if resolve_binding(apps[role], key["variable"], vault_name) is None:
                    blockers.append(role + ": dedicated " + purpose + " binding is not provisioned")
        for role, variable, expected in (("auth", "CRAVES_EMAIL_NOTIFICATION_BASE_URL", bank.origin(apps["notification"])),
                                         ("auth", "CRAVES_EMAIL_USER_CHEF_BASE_URL", bank.origin(apps["user-chef"])),
                                         ("catalog", "CRAVES_CATALOG_FINANCE_ORIGIN", bank.origin(apps["integration"]))):
            if literal(apps[role], variable) != expected:
                blockers.append("Missing verified discovered origin: " + variable)
    snapshots = {}
    for role, (app, protected, runtime) in observations.items():
        aliases = {key["aliases"][role] for key in keys.values() if role in key["consumers"]} if args.phase == "provision" else set()
        snapshots[role] = {"id": app["id"], "origin": bank.origin(app), **runtime,
                           "unrelatedSettingsHash": settings_hash(app, protected, set(wanted[role]), aliases),
                           "completeSettingsHash": settings_hash(app, protected, set(), set()),
                           "desiredEnvironment": wanted[role], "existingManagedIdentity": identities.get(role)}
    core = {"schema": 1, "sourceSha": head, "phase": args.phase, "subscriptionId": account["id"], "tenantId": account["tenantId"],
            "resourceGroup": RG, "vaultId": vault["id"], "apps": snapshots, "keys": keys, "privacy": privacy,
            "evidenceHash": digest(evidence) if evidence else None, "blockers": blockers,
            "providerCalls": False, "imageDeployments": False, "newResources": False, "replicaChanges": False}
    record = {"recordedAt": utcnow(), "mode": "APPLY" if args.apply else "PLAN_ONLY", "planHash": digest(core), "plan": core}
    write_once(Path(args.output), record)
    if not args.apply:
        print("Redacted immutable plan written. Review blockers and existing active gates before applying.")
        return 0
    approved = load_json(args.approved_plan)
    if approved.get("planHash") != digest(approved.get("plan")) or approved.get("planHash") != record["planHash"] or approved.get("mode") != "PLAN_ONLY":
        raise GuardError("Runtime, configuration, evidence or release changed since the reviewed plan")
    if blockers:
        raise GuardError("Required release evidence is incomplete; inspect the redacted plan blockers")
    if args.phase == "provision" and any(key["action"] == "CREATE_MISSING" for key in keys.values()):
        user = account.get("user", {})
        if user.get("type") != "servicePrincipal":
            raise GuardError("Secret provisioning requires the existing approved service connection principal")
        principal = az("ad", "sp", "show", "--id", user["name"], "--query", "id")
        permission_for(vault, principal, "set")
    references = {purpose: key["versionReference"] for purpose, key in keys.items()}
    for purpose, key in keys.items():
        if args.phase == "provision" and not references[purpose]:
            references[purpose] = create_key(vault_name, purpose, key["vaultSecretName"])
    resolved_values = [pinned_secret(reference, vault_name)["value"] for reference in references.values()]
    source_binding = resolve_binding(apps["integration"], "CRAVES_FINANCE_INTERNAL_KEY", vault_name)
    if len(set(resolved_values)) != len(resolved_values) or (source_binding and source_binding[2] in resolved_values):
        raise GuardError("Dedicated secret scope independence failed before configuring any app")
    receipts = {}
    for role in ("notification", "user-chef", "integration", "catalog", "auth", "order", "web"):
        settings = wanted[role]
        before, protected, _ = observations[role]
        current, current_protected, _ = read_app(role, account["id"])
        if settings_hash(current, current_protected, set(), set()) != snapshots[role]["completeSettingsHash"]:
            raise GuardError("Concurrent runtime change detected before app configuration")
        additions = []
        aliases = set()
        if args.phase == "provision":
            for purpose, key in keys.items():
                if role not in key["consumers"]:
                    continue
                alias = key["aliases"][role]
                aliases.add(alias)
                matches = [secret for secret in current["properties"]["configuration"].get("secrets", []) if secret["name"] == alias]
                if not matches:
                    additions.append(alias + "=keyvaultref:" + references[purpose] + ",identityref:" + identities[role])
            if additions:
                az("containerapp", "secret", "set", "-g", RG, "-n", APPS[role], "--secrets", *additions, output="none")
        changes = [key + "=" + value for key, value in settings.items() if (bank.environment(current).get(key, {}).get("secretRef") != value.removeprefix("secretref:") if value.startswith("secretref:") else literal(current, key) != value)]
        if changes:
            az("containerapp", "update", "-g", RG, "-n", APPS[role], "--container-name", before["properties"]["template"]["containers"][0]["name"], "--set-env-vars", *changes, output="none")
        after, after_protected, runtime = read_ready_app(role, account["id"]) if changes else read_app(role, account["id"])
        if settings_hash(after, after_protected, set(settings), aliases) != snapshots[role]["unrelatedSettingsHash"]:
            raise GuardError("Unrelated configuration drift detected after update; stop new release work")
        bank.check_env(after, settings)
        if not set(settings).issubset(bank.environment(after)):
            raise GuardError("Required settings were not materialized")
        if args.phase == "provision":
            for purpose, key in keys.items():
                if role not in key["consumers"]:
                    continue
                alias = key["aliases"][role]
                original = next((secret for secret in before["properties"]["configuration"].get("secrets", []) if secret["name"] == alias), None)
                expected = original or {"name": alias, "keyVaultUrl": references[purpose], "identity": identities[role]}
                actual = next((secret for secret in after["properties"]["configuration"].get("secrets", []) if secret["name"] == alias), None)
                if actual is None or any(actual.get(field) != expected.get(field) for field in ("name", "keyVaultUrl", "identity")):
                    raise GuardError("Dedicated secret reference differs after configuration")
                resolve_binding(after, key["variable"], vault_name)
        receipts[role] = {**runtime, "unrelatedSettingsPreserved": True, "settingsHash": settings_hash(after, after_protected, set(), set()), "configuredVariables": sorted(settings)}
        write_once(Path(args.output).with_suffix("." + role + ".readback.json"), {"sourceSha": head, "phase": args.phase, "completedAt": utcnow(), "reviewedPlanHash": record["planHash"], **receipts[role]})
    write_once(Path(args.output).with_suffix(".readback.json"), {"sourceSha": head, "phase": args.phase, "completedAt": utcnow(), "reviewedPlanHash": record["planHash"], "apps": receipts,
               "note": "No provider call, deployment, business record or approval was created. Keep all prior keys and financial history."})
    print("Reviewed existing-resource configuration completed; redacted readback written.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print("Release configuration stopped safely: " + (str(error) if isinstance(error, GuardError) else type(error).__name__))
        raise SystemExit(1)
