"""Reviewable, existing-only APIM documents routing repair.

Inspection is the default. --apply accepts only the two frozen review receipts
and seven exact existing policy changes. No application token, browser session,
document body, export, email, resource creation or container mutation is used.
"""
import argparse
import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
PROPOSAL_HASH = "90f4cbc597cf1bdf41621cd8df3112042ccccd5758e7c3f6aadd7187fe35b8a9"
SUPPLEMENT_HASH = "fdb30064355308830918b3120f0a27b325504989cc13b1cf5c868c1a3b096ea9"
ORDER = ["create-document", "list-documents", "get-document", "download-document",
         "email-document", "email-history", "capabilities"]
BACKEND = "https://ca-craves-notification-service-p.yellowdesert-9c7110ab.centralindia.azurecontainerapps.io"
ALLOWED_TAGS = {"policies", "inbound", "base", "rewrite-uri", "backend", "outbound",
                "on-error", "validate-content", "content", "set-backend-service"}
spec = importlib.util.spec_from_file_location("documents_existing_web_release", ROOT / "scripts/release/web_performance_release.py")
perf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(perf)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def json_hash(value):
    return digest(json.dumps(value, sort_keys=True, separators=(",", ":")).encode())


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def structure(text):
    root = ET.fromstring(text)
    require(all(node.tag in ALLOWED_TAGS for node in root.iter()), "Unexpected known-operation policy node")

    def node_value(node):
        # Azure's single-policy and collection views serialize indentation and
        # self-closing nodes differently. Ignore only whitespace-only formatting;
        # preserve every attribute, non-whitespace text, node and child order.
        return (node.tag, tuple(sorted(node.attrib.items())),
                node.text if node.text and not node.text.isspace() else None,
                node.tail if node.tail and not node.tail.isspace() else None,
                tuple(node_value(child) for child in node))
    return node_value(root)


def validate_insertion(before, proposed, change):
    old, new = ET.fromstring(before), ET.fromstring(proposed)
    require(not old.findall(".//set-backend-service"), "Original policy already overrides backend")
    inbound = new.find("inbound")
    overrides = new.findall(".//set-backend-service")
    require(inbound is not None and len(overrides) == 1, "Expected exactly one operation backend override")
    inserted = overrides[0]
    require(inserted in list(inbound) and inserted.attrib == {"base-url": BACKEND}
            and not list(inserted) and not (inserted.text or "").strip(), "Unexpected backend override")
    children = list(inbound)
    index = children.index(inserted)
    require(index + 1 < len(children) and children[index + 1].tag == "rewrite-uri",
            "Backend override must immediately precede existing rewrite")
    rewrites = new.findall(".//rewrite-uri")
    require(len(rewrites) == 1 and rewrites[0].attrib == {
        "template": change["currentRewrite"], "copy-unmatched-params": "true"}, "Existing rewrite changed")
    inbound.remove(inserted)
    require(structure(ET.tostring(new, encoding="unicode")) == structure(before),
            "Policy changes more than the reviewed backend insertion")


def load_review():
    proposal_raw = (HERE / "documents-routing-repair-readonly-proposal.json").read_bytes()
    supplement_raw = (HERE / "documents-routing-all-operation-policy-preflight.json").read_bytes()
    require(digest(proposal_raw) == PROPOSAL_HASH and digest(supplement_raw) == SUPPLEMENT_HASH,
            "Frozen review receipts changed")
    proposal, supplement = json.loads(proposal_raw), json.loads(supplement_raw)
    require(supplement["proposalSha256"] == PROPOSAL_HASH and proposal["applyOrderIfAuthorized"] == ORDER,
            "Reviewed receipt chain or operation order changed")
    changes = {item["name"]: item for item in proposal["changes"]}
    require(set(changes) == set(ORDER) and len(supplement["operations"]) == 14,
            "Reviewed operation inventory changed")
    originals, proposed_values = {}, {}
    for name in ORDER:
        item = changes[name]
        # Historical snapshot text was written on Windows with newline
        # translation. Undo exactly that transformation, then require its frozen
        # original hash; no permissive alternate source is accepted.
        before = (HERE / item["beforePolicyFile"]).read_bytes().decode("utf-8").replace("\r\n", "\n")
        payload = json.loads((HERE / item["proposedPolicyPutFile"]).read_bytes())
        require(set(payload) == {"properties"} and set(payload["properties"]) == {"format", "value"}
                and payload["properties"]["format"] == "rawxml", "Unexpected proposed PUT fields")
        proposed = payload["properties"]["value"]
        require(digest(before.encode()) == item["currentPolicySha256"]
                and digest(proposed.encode()) == item["proposedPolicySha256"], "Frozen policy payload changed")
        require(item["proposedBackendRootUrl"] == BACKEND and item["policyResourceId"] == item["operationId"] + "/policies/policy",
                "Unexpected destination or policy resource")
        validate_insertion(before, proposed, item)
        originals[name], proposed_values[name] = before, proposed
    return proposal, supplement, changes, originals, proposed_values


