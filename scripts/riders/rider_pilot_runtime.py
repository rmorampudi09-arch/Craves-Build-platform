#!/usr/bin/env python3
"""Rider pilot runtime switches for the Container Apps (docs/riders/GO-LIVE.md).

  status   Read only: what each service has for the rider fleet. Secret values are compared, never printed.
  wire     integration-service: internal base URLs, support contacts, insurance label, minimum app version;
           notification-service: realtime push and the ops-alert emails. Every fleet flag stays off.
  enable   integration-service: fleet, rider API and location ingest on, test mode on (the pilot zone), payouts off.
  disable  integration-service: fleet, rider API and location ingest off. The kill switch: stop dispatch in the
           console first and let running trips finish.

Without --apply nothing changes: the plan is printed and written to --output. --apply needs the exact reviewed main
commit. Each changed app must reach a healthy new revision, else its previous values are put back.
"""
import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

APPS = {
    "integration": "ca-craves-integration-service-pr",
    "order": "ca-craves-order-service-prodlow",
    "notification": "ca-craves-notification-service-p",
    "user-chef": "ca-craves-user-chef-service-prod",
    "auth": "ca-craves-auth-service-prodlow",
}
# The variable each service checks the shared internal secret with (integration sends CRAVES_INTERNAL_SERVICE_KEY).
INTERNAL_KEY = {
    "integration": "CRAVES_INTERNAL_SERVICE_KEY",
    "order": "CRAVES_INTERNAL_SERVICE_KEY",
    "notification": "CRAVES_INTERNAL_SERVICE_KEY",
    "user-chef": "CRAVES_INTERNAL_SERVICE_SECRET",
    "auth": "CRAVES_INTERNAL_SERVICE_SECRET",
}
FLAGS = ("CRAVES_FLEET_ENABLED", "CRAVES_FLEET_RIDER_API_ENABLED", "CRAVES_FLEET_LOCATION_INGEST_ENABLED")
BASE_URLS = {"CRAVES_AUTH_INTERNAL_BASE_URL": "auth", "CRAVES_FLEET_ORDER_BASE_URL": "order",
             "CRAVES_USER_CHEF_INTERNAL_BASE_URL": "user-chef", "CRAVES_NOTIFICATION_INTERNAL_BASE_URL": "notification"}
SHOWN = {
    "integration": (*FLAGS, "CRAVES_FLEET_TEST_MODE", "CRAVES_FLEET_PAYOUT_EXECUTION_ENABLED", *BASE_URLS,
                    "CRAVES_FLEET_SUPPORT_PHONE", "CRAVES_FLEET_SUPPORT_WHATSAPP_URL", "CRAVES_FLEET_INSURANCE_LABEL",
                    "CRAVES_FLEET_MIN_APP_VERSION", "CRAVES_INTERNAL_SERVICE_KEY", "CRAVES_STORAGE_ENDPOINT_VALUE",
                    "CRAVES_STORAGE_DOCUMENTS_CONTAINER", "CRAVES_BANK_DATA_ACTIVE_KEY_ID", "CRAVES_BANK_DATA_KEYS_JSON",
                    "CRAVES_LEDGER_POSTING_ENABLED"),
    "order": ("CRAVES_INTERNAL_SERVICE_KEY",),
    "notification": ("CRAVES_REALTIME_PUSH_ENABLED", "CRAVES_OPS_ALERT_EMAILS", "CRAVES_INTERNAL_SERVICE_KEY",
                     "FIREBASE_SERVICE_ACCOUNT_JSON_BASE64", "ACS_EMAIL_CONNECTION_STRING", "ACS_EMAIL_SENDER_ADDRESS"),
    "user-chef": ("CRAVES_INTERNAL_SERVICE_SECRET", "OLA_MAPS_API_KEY"),
    "auth": ("CRAVES_INTERNAL_SERVICE_SECRET",),
}
# A mobile or landline number with +91, or a 1800 toll-free number: riders call it from the app.
PHONE = re.compile(r"\+91[1-9][0-9]{9}|1800[0-9]{6,7}")
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
VERSION = re.compile(r"[0-9]+\.[0-9]+\.[0-9]+")
WHATSAPP = re.compile(r"https://(chat\.whatsapp\.com|wa\.me)/[A-Za-z0-9/_-]+")
READY_STATES = {"Running", "RunningAtMaxScale"}


