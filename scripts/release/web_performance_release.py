"""Existing customer-web performance release; inspection is the default.

Only the web image and CRAVES_BUILD_SHA may change. The exact web tree must have
saved successful lint/type/test/build evidence. A clean Git archive goes to the
existing ACR; no Docker installation, infrastructure, backend or database change.
Runtime values and short-lived registry credentials never enter the receipt.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import shutil
import tarfile
import tempfile
import time
import urllib.parse
import urllib.request
import urllib.error
import uuid


TOOLS = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("performance_existing_release", TOOLS / "active_address_release.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
require = release.require
APP_PATH = "apps/customer-web-next"
REPO = "craves/customer-web-next"
SHA = re.compile(r"[0-9a-f]{40}")
DIGEST = re.compile(r"sha256:[0-9a-f]{64}")
CHECKS = {"lint", "typecheck", "test", "build"}
ALLOWED = (APP_PATH + "/", "docs/performance/")
EXACT_FILES = {
    "scripts/release/web_performance_release.py",
    "scripts/release/tests/test_web_performance_release.py",
}
ORIGINAL_RUN = release.run


def portable_command(args):
    command = list(args)
    executable = shutil.which(command[0])
    require(bool(executable), "Required command is unavailable: " + command[0])
    if command[0] == "az" and executable.lower().endswith(".cmd"):
        # Windows CreateProcess does not find az.cmd as `az`. Invoke the CLI's
        # own bundled Python directly; no shell command string or interpolation.
        python = Path(executable).parent.parent / "python.exe"
        require(python.is_file(), "The installed Azure CLI Python runtime is unavailable")
        return [str(python), "-IBm", "azure.cli", *command[1:]]
    command[0] = executable
    return command


def portable_run(*args, cwd=None, env=None):
    return ORIGINAL_RUN(*portable_command(args), cwd=cwd, env=env)


# Existing guards resolve images/read live state through this same adapter.
release.run = portable_run


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def git(source, *args):
    return release.run("git", *args, cwd=source)


def local_evidence(source, path, expected_hash, web_tree):
    raw = path.read_bytes()
    require(re.fullmatch(r"[0-9a-f]{64}", expected_hash or "") and sha256(raw) == expected_hash,
            "Local evidence file differs from the reviewed hash")
    value = json.loads(raw)
    require(value.get("schema") == 1 and value.get("webTree") == web_tree,
            "Local checks did not run against this exact web tree")
    rows = value.get("checks", [])
    require(isinstance(rows, list) and len(rows) == len(CHECKS)
            and {row.get("name") for row in rows} == CHECKS,
            "All four distinct web checks are required")
    for row in rows:
        require(type(row.get("exitCode")) is int and row["exitCode"] == 0, "A required web check failed")
        log_name = row.get("logFile")
        require(isinstance(log_name, str) and log_name and not Path(log_name).is_absolute(),
                "Check logs must be relative to the evidence directory")
        log = (path.parent / log_name).resolve()
        require(log.is_relative_to(path.parent.resolve()), "Check log escaped the evidence directory")
        require(log.is_file() and re.fullmatch(r"[0-9a-f]{64}", row.get("logSha256", ""))
                and sha256(log.read_bytes()) == row["logSha256"], "Check log differs from its recorded hash")
    return {"webTree": web_tree, "evidenceSha256": expected_hash, "checks": sorted(CHECKS)}


def source_guard(args):
    require(SHA.fullmatch(args.sha or "") and SHA.fullmatch(args.expected_main_sha or "")
            and SHA.fullmatch(args.expected_live_sha or ""), "Exact source, main and live SHAs are required")
    require(git(args.source, "rev-parse", "HEAD") == args.sha, "Release checkout differs from the reviewed SHA")
    require(not git(args.source, "status", "--porcelain", "--untracked-files=no"), "Tracked release source changed")
    require(git(args.source, "rev-parse", "origin/main") == args.expected_main_sha,
            "Fetch and review the exact current origin/main before release")
    remote = git(args.source, "ls-remote", "https://github.com/" + release.evidence.REPO + ".git", "refs/heads/main")
    require(remote.split() == [args.expected_main_sha, "refs/heads/main"], "GitHub main changed since review")
    git(args.source, "merge-base", "--is-ancestor", args.expected_main_sha, args.sha)
    main_tree = git(args.source, "rev-parse", args.expected_main_sha + ":" + APP_PATH)
    live_tree = git(args.source, "rev-parse", args.expected_live_sha + ":" + APP_PATH)
    require(main_tree == live_tree, "Main contains unreconciled web changes since the live release")
    changes = git(args.source, "diff", "--name-only", args.expected_main_sha, args.sha).splitlines()
    require(all(name in EXACT_FILES or name.startswith(ALLOWED) for name in changes),
            "Candidate changes files outside the web performance scope")
    tree = git(args.source, "rev-parse", args.sha + ":" + APP_PATH)
    require(tree != live_tree, "Candidate contains no web performance changes")
    return local_evidence(args.source, args.evidence, args.evidence_sha256, tree)


def image_reference(image):
    prefix = release.LOGIN + "/" + REPO + "@"
    require(isinstance(image, str) and image.startswith(prefix) and DIGEST.fullmatch(image[len(prefix):]),
            "Web image must be an immutable digest in the existing web repository")
    return image[len(prefix):]


def read_bytes(request, limit, allow_blob_redirect=False):
    # Registry configuration includes runtime values. Return it only in memory;
    # errors are reported by category, never response bodies or token-bearing URLs.
    opener = urllib.request.build_opener(release.evidence.NoRedirect())
    try:
        response = opener.open(request, timeout=30)
    except urllib.error.HTTPError as error:
        try:
            require(allow_blob_redirect and error.code == 307, "Registry metadata request failed")
            target = error.headers.get("Location", "")
            parsed = urllib.parse.urlsplit(target)
            require(parsed.scheme == "https" and not parsed.username and not parsed.password
                    and parsed.port in (None, 443) and not parsed.fragment
                    and (bool(re.fullmatch(r"[a-z0-9]+\.blob\.core\.windows\.net", parsed.hostname or ""))
                         or bool(re.fullmatch(re.escape(release.ACR) + r"\.[a-z0-9-]+\.data\.azurecr\.io", parsed.hostname or ""))),
                    "Registry blob redirect has an unexpected destination")
        finally:
            error.close()
        # The authenticated registry provides a short-lived signed blob URL.
        # Never forward the scoped registry Authorization header to storage,
        # and never persist or report that signed URL. Reject further redirects.
        response = opener.open(urllib.request.Request(target), timeout=30)
    with response:
        data = response.read(limit + 1)
        require(len(data) <= limit, "Registry metadata exceeds its bound")
        return data


def verify_registry_image(image, source_sha):
    digest = image_reference(image)
    auth = release.azure("acr", "login", "-n", release.ACR, "--expose-token")
    require(auth.get("loginServer") == release.LOGIN and bool(auth.get("accessToken")), "Registry authentication unavailable")
    form = urllib.parse.urlencode({"grant_type": "refresh_token", "service": release.LOGIN,
                                  "scope": "repository:" + REPO + ":pull", "refresh_token": auth["accessToken"]}).encode()
    token_request = urllib.request.Request("https://" + release.LOGIN + "/oauth2/token", data=form,
                                          headers={"Content-Type": "application/x-www-form-urlencoded"})
    token = json.loads(read_bytes(token_request, 64 * 1024)).get("access_token")
    require(isinstance(token, str) and bool(token), "Scoped registry pull authentication unavailable")
    headers = {"Authorization": "Bearer " + token,
               "Accept": "application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json"}
    base = "https://" + release.LOGIN + "/v2/" + REPO
    manifest_bytes = read_bytes(urllib.request.Request(base + "/manifests/" + digest, headers=headers), 128 * 1024)
    require("sha256:" + sha256(manifest_bytes) == digest, "Registry manifest bytes differ from the selected digest")
    manifest = json.loads(manifest_bytes)
    config = manifest.get("config", {})
    require(manifest.get("schemaVersion") == 2 and DIGEST.fullmatch(config.get("digest", "")),
            "Expected a single reviewed Linux image manifest")
    config_bytes = read_bytes(urllib.request.Request(base + "/blobs/" + config["digest"], headers=headers), 128 * 1024, True)
    require("sha256:" + sha256(config_bytes) == config["digest"] and len(config_bytes) == config.get("size"),
            "Registry image configuration digest or length differs")
    value = json.loads(config_bytes)
    require(value.get("os") == "linux" and value.get("architecture") == "amd64", "Unexpected web image platform")
    require(value.get("config", {}).get("Labels", {}).get("org.opencontainers.image.revision") == source_sha,
            "Image revision label differs from the reviewed source")
    return {"image": image, "configDigest": config["digest"], "sourceSha": source_sha, "platform": "linux/amd64"}


def public_build_values(before):
    environment = release.environment(before)
    result = {}
    for name in release.FIREBASE:
        entry = environment.get(name, {})
        require(bool(entry.get("value")) and not entry.get("secretRef") and not entry["value"].startswith("$("),
                "Existing public Firebase build setting unavailable: " + name)
        result[name] = entry["value"]
    for name in ("NEXT_PUBLIC_RAZORPAY_MODE", "NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK", "NEXT_PUBLIC_SYNCFUSION_LICENSE_KEY"):
        entry = environment.get(name, {})
        require(not entry.get("secretRef"), "Unexpected public build secret binding: " + name)
        if entry.get("value"):
            result[name] = entry["value"]
    require(result.get("NEXT_PUBLIC_RAZORPAY_MODE") == "production", "Existing payment mode must remain production")
    require(result.get("NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK") in ("true", "false"),
            "Existing catalog fallback build setting must be known and preserved")
    return result


def build_image(args, before):
    if args.candidate_image:
        verify_registry_image(args.candidate_image, args.sha)
        return args.candidate_image
    tag = "perf-" + args.sha + "-" + uuid.uuid4().hex[:12]
    with tempfile.TemporaryDirectory(prefix="craves-web-reviewed-") as directory:
        context = Path(directory)
        archive = context / "reviewed.tar"
        git(args.source, "archive", "--format=tar", "--output=" + str(archive), args.sha, APP_PATH)
        with tarfile.open(archive) as stream:
            stream.extractall(context, filter="data")
        archive.unlink()
        command = ["acr", "build", "-r", release.ACR, "-t", REPO + ":" + tag,
                   "--platform", "linux/amd64", "--build-arg", "CRAVES_SOURCE_SHA=" + args.sha, "--no-logs"]
        for name, value in public_build_values(before).items():
            command.extend(["--build-arg", name + "=" + value])
        command.append(str(context / APP_PATH))
        print("Building the reviewed web archive in the existing registry.", flush=True)
        release.run("az", *command, "--only-show-errors", "-o", "none")
    image = release.resolve_image(release.LOGIN + "/" + REPO + ":" + tag)
    verify_registry_image(image, args.sha)
    return image


def protected_apps():
    return {app["name"]: release.runtime.stable(app)
            for app in release.azure("containerapp", "list", "-g", release.RG) if app["name"] != release.WEB}


def save_receipt(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def recover(before, image, sha, receipt, output):
    current = release.app(release.WEB)
    # A concurrent image, source, secret, payment, scaling or identity change
    # blocks recovery. Never replace somebody else's newer deployment.
    previous_image = receipt["previousImage"]
    previous_sha = receipt["previousSourceSha"]
    if release.build_sha(current) == previous_sha:
        release.web_guard(before, current, previous_image, previous_sha)
        release.ready_web(current)
        release.public_status(previous_sha)
        receipt.update(recoveryRequired=False, recoveryVerified=True)
        save_receipt(output, receipt)
        return
    release.web_guard(before, current, image, sha)
    receipt["recoveryRequired"] = True
    release.azure("containerapp", "update", "-g", release.RG, "-n", release.WEB,
                  "--image", previous_image, "--set-env-vars", "CRAVES_BUILD_SHA=" + previous_sha, "--no-wait")
    for _ in range(120):
        current = release.app(release.WEB)
        if release.build_sha(current) == sha:
            release.web_guard(before, current, image, sha)
        else:
            release.web_guard(before, current, previous_image, previous_sha)
            try:
                release.ready_web(current)
                release.public_status(previous_sha)
                receipt["recoveryVerified"] = True
                save_receipt(output, receipt)
                return
            except ValueError:
                pass
        time.sleep(10)
    raise ValueError("Recovery was requested but could not be verified")


def execute(args):
    args.source = args.source.resolve()
    proof = source_guard(args)
    image_reference(args.expected_live_image)
    account = release.azure("account", "show")
    require(account.get("id") == release.SUBSCRIPTION and account.get("tenantId") == release.inspect.TENANT,
            "Wrong Azure account")
    before = release.app(release.WEB)
    release.ready_web(before)
    require(release.build_sha(before) == args.expected_live_sha
            and before["properties"]["template"]["containers"][0]["image"] == args.expected_live_image,
            "Live web changed since inspection")
    old_image = release.resolve_image(args.expected_live_image)
    require(old_image == args.expected_live_image, "Previous web image digest changed")
    protected = protected_apps()
    receipt = {"operation": "deploy" if args.deploy else "inspect", "sourceSha": args.sha,
               "mainSha": args.expected_main_sha, "localEvidence": proof,
               "previousImage": old_image, "previousSourceSha": args.expected_live_sha,
               "runtimeFingerprint": release.stable_web(before), "protectedApps": protected,
               "verified": False, "recoveryVerified": False}
    if not args.deploy:
        save_receipt(args.receipt, receipt)
        print(json.dumps(receipt), flush=True)
        return receipt
    verify_registry_image(old_image, args.expected_live_sha)
    image = build_image(args, before)
    source_guard(args)
    release.web_guard(before, release.app(release.WEB))
    release.ready_web(release.app(release.WEB))
    require(protected == protected_apps(), "Another app changed during preparation; stop")
    receipt["image"] = image
    save_receipt(args.receipt, receipt)
    print("Selecting only the reviewed web image and its source SHA.", flush=True)
    try:
        release.azure("containerapp", "update", "-g", release.RG, "-n", release.WEB,
                      "--image", image, "--set-env-vars", "CRAVES_BUILD_SHA=" + args.sha, "--no-wait")
        for _ in range(120):
            current = release.app(release.WEB)
            if release.build_sha(current) == args.expected_live_sha:
                release.web_guard(before, current)
            else:
                release.web_guard(before, current, image, args.sha)
                try:
                    revision = release.ready_web(current)
                    public = release.public_status(args.sha)
                    require(protected == protected_apps(), "A protected app changed during release")
                    receipt.update(verified=True, revision=revision, public=public)
                    save_receipt(args.receipt, receipt)
                    print(json.dumps(receipt), flush=True)
                    return receipt
                except ValueError:
                    pass
            print("Waiting for the reviewed web revision and public source readback.", flush=True)
            time.sleep(10)
        raise ValueError("Web performance release could not be verified within twenty minutes")
    except Exception:
        recover(before, image, args.sha, receipt, args.receipt)
        raise ValueError("Release failed; previous web image and source were restored and verified")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--expected-main-sha", required=True)
    parser.add_argument("--expected-live-sha", required=True)
    parser.add_argument("--expected-live-image", required=True)
    parser.add_argument("--evidence", required=True, type=Path)
    parser.add_argument("--evidence-sha256", required=True)
    parser.add_argument("--receipt", required=True, type=Path)
    parser.add_argument("--candidate-image", help="Reuse a previously built immutable image after independent verification")
    parser.add_argument("--deploy", action="store_true", help="Explicitly update only the existing customer web")
    try:
        execute(parser.parse_args())
    except Exception as error:
        raise SystemExit("Web performance release stopped: " + (str(error) if isinstance(error, ValueError) else type(error).__name__))


if __name__ == "__main__":
    main()
