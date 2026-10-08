#!/usr/bin/env python3
"""Read-only plan or exact PDF storage binding correction in the current environment.

The sole allowed cloud write is Notification's CRAVES_DOCUMENTS_BLOB_CONTAINER
value: documents -> pdf-documents. --apply requires --expected-baseline-sha256,
computed over the printed 13-app baseline using canonical sorted compact JSON.
No role grants, keys, SAS, blob/database writes, images or other settings change.
The established read-only DB helper uses existing credentials in memory only.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time

SUB = "721906c9-4a72-4606-830b-d3e7ace093ff"
TENANT = "1e7e43ac-c7f5-4d47-a74f-289a7cc21508"
RG = "rg-craves-prodlow-centralindia"
APP = "ca-craves-notification-service-p"
ACCOUNT = "stcravesprodlowkmqgfy"
FROM, TO = "documents", "pdf-documents"
KEY = "CRAVES_DOCUMENTS_BLOB_CONTAINER"
ENDPOINT = "https://stcravesprodlowkmqgfy.blob.core.windows.net"
ROLE = "ba92f5b4-2d11-453d-a403-e96b0029c9fe"
ACCOUNT_ID = f"/subscriptions/{SUB}/resourceGroups/{RG}/providers/Microsoft.Storage/storageAccounts/{ACCOUNT}"
SCOPE = ACCOUNT_ID + "/blobServices/default/containers/" + TO
APP_ID = f"/subscriptions/{SUB}/resourceGroups/{RG}/providers/Microsoft.App/containerApps/{APP}"
APP_URL = "https://management.azure.com" + APP_ID + "?api-version=2025-07-01"
SOURCES = ("ca-craves-order-service-prodlow", "ca-craves-integration-service-pr", "ca-craves-subscription-service-p")


def require(ok, message):
    if not ok:
        raise ValueError(message)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def lower(value):
    return str(value or "").rstrip("/").lower()


def error_code(stderr):
    """Return safe machine classifications, never raw ARM messages or values."""
    if "You do not have the required permissions needed to perform this operation" in stderr:
        return "AuthorizationPermissionMismatch"
    for pattern in (r'"code"\s*:\s*"([A-Za-z][A-Za-z0-9_.-]{1,79})"',
                    r'ERROR:\s*\(([A-Za-z][A-Za-z0-9_.-]{1,79})\)',
                    r'(?m)^Code:\s*([A-Za-z][A-Za-z0-9_.-]{1,79})\s*$'):
        match = re.search(pattern, stderr)
        if match:
            return match.group(1)
    if "unrecognized arguments:" in stderr:
        return "CliUnrecognizedArguments"
    if "invalid choice:" in stderr:
        return "CliInvalidChoice"
    return "UnclassifiedAzureFailure"


def revision_suffix(baseline_hash, rollback=False):
    suffix = ("pdfr-" if rollback else "pdfs-") + baseline_hash[:10]
    require(len(APP + "--" + suffix) <= 54 and re.fullmatch(r"[a-z][a-z0-9-]*[a-z0-9]", suffix)
            and "--" not in suffix, "Invalid repair revision name")
    return suffix


def cli(args, data_read=False, approved_patch=False):
    allowed = args[:3] in (["storage", "account", "show"], ["role", "assignment", "list"],
                           ["storage", "blob", "download"], ["rest", "--method", "get"])
    allowed = allowed or (approved_patch and len(args) == 9 and args[:5] == ["rest", "--method", "patch", "--url", APP_URL]
                          and args[5] == "--body" and args[6].startswith("@")
                          and args[7:] == ["--headers", "Content-Type=application/json"])
    require(allowed, "Unapproved Azure operation refused")
    try:
        result = subprocess.run(["az", *args, "--subscription", SUB, "--only-show-errors", "-o", "json"],
                                capture_output=True, text=True, timeout=150)
    except (OSError, subprocess.TimeoutExpired):
        if data_read:
            return {"error": "OperationUnavailable"}
        raise ValueError("Azure operation unavailable; raw output suppressed") from None
    if result.returncode:
        classified = error_code(result.stderr)
        if data_read:
            codes = ("AuthorizationPermissionMismatch", "AuthorizationFailure", "AuthenticationFailed",
                     "InvalidAuthenticationInfo", "BlobNotFound", "ContainerNotFound", "ResourceNotFound")
            return {"error": next((code for code in codes if code in result.stderr), classified)}
        raise ValueError("Azure operation failed: " + classified + "; raw output suppressed")
    require(len(result.stdout) <= 4_000_000, "Azure response exceeds bound")
    return json.loads(result.stdout) if result.stdout.strip() else {}


def load_helpers(repo):
    path = repo.resolve() / "scripts/finance/shared_chef_finance_release.py"
    require(path.is_file(), "Existing repository helper required")
    spec = importlib.util.spec_from_file_location("pdf_storage_inventory", path)
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    require((helper.SUB, helper.TENANT, helper.RG) == (SUB, TENANT, RG), "Repository environment guard differs")
    return helper


def baseline(helper, apps):
    require(len(apps) == 13 and APP in apps, "Current 13-app inventory differs")
    return {name: {"signature": helper.signature(app), "image": app["properties"]["template"]["containers"][0]["image"]}
            for name, app in sorted(apps.items())}


def strict_runtime(apps):
    return {name: digest({"template": app["properties"]["template"], "configuration": app["properties"]["configuration"],
                         "identity": app.get("identity"), "tags": app.get("tags")}) for name, app in sorted(apps.items())}


def patch_binding(app, baseline_hash, rollback=False):
    # JSON Merge Patch keeps every other template field untouched. The container
    # array is copied in full, preserving image, resources, probes, mounts and env.
    # A fresh revision suffix is revision metadata, not another runtime setting.
    require(lower(app.get("id")) == lower(APP_ID), "Patch application differs")
    containers = copy.deepcopy(app["properties"]["template"]["containers"])
    require(len(containers) == 1, "Unexpected target container count")
    matches = [row for row in containers[0].get("env", []) if row.get("name") == KEY]
    source, target = (TO, FROM) if rollback else (FROM, TO)
    require(len(matches) == 1 and matches[0].get("value") == source and not matches[0].get("secretRef"), "Patch setting differs")
    matches[0]["value"] = target
    suffix = revision_suffix(baseline_hash, rollback)
    body = {"location": app["location"], "properties": {"template": {
        "containers": containers, "revisionSuffix": suffix}}}
    with tempfile.TemporaryDirectory(prefix="craves-pdf-binding-") as temp:
        payload = Path(temp) / "patch.json"
        with payload.open("x") as stream:
            os.chmod(payload, 0o600)
            json.dump(body, stream, separators=(",", ":"))
        cli(["rest", "--method", "patch", "--url", APP_URL, "--body", "@" + str(payload),
             "--headers", "Content-Type=application/json"], approved_patch=True)


def unrelated_preserved(before, now):
    if set(before) != set(now):
        return False
    first, current = strict_runtime(before), strict_runtime(now)
    return (all(first[name] == current[name] for name in before if name != APP)
            and before[APP]["properties"]["configuration"]["ingress"].get("traffic")
            == now[APP]["properties"]["configuration"]["ingress"].get("traffic"))


def wait_binding(helper, before_apps, desired_apps, suffix):
    prior, wanted = baseline(helper, before_apps), baseline(helper, desired_apps)
    prior_revision = before_apps[APP]["properties"].get("latestRevisionName")
    own_revision, seen_own = APP + "--" + suffix, False
    for attempt in range(48):
        now = helper.inventory()
        require(unrelated_preserved(before_apps, now), "Unrelated runtime or traffic changed")
        state, props = baseline(helper, now), now[APP]["properties"]
        actual_suffix = props["template"].get("revisionSuffix")
        if actual_suffix == suffix or props.get("latestRevisionName") == own_revision:
            seen_own = True
            require(actual_suffix == suffix and state == wanted, "Own revision has unexpected runtime settings")
            require(props.get("latestRevisionName") in (prior_revision, own_revision), "Another revision superseded this change")
            if props.get("latestRevisionName") == props.get("latestReadyRevisionName") == own_revision:
                try:
                    health, _, _ = helper.request_json(helper.origin(now[APP]) + "/actuator/health/readiness")
                    if health.get("status") == "UP":
                        return now
                except Exception:
                    pass
        else:
            require(not seen_own and state == prior and props.get("latestRevisionName") == prior_revision
                    and strict_runtime(now) == strict_runtime(before_apps), "Unexpected state while waiting for ARM publication")
        if attempt < 47:
            time.sleep(5)
    raise ValueError("Own Notification revision did not become healthy within the bound")


def rollback_owned_change(helper, original, desired, baseline_hash):
    result = {"status": "HELD_FOR_REVIEW", "mutationAttempted": False}
    own_suffix = revision_suffix(baseline_hash)
    try:
        current = helper.inventory()
        props = current[APP]["properties"]
        if (baseline(helper, current) != baseline(helper, desired)
                or props["template"].get("revisionSuffix") != own_suffix
                or props.get("latestRevisionName") not in (original[APP]["properties"].get("latestRevisionName"), APP + "--" + own_suffix)
                or not unrelated_preserved(original, current)):
            result["reason"] = "Exact owned change is not visible or unrelated state changed; no rollback write"
            return result
        fresh = helper.inventory()
        require(strict_runtime(fresh) == strict_runtime(current)
                and fresh[APP]["properties"].get("latestRevisionName") == props.get("latestRevisionName"),
                "Concurrent change before rollback; no rollback write")
        restored = copy.deepcopy(fresh)
        next(row for row in restored[APP]["properties"]["template"]["containers"][0]["env"] if row["name"] == KEY)["value"] = FROM
        require(baseline(helper, restored) == baseline(helper, original), "Rollback would not restore exact original settings")
        result.update(status="ROLLBACK_REQUESTED_NOT_VERIFIED", mutationAttempted=True)
        patch_binding(fresh[APP], baseline_hash, rollback=True)
        final = wait_binding(helper, fresh, restored, revision_suffix(baseline_hash, rollback=True))
        require(baseline(helper, final) == baseline(helper, original), "Rollback runtime differs from original")
        result.update(status="ROLLED_BACK_AND_HEALTHY", readyRevision=final[APP]["properties"]["latestReadyRevisionName"])
    except Exception:
        result["reason"] = "Rollback could not be safely completed or verified; inspect runtime before another write"
    return result


def inspect(helper):
    apps = helper.inventory()
    for app in apps.values():
        p = app["properties"]
        require(p.get("latestRevisionName") == p.get("latestReadyRevisionName"), "Application rollout unsettled; wait before planning")
    for source in SOURCES:
        setting = helper.environment(apps[source]).get("CRAVES_DOCUMENTS_SOURCES_ENABLED", {})
        require(setting.get("value") == "true" and not setting.get("secretRef"), "All three PDF source readers must already be enabled")
    require(apps[APP]["properties"]["configuration"].get("activeRevisionsMode") == "Single", "Notification revision mode differs")
    env = helper.environment(apps[APP])
    require(env.get("CRAVES_DOCUMENTS_BLOB_ENDPOINT", {}).get("value", "").rstrip("/") == ENDPOINT, "PDF account binding differs")
    current = env.get(KEY, {})
    require(not current.get("secretRef") and current.get("value") in (FROM, TO), "Unexpected PDF container binding")
    override = env.get("CRAVES_DOCUMENTS_MANAGED_IDENTITY_CLIENT_ID", {})
    require(not override.get("value") and not override.get("secretRef"), "User-assigned PDF identity requires separate review")
    identity = apps[APP].get("identity", {})
    require("SystemAssigned" in str(identity.get("type", "")).replace(" ", "").split(","), "Existing system identity required")
    require(lower(identity.get("tenantId")) == TENANT, "Notification identity tenant differs")
    principal = lower(identity.get("principalId"))
    require(re.fullmatch(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", principal), "Invalid Notification principal")
    account = cli(["storage", "account", "show", "-g", RG, "-n", ACCOUNT])
    require(lower(account.get("id")) == lower(ACCOUNT_ID), "Storage resource differs")
    require(account.get("primaryEndpoints", {}).get("blob", "").rstrip("/") == ENDPOINT, "Storage endpoint differs")
    require(account.get("allowBlobPublicAccess") is False, "Account public access must already be disabled")
    container = cli(["rest", "--method", "get", "--url", "https://management.azure.com" + SCOPE + "?api-version=2023-01-01"])
    require(lower(container.get("id")) == lower(SCOPE), "Existing target container differs")
    require(container.get("properties", {}).get("publicAccess") in (None, "None") and not container.get("properties", {}).get("deleted"),
            "Existing target must be private and active")
    roles = cli(["role", "assignment", "list", "--all", "--fill-principal-name", "false", "--fill-role-definition-name", "false"])
    grants = [row for row in roles if lower(row.get("principalId")) == principal and lower(row.get("scope")) == lower(SCOPE)
              and lower(row.get("roleDefinitionId")).rsplit("/", 1)[-1] == ROLE and not row.get("condition")
              and not row.get("delegatedManagedIdentityResourceId")]
    require(grants, "Exact existing Notification container grant is missing; no access will be created")
    resources = {"principalId": principal, "scope": SCOPE, "role": "Storage Blob Data Contributor",
                 "existingAssignmentIds": sorted(row["id"] for row in grants), "privateContainer": True,
                 "accountSha256": digest(account), "containerSha256": digest(container)}
    return apps, current["value"], resources


def verify_saved_blobs(helper, app):
    rows = helper.database(app, """SELECT coalesce(json_agg(row_to_json(t)),'[]'::json) FROM
      (SELECT document_type,blob_key,pdf_hash,byte_count FROM notification_schema.pdf_document
       WHERE status='READY' ORDER BY id LIMIT 21)t;""")
    require(isinstance(rows, list) and len(rows) <= 20, "Saved PDF verification exceeds bounded read plan")
    evidence, denied = [], None
    with tempfile.TemporaryDirectory(prefix="craves-pdf-read-") as temp:
        for index, row in enumerate(rows):
            require(re.fullmatch(r"[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f]{64}\.pdf", row["blob_key"])
                    and re.fullmatch(r"[0-9a-f]{64}", row["pdf_hash"]) and row["blob_key"].endswith(row["pdf_hash"] + ".pdf")
                    and 5 <= row["byte_count"] <= 4_194_304, "Invalid saved artifact metadata")
            item = {"type": row["document_type"], "expectedByteLength": row["byte_count"], "expectedSha256": row["pdf_hash"]}
            if denied:
                item.update(verificationUnavailable=True, azureErrorCode=denied)
                evidence.append(item)
                continue
            output = Path(temp) / (str(index) + ".pdf")
            response = cli(["storage", "blob", "download", "--auth-mode", "login", "--account-name", ACCOUNT,
                            "--container-name", TO, "--name", row["blob_key"], "--file", str(output), "--no-progress"], data_read=True)
            if response.get("error"):
                code = response["error"]
                item.update(verificationUnavailable=True, azureErrorCode=code)
                if code in {"AuthorizationPermissionMismatch", "AuthorizationFailure", "AuthenticationFailed", "InvalidAuthenticationInfo"}:
                    denied = code  # No retry or alternate authentication after denial.
                if code == "BlobNotFound":
                    item["blobMissingConfirmed"] = True
            else:
                data = output.read_bytes()
                item.update(verificationUnavailable=False, byteLengthMatches=len(data) == row["byte_count"],
                            sha256Matches=hashlib.sha256(data).hexdigest() == row["pdf_hash"])
            evidence.append(item)
    return evidence


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parent / "craves-pdf-fix")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--expected-baseline-sha256")
    parser.add_argument("--output", type=Path, help="Write the sanitized final JSON report; runtimeBaselineSha256 is the apply guard")
    args = parser.parse_args()
    require(not args.apply or re.fullmatch(r"[0-9a-f]{64}", args.expected_baseline_sha256 or ""), "Apply requires exact reviewed baseline SHA-256")
    helper = load_helpers(args.repo)
    apps, current, resources = inspect(helper)
    before = baseline(helper, apps)
    report = {"mode": "APPLY" if args.apply else "READ_ONLY_PLAN", "apps": before, "runtimeBaselineSha256": digest(before),
              "proposedChange": {"app": APP, "setting": KEY, "from": current, "to": TO},
              "resourceEvidence": resources, "mutationAttempted": False}
    if args.apply:
        require(args.expected_baseline_sha256 == digest(before), "Runtime differs from reviewed baseline; no write made")
    report["savedPdfVerification"] = verify_saved_blobs(helper, apps[APP])
    print(json.dumps({"event": "SAVED_PDF_READ_INSPECTION", "evidence": report["savedPdfVerification"]}), flush=True)
    require(not any(row.get("blobMissingConfirmed") or row.get("byteLengthMatches") is False or row.get("sha256Matches") is False
                    for row in report["savedPdfVerification"]), "Target blob missing or integrity mismatch; binding unchanged")
    again, again_value, again_resources = inspect(helper)
    require(strict_runtime(again) == strict_runtime(apps) and again_value == current and again_resources == resources,
            "Apps or storage changed during inspection; no write made")
    if not args.apply or current == TO:
        report.update(appsAndStoragePreserved=True, result="ALREADY_CORRECT" if current == TO else "READY_FOR_BINDING_CORRECTION")
        emit_report(report, args.output)
        return
    desired = copy.deepcopy(apps)
    next(row for row in desired[APP]["properties"]["template"]["containers"][0]["env"] if row["name"] == KEY)["value"] = TO
    expected_after = baseline(helper, desired)
    report["mutationAttempted"] = True
    print(json.dumps({"event": "APPLY_ONE_PDF_BINDING", "change": report["proposedChange"]}), flush=True)
    try:
        patch_binding(apps[APP], digest(before))
        wait_binding(helper, apps, desired, revision_suffix(digest(before)))
        after, value, after_resources = inspect(helper)
        require(baseline(helper, after) == expected_after and value == TO and resources == after_resources
                and unrelated_preserved(apps, after), "Final runtime/storage preservation check failed")
        require(after[APP]["properties"]["latestReadyRevisionName"] == APP + "--" + revision_suffix(digest(before)),
                "Final ready revision is not this script's revision")
    except Exception as exc:
        report["result"] = "BINDING_APPLY_FAILED"
        report["error"] = str(exc) if isinstance(exc, ValueError) and not isinstance(exc, json.JSONDecodeError) else "Runtime operation or verification unavailable"
        report["rollback"] = rollback_owned_change(helper, apps, desired, digest(before))
        report["appsAndStoragePreserved"] = False
        report["originalApplicationSettingsRestored"] = report["rollback"]["status"] == "ROLLED_BACK_AND_HEALTHY"
        emit_report(report, args.output)
        raise SystemExit(1) from None
    report.update(appsAndStoragePreserved=True, notificationOnlyExpectedBindingChanged=True,
                  readyRevision=after[APP]["properties"]["latestReadyRevisionName"], result="BINDING_CORRECTED_AND_HEALTHY",
                  finalApps=baseline(helper, after), rollback={"status": "NOT_REQUIRED", "mutationAttempted": False})
    emit_report(report, args.output)


def emit_report(report, output):
    rendered = json.dumps(report, indent=2) + "\n"
    if output:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(rendered)
    print(rendered, end="")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError) as exc:
        reason = str(exc) if isinstance(exc, ValueError) and not isinstance(exc, json.JSONDecodeError) else "Inspection unavailable or unexpected response shape"
        print(json.dumps({"result": "STOPPED", "reason": reason}), file=sys.stderr)
        raise SystemExit(1) from None