class GuardError(RuntimeError):
    pass


def az(*args: str, output: str = "json"):
    """Azure CLI; stdout and stderr are captured because raw Azure output can include unrelated secrets."""
    result = subprocess.run(["az", *args, "--only-show-errors", "-o", output],
                            capture_output=True, text=True, timeout=600, check=False)
    if result.returncode:
        raise GuardError("Azure command failed: az " + " ".join(args[:3]))
    if output == "none":
        return None
    try:
        return json.loads(result.stdout) if result.stdout.strip() else None
    except ValueError as exc:
        raise GuardError("Azure response was not valid JSON") from exc


def environment(app: dict) -> dict:
    containers = app["properties"]["template"]["containers"]
    if len(containers) != 1:
        raise GuardError("Expected the single application container")
    items = containers[0].get("env", [])
    if len({item["name"] for item in items}) != len(items):
        raise GuardError("Duplicate environment variable names need a person to reconcile them first")
    return {item["name"]: item for item in items}


def origin(app: dict) -> str:
    host = (app["properties"]["configuration"].get("ingress") or {}).get("fqdn") or ""
    if not re.fullmatch(r"[A-Za-z0-9.-]+\.azurecontainerapps\.io", host):
        raise GuardError("Container App has no Azure-provided ingress hostname")
    return "https://" + host


def literal(app: dict, name: str):
    """A plain value; None when the variable is absent or a secret reference."""
    item = environment(app).get(name)
    return None if item is None or item.get("secretRef") else (item.get("value") or "")


def secret_value(group: str, name: str, app: dict, variable: str, cache: dict):
    """The value behind a variable, plain or secret reference; kept in memory only, never printed."""
    item = environment(app).get(variable)
    if item is None:
        return None
    if not item.get("secretRef"):
        return item.get("value") or None
    if name not in cache:
        cache[name] = {s["name"]: s.get("value") for s in
                       az("containerapp", "secret", "list", "-g", group, "-n", name, "--show-values") or []}
    return cache[name].get(item["secretRef"]) or None


# The only variables whose plain values are printed; every other value shows as <set> (it may hold a secret).
PRINTABLE = {*FLAGS, "CRAVES_FLEET_TEST_MODE", "CRAVES_FLEET_PAYOUT_EXECUTION_ENABLED", *BASE_URLS, "CRAVES_FLEET_SUPPORT_PHONE",
             "CRAVES_FLEET_SUPPORT_WHATSAPP_URL", "CRAVES_FLEET_INSURANCE_LABEL", "CRAVES_FLEET_MIN_APP_VERSION",
             "CRAVES_STORAGE_DOCUMENTS_CONTAINER", "CRAVES_BANK_DATA_ACTIVE_KEY_ID", "CRAVES_LEDGER_POSTING_ENABLED",
             "CRAVES_REALTIME_PUSH_ENABLED", "CRAVES_OPS_ALERT_EMAILS", "ACS_EMAIL_SENDER_ADDRESS"}


def shown(app: dict, variable: str) -> str:
    item = environment(app).get(variable)
    if item is None:
        return "<missing>"
    if item.get("secretRef"):
        return "<secret " + item["secretRef"] + ">"
    if variable not in PRINTABLE:
        return "<set>" if item.get("value") else "<empty>"
    return item.get("value") or "<empty>"


def is_true(value) -> bool:
    return (value or "").strip().lower() == "true"


