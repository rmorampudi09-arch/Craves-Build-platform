"""Focused, exact-source User/Chef -> APIM -> web release in rmorampudi09.

Default inspection is read only. Deployment requires an explicit operation and
confirmation, exact merged-main regression evidence, and unchanged live settings.
No infrastructure creation, credential rotation, payment flags or scale changes.
"""
import argparse
import copy
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import time

TOOLS = Path(__file__).resolve().parent
SUBSCRIPTION = "721906c9-4a72-4606-830b-d3e7ace093ff"
RG = "rg-craves-prodlow-centralindia"
ACR = "cravesrm09prodlow6bf632"
LOGIN = ACR + ".azurecr.io"
CHEF = "ca-craves-user-chef-service-prod"
WEB = "ca-craves-web-prodlow"
APIM = "apim-craves-prodlow-kmqgfy"
FIREBASE = ["NEXT_PUBLIC_FIREBASE_" + suffix for suffix in (
    "API_KEY", "AUTH_DOMAIN", "PROJECT_ID", "APP_ID", "MESSAGING_SENDER_ID", "STORAGE_BUCKET")]


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, TOOLS / filename)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


inspect = module("active_preflight", "rmorampudi09_preflight.py")
evidence = module("web_evidence", "verify-web-release-evidence.py")
runtime = module("web_runtime", "verify-customer-web-runtime.py")
require = inspect.require


def run(*args, cwd=None, env=None):
    # Capture CLI failures: Azure responses can contain runtime values. Never echo them.
    result = subprocess.run(args, cwd=cwd, env=env, text=True, capture_output=True, timeout=2400)
    if result.returncode and env and env.get("DEPLOY_PREFLIGHT_ONLY") == "true":
        # The guard prints fixed diagnostics containing reference names, never values.
        for line in result.stderr.splitlines():
            if re.fullmatch(r"ERROR: Active (?:secret reference|Key Vault secret) '[A-Za-z0-9_-]+' (?:is not Key Vault-backed\. Deployment refused\.|has no supported managed-identity reference\.)", line):
                raise ValueError(line)
    require(result.returncode == 0, "Command failed (details suppressed): " + " ".join(args[:2]))
    return result.stdout.strip()


def azure(*args):
    text = run("az", *args, "--only-show-errors", "-o", "json")
    return json.loads(text) if text else None


def app(name):
    return azure("containerapp", "show", "-g", RG, "-n", name)


def environment(value):
    containers = value["properties"]["template"]["containers"]
    require(len(containers) == 1, "Unexpected container count")
    entries = containers[0].get("env", [])
    result = {entry["name"]: entry for entry in entries}
    require(len(result) == len(entries), "Duplicate environment variable")
    return result


def build_sha(value):
    item = environment(value).get("CRAVES_BUILD_SHA", {})
    require(not item.get("secretRef") and re.fullmatch("[0-9a-f]{40}", item.get("value", "")),
            "Existing web release SHA must be known for guarded recovery")
    return item["value"]


def stable_web(value):
    normalized = copy.deepcopy(value)
    entries = normalized["properties"]["template"]["containers"][0].get("env", [])
    normalized["properties"]["template"]["containers"][0]["env"] = [
        entry for entry in entries if entry["name"] != "CRAVES_BUILD_SHA"]
    return runtime.stable(normalized)


def web_guard(before, current, image=None, sha=None):
    require(stable_web(before) == stable_web(current), "Unrelated web runtime setting changed; stop")
    require(build_sha(current) == (sha or build_sha(before)), "Concurrent web source update; stop")
    desired = current["properties"]["template"]["containers"][0]["image"]
    require(desired == (image or before["properties"]["template"]["containers"][0]["image"]),
            "Concurrent web image update; stop")


def ready_web(value):
    revision = value["properties"]["latestReadyRevisionName"]
    return runtime.ready(value,
        azure("containerapp", "revision", "list", "-g", RG, "-n", WEB),
        azure("containerapp", "replica", "list", "-g", RG, "-n", WEB, "--revision", revision))


def source_guard(source, sha, run_id):
    require(bool(re.fullmatch("[0-9a-f]{40}", sha)), "Exact release SHA required")
    require(run("git", "rev-parse", "HEAD", cwd=source) == sha, "Release checkout differs from reviewed SHA")
    require(not run("git", "status", "--porcelain", "--untracked-files=no", cwd=source), "Tracked release source changed")
    return evidence.evidence(sha, run_id)


def database_report(source, output):
    inspect.ROOT = source
    report = inspect.capture()
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def require_database(report, applied=False):
    require(report.get("database", {}).get("compatible") is True, "Database migration/backup inspection failed")
    require(report["account"]["subscriptionId"] == SUBSCRIPTION, "Unexpected Azure subscription")
    if applied:
        require(report["database"]["v13"] == "APPLIED_MATCHING", "Deploy and verify User/Chef V13 first")