class Repair:
    def __init__(self):
        self.proposal, self.supplement, self.changes, self.originals, self.proposed = load_review()
        self.api = self.proposal["affectedExistingApiId"]
        self.applied = {}
        self.restored = {}
        self.ambiguous = set()
        self.attempted = []
        self.token = None
        self.protected = None
        self.all_apps = None
        self.service_tier = None
        self.receipt = {"startedAtUtc": now(), "operation": "inspection", "proposalSha256": PROPOSAL_HASH,
                        "supplementSha256": SUPPLEMENT_HASH, "configurationVerified": False,
                        "functionalVerified": False, "functionalProofPending": "Root's existing signed-in native browser capability GET",
                        "changes": [], "rollback": [], "newResources": 0, "containerChanges": 0,
                        "authorizationChanges": 0, "documentsGeneratedDownloadedEmailed": 0}

    def account(self):
        account = perf.release.azure("account", "show")
        require(account.get("id") == perf.release.SUBSCRIPTION and account.get("tenantId") == perf.release.inspect.TENANT,
                "Unexpected Azure account")
        return {"subscriptionId": account["id"], "tenantId": account["tenantId"]}

    def get(self, path):
        return perf.release.azure("rest", "--method", "get", "--url",
                                  "https://management.azure.com" + path + "?api-version=2024-05-01")

    def policy_list(self, operation):
        return self.get(operation + "/policies")["value"]

    def direct(self, method, path, payload=None, etag=None):
        if self.token is None:
            credential = perf.release.azure("account", "get-access-token", "--resource", "https://management.azure.com/")
            require(credential.get("subscription") == perf.release.SUBSCRIPTION, "Management credential account changed")
            self.token = credential["accessToken"]
        headers = {"Authorization": "Bearer " + self.token, "Accept": "application/json"}
        data = None
        if payload is not None:
            require(bool(etag), "An exact target ETag is required")
            headers.update({"Content-Type": "application/json", "If-Match": etag})
            data = json.dumps(payload).encode()
        request = urllib.request.Request("https://management.azure.com" + path + "?api-version=2024-05-01&format=rawxml",
                                         data=data, headers=headers, method=method)
        opener = urllib.request.build_opener(perf.release.evidence.NoRedirect())
        try:
            with opener.open(request, timeout=45) as response:
                if method == "PUT":
                    # A successful synchronous status acknowledges this write;
                    # the response body is unnecessary. Read the policy anew.
                    return None, response.headers.get("ETag"), response.status
                raw = response.read(512 * 1024 + 1)
                require(len(raw) <= 512 * 1024, "Management response exceeds bound")
                return json.loads(raw) if raw else None, response.headers.get("ETag"), response.status
        except urllib.error.HTTPError as error:
            status = error.code
            error.close()
            raise ValueError("Management policy request failed; status " + str(status)) from None
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
            raise PolicyTransportError("Management policy request failed; transport outcome unknown") from None

    def check(self, capture=False):
        account = self.account()
        service = self.get(self.api.split("/apis/", 1)[0])
        tier = {"id": service["id"], "location": service["location"], "sku": service["sku"]}
        if capture:
            self.service_tier = tier
            self.receipt["serviceTierBefore"] = tier
        else:
            require(tier == self.service_tier, "APIM service tier drift")
        api = self.get(self.api)
        require(json_hash(api) == self.proposal["apiResourceSha256"], "API resource drift")
        operations = self.get(self.api + "/operations")["value"]
        require(json_hash(operations) == self.proposal["operationsInventorySha256"], "Operation inventory drift")
        require(not self.get(self.api + "/products")["value"], "API product association drift")
        for scope in self.proposal["inheritedPolicies"]:
            policies = self.get(scope["id"].rsplit("/", 1)[0])["value"]
            require(len(policies) == 1 and policies[0]["id"] == scope["id"]
                    and digest(policies[0]["properties"]["value"].encode()) == scope["policySha256"],
                    "Inherited policy drift")
        for row in self.supplement["operations"]:
            policies = self.policy_list(row["operationId"])
            name = row["name"]
            if not row["knownOperation"]:
                require(not policies, "Wildcard operation policy drift")
                continue
            require(len(policies) == 1 and policies[0]["id"] == self.changes[name]["policyResourceId"],
                    "Known operation policy inventory drift")
            xml = policies[0]["properties"]["value"]
            expected_hash = self.applied.get(name, self.restored.get(name, self.changes[name]["currentPolicySha256"]))
            require(digest(xml.encode()) == expected_hash, "Known operation policy drift: " + name)
            require(structure(xml) == structure(self.proposed[name] if name in self.applied else self.originals[name]),
                    "Known operation policy structure drift: " + name)
        apps = perf.release.azure("containerapp", "list", "-g", perf.release.RG)
        all_apps = {app["name"]: perf.protected_fingerprint(app) for app in apps}
        protected = {name: value for name, value in all_apps.items() if name != perf.release.WEB}
        web = next(app for app in apps if app["name"] == perf.release.WEB)
        released = json.loads((HERE / "release-deploy.json").read_bytes())
        require(released.get("verified") is True and protected == released["protectedApps"] and len(protected) == 12,
                "Protected apps differ from the verified customer release")
        require(perf.release.build_sha(web) == self.proposal["sourceSha"]
                and web["properties"]["template"]["containers"][0]["image"] == released["image"],
                "Current web source/image changed")
        if capture:
            self.protected, self.all_apps = protected, all_apps
            self.receipt.update({"account": account, "protectedAppsBefore": protected, "allAppsBefore": all_apps})
        else:
            require(all_apps == self.all_apps, "Container runtime/image/traffic drift")
        return {"observedAtUtc": now(), "apiResourceSha256": json_hash(api),
                "operationsInventorySha256": json_hash(operations), "serviceTier": tier,
                "protectedApps": protected, "allApps": all_apps}

    def target(self, name, expected):
        value, etag, status = self.direct("GET", self.changes[name]["policyResourceId"])
        require(status == 200 and bool(etag) and re.fullmatch(r'"[A-Za-z0-9+/=]+"', etag), "Target has no usable exact ETag")
        require(value.get("id") == self.changes[name]["policyResourceId"]
                and structure(value["properties"]["value"]) == structure(expected), "ETag target structure drift")
        return etag

    def update(self, name, value, etag):
        try:
            _, _, status = self.direct("PUT", self.changes[name]["policyResourceId"],
                                       {"properties": {"format": "rawxml", "value": value}}, etag)
        except PolicyTransportError:
            self.ambiguous.add(name)
            raise
        require(status in (200, 201), "Unexpected policy update status")
        policies = self.policy_list(self.changes[name]["operationId"])
        require(len(policies) == 1, "Updated policy inventory changed")
        actual = policies[0]["properties"]["value"]
        require(structure(actual) == structure(value), "Updated policy differs from reviewed structure")
        if value == self.proposed[name]:
            validate_insertion(self.originals[name], actual, self.changes[name])
        return digest(actual.encode()), status

    def boundary(self):
        base = "https://apim-craves-prodlow-kmqgfy.azure-api.net/api/v1/documents"
        urls = ["https://craves.in/api/documents/capabilities", "https://craves.in/api/documents",
                "https://craves.in/api/documents/00000000-0000-0000-0000-000000000000", base + "/capabilities"]
        opener = urllib.request.build_opener(perf.release.evidence.NoRedirect())
        rows = []
        for url, expected_status in zip(urls, [401, 401, 404, 401]):
            start = time.monotonic()
            request = urllib.request.Request(url, headers={"Accept": "application/json"}, method="GET")
            try:
                response = opener.open(request, timeout=30)
            except urllib.error.HTTPError as error:
                response = error
            except urllib.error.URLError:
                raise ValueError("Anonymous boundary request transport error") from None
            try:
                status = response.status
                cache = response.headers.get("Cache-Control", "")
                edge = response.headers.get("X-Cache", "")
                rows.append({"url": url, "status": status, "cacheControl": cache, "xCache": edge,
                             "seconds": round(time.monotonic() - start, 6), "authenticated": False,
                             "responseBodyRead": False})
                require(status == expected_status, "Anonymous documents boundary status changed")
                require("no-store" in cache.lower() or "private" in cache.lower(), "Anonymous documents response lacks private/no-store cache control")
                require(not edge or edge == "CONFIG_NOCACHE", "Anonymous documents response became cacheable")
            finally:
                response.close()
        baseline = self.receipt.get("anonymousBoundariesBefore")
        if baseline:
            require([{key: row[key] for key in ("url", "status", "cacheControl", "xCache")} for row in rows] ==
                    [{key: row[key] for key in ("url", "status", "cacheControl", "xCache")} for row in baseline],
                    "Anonymous documents boundary headers/status changed")
        return rows

    def save(self, filename):
        self.receipt["lastUpdatedAtUtc"] = now()
        (HERE / filename).write_bytes((json.dumps(self.receipt, indent=2) + "\n").encode())

    def rollback(self):
        # An in-flight update may have succeeded before a transport/readback
        # failure. Discover only exact own proposed structures, then use current
        # ETags. Never restore a concurrently changed target or other scope.
        if self.ambiguous:
            self.receipt["ambiguousWriteOperations"] = sorted(self.ambiguous)
            self.receipt["manualReviewRequired"] = True
            # Bounded observations help discover a late completion, but cannot
            # prove an unacknowledged network write will never complete later.
            # Even an apparently original state retains the unknown outcome.
            for name in sorted(self.ambiguous):
                samples = []
                for round_number in range(3):
                    if round_number:
                        time.sleep(2)
                    policies = self.policy_list(self.changes[name]["operationId"])
                    require(len(policies) == 1, "Ambiguous recovery inventory drift")
                    actual = policies[0]["properties"]["value"]
                    kind = "own-proposed" if structure(actual) == structure(self.proposed[name]) else (
                        "original" if structure(actual) == structure(self.originals[name]) else "concurrent-drift")
                    samples.append({"observedAtUtc": now(), "policySha256": digest(actual.encode()), "structure": kind})
                self.receipt.setdefault("ambiguousWriteReadbacks", {})[name] = samples
        for name in self.attempted:
            policies = self.policy_list(self.changes[name]["operationId"])
            require(len(policies) == 1, "Recovery policy inventory drift")
            actual = policies[0]["properties"]["value"]
            if structure(actual) == structure(self.proposed[name]):
                self.applied[name] = digest(actual.encode())
            elif structure(actual) == structure(self.originals[name]):
                self.applied.pop(name, None)
                self.restored[name] = digest(actual.encode())
            else:
                raise ValueError("Recovery refused: target has concurrent drift")
        self.check()
        for name in reversed(self.attempted):
            if name not in self.applied:
                continue
            self.check()
            etag = self.target(name, self.proposed[name])
            actual_hash, status = self.update(name, self.originals[name], etag)
            self.restored[name] = actual_hash
            del self.applied[name]
            self.receipt["rollback"].append({"operation": name, "restoredAtUtc": now(), "status": status,
                                             "restoredPolicySha256": actual_hash, "originalStructureVerified": True})
            self.save("documents-routing-repair-applied-receipt.json")
        self.receipt["rollbackVerified"] = not self.applied and not self.ambiguous
        self.receipt["afterRollback"] = self.check()

    def execute(self, apply=False):
        before = self.check(capture=True)
        self.receipt["before"] = before
        self.receipt["anonymousBoundariesBefore"] = self.boundary()
        if not apply:
            self.receipt["inspectionVerified"] = True
            self.save("documents-routing-repair-inspection.json")
            return self.receipt
        require(not (HERE / "documents-routing-repair-applied-receipt.json").exists(),
                "An existing apply receipt requires review; automatic rerun is refused")
        self.receipt["operation"] = "apply exact reviewed seven existing operation policies"
        self.save("documents-routing-repair-applied-receipt.json")
        try:
            for name in ORDER:
                preflight = self.check()
                etag = self.target(name, self.originals[name])
                self.attempted.append(name)
                actual_hash, status = self.update(name, self.proposed[name], etag)
                self.applied[name] = actual_hash
                self.receipt["changes"].append({"operation": name, "method": self.changes[name]["method"],
                    "urlTemplate": self.changes[name]["urlTemplate"], "policyResourceId": self.changes[name]["policyResourceId"],
                    "originalPolicySha256": self.changes[name]["currentPolicySha256"],
                    "reviewedProposedPolicySha256": self.changes[name]["proposedPolicySha256"],
                    "readbackPolicySha256": actual_hash, "etagConditionalUpdate": True, "putStatus": status,
                    "onlyReviewedNodeInserted": True, "appliedAtUtc": now(), "preflight": preflight})
                self.save("documents-routing-repair-applied-receipt.json")
                print(json.dumps({"operation": name, "configurationReadbackVerified": True, "appliedAtUtc": now()}), flush=True)
            self.receipt["after"] = self.check()
            self.receipt["anonymousBoundariesAfter"] = self.boundary()
            self.receipt["configurationVerified"] = len(self.applied) == 7
            self.receipt["protectedAppsAfter"] = self.receipt["after"]["protectedApps"]
            self.receipt["allAppsAfter"] = self.receipt["after"]["allApps"]
            self.save("documents-routing-repair-applied-receipt.json")
        except Exception as failure:
            # Fixed categories only: no Azure response, credentials or values.
            self.receipt["failureCategory"] = type(failure).__name__
            self.receipt["configurationVerified"] = False
            try:
                self.rollback()
            except Exception as recovery:
                self.receipt["rollbackVerified"] = False
                self.receipt["rollbackFailureCategory"] = type(recovery).__name__
                self.receipt["manualReviewRequired"] = True
            self.save("documents-routing-repair-applied-receipt.json")
            raise ValueError("Apply verification failed; inspect sanitized receipt and guarded recovery state") from None
        return self.receipt