def checks(stage: str, apps: dict, args, values) -> tuple[list, list]:
    """(blocking problems, warnings) for a stage; values(role, variable) resolves secrets."""
    problems, warnings = [], []
    integration, notification = apps["integration"], apps["notification"]
    if stage in ("status", "wire", "enable"):
        key = values("integration", INTERNAL_KEY["integration"])
        if not key:
            problems.append("integration-service has no CRAVES_INTERNAL_SERVICE_KEY: it signs every internal call.")
        else:
            for role in ("order", "notification", "user-chef", "auth"):
                if values(role, INTERNAL_KEY[role]) != key:
                    problems.append(f"{APPS[role]} {INTERNAL_KEY[role]} is missing or differs from integration-service's "
                                    "CRAVES_INTERNAL_SERVICE_KEY: a person sets it to the same secret in Azure.")
        if not values("notification", "FIREBASE_SERVICE_ACCOUNT_JSON_BASE64"):
            problems.append("notification-service has no FIREBASE_SERVICE_ACCOUNT_JSON_BASE64: offers cannot ring.")
        if not values("integration", "CRAVES_STORAGE_ENDPOINT_VALUE"):
            problems.append("integration-service has no CRAVES_STORAGE_ENDPOINT_VALUE (the private documents storage "
                            "connection user-chef-service uses): rider documents and selfies cannot be saved.")
        if not values("integration", "CRAVES_BANK_DATA_KEYS_JSON") or not literal(integration, "CRAVES_BANK_DATA_ACTIVE_KEY_ID"):
            problems.append("integration-service has no CRAVES_BANK_DATA_KEYS_JSON / CRAVES_BANK_DATA_ACTIVE_KEY_ID: "
                            "rider payout accounts cannot be saved (run the chef bank runtime release first).")
        if not values("notification", "ACS_EMAIL_CONNECTION_STRING"):
            warnings.append("notification-service has no ACS email: SOS and dispatch-queue alerts stay log lines.")
        if not values("user-chef", "OLA_MAPS_API_KEY"):
            warnings.append("user-chef-service has no OLA_MAPS_API_KEY: road distance falls back to straight line x 1.3.")
        if not is_true(literal(integration, "CRAVES_LEDGER_POSTING_ENABLED")):
            warnings.append("CRAVES_LEDGER_POSTING_ENABLED is off: rider pay waits until it is on (nothing is lost).")
    if stage == "wire":
        if not PHONE.fullmatch(args.support_phone or ""):
            problems.append("--support-phone must be +91 and 10 digits, or a 1800 number: riders call it from the app.")
        if args.support_whatsapp_url and not WHATSAPP.fullmatch(args.support_whatsapp_url):
            problems.append("--support-whatsapp-url must be a https://chat.whatsapp.com/ or https://wa.me/ link.")
        emails = [e.strip() for e in (args.ops_alert_emails or "").split(",") if e.strip()]
        if not emails or not all(EMAIL.fullmatch(e) for e in emails):
            problems.append("--ops-alert-emails must list the ops leads' emails, comma-separated.")
        if not VERSION.fullmatch(args.min_app_version or ""):
            problems.append("--min-app-version must look like 1.0.0.")
        if len(args.insurance_label or "") > 120:
            problems.append("--insurance-label is longer than 120 characters.")
    if stage == "enable":
        for variable in (*BASE_URLS, "CRAVES_FLEET_SUPPORT_PHONE"):
            if not literal(integration, variable):
                problems.append(f"integration-service {variable} is not set: run the wire stage first.")
        if not is_true(literal(notification, "CRAVES_REALTIME_PUSH_ENABLED")):
            problems.append("notification-service CRAVES_REALTIME_PUSH_ENABLED is not true: run the wire stage first.")
    return problems, warnings


