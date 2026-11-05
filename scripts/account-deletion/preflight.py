#!/usr/bin/env python3
"""Read-only preflight before switching account deletion on (docs/superpowers/specs/2026-11-05-account-deletion-switch-on-design.md).

Run from Azure Cloud Shell on the production subscription (34eefd95). The only Azure call is `az containerapp show`.
It reports what auth and the 8 erase targets have, and prints the `az containerapp update` line for what auth lacks.
Secret values are never printed or written, and no printed command sets either deletion switch.

Exit code: 0 ready, 1 something missing or unreadable, 2 STOP (an enforced internal path covers the erase paths).
"""
import argparse
import ipaddress
import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

AUTH_APP = "ca-craves-auth-prod"
AUTH_GROUP = "rg-craves-auth-prod"
# Auth's outbound address (docs/runbooks/production-environment.md, auth row); a target's ingress must let it in.
AUTH_OUTBOUND_DEFAULT = "20.198.108.229"
REFERRAL_HMAC = "CRAVES_REFERRALS_AUTH_HMAC_BASE64"
# (name, resource group, app names, credential variable on the target); AccountErasureClient.ERASE_ORDER.
# Referral signs with an HMAC; both its apps live in rg-craves-referral-prod.
TARGETS = [
    ("subscription", "rg-craves-subscription-prod", ["ca-craves-subscription-prod"], "CRAVES_INTERNAL_SERVICE_SECRET"),
    ("order", "rg-craves-order-prod", ["ca-craves-order-prod"], "CRAVES_INTERNAL_SERVICE_KEY"),
    ("integration", "rg-craves-integration-prod", ["ca-craves-integration-prod"], "CRAVES_INTERNAL_SERVICE_KEY"),
    ("referral", "rg-craves-referral-prod", ["ca-craves-referral-prod", "ca-craves-referral-members-prod"], REFERRAL_HMAC),
    ("advanced", "rg-craves-advanced-prod", ["ca-craves-advanced-prod"], "CRAVES_INTERNAL_SERVICE_SECRET"),
    ("catalog", "rg-craves-catalog-prod", ["ca-craves-catalog-prod"], "CRAVES_INTERNAL_SERVICE_SECRET"),
    ("user-chef", "rg-craves-user-chef-prod", ["ca-craves-user-chef-prod"], "CRAVES_INTERNAL_SERVICE_SECRET"),
    ("notification", "rg-craves-notification-prod", ["ca-craves-notification-prod"], "CRAVES_INTERNAL_SERVICE_KEY"),
]
ERASE_PATHS = ["/internal/v1/account-erasure", "/internal/v1/account-erasure/blockers",
               "/internal/v1/account-erasure/prepare", "/internal/v1/account-erasure/release"]
SWITCHES = ["CRAVES_ACCOUNT_DELETION_ENABLED", "CRAVES_ACCOUNT_DELETION_WORKER_ENABLED"]
TUNABLES = ["CRAVES_ACCOUNT_DELETION_WORKER_DELAY", "CRAVES_ACCOUNT_DELETION_WAIT_DAYS",
            "CRAVES_ACCOUNT_DELETION_REMINDER_DAYS", "CRAVES_ACCOUNT_DELETION_CALL_TIMEOUT"]
HMAC_SETTING = "CRAVES_ACCOUNT_DELETION_REFERRAL_HMAC_BASE64"
INTERNAL_SECRET = "CRAVES_INTERNAL_SERVICE_SECRET"
SOURCE_HMAC = "CRAVES_REFERRAL_SOURCE_HMAC_BASE64"
ALLOWED = "CRAVES_INTERNAL_AUTH_ALLOWED_CALLERS"
ENFORCED = "CRAVES_INTERNAL_AUTH_ENFORCED_PATHS"
PLACEHOLDER = "secretref:<create-a-key-vault-backed-secret>"


class GuardError(RuntimeError):
    pass


def key(name: str) -> str:
    return name.upper().replace("-", "_")


def base_url_setting(name: str) -> str:
    return f"CRAVES_ACCOUNT_DELETION_{key(name)}_BASE_URL"


def credential_setting(name: str):
    return None if name == "referral" else f"CRAVES_ACCOUNT_DELETION_{key(name)}_CREDENTIAL"


def az(*args: str):
    """Azure CLI; output is captured and never echoed because raw Azure output can include secrets."""
    result = subprocess.run(["az", *args, "--only-show-errors", "-o", "json"],
                            capture_output=True, text=True, timeout=300, check=False)
    if result.returncode:
        raise GuardError("Azure command failed: az " + " ".join(args[:3]))
    try:
        return json.loads(result.stdout)
    except ValueError as exc:
        raise GuardError("Azure response was not valid JSON") from exc


def show(group: str, name: str) -> dict:
    try:
        return az("containerapp", "show", "-g", group, "-n", name)
    except GuardError:
        raise GuardError(f"Azure command failed: az containerapp show -g {group} -n {name}") from None


