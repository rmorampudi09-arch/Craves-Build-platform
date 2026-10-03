"""Exact-main, web-only pilot-gate deployment with configuration preservation.

This deliberately reuses the established immutable-image and full regression
guards. It never deploys a backend, changes scale, writes business data, or arms
the waiting page. Only three new launch settings and the reviewed web image/SHA
are permitted. Recovery removes those additions and restores the exact image.
"""
import argparse
import copy
import datetime
import importlib.util
import json
from pathlib import Path
import re
import time

TOOLS = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("pilot_existing_web_release", TOOLS / "active_address_release.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
require = release.require
LAUNCH_URL = "https://stcravesprodlowkmqgfy.blob.core.windows.net/web-pilot-launch/state.json"
SETTING_NAMES = ("CRAVES_WEB_LAUNCH_BLOB_URL", "CRAVES_WEB_LAUNCH_KEY_SHA256", "CRAVES_WEB_LAUNCH_KEY_EXPIRES_AT")


def launch_settings(key_hash, expiry):
    require(bool(re.fullmatch("[0-9a-f]{64}", key_hash)), "An exact launch-key hash is required; never pass the private key")
    require(bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z", expiry)), "Exact UTC key expiry required")
    expires = datetime.datetime.fromisoformat(expiry.replace("Z", "+00:00"))
    require(expires > datetime.datetime.now(datetime.timezone.utc), "Launch key already expired")
    return dict(zip(SETTING_NAMES, (LAUNCH_URL, key_hash, expiry)))


def guard(before, current, settings, image, sha):
    require(release.build_sha(current) == sha, "Concurrent web source change; stop")
    containers = current["properties"]["template"]["containers"]
    require(len(containers) == 1 and containers[0]["image"] == image, "Concurrent web image change; stop")
    previous_env = release.environment(before)
    require(not set(SETTING_NAMES).intersection(previous_env), "Existing launch settings must not be overwritten")
    expected = copy.deepcopy(previous_env)
    expected["CRAVES_BUILD_SHA"] = {"name": "CRAVES_BUILD_SHA", "value": sha}
    expected.update({name: {"name": name, "value": value} for name, value in settings.items()})
    actual = release.environment(current)
    # Normalize only unused Azure null fields, exactly as the existing guard does.
    def canonical(environment):
        result = {}
        for name, entry in environment.items():
            entry = dict(entry)
            if entry.get("secretRef"):
                require(entry.get("value") in (None, ""), "Ambiguous secret binding")
                entry.pop("value", None)
            elif entry.get("secretRef") in (None, ""):
                entry.pop("secretRef", None)
            result[name] = entry
        return result
    require(canonical(actual) == canonical(expected), "Unrelated web environment change; stop")
    normalized = copy.deepcopy(current)
    normalized["properties"]["template"]["containers"][0]["env"] = list(previous_env.values())
    require(release.runtime.stable(before) == release.runtime.stable(normalized), "Unrelated web runtime change; stop")


def other_apps():
    return {app["name"]: release.runtime.stable(app) for app in release.azure("containerapp", "list", "-g", release.RG)
            if app["name"] != release.WEB}


def assert_blob_open(output):
    path = output.parent / "launch-state-private.json"
    release.run("az", "storage", "blob", "download", "--account-name", "stcravesprodlowkmqgfy",
                "--container-name", "web-pilot-launch", "--name", "state.json", "--file", str(path),
                "--auth-mode", "key", "--overwrite", "--no-progress", "--only-show-errors", "-o", "none")
    state = json.loads(path.read_text())
    require(state.get("schema") == 1 and state.get("phase") == "open", "Deployment must start with website access open")
    path.unlink()


def public_launch_status(sha):
    result = release.public_status(sha)
    status, body = release.inspect.probe("https://craves.in/api/web-launch/status")
    require(status == 200 and json.loads(body) == {"open": True}, "Durable launch-state access failed")
    for method in ("GET", "POST"):
        with release.evidence.request("https://craves.in/api/web-launch/control", method) as response:
            require(response.code == 404 and "no-store" in response.headers.get("Cache-Control", ""), "Private control denial failed")
    status, body = release.inspect.probe("https://craves.in/pilot-launch")
    require(status == 200 and b'id="launch" type="button" hidden' in body, "Private control page unavailable")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--regression-run", required=True)
    parser.add_argument("--expected-live-sha", required=True)
    parser.add_argument("--key-sha256", required=True)
    parser.add_argument("--key-expires-at", required=True)
    parser.add_argument("--receipt", required=True, type=Path)
    parser.add_argument("--confirm-web-only", action="store_true")
    args = parser.parse_args()
    require(args.confirm_web_only, "Explicit web-only operation required")
    settings = launch_settings(args.key_sha256, args.key_expires_at)
    account = release.azure("account", "show")
    require(account["id"] == release.SUBSCRIPTION, "Wrong Azure subscription")
    release.source_guard(args.source, args.sha, args.regression_run)
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    assert_blob_open(args.receipt)
    before = release.app(release.WEB)
    release.ready_web(before)
    previous_sha = release.build_sha(before)
    require(previous_sha == args.expected_live_sha, "Live web changed since inspection; stop")
    require(not set(SETTING_NAMES).intersection(release.environment(before)), "Launch gate already configured; inspect instead of overwriting")
    protected = other_apps()
    old_image = release.resolve_image(before["properties"]["template"]["containers"][0]["image"])
    environment = release.environment(before)
    public = {}
    for name in release.FIREBASE:
        entry = environment.get(name, {})
        require(bool(entry.get("value")) and not entry.get("secretRef"), "Existing public Firebase build setting unavailable: " + name)
        public[name] = entry["value"]
    for name in ("NEXT_PUBLIC_RAZORPAY_MODE", "NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK", "NEXT_PUBLIC_SYNCFUSION_LICENSE_KEY"):
        entry = environment.get(name, {})
        if entry.get("value"):
            require(not entry.get("secretRef"), "Unexpected public build secret binding")
            public[name] = entry["value"]
    release.run("az", "acr", "login", "-n", release.ACR, "--only-show-errors")
    image = release.build_image(args.source, "apps/customer-web-next", "craves/customer-web-next", args.sha, public)
    release.source_guard(args.source, args.sha, args.regression_run)
    release.web_guard(before, release.app(release.WEB))
    require(protected == other_apps(), "Another app changed during preparation; stop")
    receipt = {"sourceSha": args.sha, "image": image, "previousImage": old_image, "previousSourceSha": previous_sha,
               "previousRuntimeFingerprint": release.runtime.stable(before), "launchSettings": settings,
               "protectedApps": protected, "websiteInitiallyOpen": True, "verified": False}
    args.receipt.write_text(json.dumps(receipt, indent=2) + "\n")
    release.azure("containerapp", "update", "-g", release.RG, "-n", release.WEB, "--image", image,
                  "--set-env-vars", "CRAVES_BUILD_SHA=" + args.sha, *[name + "=" + value for name, value in settings.items()], "--no-wait")
    try:
        for attempt in range(120):
            current = release.app(release.WEB)
            if release.build_sha(current) == previous_sha:
                release.web_guard(before, current)
                time.sleep(10)
                continue
            guard(before, current, settings, image, args.sha)
            try:
                release.ready_web(current)
                public_result = public_launch_status(args.sha)
                require(protected == other_apps(), "A protected app changed; investigate")
                receipt.update(verified=True, public=public_result, revision=current["properties"]["latestReadyRevisionName"])
                args.receipt.write_text(json.dumps(receipt, indent=2) + "\n")
                print(json.dumps(receipt), flush=True)
                return
            except ValueError as error:
                print("Waiting for reviewed web rollout: " + str(error), flush=True)
                time.sleep(10)
        raise ValueError("Web launch deployment could not be verified")
    except Exception:
        current = release.app(release.WEB)
        guard(before, current, settings, image, args.sha)
        print("Restoring only the captured web image/SHA and removing the three launch additions.", flush=True)
        release.azure("containerapp", "update", "-g", release.RG, "-n", release.WEB, "--image", old_image,
                      "--set-env-vars", "CRAVES_BUILD_SHA=" + previous_sha, "--remove-env-vars", *SETTING_NAMES, "--no-wait")
        for _ in range(120):
            current = release.app(release.WEB)
            if release.build_sha(current) == args.sha:
                guard(before, current, settings, image, args.sha)
                time.sleep(10)
                continue
            release.web_guard(before, current, old_image, previous_sha)
            try:
                release.ready_web(current)
                release.public_status(previous_sha)
            except ValueError:
                time.sleep(10)
                continue
            raise RuntimeError("Release failed; exact previous web runtime restored and verified")
        raise RuntimeError("Release failed; recovery requested but not verified")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        raise SystemExit("Web pilot release stopped: " + (str(error) if isinstance(error, (ValueError, RuntimeError)) else type(error).__name__))
