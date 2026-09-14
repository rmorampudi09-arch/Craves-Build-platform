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
        value = az("rest", "--method", "get", "--url", url, "--headers", "Accept=application/json")
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

def policy_structure(text: str) -> tuple:
    """Compare policy meaning without depending on Azure's XML formatting."""
    try:
        root = ET.fromstring(text)
    except (ET.ParseError, TypeError) as exc:
        raise GuardError("Bank policy XML cannot be inspected safely") from exc
    if root.tag != "policies":
        raise GuardError("Unexpected bank policy XML root")

    def content(value):
        # Only indentation/empty text is insignificant. Do not strip expressions
        # or header values, or reorder child policies: their order is meaningful.
        return value if value and value.strip() else None

    def node(value):
        return (value.tag, tuple(sorted(value.attrib.items())), content(value.text),
                tuple(node(child) for child in value), content(value.tail))

    return node(root)

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
        headers = ["Content-Type=application/json"]
        if create: headers.append("If-None-Match=*")
        # Policy PUT may return XML. Ignore mutation output and require separate
        # JSON resource/collection readbacks before removing subscription gating.
        az("rest", "--method", "put", "--url", url_value, "--body", "@" + str(path),
           "--headers", *headers, output="none")

def check_operations(api_base: str, operations: list[dict], complete: bool = False) -> None:
    names = [operation.get("name") for operation in operations]
    if len(names) != len(set(names)) or (complete and set(names) != {"bank-get", "bank-post"}):
        raise GuardError("Bank operations read-back differs; leaf API is not released")
    for operation in operations:
        props = operation["properties"]
        if operation["name"] not in ("bank-get", "bank-post") or props.get("method") != operation["name"].removeprefix("bank-").upper() or props.get("urlTemplate") != "/":
            raise GuardError("Unexpected operation in owned leaf API")
        if pages(url(api_base, "/operations/" + operation["name"] + "/policies")):
            raise GuardError("Unexpected operation policy could override bank privacy or authorization")

def check_api(api_base: str, api_id: str, path: str, backend: str, subscription_required: bool) -> None:
    actual = az("rest", "--method", "get", "--url", url(api_base, ""), "--headers", "Accept=application/json")
    if check_existing([actual], api_id, path) is None:
        raise GuardError("Bank API ownership read-back differs; leaf API is not released")
    properties = actual.get("properties", {})
    if (properties.get("serviceUrl") != backend or properties.get("protocols") != ["https"]
            or properties.get("subscriptionRequired") is not subscription_required):
        raise GuardError("Bank API configuration read-back differs; leaf API is not released")

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
            if policy_structure(item["properties"].get("value")) != policy_structure(expected_policy):
                raise GuardError("Existing leaf policy differs from this release; no overwrite performed")
        operations = pages(url(base, "/apis/" + api_id + "/operations")) if existing else []
        check_operations(base + "/apis/" + api_id, operations)
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
            # ElementTree XML-encodes expression attributes. rawxml would preserve
            # those entities inside the expression instead of decoding the XML.
            put(url(api_base, "/policies/policy"), {"properties": {"format": "xml", "value": policy}}, create=True)
        actual = pages(url(api_base, "/policies"))
        if len(actual) != 1 or policy_structure(actual[0]["properties"].get("value")) != policy_structure(policy):
            raise GuardError("Bank policy read-back differs; leaf API is not released")
        check_operations(api_base, pages(url(api_base, "/operations")), complete=True)
        subscription_required = True if not existing else existing["properties"].get("subscriptionRequired")
        if not isinstance(subscription_required, bool):
            raise GuardError("Bank API subscription protection is not explicit")
        check_api(api_base, api_id, path, backend, subscription_required)
        if not existing or existing["properties"].get("subscriptionRequired") is True:
            properties["subscriptionRequired"] = False
            put(url(api_base, ""), {"properties": properties})
        check_api(api_base, api_id, path, backend, False)
        protected_status(service["gatewayUrl"].rstrip("/") + "/" + path)
    print("Bank leaf API routes configured; authenticated acceptance and provider activation remain separate.")
    return 0

if __name__ == "__main__":
    try: raise SystemExit(main())
    except Exception as error:
        print("Bank API release stopped: " + (str(error) if isinstance(error, GuardError) else type(error).__name__))
        raise SystemExit(1)
