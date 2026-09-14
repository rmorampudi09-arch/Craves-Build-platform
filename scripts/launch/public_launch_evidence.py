"""Read-only acceptance guards used by the public launch configuration workflow."""
from __future__ import annotations
import hashlib
import hmac
import json
import re
import signal
import time
import urllib.request
import uuid
import zlib
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
import configure_public_launch as launch
import configure_bank_apim as bank_apim

GuardError = launch.GuardError
ROOT = Path(__file__).resolve().parents[2]
SERVICE_DIRS = {role: ROOT / "services" / ("user-chef-service" if role == "user-chef" else role + "-service") / "src/main/resources/db/migration"
                for role in launch.APPS if role != "web"}
APIM = "apim-craves-prodlow-l3ing6"
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
SHA = re.compile(r"[0-9a-f]{64}")
EXPOSURE_COUNTS = {"emailChallengesPending", "emailProjectionPending", "bankValidationsQueued", "payoutsQueued",
                   "sourceEventsQueued", "sourceExceptions", "unknownTransfers"}
EXCLUDED_PROVIDERS = re.compile(r"(pidge|borzo|shadowfax|shiprocket|delhivery|logistics|courier)", re.I)


def excluded_scope(value: object) -> bool:
    # Same metadata-only scope selector as the approved runtime preflight's
    # audit_runtime.py excluded(). Do not fetch excluded provider policies.
    value = str(value)
    if EXCLUDED_PROVIDERS.search(value):
        return True
    value = re.sub(r"[^a-z0-9]", "", value.lower())
    for allowed in ("notificationdelivery", "channeldelivery", "webhookdelivery"):
        value = value.replace(allowed, "")
    return "delivery" in value or "deliveries" in value or value == "integrationservicechefaccepted"


def private_operation_guard(path: str, template: str) -> None:
    """Preserve historical Catalog/delivery routes; reject publication of these private launch contracts."""
    route = "/" + "/".join(part.strip("/") for part in (path, template) if part.strip("/"))
    private = ("/internal/v1/auth-email", "/internal/v1/finance", "/internal/v1/chef-bank")
    # A broad root/internal catch-all can reach every private leaf. Public Catalog's
    # historical /api/v1/catalog/internal/kitchens route is a separate existing API.
    prefix = route.split("*", 1)[0].rstrip("/")
    if any(route == item or route.startswith(item + "/") or ("*" in route and item.startswith(prefix + "/")) for item in private):
        raise GuardError("A private email, finance or bank-identity contract is publicly routed; review before configuration")


def privacy_guard(policies: list, diagnostics: list) -> None:
    bank_apim.privacy_guard(policies, diagnostics)
    for policy in policies:
        text = policy.get("properties", {}).get("value", "")
        if re.search(r"/internal/v1/(?:auth-email|finance|chef-bank)(?:/|[\"'<\s])", text, re.I):
            raise GuardError("An APIM policy references a private launch contract; review its rewrite before configuration")
    for diagnostic in diagnostics:
        for side in ("frontend", "backend"):
            for direction in ("request", "response"):
                headers = ((diagnostic.get("properties", {}).get(side) or {}).get(direction) or {}).get("headers", [])
                if any(re.search(r"(?:signature|internal-key|subscription-key|api-key|secret)", header, re.I) for header in headers):
                    raise GuardError("Existing APIM diagnostic logs private authentication material")


def fresh(value: object, maximum_seconds: int = 7200) -> bool:
    try:
        timestamp = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        delta = (datetime.now(timezone.utc) - timestamp).total_seconds()
        return 0 <= delta <= maximum_seconds
    except (ValueError, TypeError):
        return False


def migration_checksum(path: Path) -> int:
    # Flyway SQL checksum: UTF-8 logical lines without CR/LF, skipping an initial BOM.
    value = path.read_text(encoding="utf-8-sig")
    checksum = zlib.crc32("".join(re.split(r"\r\n|\n|\r", value)).encode("utf-8"))
    return checksum if checksum < 2 ** 31 else checksum - 2 ** 32


