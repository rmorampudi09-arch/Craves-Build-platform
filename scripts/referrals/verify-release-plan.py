#!/usr/bin/env python3
"""Read-only validation for the dormant, isolated Azure referral release plan.

No network calls, resource writes, secret lookups or deployment are performed.
This validates supplied inventory, not its freshness or the operator's authority.
"""
from __future__ import annotations
import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

EXPECTED = {"appName", "location", "managedEnvironmentId", "userAssignedIdentityId", "registryServer", "image", "redisHost", "redisPort", "redisUsername", "jwtIssuer", "jwtAudience", "secretReferences", "authVerificationMode", "authBaseUrl"}
REQUIRED = EXPECTED - {"redisHost", "redisPort", "redisUsername", "jwtIssuer", "jwtAudience", "authVerificationMode", "authBaseUrl"}
SECRETS = {"dbUrl", "dbUser", "dbPassword", "jwtVerificationPem", "redisPassword", "authHmac", "orderHmac", "financeHmac"}
RESOURCE = re.compile(r"^/subscriptions/[0-9a-fA-F-]{36}/resourceGroups/[^/]+/providers/([^/]+)/([^/]+)/[^/]+$", re.IGNORECASE)

def validate(document: dict, inventory: list, subscription: str, resource_group: str) -> None:
    if not isinstance(document, dict) or set(document) - {"$schema", "contentVersion", "parameters"}:
        raise ValueError("Expected a standard deployment parameters document only")
    entries = document.get("parameters")
    if not isinstance(entries, dict) or set(entries) - EXPECTED or REQUIRED - set(entries):
        raise ValueError("Missing or unrecognised parameters; no runtime flag overrides are permitted")
    if any(not isinstance(v, dict) or set(v) != {"value"} for v in entries.values()):
        raise ValueError("Only explicit non-secret values and Key Vault URLs are supported")
    p = {k: v["value"] for k, v in entries.items()}
    if "REPLACE" in json.dumps(p).upper():
        raise ValueError("Template placeholders remain; this is not a release-ready plan")
    if not isinstance(inventory, list) or any(not isinstance(row, dict) or not isinstance(row.get("name"), str) or not isinstance(row.get("id"), str) for row in inventory):
        raise ValueError("Provide the complete az containerapp list JSON for the approved resource group")
    prefix = f"/subscriptions/{subscription}/resourceGroups/{resource_group}/providers/Microsoft.App/containerApps/".lower()
    if any(not row["id"].lower().startswith(prefix) for row in inventory):
        raise ValueError("Inventory contains a different subscription/resource group")
    name = p["appName"]
    if not isinstance(name, str) or not re.fullmatch(r"ca-craves-referral-[a-z0-9](?:[a-z0-9-]{0,12}[a-z0-9])?", name) or len(name) > 32:
        raise ValueError("Use a new, at most 32-character ca-craves-referral-* app name")
    if name.lower() in {row["name"].lower() for row in inventory}:
        raise ValueError("The target already exists. This first-deployment plan must not update an existing app")
    for key, provider, kind in [("managedEnvironmentId", "Microsoft.App", "managedEnvironments"), ("userAssignedIdentityId", "Microsoft.ManagedIdentity", "userAssignedIdentities")]:
        value = p[key]; match = RESOURCE.fullmatch(value) if isinstance(value, str) else None
        if not match or (match[1].lower(), match[2].lower()) != (provider.lower(), kind.lower()) or not value.lower().startswith(f"/subscriptions/{subscription}/".lower()):
            raise ValueError(f"{key} must reference an approved resource in this subscription")
    registry = p["registryServer"]
    if not isinstance(registry, str) or not re.fullmatch(r"[a-z0-9]+\.azurecr\.io", registry):
        raise ValueError("An approved ACR server is required")
    if not isinstance(p["image"], str) or not re.fullmatch(re.escape(registry) + r"/[a-z0-9][a-z0-9/_-]*@sha256:[0-9a-f]{64}", p["image"]):
        raise ValueError("Pin the scanned image to an immutable SHA-256 digest from the approved registry")
    if not isinstance(p["location"], str) or not re.fullmatch(r"[a-z0-9]+", p["location"]):
        raise ValueError("An explicit approved Azure region is required")
    mode=p.get("authVerificationMode", "REDIS")
    if mode not in {"REDIS", "AUTH_HTTP"}:
        raise ValueError("Unknown Auth verification mode")
    if mode == "AUTH_HTTP":
        url=urlparse(p.get("authBaseUrl", ""))
        if url.scheme != "https" or not url.hostname or url.username or url.password or url.query or url.fragment or url.path not in {"", "/"}:
            raise ValueError("Auth verification requires an HTTPS origin")
    if mode == "REDIS" and (not isinstance(p.get("redisHost"), str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.-]+", p["redisHost"]) or not isinstance(p.get("redisPort"), int) or isinstance(p["redisPort"], bool) or not 1 <= p["redisPort"] <= 65535):
        raise ValueError("Invalid TLS Redis host/port; network reachability still needs verification")
    refs = p["secretReferences"]
    if not isinstance(refs, dict) or set(refs) != (SECRETS if mode == "REDIS" else SECRETS - {"redisPassword"}):
        raise ValueError("Provide exactly the required Key Vault secret reference map, never secret values")
    for value in refs.values():
        if not isinstance(value, str):
            raise ValueError("Key Vault secret references must be URLs")
        url = urlparse(value)
        if url.scheme != "https" or not re.fullmatch(r"[a-z0-9-]+\.vault\.azure\.net", url.netloc) or url.query or url.fragment or not re.fullmatch(r"/secrets/[A-Za-z0-9-]+/[0-9a-fA-F]{32}", url.path):
            raise ValueError("Every secret reference must be a versioned Azure Key Vault HTTPS URL")
    if len({refs[k] for k in ("authHmac", "orderHmac", "financeHmac")}) != 3:
        raise ValueError("Auth, Order and Finance require distinct source secret references")
    if "jwtIssuer" in p:
        url = urlparse(p["jwtIssuer"])
        if url.scheme != "https" or not url.hostname or url.username or url.password or url.query or url.fragment:
            raise ValueError("JWT issuer must be the reviewed Auth HTTPS issuer")
    if "jwtAudience" in p and (not isinstance(p["jwtAudience"], str) or not p["jwtAudience"].strip()):
        raise ValueError("JWT audience must be explicit and non-empty")

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("parameters", type=Path)
    parser.add_argument("inventory", type=Path)
    parser.add_argument("--subscription", required=True)
    parser.add_argument("--resource-group", required=True)
    args = parser.parse_args()
    try:
        validate(json.loads(args.parameters.read_text()), json.loads(args.inventory.read_text()), args.subscription, args.resource_group)
    except (ValueError, TypeError, KeyError, OSError) as exc:
        print(f"STOP: {exc}", file=sys.stderr); return 1
    print("Static dormant-plan checks passed. No Azure resources were read or changed. Independently verify inventory freshness, RBAC, networking, region/capacity, cost, image scan, restricted DB roles and release approval.")
    return 0
if __name__ == "__main__":
    raise SystemExit(main())