class PolicyTransportError(Exception):
    """Unknown management write outcome; body and credentials are suppressed."""


def self_test():
    _, _, changes, originals, proposed = load_review()
    for name in ORDER:
        validate_insertion(originals[name], proposed[name], changes[name])
    require(structure('<policies><inbound><base /></inbound></policies>') ==
            structure('<policies>\n <inbound>\n<base/>\n</inbound>\n</policies>'), "Whitespace canonicalization failed")
    bad = [proposed["capabilities"].replace(BACKEND, BACKEND + "/api/v1/documents"),
           proposed["capabilities"].replace('copy-unmatched-params="true"', 'copy-unmatched-params="false"'),
           proposed["capabilities"].replace('<base />', '<base /><set-header name="Authorization" exists-action="delete" />', 1),
           proposed["capabilities"].replace('<set-backend-service', '<set-backend-service extra="value"')]
    for value in bad:
        rejected = False
        try:
            validate_insertion(originals["capabilities"], value, changes["capabilities"])
        except ValueError:
            rejected = True
        require(rejected, "Unsafe policy variation was accepted")
    print(json.dumps({"offlineSelfTestVerified": True, "frozenOperationsValidated": 7, "unsafeVariationsRejected": len(bad)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        require(not args.apply, "Self-test cannot apply")
        self_test()
    else:
        result = Repair().execute(args.apply)
        print(json.dumps({"inspectionVerified": result.get("inspectionVerified", False),
                          "configurationVerified": result["configurationVerified"],
                          "functionalVerified": result["functionalVerified"],
                          "changedOperations": len(result["changes"]),
                          "receipt": "documents-routing-repair-applied-receipt.json" if args.apply else "documents-routing-repair-inspection.json"}))