def migrations_match(role: str, rows: object, require_complete: bool) -> bool:
    if not isinstance(rows, list) or not rows:
        return False
    files = {}
    for path in SERVICE_DIRS[role].glob("V*__*.sql"):
        match = re.fullmatch(r"V([0-9]+)__.+\.sql", path.name)
        if not match or match[1] in files:
            return False
        files[match[1]] = path
    applied = set()
    for row in rows:
        if (not isinstance(row, dict) or set(row) != {"version", "checksum", "success"}
                or not isinstance(row["version"], str) or row["version"] in applied
                or row["version"] not in files or type(row["checksum"]) is not int or row["success"] is not True
                or row["checksum"] != migration_checksum(files[row["version"]])):
            return False
        applied.add(row["version"])
    return not require_complete or applied == set(files)


def privacy_preflight(subscription: str) -> dict:
    service = launch.az("apim", "show", "-g", launch.RG, "-n", APIM)
    expected = f"/subscriptions/{subscription}/resourceGroups/{launch.RG}/providers/Microsoft.ApiManagement/service/{APIM}"
    if service.get("id", "").lower() != expected.lower():
        raise GuardError("Existing APIM differs from the reviewed runtime scope")
    base = "https://management.azure.com" + service["id"]
    snapshots = []
    def inspect(path: str):
        policies = bank_apim.pages(bank_apim.url(base, path + "/policies"))
        diagnostics = bank_apim.pages(bank_apim.url(base, path + "/diagnostics"))
        privacy_guard(policies, diagnostics)
        snapshots.extend(policies + diagnostics)
    inspect("")
    apis = bank_apim.pages(bank_apim.url(base, "/apis"))
    relevant = []
    excluded = []
    for api in apis:
        path = api.get("properties", {}).get("path", "").strip("/")
        if excluded_scope(api["name"] + " " + path + " " + str(api.get("properties", {}).get("serviceUrl", ""))):
            excluded.append({"scope": "API", "metadataHash": launch.digest(api)})
            continue
        operations = bank_apim.pages(bank_apim.url(base, "/apis/" + api["name"] + "/operations"))
        permitted = []
        for operation in operations:
            if excluded_scope(operation["name"] + " " + operation.get("properties", {}).get("urlTemplate", "")):
                excluded.append({"scope": "OPERATION", "metadataHash": launch.digest(operation)})
                continue
            permitted.append(operation)
            private_operation_guard(path, operation.get("properties", {}).get("urlTemplate", ""))
        snapshots.extend(operations)
        relevant.append(api["name"])
        inspect("/apis/" + api["name"])
        for operation in permitted:
            policies = bank_apim.pages(bank_apim.url(base, "/apis/" + api["name"] + "/operations/" + operation["name"] + "/policies"))
            privacy_guard(policies, [])
            snapshots.extend(policies)
        products = bank_apim.pages(bank_apim.url(base, "/apis/" + api["name"] + "/products"))
        for product in products:
            policies = bank_apim.pages(bank_apim.url(base, "/products/" + product["name"] + "/policies"))
            privacy_guard(policies, [])
            snapshots.extend(policies)
    return {"apim": APIM, "inspectedApis": sorted(relevant), "configurationHash": launch.digest([apis, snapshots]),
            "excludedDeliveryScopes": excluded, "excludedPoliciesRead": False, "excludedScopePrivacyVerified": False,
            "publicRoutesChanged": False, "privateRoutesPublished": False}