def resolve_image(image):
    require(image.startswith(LOGIN + "/craves/"), "Unexpected live image registry")
    ref = image[len(LOGIN) + 1:]
    digest = azure("acr", "repository", "show", "-n", ACR, "--image", ref)["digest"]
    require(re.fullmatch("sha256:[0-9a-f]{64}", digest), "Immutable image digest unavailable")
    return LOGIN + "/" + re.split("[:@]", ref)[0] + "@" + digest


def verify_image(image, sha):
    run("docker", "pull", image)
    label = run("docker", "image", "inspect", image, "--format", '{{ index .Config.Labels "org.opencontainers.image.revision" }}')
    require(label == sha, "Running image is not the reviewed release source")


def build_image(source, path, repo, sha, public=None):
    image = LOGIN + "/" + repo + ":" + sha
    # Never silently replace a source tag. A previous verified build can be resumed.
    existing = subprocess.run(["az", "acr", "repository", "show", "-n", ACR, "--image", repo + ":" + sha,
                               "-o", "json", "--only-show-errors"], text=True, capture_output=True, timeout=120)
    if existing.returncode == 0:
        pinned = resolve_image(image)
        verify_image(pinned, sha)
        return pinned
    command = ["docker", "build", "--pull", "--label", "org.opencontainers.image.revision=" + sha, "-t", image]
    for key, value in (public or {}).items():
        command.extend(["--build-arg", key + "=" + value])
    command.append(str(source / path))
    print("Building reviewed image for " + repo, flush=True)
    run(*command)
    config = run("docker", "image", "inspect", image, "--format", "{{.Id}}")
    run("docker", "push", image)
    pinned = resolve_image(image)
    verify_image(pinned, sha)
    require(run("docker", "image", "inspect", pinned, "--format", "{{.Id}}") == config, "Registry image changed after build")
    return pinned


def chef_image_guard(sha):
    value = app(CHEF)
    props = value["properties"]
    require(props["latestRevisionName"] == props["latestReadyRevisionName"], "User/Chef rollout is not ready")
    verify_image(resolve_image(props["template"]["containers"][0]["image"]), sha)


def public_status(sha):
    result = evidence.smoke("https://craves.in")
    code, body = inspect.probe("https://craves.in/api/version")
    require(code == 200 and json.loads(body).get("commitSha") == sha, "Public web still serves another source")
    for url, status in ([("https://craves.in" + path, 200) for path in ("/", "/home", "/chef", "/sign-in")]
            + [("https://api.craves.in/api/v1/chef/application/readiness", 401),
               ("https://craves.in/api/chef/application/readiness", 401)]):
        require(inspect.probe(url)[0] == status, "Public route verification failed: " + url)
    return result


def deploy_web(source, sha, run_id, output):
    before = app(WEB)
    ready_web(before)
    previous_sha = build_sha(before)
    old_image = resolve_image(before["properties"]["template"]["containers"][0]["image"])
    env = environment(before)
    public = {}
    for key in FIREBASE:
        entry = env.get(key, {})
        value = entry.get("value", "")
        require(bool(value) and not value.startswith("$(") and not entry.get("secretRef"), "Missing public web build setting: " + key)
        public[key] = value
    public.update(NEXT_PUBLIC_RAZORPAY_MODE="production", NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK="false")
    if env.get("NEXT_PUBLIC_SYNCFUSION_LICENSE_KEY", {}).get("value"):
        public["NEXT_PUBLIC_SYNCFUSION_LICENSE_KEY"] = env["NEXT_PUBLIC_SYNCFUSION_LICENSE_KEY"]["value"]
    image = build_image(source, "apps/customer-web-next", "craves/customer-web-next", sha, public)
    source_guard(source, sha, run_id)
    web_guard(before, app(WEB))
    ready_web(app(WEB))
    receipt = {"sourceSha": sha, "image": image, "previousImage": old_image, "previousSourceSha": previous_sha}
    output.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    azure("containerapp", "update", "-g", RG, "-n", WEB, "--image", image,
          "--set-env-vars", "CRAVES_BUILD_SHA=" + sha, "--no-wait")
    try:
        for attempt in range(120):
            current = app(WEB)
            if current["properties"]["template"]["containers"][0]["image"] == before["properties"]["template"]["containers"][0]["image"] and build_sha(current) == previous_sha:
                web_guard(before, current)
                time.sleep(10)
                continue
            web_guard(before, current, image, sha)
            try:
                ready_web(current)
                result = public_status(sha)
                print(json.dumps({**receipt, "verified": True, "public": result}), flush=True)
                return
            except ValueError:
                print("Waiting for reviewed web revision and public source verification: " + str(attempt + 1), flush=True)
                time.sleep(10)
        raise ValueError("Web deployment did not become verifiable within twenty minutes")
    except Exception:
        current = app(WEB)
        web_guard(before, current, image, sha)
        print("Restoring the captured previous image and its release SHA; other settings remain unchanged.", flush=True)
        azure("containerapp", "update", "-g", RG, "-n", WEB, "--image", old_image,
              "--set-env-vars", "CRAVES_BUILD_SHA=" + previous_sha, "--no-wait")
        # Recovery is not success. Keep the release red even when recovery succeeds.
        for _ in range(120):
            current = app(WEB)
            if current["properties"]["template"]["containers"][0]["image"] == image and build_sha(current) == sha:
                web_guard(before, current, image, sha)
                time.sleep(10)
                continue
            web_guard(before, current, old_image, previous_sha)
            try:
                ready_web(current)
                code, body = inspect.probe("https://craves.in/api/version")
                require(code == 200 and json.loads(body).get("commitSha") == previous_sha, "Previous public source not restored yet")
                raise RuntimeError("Release failed; previous image and source restored and verified")
            except ValueError:
                time.sleep(10)
        raise RuntimeError("Release failed; recovery requested but not verified; inspect Azure revisions")


