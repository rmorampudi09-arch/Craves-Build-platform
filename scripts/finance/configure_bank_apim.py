#!/usr/bin/env python3
"""Publish only bank leaf APIs on an existing APIM. Read-only plan unless --apply.
Requires deployed bank authentication and privacy-safe inherited policies/diagnostics.
"""
from __future__ import annotations
import argparse
import json
import re
import subprocess
import tempfile
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from configure_bank_runtime import az, origin, GuardError

VERSION = "2022-08-01"
OWNER = "Craves bank automation leaf routes v1"
ROUTES = {
    "craves-bank-enrollment-v1": "api/v1/chef-onboarding/bank",
    "craves-bank-automation-v1": "api/v1/admin/finance/bank-onboarding",
}

def pages(url: str) -> list[dict]:
    result = []
    for _ in range(100):
        if not url.startswith("https://management.azure.com/"):
            raise GuardError("Unexpected management pagination origin")
        value = az("rest", "--method", "get", "--url", url)
        result.extend(value.get("value", []))
        url = value.get("nextLink")
        if not url: return result
    raise GuardError("Management pagination limit exceeded")

def url(base: str, suffix: str) -> str:
    return base + suffix + "?api-version=" + VERSION

def privacy_guard(policies: list[dict], diagnostics: list[dict]) -> None:
    for policy in policies:
        text = policy.get("properties", {}).get("value", "")
        try: root = ET.fromstring(text)
        except ET.ParseError as exc: raise GuardError("Inherited policy cannot be inspected safely") from exc
        for node in root.iter():
            tag = node.tag.rsplit("}", 1)[-1]
            if tag in {"trace", "log-to-eventhub", "send-request", "send-one-way-request", "include-fragment"}:
                raise GuardError("Inherited policy requires a bank-data privacy review; no publication performed")
            if tag == "set-backend-service" and node.get("backend-id"):
                raise GuardError("Inherited backend-id cannot be safely overridden")
        if re.search(r"context\.(?:Request|Response)\.Body", text, re.I):
            raise GuardError("Inherited policy accesses message bodies; bank publication blocked")
    for diagnostic in diagnostics:
        properties = diagnostic.get("properties", {})
        for side in ("frontend", "backend"):
            for direction in ("request", "response"):
                options = (properties.get(side) or {}).get(direction) or {}
                if (options.get("body") or {}).get("bytes", 0):
                    raise GuardError("Inherited diagnostic logs bodies; bank publication blocked")
                if any(h.lower() in {"authorization", "cookie", "set-cookie"} for h in options.get("headers", [])):
                    raise GuardError("Inherited diagnostic logs authentication headers; publication blocked")

def policy_text(backend: str, path: str) -> str:
    root = ET.Element("policies"); inbound = ET.SubElement(root, "inbound")
    ET.SubElement(inbound, "base")
    choose = ET.SubElement(inbound, "choose")
    when = ET.SubElement(choose, "when", {"condition": '@(!context.Request.Headers.GetValueOrDefault("Authorization", "").StartsWith("Bearer "))'})
    response = ET.SubElement(when, "return-response")
    ET.SubElement(response, "set-status", {"code": "401", "reason": "Unauthorized"})
    ET.SubElement(inbound, "set-backend-service", {"base-url": backend})
    ET.SubElement(inbound, "rewrite-uri", {"template": "/" + path, "copy-unmatched-params": "false"})
    ET.SubElement(ET.SubElement(root, "backend"), "base")
    outbound = ET.SubElement(root, "outbound"); ET.SubElement(outbound, "base")
    header = ET.SubElement(outbound, "set-header", {"name": "Cache-Control", "exists-action": "override"})
    ET.SubElement(header, "value").text = "no-store"
    ET.SubElement(ET.SubElement(root, "on-error"), "base")
    return ET.tostring(root, encoding="unicode")

def check_existing(apis: list[dict], api_id: str, path: str) -> dict | None:
    matches = [a for a in apis if a.get("name", "").split(";")[0] == api_id or a.get("properties", {}).get("path", "").strip("/") == path]
    if len(matches) > 1: raise GuardError("API path or revision ownership is ambiguous")
    if not matches: return None
    existing = matches[0]
    p = existing.get("properties", {})
    if existing["name"] != api_id or p.get("path", "").strip("/") != path or p.get("description") != OWNER:
        raise GuardError("Bank path already belongs to another API; no overwrite performed")
    return existing

def put(url_value: str, body: dict, create: bool = False) -> None:
    with tempfile.TemporaryDirectory(prefix="craves-apim-") as folder:
        path = Path(folder) / "body.json"; path.write_text(json.dumps(body))
        extra = ["--headers", "If-None-Match=*"] if create else []
        az("rest", "--method", "put", "--url", url_value, "--body", "@" + str(path), *extra)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl): return None