def environment(app: dict) -> dict:
    containers = app["properties"]["template"]["containers"]
    if len(containers) != 1:
        raise GuardError(f"{app.get('name')}: expected the single application container")
    items = containers[0].get("env") or []
    if len({item["name"] for item in items}) != len(items):
        raise GuardError(f"{app.get('name')}: duplicate environment variable names")
    return {item["name"]: item for item in items}


def configuration(app: dict) -> dict:
    return app["properties"]["configuration"]


def ingress(app: dict) -> dict:
    return configuration(app).get("ingress") or {}


def traffic_state(app: dict) -> str:
    """'pinned <revision>' or 'latest'; a split means a release is rolling out."""
    if configuration(app).get("activeRevisionsMode") != "Multiple":
        return "latest"
    weighted = [t for t in ingress(app).get("traffic") or [] if t.get("weight")]
    if len(weighted) == 1 and weighted[0].get("latestRevision"):
        return "latest"
    if len(weighted) == 1 and weighted[0].get("weight") == 100 and weighted[0].get("revisionName"):
        return "pinned " + weighted[0]["revisionName"]
    raise GuardError(f"{app.get('name')} is rolling out (traffic split); try again once it has finished")


def secret_ref_name(app: dict, var: str):
    item = environment(app).get(var)
    return item.get("secretRef") if item else None


def setting(app: dict, var: str, show_value: bool = False) -> str:
    """missing | secretref:<name> [-> vault/secret] | the value (non-secret variables only) | plain value (hidden)."""
    item = environment(app).get(var)
    if item is None:
        return "missing"
    if item.get("secretRef"):
        text = "secretref:" + item["secretRef"]
        url = next((s.get("keyVaultUrl") for s in configuration(app).get("secrets") or []
                    if s.get("name") == item["secretRef"] and s.get("keyVaultUrl")), None)
        if url:
            parsed = urlparse(url)
            text += f" -> {(parsed.hostname or '').split('.')[0]}/{parsed.path.rsplit('/', 1)[-1]}"
        return text
    return (item.get("value") or "<empty>") if show_value else "plain value (hidden)"


def ant_regex(pattern: str):
    """Spring AntPathMatcher: ** crosses segments, * and ? stay inside one."""
    out, i = "", 0
    while i < len(pattern):
        if pattern.startswith("**", i):
            out, i = out + ".*", i + 2
            continue
        out += "[^/]*" if pattern[i] == "*" else "[^/]" if pattern[i] == "?" else re.escape(pattern[i])
        i += 1
    return re.compile(out.replace("/.*/", "/(?:.*/)?"))


def enforced_stop(value: str) -> bool:
    patterns = [p.strip() for p in (value or "").split(",") if p.strip()]
    return any(ant_regex(p).fullmatch(path) for p in patterns for path in ERASE_PATHS)


def ingress_verdict(app: dict, ip: str) -> str:
    rules = ingress(app).get("ipSecurityRestrictions") or []
    if not rules:
        return "open"
    address = ipaddress.ip_address(ip)

    def inside(action):
        return any(str(r.get("action")).lower() == action.lower() and address in ipaddress.ip_network(r["ipAddressRange"], strict=False)
                   for r in rules)
    if any(str(r.get("action")).lower() not in ("allow", "deny") for r in rules):
        return "does not allow auth"
    has_allow = any(str(r.get("action")).lower() == "allow" for r in rules)
    if inside("Deny") or (has_allow and not inside("Allow")):
        return "does not allow auth"
    return "allows auth"


def is_running(app: dict) -> bool:
    props = app["properties"]
    return props.get("provisioningState") in (None, "Succeeded") and props.get("runningStatus") in (None, "Running")


def host_of(app: dict):
    host = ingress(app).get("fqdn") or ""
    return host if re.fullmatch(r"[A-Za-z0-9.-]+\.azurecontainerapps\.io", host) else None