def execute(args):
    require(args.operation in ("preflight", "status") or args.confirm, "Explicit deployment confirmation required")
    args.output.mkdir(parents=True, exist_ok=True)
    account = azure("account", "show")
    require(account["id"] == SUBSCRIPTION and account["tenantId"] == inspect.TENANT, "Wrong Azure account")
    proof = source_guard(args.source, args.sha, args.regression_run)
    print(json.dumps({"operation": args.operation, "reviewedSource": proof}), flush=True)
    report = database_report(args.source, args.output / "preflight.json")
    if args.operation == "preflight":
        print(json.dumps(report, indent=2))
        require_database(report)
        current = app(CHEF)["properties"]["template"]["containers"][0]["image"]
        env = dict(os.environ, DEPLOY_PREFLIGHT_ONLY="true")
        print(run("bash", str(TOOLS / "deploy-single-service-preserve-runtime.sh"),
                  RG, CHEF, current, "user-chef", env=env), flush=True)
        print("Database is compatible. Pending rollout findings: " + json.dumps(report["blockers"]))
        return
    require_database(report, applied=args.operation != "backend")
    if args.operation == "status":
        ready_web(app(WEB))
        print(json.dumps(public_status(args.sha)))
        return
    run("az", "acr", "login", "-n", ACR, "--only-show-errors")
    if args.operation == "backend":
        previous = app(CHEF)["properties"]["template"]["containers"][0]["image"]
        env = dict(os.environ, DEPLOY_PREFLIGHT_ONLY="true", READY_ATTEMPTS="150", READY_SLEEP_SECONDS="10")
        helper = str(TOOLS / "deploy-single-service-preserve-runtime.sh")
        run("bash", helper, RG, CHEF, previous, "user-chef", env=env)
        image = build_image(args.source, "services/user-chef-service", "craves/user-chef-service", args.sha)
        source_guard(args.source, args.sha, args.regression_run)
        if previous != image:
            env.update(DEPLOY_PREFLIGHT_ONLY="false", EXPECTED_PREVIOUS_IMAGE=previous)
            run("bash", helper, RG, CHEF, image, "user-chef", env=env)
        chef_image_guard(args.sha)
        require_database(database_report(args.source, args.output / "backend-after.json"), applied=True)
        print(json.dumps({"backendVerified": True, "sourceSha": args.sha, "image": image}), flush=True)
    elif args.operation == "apim":
        chef_image_guard(args.sha)
        env = dict(os.environ, RG=RG, APIM=APIM, USER_CHEF_APP=CHEF)
        run("bash", str(args.source / "scripts/apim/configure-chef-application-apim.sh"), env=env)
        require(inspect.probe("https://api.craves.in/api/v1/chef/application/readiness")[0] == 401,
                "Readiness route did not return the required unsigned 401")
        print("Chef readiness operation verified: unsigned 401.")
    elif args.operation == "web":
        require(not report["blockers"], "Backend/APIM release prerequisites are incomplete")
        chef_image_guard(args.sha)
        deploy_web(args.source, args.sha, args.regression_run, args.output / "web-release.json")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--operation", choices=("preflight", "backend", "apim", "web", "status"), default="preflight")
    parser.add_argument("--confirm", action="store_true")
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--regression-run", required=True)
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args()
    try:
        execute(arguments)
    except Exception as error:
        raise SystemExit(str(error) if isinstance(error, (ValueError, RuntimeError)) else "Release stopped (details suppressed): " + type(error).__name__)