def protected_status(target: str) -> None:
    try:
        with urllib.request.build_opener(NoRedirect()).open(target, timeout=20) as response:
            status = response.status
    except urllib.error.HTTPError as error: status = error.code
    if status not in (401, 403):
        raise GuardError("Deployed bank authentication probe did not reject an anonymous request")

def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--resource-group", default="rg-craves-prodlow-centralindia")
    p.add_argument("--apim", default="apim-craves-prodlow-l3ing6")
    p.add_argument("--apply", action="store_true"); p.add_argument("--expected-source-sha", default="")
    p.add_argument("--output", default="bank-apim-plan.json")
    args = p.parse_args(argv)
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    if args.apply and (not re.fullmatch(r"[0-9a-f]{40}", args.expected_source_sha) or args.expected_source_sha != head):
        raise GuardError("APIM apply requires the exact reviewed release SHA")
    subscription = az("account", "show", "--query", "id")
    service = az("apim", "show", "-g", args.resource_group, "-n", args.apim)
    app = az("containerapp", "show", "-g", args.resource_group, "-n", "ca-craves-integration-service-pr")
    backend = origin(app)
    base = f"https://management.azure.com/subscriptions/{subscription}/resourceGroups/{args.resource_group}/providers/Microsoft.ApiManagement/service/{args.apim}"
    apis = pages(url(base, "/apis"))
    privacy_guard(pages(url(base, "/policies")), pages(url(base, "/diagnostics")))
    planned = []
    for api_id, path in ROUTES.items():
        existing = check_existing(apis, api_id, path)
        policies = pages(url(base, "/apis/" + api_id + "/policies")) if existing else []
        diagnostics = pages(url(base, "/apis/" + api_id + "/diagnostics")) if existing else []
        privacy_guard(policies, diagnostics)
        expected_policy = policy_text(backend, path)
        for item in policies:
            if item["properties"].get("value") != expected_policy:
                raise GuardError("Existing leaf policy differs from this release; no overwrite performed")
        operations = pages(url(base, "/apis/" + api_id + "/operations")) if existing else []
        for operation in operations:
            props = operation["properties"]
            if operation["name"] not in ("bank-get", "bank-post") or props.get("method") != operation["name"].removeprefix("bank-").upper() or props.get("urlTemplate") != "/":
                raise GuardError("Unexpected operation in owned leaf API")
            if pages(url(base, "/apis/" + api_id + "/operations/" + operation["name"] + "/policies")):
                raise GuardError("Unexpected operation policy could override bank privacy or authorization")
        planned.append((api_id, path, existing, operations, expected_policy))
    Path(args.output).write_text(json.dumps({"mode": "APPLY" if args.apply else "PLAN_ONLY", "sourceSha": head,
        "apim": args.apim, "backendOrigin": backend, "routes": ROUTES, "privatePostingEndpointsPublished": False,
        "notice": "No body or credential diagnostics are enabled; application JWT and finance role checks remain authoritative."}, indent=2) + "\n")
    if not args.apply:
        print("Read-only bank API publication plan written."); return 0
    protected_status(backend + "/api/v1/chef-onboarding/bank")
    for api_id, path, existing, operations, policy in planned:
        api_base = base + "/apis/" + api_id
        properties = {"path": path, "displayName": api_id, "description": OWNER,
            "serviceUrl": backend, "protocols": ["https"], "subscriptionRequired": True}
        if not existing: put(url(api_base, ""), {"properties": properties}, create=True)
        for method in ("GET", "POST"):
            oid = "bank-" + method.lower()
            if not any(op["name"] == oid for op in operations):
                put(url(api_base, "/operations/" + oid), {"properties": {"displayName": "Bank " + method,
                    "method": method, "urlTemplate": "/", "templateParameters": [], "responses": []}}, create=True)
        if not existing or not pages(url(api_base, "/policies")):
            put(url(api_base, "/policies/policy"), {"properties": {"format": "rawxml", "value": policy}}, create=True)
        actual = pages(url(api_base, "/policies"))
        if len(actual) != 1 or actual[0]["properties"].get("value") != policy:
            raise GuardError("Bank policy read-back differs; leaf API is not released")
        if not existing or existing["properties"].get("subscriptionRequired") is True:
            properties["subscriptionRequired"] = False
            put(url(api_base, ""), {"properties": properties})
        protected_status(service["gatewayUrl"].rstrip("/") + "/" + path)
    print("Bank leaf API routes configured; authenticated acceptance and provider activation remain separate.")
    return 0

if __name__ == "__main__":
    try: raise SystemExit(main())
    except Exception as error:
        print("Bank API release stopped: " + (str(error) if isinstance(error, GuardError) else type(error).__name__))
        raise SystemExit(1)
