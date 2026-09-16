#!/usr/bin/env python3
"""Run and summarize exact-source disposable launch verification; never deploys."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "scripts/launch/required-suites.json"
SERVICES = ("auth-service", "user-chef-service", "catalog-service", "integration-service",
            "order-service", "subscription-service", "notification-service")
COUNTS = ("tests", "failures", "errors", "skipped")


def save(path, value):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")
    temporary.replace(path)


def source(expected):
    if not re.fullmatch(r"[0-9a-f]{40}", expected):
        raise ValueError("Expected release SHA must be an exact lowercase 40-character commit SHA")
    actual = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    if actual != expected:
        raise ValueError("Checkout does not match the exact reviewed release SHA")
    subprocess.run(["git", "diff", "--exit-code", "HEAD", "--"], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    return {"sourceSha": actual, "sourceTree": subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], cwd=ROOT, text=True).strip(),
            "runId": os.environ.get("GITHUB_RUN_ID"), "runAttempt": os.environ.get("GITHUB_RUN_ATTEMPT"),
            "recordedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
            "requiredManifestSha256": hashlib.sha256(MANIFEST.read_bytes()).hexdigest()}


def run_command(command, cwd, log, timeout=1200):
    """Save output and an explicit result even on failure/timeout, without printing environment."""
    start = time.monotonic(); log = Path(log); log.parent.mkdir(parents=True, exist_ok=True)
    result = {"command": command, "exitCode": None, "timedOut": False, "log": log.name}
    print("Running " + " ".join(command), flush=True)
    try:
        with log.open("w") as output:
            process = subprocess.Popen(command, cwd=cwd, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
            try:
                result["exitCode"] = process.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                result["timedOut"] = True
                if os.name == 'nt': process.terminate()
                else: os.killpg(process.pid, signal.SIGTERM)
                try: process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    if os.name == 'nt': process.kill()
                    else: os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
    except OSError as error:
        result["launchError"] = type(error).__name__
    result["durationSeconds"] = round(time.monotonic() - start, 3)
    print(f"Finished {command[0]}: exit={result['exitCode']}, timeout={result['timedOut']}", flush=True)
    return result


def discover_java(source_folder):
    result = {}
    for file in sorted(Path(source_folder).rglob("*.java")):
        body = file.read_text()
        count = len(re.findall(r"(?m)^\s*@(Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate)\b", body))
        if count:
            result[file.stem] = max(count, result.get(file.stem, 0))
    return result


def java_result(service, reports, required, source_folder):
    issues = []; suites = {}; totals = dict.fromkeys(COUNTS, 0)
    for file in sorted(Path(reports).glob("TEST-*.xml")):
        try:
            suite = ET.parse(file).getroot()
            if suite.tag != "testsuite": raise ValueError("Unexpected JUnit root")
            name = suite.attrib["name"]
            counts = {key: int(suite.attrib.get(key, "0")) for key in COUNTS}
            if min(counts.values()) < 0 or counts["tests"] < sum(counts[k] for k in COUNTS[1:]):
                raise ValueError("Invalid JUnit counts")
            cases = suite.findall('testcase')
            if len(cases) != counts['tests']:
                raise ValueError('JUnit case count does not match declared count')
            for attribute, tag in (('failures','failure'), ('errors','error'), ('skipped','skipped')):
                if counts[attribute] != sum(case.find(tag) is not None for case in cases):
                    raise ValueError('JUnit child outcomes do not match declared counts')
            if name in suites: raise ValueError("Duplicate JUnit suite")
            suites[name] = counts
            for key in COUNTS: totals[key] += counts[key]
        except (ET.ParseError, ValueError, KeyError):
            issues.append("Malformed or duplicate JUnit report: " + file.name)
    minima = dict(required)
    for name, minimum in discover_java(source_folder).items(): minima[name] = max(minimum, minima.get(name, 0))
    for name, minimum in sorted(minima.items()):
        matching = [c for full, c in suites.items() if full.rsplit(".", 1)[-1].split("$", 1)[0] == name]
        count = sum(c["tests"] for c in matching)
        if not matching or count < minimum: issues.append(f"Missing required cases: {name} ({count}/{minimum})")
        if any(c[k] for c in matching for k in COUNTS[1:]): issues.append("Required suite skipped or failed: " + name)
    if not totals["tests"] or any(totals[k] for k in COUNTS[1:]): issues.append("Full service run has missing, skipped or failing tests")
    return {"service": service, "counts": totals, "requiredSuites": len(minima), "suites": suites,
            "issues": issues, "status": "GREEN" if not issues else "RED"}


def run_backend(output, expected):
    output = Path(output); manifest = json.loads(MANIFEST.read_text())
    result = {**source(expected), "kind": "backend", "status": "RED", "services": {},
              "scope": "Disposable PostgreSQL/PostGIS, local HTTP/mock providers; no production credentials or deployment"}
    save(output / "backend-summary.json", result)
    if os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("CRAVES_DISPOSABLE_TEST_DATABASE") != "true":
        raise ValueError("Backend runner requires the explicit GitHub disposable-database acknowledgement")
    for service in SERVICES:
        command = run_command(["mvn", "-B", "-ntp", "-f", f"services/{service}/pom.xml", "clean", "verify",
            "-DskipTests=false", "-Dmaven.test.skip=false", "-Djunit.jupiter.execution.parallel.enabled=false"], ROOT, output / f"{service}.log", 1200)
        checked = java_result(service, ROOT / f"services/{service}/target/surefire-reports", manifest["services"][service], ROOT / f"services/{service}/src/test")
        checked["command"] = command
        if command["exitCode"] != 0: checked["status"] = "RED"; checked["issues"].append("Full Maven clean verify did not complete successfully")
        result["services"][service] = checked; save(output / "backend-summary.json", result)
    if all(result["services"][s]["status"] == "GREEN" for s in ("order-service", "integration-service")):
        command = run_command(["bash", "scripts/finance/test-source-roundtrip.sh"], ROOT, output / "source-roundtrip.log", 600)
        try:
            report = json.loads((ROOT / "target/finance-roundtrip/report.json").read_text())
            valid = command["exitCode"] == 0 and report["status"] == "PASS" and report["checkCount"] >= manifest["roundtrip"]["minimumChecks"] and report["net"] == manifest["roundtrip"]["expectedNet"]
            result["roundtrip"] = {"status": "GREEN" if valid else "RED", "command": command, "report": report}
        except (OSError, KeyError, ValueError):
            result["roundtrip"] = {"status": "RED", "command": command, "issue": "Missing or malformed connected source evidence"}
    else:
        result["roundtrip"] = {"status": "RED", "issue": "Prerequisite Integration or Order verification failed"}
    result["status"] = "GREEN" if all(s["status"] == "GREEN" for s in result["services"].values()) and result["roundtrip"]["status"] == "GREEN" else "RED"
    save(output / "backend-summary.json", result)
    return result


def web_result(vitest_file, tap_file, required, source_folder=None):
    issues = []; counts = {}
    try:
        report = json.loads(Path(vitest_file).read_text())
        counts["vitest"] = {"tests": int(report["numTotalTests"]), "passed": int(report["numPassedTests"]),
            "failed": int(report["numFailedTests"]), "skipped": int(report["numPendingTests"])}
        value = counts["vitest"]
        minima = dict(required.get("requiredVitestFiles", {}))
        if source_folder is not None:
            for file in Path(source_folder).glob("*.vitest.ts"): minima[file.name] = max(1, minima.get(file.name, 0))
        files = {}
        for item in report.get("testResults", []):
            name = Path(item.get("name", "")).name
            if name in files: issues.append("Duplicate Vitest file report: " + name)
            files[name] = item
        for name, minimum in minima.items():
            item = files.get(name, {}); assertions = item.get("assertionResults", [])
            if item.get("status") != "passed" or len(assertions) < minimum or any(a.get("status") != "passed" for a in assertions):
                issues.append("Missing, skipped or failed required Vitest file: " + name)
        if report.get("numTodoTests", 0): issues.append("Vitest contains unexecuted todo cases")
        if report.get("success") is not True or value["tests"] < required["minimumVitestTests"] or value["passed"] != value["tests"] or value["failed"] or value["skipped"]:
            issues.append("Vitest failed, skipped or ran fewer than the required cases")
    except (OSError, KeyError, ValueError): issues.append("Missing or malformed Vitest evidence")
    try:
        content = Path(tap_file).read_text()
        def number(label):
            values = re.findall(r"(?m)^# " + label + r" (\d+)\s*$", content)
            if len(values) != 1: raise ValueError("Missing or duplicate TAP summary")
            return int(values[0])
        counts["node"] = {k: number(k) for k in ("tests", "pass", "fail", "cancelled", "skipped", "todo")}
        value = counts["node"]
        if value["tests"] < required["minimumNodeTests"] or value["pass"] != value["tests"] or any(value[k] for k in ("fail", "cancelled", "skipped", "todo")):
            issues.append("Node test runner failed, skipped or ran fewer than the required cases")
    except (OSError, ValueError): issues.append("Missing or malformed Node TAP evidence")
    return {"status": "GREEN" if not issues else "RED", "counts": counts, "issues": issues}


def run_web(output, expected):
    output = Path(output).resolve(); app = ROOT / "apps/customer-web-next"
    result = {**source(expected), "kind": "web", "status": "RED", "commands": {},
              "scope": "CI validation bundle only; never reuse as a production-configured deployment artifact"}
    save(output / "web-summary.json", result)
    # Execute both complete package test groups with machine-readable reporting, without filters.
    test_script = json.loads((app / "package.json").read_text())["scripts"]["test"]
    if test_script != "vitest run && node --test --experimental-strip-types src/lib/*.test.ts":
        raise ValueError("Package test script changed; update the full-suite reporting adapter before release")
    commands = [("install", ["npm", "ci"]), ("lint", ["npm", "run", "lint"]),
        ("typecheck", ["npm", "run", "typecheck"]),
        ("vitest", [str(app / "node_modules/.bin/vitest"), "run", "--reporter=json", "--outputFile=" + str(output / "vitest.json")]),
        ("node", ["node", "--test", "--experimental-strip-types", "--test-reporter=tap", *[str(p.relative_to(app)) for p in sorted((app / "src/lib").glob("*.test.ts"))]]),
        ("build", ["npm", "run", "build"])]
    for name, command in commands:
        result["commands"][name] = run_command(command, app, output / ("node.tap" if name == "node" else name + ".log"), 1200)
        save(output / "web-summary.json", result)
        if name == "install" and result["commands"][name]["exitCode"] != 0: break
    result["tests"] = web_result(output / "vitest.json", output / "node.tap", json.loads(MANIFEST.read_text())["web"], app / "src/lib")
    build_id = app / ".next/BUILD_ID"
    if build_id.is_file(): result["buildId"] = build_id.read_text().strip()
    result["status"] = "GREEN" if len(result["commands"]) == len(commands) and all(x["exitCode"] == 0 for x in result["commands"].values()) and result["tests"]["status"] == "GREEN" and result.get("buildId") else "RED"
    save(output / "web-summary.json", result)
    return result


def combine(folder, expected):
    result = {"schemaVersion": 1, "sourceSha": expected, "status": "RED", "components": {}, "issues": [],
              "boundary": "Automated disposable CI evidence only. Production routing, activation, owner records and any authorized live financial acceptance require separate evidence."}
    if not re.fullmatch(r"[0-9a-f]{40}", expected): result["issues"].append("Invalid expected release SHA")
    for kind in ("backend", "web"):
        files = list(Path(folder).rglob(kind + "-summary.json"))
        if len(files) != 1: result["issues"].append("Missing or duplicate " + kind + " evidence"); continue
        try:
            component = json.loads(files[0].read_text()); result["components"][kind] = component
            if component.get("sourceSha") != expected: result["issues"].append(kind + " was not tested at the exact release SHA")
            if component.get("status") != "GREEN": result["issues"].append(kind + " verification is incomplete or failed")
            if kind == "backend":
                services = component.get("services", {})
                if set(services) != set(SERVICES) or any(s.get("status") != "GREEN" or s.get("command", {}).get("exitCode") != 0 for s in services.values()):
                    result["issues"].append("Not all seven Java services completed successfully")
                if component.get("roundtrip", {}).get("status") != "GREEN": result["issues"].append("Connected source round trip did not pass")
            if kind == "web":
                commands = component.get("commands", {})
                if set(commands) != {"install", "lint", "typecheck", "vitest", "node", "build"} or any(c.get("exitCode") != 0 for c in commands.values()):
                    result["issues"].append("Full web command set did not complete")
                if component.get("tests", {}).get("status") != "GREEN" or not component.get("buildId"):
                    result["issues"].append("Web tests or production build evidence is incomplete")
        except (OSError, ValueError): result["issues"].append("Malformed " + kind + " evidence")
    if len(result["components"]) == 2:
        manifests = {c.get("requiredManifestSha256") for c in result["components"].values()}
        runs = {(c.get("runId"), c.get("runAttempt")) for c in result["components"].values()}
        actual_manifest = hashlib.sha256(MANIFEST.read_bytes()).hexdigest()
        if manifests != {actual_manifest} or len(runs) != 1: result["issues"].append("Component provenance does not match")
        if os.environ.get("GITHUB_RUN_ID") and runs != {(os.environ["GITHUB_RUN_ID"], os.environ.get("GITHUB_RUN_ATTEMPT"))}:
            result["issues"].append("Evidence is not from this workflow attempt")
    result["status"] = "GREEN" if not result["issues"] else "RED"
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("source", "backend", "web", "summary"))
    parser.add_argument("--expected-sha", required=True); parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--evidence", type=Path)
    args = parser.parse_args()
    if args.mode == "source": save(args.output, source(args.expected_sha)); return 0
    if args.mode == "backend": result = run_backend(args.output, args.expected_sha)
    elif args.mode == "web": result = run_web(args.output, args.expected_sha)
    else:
        if not args.evidence: parser.error("--evidence is required for summary")
        result = combine(args.evidence, args.expected_sha); save(args.output, result)
        # This result contains only suite counts, source/run provenance, command metadata,
        # and synthetic acceptance labels. Keep it retrievable if artifact delivery fails.
        print("LAUNCH_EVIDENCE_JSON_BEGIN")
        print(json.dumps(result, sort_keys=True, separators=(",", ":")))
        print("LAUNCH_EVIDENCE_JSON_END")
    return 0 if result["status"] == "GREEN" else 1


if __name__ == "__main__":
    sys.exit(main())