def source_prerequisites(apps: dict, vault: str, keys: dict) -> dict:
    if launch.literal(apps["catalog"], "CRAVES_PUBLIC_CATALOG_PRIVACY_ENFORCEMENT_ENABLED") != "true":
        raise GuardError("Existing Catalog public privacy enforcement must stay enabled")
    left = launch.resolve_binding(apps["integration"], "CRAVES_FINANCE_INTERNAL_KEY", vault)
    right = launch.resolve_binding(apps["order"], "CRAVES_FINANCE_INTERNAL_KEY", vault)
    if not left or not right:
        return {"ready": False, "reason": "Run the existing reviewed bank runtime configuration helper for missing finance source bindings"}
    if not hmac.compare_digest(left[2], right[2]):
        raise GuardError("Existing Order and Integration finance source keys conflict")
    if left[2] in [value for value in keys.values() if value is not None]:
        raise GuardError("The finance posting key must differ from every new read-only/email key")
    origin = launch.bank.origin(apps["integration"])
    if launch.literal(apps["order"], "CRAVES_FINANCE_INTEGRATION_BASE_URL") != origin:
        return {"ready": False, "reason": "Verify the existing bank runtime helper's discovered finance origin before activation"}
    return {"ready": True, "origin": origin, "catalogKey": keys.get("catalog-read")}


def provision_activation_blockers(apps: dict, wanted: dict) -> list[str]:
    dependencies = {
        "email-hmac": (("auth", "CRAVES_EMAIL_VERIFICATION_ENABLED"),),
        "email-transport": (("auth", "CRAVES_EMAIL_VERIFICATION_ENABLED"), ("notification", "CRAVES_EMAIL_VERIFICATION_TRANSPORT_ENABLED")),
        "email-projection": (("auth", "CRAVES_EMAIL_PROJECTION_WORKER_ENABLED"),),
    }
    extra = {"email-transport": (("auth", "CRAVES_EMAIL_NOTIFICATION_BASE_URL"),),
             "email-projection": (("auth", "CRAVES_EMAIL_USER_CHEF_BASE_URL"),)}
    blockers = []
    for purpose, gates in dependencies.items():
        if not any(launch.literal(apps[role], gate) == "true" for role, gate in gates):
            continue
        variable, roles, _, _ = launch.KEYS[purpose]
        fields = [(role, variable) for role in roles] + list(extra.get(purpose, ()))
        for role, name in fields:
            actual = launch.bank.environment(apps[role]).get(name, {})
            target = wanted[role][name]
            matches = actual.get("secretRef") == target[10:] if target.startswith("secretref:") else actual.get("value") == target
            if not matches:
                blockers.append("Provision would complete a dependency of enabled " + purpose + "; review its queued work and close new capability safely before provisioning")
                break
    return blockers


def catalog_probe(origin: str, key: str) -> dict:
    """The only application request made here is a signed READ of saved selling eligibility; it cannot post money."""
    path = "/internal/v1/finance/catalog-eligibility"
    request_id = str(uuid.uuid4())
    body = json.dumps({"requestId": request_id}, separators=(",", ":")).encode()
    stamp = str(int(time.time()))
    signature = hmac.new(key.encode(), f"POST\n{path}\n{stamp}\n".encode() + body, hashlib.sha256).hexdigest()
    request = urllib.request.Request(origin + path, data=body, method="POST", headers={"Content-Type": "application/json",
        "X-Craves-Catalog-Timestamp": stamp, "X-Craves-Catalog-Signature": signature})
    def timeout(_signal, _frame):
        raise GuardError("Signed eligibility read exceeded its total deadline")
    previous = signal.signal(signal.SIGALRM, timeout)
    signal.setitimer(signal.ITIMER_REAL, 8)
    try:
        with urllib.request.build_opener(bank_apim.NoRedirect()).open(request, timeout=5) as response:
            raw = response.read(65537)
            response_stamp = response.headers.get("X-Craves-Catalog-Timestamp", "")
            response_signature = response.headers.get("X-Craves-Catalog-Signature", "")
            if response.status != 200 or len(raw) > 65536 or not response_stamp.isdigit() or abs(int(time.time()) - int(response_stamp)) > 15:
                raise GuardError("Signed eligibility read is invalid, stale or oversized")
            wanted = hmac.new(key.encode(), f"RESPONSE\n{path}\n{response_stamp}\n".encode() + raw, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(wanted, response_signature):
                raise GuardError("Signed eligibility response authentication failed")
            result = json.loads(raw)
            fields = {"requestId", "evaluatedAt", "complete", "policyId", "revision", "hash", "eligibleChefIds"}
            if (not isinstance(result, dict) or set(result) != fields or result["requestId"] != request_id or result["complete"] is not True
                    or not fresh(result["evaluatedAt"], 15) or not UUID.fullmatch(str(result["policyId"]))
                    or type(result["revision"]) is not int or result["revision"] < 0 or not SHA.fullmatch(str(result["hash"]))
                    or not isinstance(result["eligibleChefIds"], list) or not 1 <= len(result["eligibleChefIds"]) <= 1000
                    or len(set(result["eligibleChefIds"])) != len(result["eligibleChefIds"])
                    or not all(UUID.fullmatch(str(chef)) for chef in result["eligibleChefIds"])):
                raise GuardError("Saved policy and eligible chef records are incomplete or unavailable")
            return result
    except GuardError:
        raise
    except Exception as error:
        raise GuardError("Private signed Catalog eligibility is unavailable; no checkout activation") from error
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)