def desired(stage: str, apps: dict, args) -> dict:
    if stage == "wire":
        integration = {variable: origin(apps[role]) for variable, role in BASE_URLS.items()}
        integration.update({"CRAVES_FLEET_SUPPORT_PHONE": args.support_phone, "CRAVES_FLEET_MIN_APP_VERSION": args.min_app_version})
        if args.support_whatsapp_url:
            integration["CRAVES_FLEET_SUPPORT_WHATSAPP_URL"] = args.support_whatsapp_url
        if args.insurance_label:
            integration["CRAVES_FLEET_INSURANCE_LABEL"] = args.insurance_label
        emails = ",".join(e.strip() for e in args.ops_alert_emails.split(",") if e.strip())
        # Notification first: push on with nothing calling it is harmless if integration-service then fails.
        return {"notification": {"CRAVES_REALTIME_PUSH_ENABLED": "true", "CRAVES_OPS_ALERT_EMAILS": emails},
                "integration": integration}
    if stage == "enable":
        return {"integration": {**{flag: "true" for flag in FLAGS}, "CRAVES_FLEET_TEST_MODE": "true",
                                "CRAVES_FLEET_PAYOUT_EXECUTION_ENABLED": "false"}}
    if stage == "disable":
        return {"integration": {flag: "false" for flag in FLAGS}}
    return {}


def changes(apps: dict, wanted: dict) -> dict:
    """Only the variables whose value differs; never replaces a secret reference with a plain value."""
    result = {}
    for role, settings in wanted.items():
        current = environment(apps[role])
        for variable, value in settings.items():
            if current.get(variable, {}).get("secretRef"):
                raise GuardError(f"{APPS[role]} {variable} is a secret reference; refusing to replace it with a value")
            if literal(apps[role], variable) != value:
                result.setdefault(role, {})[variable] = value
    return result


def revision_state(group: str, name: str, revision: str) -> tuple:
    props = (az("containerapp", "revision", "show", "-g", group, "-n", name, "--revision", revision) or {}).get("properties", {})
    return props.get("runningState", ""), props.get("healthState", ""), props.get("provisioningState", "")


def wait_ready(group: str, name: str, previous: str, attempts: int, pause: float) -> str:
    for _ in range(attempts):
        props = az("containerapp", "show", "-g", group, "-n", name)["properties"]
        latest = props.get("latestRevisionName", "")
        if latest and latest != previous:
            running, health, provisioning = revision_state(group, name, latest)
            if provisioning == "Failed" or running in ("Failed", "Degraded"):
                raise GuardError(f"{name} revision {latest} failed ({provisioning or running})")
            if props.get("latestReadyRevisionName") == latest and running in READY_STATES and health == "Healthy":
                return latest
        time.sleep(pause)
    raise GuardError(f"{name} did not reach a healthy new revision in time")


