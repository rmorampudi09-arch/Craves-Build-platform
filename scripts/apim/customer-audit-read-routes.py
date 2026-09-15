"""Publish only audited customer reads; never deploy services or mutate customer data."""
import json
import subprocess
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

RG = "rg-craves-prodlow-centralindia"
APIM = "apim-craves-prodlow-l3ing6"
VERSION = "2022-08-01"
TARGETS = {
    "orders": ("ca-craves-order-service-prodlow", "cravesprodlowacr82121.azurecr.io/craves/order-service:referral-151c36cb2afaaf7b8482ee784704d983f7d87324"),
    "support": ("ca-craves-user-chef-service-prod", "cravesprodlowacr82121.azurecr.io/craves/user-chef-service@sha256:fa546c94af8eb329593d158589e0bffee96e19d6f84a55f937032de1f74fa93d"),
}
# Exact controller contracts: CustomerReviewController, OrderReviewController,
# SupportCaseController. No POST/PUT/DELETE content actions are published here.
GROUPS = [
    ("orders", "api/v1/orders", "craves-orders-v1", [
        ("get-own-order-review", "/{orderId}/review"),
    ]),
    ("orders", "api/v1/reviews", "craves-customer-reviews-v1", [
        ("get-own-reviews", "/mine"), ("get-review-tags", "/tags"),
    ]),
    ("support", "api/v1/support/cases", "craves-customer-support-v1", [
        ("get-own-support-cases", "/"), ("get-own-support-case", "/{caseId}"),
    ]),
]