def validate_evidence(evidence: dict | None, sha: str, phase: str, observations: dict, source: dict, apps: dict) -> list[str]:
    blockers = []
    if (not evidence or evidence.get("schema") != 1 or evidence.get("sourceSha") != sha or not fresh(evidence.get("checkedAt"))):
        return ["Fresh read-only preflight evidence for this exact release SHA is required"]
    control = evidence.get("releaseControl", {})
    if (control.get("protectedResource") != "Craves-Dev-Service-Connection" or control.get("exclusiveLockEnabled") is not True
            or control.get("otherReleaseWritersPaused") is not True or not fresh(control.get("checkedAt"))
            or not SHA.fullmatch(str(control.get("reviewedEvidenceHash")))):
        blockers.append("Verify the existing protected service connection exclusive lock and pause other release writers before applying")
    services = evidence.get("services", {})
    for role, (_, _, runtime) in observations.items():
        saved = services.get(role, {})
        if saved.get("revision") != runtime["revision"] or saved.get("image") != runtime["image"]:
            blockers.append(role + ": preflight runtime receipt differs")
        if role != "web" and not migrations_match(role, saved.get("appliedMigrations"), phase != "provision"):
            blockers.append(role + ": applied migration history is missing, changed, unsuccessful or incomplete")
        if phase != "provision" and (saved.get("buildSourceSha") != sha or saved.get("imageDigest") != runtime.get("imageDigest")
                or not re.fullmatch(r"sha256:[0-9a-f]{64}", str(saved.get("imageDigest")))
                or not runtime["image"].endswith("@" + str(saved.get("imageDigest")))
                or not re.fullmatch(r"[0-9]+", str(saved.get("pipelineRunId")))):
            blockers.append(role + ": immutable exact-release image digest and build run evidence is required")
    if phase == "provision":
        return blockers
    if not source.get("ready"):
        blockers.append(source["reason"])
    if launch.literal(apps["auth"], "CRAVES_EMAIL_VERIFICATION_ALLOW_LOCAL_HTTP") != "false":
        blockers.append("The production local-HTTP test override must be explicitly false")
    checks = evidence.get("connectivity", {})
    required = {"email-processing": ("auth-notification", "auth-user-chef"), "email-capability": ("auth-notification", "auth-user-chef", "authenticated-email-routes"),
                "finance-processing": ("order-integration-source", "catalog-integration-read", "finance-auth-owner-denial"),
                "order-checkout": ("order-integration-source", "catalog-integration-read", "finance-auth-owner-denial", "statement-owner-denial")}[phase]
    for name in required:
        receipt = checks.get(name, {})
        if receipt.get("result") != "PASS" or receipt.get("sourceSha") != sha or not fresh(receipt.get("checkedAt")) or not SHA.fullmatch(str(receipt.get("evidenceHash"))):
            blockers.append("Missing deployed authenticated connectivity evidence: " + name)
    exposure = evidence.get("queuedExposure", {})
    counts, maxima = exposure.get("counts", {}), exposure.get("approvedMaximums", {})
    if (not fresh(exposure.get("checkedAt")) or not SHA.fullmatch(str(exposure.get("reviewedEvidenceHash")))
            or not isinstance(counts, dict) or not isinstance(maxima, dict) or set(counts) != EXPOSURE_COUNTS or set(maxima) != EXPOSURE_COUNTS
            or any(type(counts[name]) is not int or type(maxima[name]) is not int or not 0 <= counts[name] <= maxima[name] for name in EXPOSURE_COUNTS)):
        blockers.append("Fresh reviewed queued-work counts within explicitly approved bounds are required before enabling any processor")
    if phase == "email-capability":
        if launch.literal(apps["auth"], "CRAVES_EMAIL_PROJECTION_WORKER_ENABLED") != "true" or launch.literal(apps["notification"], "CRAVES_EMAIL_VERIFICATION_TRANSPORT_ENABLED") != "true":
            blockers.append("Activate and verify dedicated email processing before opening email capability")
    if phase in ("finance-processing", "order-checkout"):
        policy = evidence.get("financePolicy", {})
        settings = policy.get("settings", {})
        try:
            fee_ok = Decimal(str(settings.get("chefFeePercent"))) == Decimal("7")
        except Exception:
            fee_ok = False
        if (not UUID.fullmatch(str(policy.get("savedPolicyId"))) or not SHA.fullmatch(str(policy.get("contentHash")))
                or not SHA.fullmatch(str(policy.get("reviewedBusinessEvidenceHash"))) or not fresh(policy.get("checkedAt"))
                or policy.get("state") not in ("DRAFT", "ACTIVE") or settings.get("ledgerStartDate") != "2026-09-14"
                or settings.get("ledgerEnabled") is not True or settings.get("manualWithdrawalsEnabled") is not True
                or settings.get("automaticPayoutsEnabled") is not False or settings.get("automaticPayoutDelayHours") != 48
                or settings.get("chefFeeTaxTreatment") != "EXCLUSIVE" or not fee_ok
                or not isinstance(settings.get("taxApprovalReference"), str) or not settings["taxApprovalReference"].strip()):
            blockers.append("A genuinely saved reviewed 7-percent policy with separate approved fee GST, tax evidence and manual-only payout settings is required")
        for gate in ("CRAVES_BANK_PROVIDER_ENABLED", "CRAVES_RAZORPAYX_PRODUCTION_APPROVED", "CRAVES_RAZORPAYX_WORKER_ENABLED"):
            if launch.literal(apps["integration"], gate) not in (None, "false"):
                blockers.append("Provider-mode gate must remain closed during manual launch: " + gate)
        if phase == "finance-processing" and launch.literal(apps["order"], "CRAVES_FINANCE_SOURCE_ENABLED") == "true":
            blockers.append("New source checkout must remain closed until compatible Integration processing and policy are verified")
        if phase == "order-checkout":
            if any(launch.literal(apps["integration"], gate) != "true" for gate in launch.GATES["integration"]):
                blockers.append("All compatible Integration processing/manual gates must precede Order checkout")
            if policy.get("state") != "ACTIVE" or type(policy.get("revision")) is not int or policy["revision"] < 0:
                blockers.append("Activate the saved reviewed policy before opening Order source checkout")
            if not blockers and source.get("catalogKey"):
                live = catalog_probe(source["origin"], source["catalogKey"])
                if live["policyId"] != policy["savedPolicyId"] or live["revision"] != policy["revision"]:
                    blockers.append("Live signed eligibility policy differs from the reviewed saved policy")
            elif not source.get("catalogKey"):
                blockers.append("Catalog read key is missing; no authoritative eligibility verification")
    return blockers