def apply_role(group: str, name: str, app: dict, settings: dict, attempts: int, pause: float, roll_back: bool = True) -> str:
    """Sets the values and waits for a healthy revision. On failure the previous values go back (never for
    disable: a kill switch must not switch the fleet back on) and the restored revision is awaited too."""
    container = app["properties"]["template"]["containers"][0]["name"]
    previous_revision = app["properties"].get("latestRevisionName", "")
    before = {variable: literal(app, variable) for variable in settings}
    az("containerapp", "update", "-g", group, "-n", name, "--container-name", container,
       "--set-env-vars", *[f"{k}={v}" for k, v in settings.items()], output="none")
    try:
        return wait_ready(group, name, previous_revision, attempts, pause)
    except GuardError as failure:
        if not roll_back:
            raise GuardError(f"{failure}; the new values stay (no roll back for disable): check the app in Azure") from failure
        failed_revision = az("containerapp", "show", "-g", group, "-n", name)["properties"].get("latestRevisionName", "")
        restore = [f"{k}={v}" for k, v in before.items() if v is not None]
        remove = [k for k, v in before.items() if v is None]
        if restore:
            az("containerapp", "update", "-g", group, "-n", name, "--container-name", container,
               "--set-env-vars", *restore, output="none")
        if remove:
            az("containerapp", "update", "-g", group, "-n", name, "--container-name", container,
               "--remove-env-vars", *remove, output="none")
        try:
            restored = wait_ready(group, name, failed_revision, attempts, pause)
        except GuardError as restore_failure:
            raise GuardError(f"{failure}; putting the previous values back also failed ({restore_failure}): "
                             "a person must check the app in Azure now") from failure
        raise GuardError(f"{failure}; previous values restored on {restored}") from failure


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--stage", required=True, choices=["status", "wire", "enable", "disable"])
    parser.add_argument("--resource-group", default="rg-craves-prodlow-centralindia")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--expected-source-sha", default="")
    parser.add_argument("--support-phone", default="")
    parser.add_argument("--support-whatsapp-url", default="")
    parser.add_argument("--ops-alert-emails", default="")
    parser.add_argument("--insurance-label", default="")
    parser.add_argument("--min-app-version", default="1.0.0")
    parser.add_argument("--output", default="rider-pilot-runtime.json")
    parser.add_argument("--ready-attempts", type=int, default=150)
    parser.add_argument("--ready-pause-seconds", type=float, default=10)
    args = parser.parse_args(argv)

    if args.apply:
        if args.stage == "status":
            raise GuardError("status is read only; drop --apply")
        head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
        if not re.fullmatch(r"[0-9a-f]{40}", args.expected_source_sha) or head != args.expected_source_sha:
            raise GuardError("--apply needs --expected-source-sha equal to this checkout's commit")

    group = args.resource_group
    apps = {role: az("containerapp", "show", "-g", group, "-n", name) for role, name in APPS.items()}
    for role, app in apps.items():
        environment(app)
        if app["properties"].get("provisioningState") not in (None, "Succeeded"):
            raise GuardError(f"{APPS[role]} is {app['properties'].get('provisioningState')}: wait until it settles")
    cache: dict = {}

    def values(role, variable):
        return secret_value(group, APPS[role], apps[role], variable, cache)

    problems, warnings = checks(args.stage, apps, args, values)
    planned = {} if problems else changes(apps, desired(args.stage, apps, args))
    report = {
        "stage": args.stage, "mode": "APPLY" if args.apply else "PLAN_ONLY", "resourceGroup": group,
        "apps": {role: {"name": APPS[role], "latestRevision": app["properties"].get("latestRevisionName"),
                        "settings": {variable: shown(app, variable) for variable in SHOWN[role]}}
                 for role, app in apps.items()},
        "problems": problems, "warnings": warnings,
        "changes": {APPS[role]: settings for role, settings in planned.items()},
    }
    Path(args.output).write_text(json.dumps(report, indent=2) + "\n")
    for app in report["apps"].values():
        print(f"{app['name']} ({app['latestRevision']})")
        for variable, value in app["settings"].items():
            print(f"  {variable} = {value}")
    for warning in warnings:
        print("WARNING: " + warning)
    for problem in problems:
        print(("TO DO: " if args.stage == "status" else "BLOCKED: ") + problem)
    if args.stage == "status":
        print("Read only: nothing changed.")
        return 0
    if problems:
        return 1
    for role, settings in planned.items():
        print(f"{'Setting' if args.apply else 'Would set'} on {APPS[role]}: " + ", ".join(f"{k}={v}" for k, v in settings.items()))
    if not planned:
        print("Nothing to change.")
        return 0
    if not args.apply:
        print("Plan only: run again with --apply and the reviewed commit to make these changes.")
        return 0
    for role, settings in planned.items():
        revision = apply_role(group, APPS[role], apps[role], settings, args.ready_attempts, args.ready_pause_seconds,
                              roll_back=args.stage != "disable")
        print(f"{APPS[role]}: healthy on {revision}")
    print(f"Done: stage {args.stage} applied.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (GuardError, subprocess.SubprocessError, OSError, KeyError, ValueError) as error:
        print("Stopped safely: " + (str(error) if isinstance(error, GuardError) else type(error).__name__), file=sys.stderr)
        raise SystemExit(1)