def az(*args, expect_json=True):
    # Capture CLI output so error bodies/configuration cannot enter pipeline logs.
    result = subprocess.run(["az", *args, "-o", "json" if expect_json else "none"], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError("Azure operation failed: " + " ".join(args[:3]))
    if not expect_json:
        return None  # Writes are verified separately with explicit GET readback.
    output = result.stdout.lstrip("\ufeff").strip()
    return json.loads(output) if output else None


def rest(method, url, body=None):
    # APIM policy endpoints also offer raw XML; explicitly request their JSON envelope.
    args = ["rest", "--method", method, "--url", url, "--headers", "Accept=application/json"]
    if body is not None:
        args += ["--body", json.dumps(body)]
    return az(*args, expect_json=method.lower() == "get")


def status(url):
    request = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def validate_policy(xml):
    root = ET.fromstring(xml)
    require(not any("backend-id" in e.attrib for e in root.iter("set-backend-service")),
            "Inherited backend-id routing requires separate review")


def read_policy(scope):
    # Collection GET distinguishes an absent policy from an inaccessible one.
    entries = rest("get", scope + "/policies?api-version=" + VERSION).get("value", [])
    for entry in entries:
        validate_policy(entry["properties"]["value"])


def operation_body(operation_id, path):
    parameters = []
    for name in ("orderId", "caseId"):
        if "{" + name + "}" in path:
            parameters.append({"name": name, "type": "string", "required": True})
    return {"properties": {"displayName": operation_id.replace("-", " "),
            "method": "GET", "urlTemplate": path, "templateParameters": parameters,
            "responses": [{"statusCode": 200}, {"statusCode": 401}, {"statusCode": 403}, {"statusCode": 404}]}}


def policy(backend):
    root = ET.Element("policies")
    inbound = ET.SubElement(root, "inbound")
    ET.SubElement(inbound, "base")
    choose = ET.SubElement(inbound, "choose")
    when = ET.SubElement(choose, "when", condition='@(!context.Request.Headers.GetValueOrDefault("Authorization", "").StartsWith("Bearer ", System.StringComparison.OrdinalIgnoreCase))')
    response = ET.SubElement(when, "return-response")
    ET.SubElement(response, "set-status", code="401", reason="Unauthorized")
    for name, value in (("Content-Type", "application/json"), ("Cache-Control", "no-store")):
        ET.SubElement(ET.SubElement(response, "set-header", name=name, **{"exists-action": "override"}), "value").text = value
    ET.SubElement(response, "set-body").text = '{"error":"AUTHENTICATION_REQUIRED","message":"Please sign in to continue."}'
    ET.SubElement(inbound, "set-backend-service", **{"base-url": backend})
    ET.SubElement(ET.SubElement(root, "backend"), "base")
    outbound = ET.SubElement(root, "outbound")
    ET.SubElement(outbound, "base")
    for name, value in (("Cache-Control", "no-store, no-cache, must-revalidate"), ("Pragma", "no-cache"), ("X-Content-Type-Options", "nosniff")):
        ET.SubElement(ET.SubElement(outbound, "set-header", name=name, **{"exists-action": "override"}), "value").text = value
    ET.SubElement(ET.SubElement(root, "on-error"), "base")
    return ET.tostring(root, encoding="unicode")


def validate_operations(existing, desired):
    for operation_id, path in desired:
        for operation in existing:
            same_route = operation["method"] == "GET" and operation["urlTemplate"].rstrip("/") == path.rstrip("/")
            same_id = operation["name"] == operation_id
            require(not same_route or same_id, "An existing operation already owns the requested route")
            require(not same_id or same_route, "Requested operation id belongs to another route")


def main(apply=False):
    subscription = az("account", "show")["id"]
    base = f"https://management.azure.com/subscriptions/{subscription}/resourceGroups/{RG}/providers/Microsoft.ApiManagement/service/{APIM}"
    read_policy(base)
    origins = {}
    for key, (name, expected_image) in TARGETS.items():
        app = az("containerapp", "show", "-g", RG, "-n", name)["properties"]
        require(app["latestRevisionName"] == app["latestReadyRevisionName"] and app["runningStatus"] == "Running", "Service is not ready")
        require(app["template"]["containers"][0]["image"] == expected_image, "Live image changed; review before publishing")
        origins[key] = "https://" + app["configuration"]["ingress"]["fqdn"]
        require(status(origins[key] + "/actuator/health") == 200, "Backend health check failed")
    apis = az("apim", "api", "list", "-g", RG, "--service-name", APIM)
    plan = []
    for key, path, api_id, operations in GROUPS:
        owners = [api for api in apis if api["path"].rstrip("/") == path]
        require(len(owners) <= 1, "Multiple APIs own the same public path")
        exists = bool(owners)
        if exists:
            require(owners[0]["name"] == api_id and not owners[0]["subscriptionRequired"], "Existing API identity/security differs")
            read_policy(base + "/apis/" + api_id)
            existing = az("apim", "api", "operation", "list", "-g", RG, "--service-name", APIM, "--api-id", api_id)
            validate_operations(existing, operations)
        else:
            require(not any(api["name"] == api_id for api in apis), "API id is already used")
        backend = origins[key] + "/" + path
        for _, template in operations:
            probe = template.replace("{orderId}", "00000000-0000-4000-8000-000000000000").replace("{caseId}", "00000000-0000-4000-8000-000000000000")
            require(status(backend + ("" if probe == "/" else probe)) in (401, 403), "Backend read is not authentication protected")
        plan.append((path, api_id, backend, exists, operations))
        print(f"Validated {api_id}: {len(operations)} customer GET routes; existing={exists}")
    if not apply:
        print("PLAN ONLY: No cloud writes")
        return
    for path, api_id, backend, exists, operations in plan:
        scope = base + "/apis/" + api_id
        if not exists:
            rest("put", scope + "?api-version=" + VERSION, {"properties": {
                "displayName": api_id.replace("-", " "), "path": path,
                "protocols": ["https"], "serviceUrl": backend, "subscriptionRequired": False}})
            # Protected backend and API policy are in place before leaf operations.
            rest("put", scope + "/policies/policy?api-version=" + VERSION,
                 {"properties": {"format": "rawxml", "value": policy(backend)}})
        for operation_id, template in operations:
            target = scope + "/operations/" + operation_id
            rest("put", target + "?api-version=" + VERSION, operation_body(operation_id, template))
            rendered = policy(backend)
            rest("put", target + "/policies/policy?api-version=" + VERSION,
                 {"properties": {"format": "rawxml", "value": rendered}})
            actual = rest("get", target + "?api-version=" + VERSION)["properties"]
            require(actual["method"] == "GET" and actual["urlTemplate"] == template, "Route readback failed")
            actual_policy = rest("get", target + "/policies/policy?api-version=" + VERSION)["properties"]["value"]
            require(backend in actual_policy and "Authorization" in actual_policy and "no-store" in actual_policy, "Policy readback failed")
            print(f"Published GET /{path}{template}: authenticated backend, no-store")
    print("Gateway configuration complete; authenticated customer acceptance remains required.")


if __name__ == "__main__":
    main(apply=sys.argv[1:] == ["--apply"])