def build(args) -> tuple:
    """(exit code, text, facts)."""
    lines, problems, stops = [], [], []
    facts = {"problems": problems}
    auth = show(AUTH_GROUP, AUTH_APP)
    auth_env = environment(auth)

    def traffic(app):
        try:
            return traffic_state(app)
        except GuardError as failure:
            problems.append(str(failure))
            return "rolling out"

    def run_state(app):
        if is_running(app):
            return "running"
        problems.append(f"{app['name']} is not running")
        return "not running"

    props = auth["properties"]
    lines.append("## auth")
    auth_traffic = traffic(auth)
    lines.append(f"{AUTH_APP}: {run_state(auth)}; latest {props.get('latestRevisionName')}, "
                 f"ready {props.get('latestReadyRevisionName')}; traffic {auth_traffic}")
    required = [base_url_setting(n) for n, _, _, _ in TARGETS] + \
               [credential_setting(n) for n, _, _, _ in TARGETS if credential_setting(n)] + [HMAC_SETTING]
    missing = []
    for var in [*required, *SWITCHES, *TUNABLES]:
        value = setting(auth, var, show_value=var in SWITCHES or var in TUNABLES or var.endswith("_BASE_URL"))
        lines.append(f"  {var} = {value}")
        if value in ("missing", "<empty>") and var in required:
            missing.append(var)
            problems.append(f"auth: {var} missing")
    facts["auth"] = {"running": is_running(auth), "traffic": auth_traffic, "missing": missing, "switches": {v: setting(auth, v, True) for v in SWITCHES}}

    secrets = {}
    for var in (INTERNAL_SECRET, SOURCE_HMAC):
        ref = secret_ref_name(auth, var)
        if var not in auth_env:
            problems.append(f"auth: {var} missing")
        secrets[var] = "secretref:" + ref if ref else PLACEHOLDER
    notes = [f"note: auth's {v} is not a secretref; create a Key Vault-backed secret for it first"
             for v, s in secrets.items() if s == PLACEHOLDER and v in auth_env]

    sets = []
    for name, group, apps, cred_var in TARGETS:
        fetched = {a: show(group, a) for a in apps}
        chosen = apps[0]
        if name == "referral":
            holders = [a for a, app in fetched.items() if cred_var in environment(app)]
            if len(holders) > 1:
                problems.append(f"referral: both referral apps hold {cred_var}")
            elif not holders:
                problems.append(f"referral: no referral app holds {cred_var}")
            chosen = holders[0] if len(holders) == 1 else None
        lines.append(f"## {name}: {chosen or '(ambiguous)'}")
        entry = facts[name] = {"app": chosen}
        if not chosen:
            continue
        app = fetched[chosen]
        host, cred, verdict = host_of(app), setting(app, cred_var), ingress_verdict(app, args.auth_outbound_ip)
        enforced_item = environment(app).get(ENFORCED) or {}
        traffic_of = traffic(app)
        lines += [f"  {run_state(app)}; traffic {traffic_of}",
                  f"  base URL: {'https://' + host if host else 'no Azure ingress hostname'}"
                  f" ({'external' if ingress(app).get('external') else 'internal'} ingress)",
                  f"  ingress: {verdict}", f"  {cred_var}: {cred}",
                  f"  {ALLOWED}: {setting(app, ALLOWED, True)}", f"  {ENFORCED}: {setting(app, ENFORCED, True)}"]
        entry.update({"baseUrl": "https://" + host if host else None, "ingress": verdict, "credential": cred})
        if not host:
            problems.append(f"{name}: no Azure ingress hostname")
        if not ingress(app).get("external"):
            problems.append(f"{name}: internal ingress; auth runs in another environment and can reach it only over network peering")
        if verdict == "does not allow auth":
            problems.append(f"{name}: ingress does not allow auth's address {args.auth_outbound_ip}")
        if cred == "missing":
            problems.append(f"{name}: {cred_var} missing")
        stop = False
        if enforced_item.get("secretRef"):
            problems.append(f"{name}: enforced paths unreadable (secretref)")
        elif enforced_stop(enforced_item.get("value")):
            stop = True
            stops.append(name)
        entry.update({"running": is_running(app), "traffic": traffic_of, "allowedCallers": setting(app, ALLOWED, True),
                      "enforcedPaths": setting(app, ENFORCED, True), "stop": stop})
        if host and base_url_setting(name) in missing:
            sets.append(f"{base_url_setting(name)}=https://{host}")
        auth_url = setting(auth, base_url_setting(name), True)
        if host and base_url_setting(name) not in missing and auth_url != "https://" + host:
            problems.append(f"auth: {base_url_setting(name)} is {auth_url}, target serves https://{host}")
        if credential_setting(name) in missing:
            sets.append(f"{credential_setting(name)}={secrets[INTERNAL_SECRET]}")
    if HMAC_SETTING in missing:
        sets.append(f"{HMAC_SETTING}={secrets[SOURCE_HMAC]}")

    lines.append("## commands")
    if sets:
        lines.append(f"az containerapp update -g {AUTH_GROUP} -n {AUTH_APP} -o none --set-env-vars " + " ".join(sets))
    else:
        lines.append("nothing to add to auth")
    lines += notes
    facts["stops"] = stops
    facts["commands"] = lines[lines.index("## commands") + 1:]
    lines += [f"STOP: {n} enforces internal paths that cover the erase paths; auth would be refused there" for n in stops]
    lines += [f"PROBLEM: {p}" for p in problems]
    return (2 if stops else 1 if problems else 0), "\n".join(lines), facts


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--auth-outbound-ip", default=AUTH_OUTBOUND_DEFAULT)
    parser.add_argument("--output", default=None, help="also write the facts as JSON")
    args = parser.parse_args(argv)
    try:
        code, text, facts = build(args)
        print(text)
        print({0: "READY", 1: "NOT READY", 2: "STOP"}[code])
        if args.output:
            Path(args.output).write_text(json.dumps({**facts, "exitCode": code}, indent=2) + "\n")
        return code
    except Exception as error:  # type name only: an exception's text could carry Azure output
        print("Stopped safely: " + (str(error) if isinstance(error, GuardError) else type(error).__name__), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
