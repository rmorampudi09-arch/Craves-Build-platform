#!/usr/bin/env python3
"""Verify Pidge; activation additionally requires a cancelled, unallocated callback canary.

Credentials stay in Key Vault/runtime memory. No fulfil/dispatch endpoint is called here.
The canary has its own durable claim and never changes an existing Craves order.
"""
import argparse
import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.request
import uuid


def az(*args):
    result = subprocess.run(["az", *args, "--only-show-errors"], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError("Azure operation failed: " + " ".join(args[:3]))
    return result.stdout.strip()


class HttpFailure(RuntimeError):
    def __init__(self, status, body):
        self.status = status
        self.body = body
        super().__init__("HTTP " + str(status))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def http(url, headers, body=None):
    req = urllib.request.Request(url, headers={"Content-Type": "application/json", **headers},
                                 data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=35) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        raise HttpFailure(exc.code, exc.read().decode(errors="replace")) from None


class Acceptance:
    def __init__(self, args):
        self.args = args
        self.refresh()
        refs = json.loads(az("containerapp", "secret", "list", "-g", args.resource_group,
                             "-n", args.app, "-o", "json"))
        self.refs = {r["name"]: r for r in refs}
        self.internal = self.secret("CRAVES_INTERNAL_SERVICE_KEY")
        self.webhook = self.secret("PIDGE_WEBHOOK_TOKEN")
        self.token = self.secret("PIDGE_API_AUTH_TOKEN")
        self.db_url = self.env["SPRING_DATASOURCE_URL"]["value"]
        assert self.db_url.startswith("jdbc:postgresql://"), "Unexpected database binding"
        self.pg = dict(os.environ, PGPASSWORD=self.secret("SPRING_DATASOURCE_PASSWORD"),
                       PGUSER=self.env["SPRING_DATASOURCE_USERNAME"]["value"])
        self.base = "https://" + self.app["properties"]["configuration"]["ingress"]["fqdn"]

    def refresh(self):
        self.app = json.loads(az("containerapp", "show", "-g", self.args.resource_group,
                                  "-n", self.args.app, "-o", "json"))
        self.env = {e["name"]: e for e in self.app["properties"]["template"]["containers"][0]["env"]}

    def secret(self, name):
        url = self.refs[self.env[name]["secretRef"]]["keyVaultUrl"]
        assert url.startswith("https://kvcravesprodlowl3ing6.vault.azure.net/secrets/"), "Unexpected secret origin"
        return az("keyvault", "secret", "show", "--id", url, "--query", "value", "-o", "tsv")

    def sql(self, sql):
        result = subprocess.run(["psql", self.db_url[5:], "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
                                env=self.pg, capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError("Pidge database operation failed")
        return result.stdout.strip()

    def readiness(self):
        return http(self.base + "/internal/v1/delivery-provider-readiness/pidge",
                    {"X-Craves-Internal-Secret": self.internal})

    def vendor(self, path, body=None):
        assert path.startswith("/") and ".." not in path
        token = self.token if self.token.lower().startswith("bearer ") else "Bearer " + self.token
        return http("https://api.pidge.in/v1.0/store/channel/vendor" + path,
                    {"Authorization": token}, body)

    def diagnostic_error(self, label, exc, route):
        # Only error messages/codes are reported, with all request strings and secrets removed.
        try:
            data = json.loads(exc.body)
        except ValueError:
            data = {}
        messages = []
        def collect(value):
            if isinstance(value, dict):
                for key, item in value.items():
                    if key in ("message", "code", "error", "description") and isinstance(item, (str, int)):
                        messages.append(str(item))
                    elif isinstance(item, (dict, list)):
                        collect(item)
            elif isinstance(value, list):
                for item in value:
                    collect(item)
        collect(data)
        result = " | ".join(messages)
        def redact(value):
            nonlocal result
            if isinstance(value, str) and len(value) > 2:
                result = result.replace(value, "[redacted]")
            elif isinstance(value, dict):
                for item in value.values():
                    redact(item)
            elif isinstance(value, list):
                for item in value:
                    redact(item)
        redact(route)
        for secret in (self.internal, self.webhook, self.token):
            result = result.replace(secret, "[redacted]")
        result = re.sub(r"[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+|[0-9]{6,}|[A-Za-z0-9_-]{40,}", "[redacted]", result)
        print(label, exc.status, result[:700], flush=True)

    def diagnose_quote(self, route, exc):
        self.diagnostic_error("INTEGRATION_QUOTE_ERROR", exc, route)
        print("ROUTE_REQUIREMENTS", json.dumps({"thermoboxRequired": route.get("thermoboxRequired"),
              "totalWeightGrams": route.get("totalWeightGrams"), "paymentCollectionMode": route.get("paymentCollectionMode")}), flush=True)
        def location(stop):
            return {"coordinates": {"latitude": stop["latitude"], "longitude": stop["longitude"]}, "pincode": stop["postalCode"]}
        try:
            response = self.vendor("/quote", {"pickup": location(route["pickup"]), "drop": [{"ref": "craves-pidge-diagnostic",
                "location": location(route["dropoff"]), "attributes": {"cod_amount": 0, "weight": route["totalWeightGrams"]}}]})
            items = response.get("data", {}).get("items", [])
            print("DIRECT_PROVIDER_QUOTE", json.dumps({"dataKeys": list(response.get("data", {})),
                  "items": [{k: i.get(k) for k in ("network_id", "service", "pickup_now", "quote")} for i in items]}), flush=True)
        except HttpFailure as provider_exc:
            self.diagnostic_error("DIRECT_PROVIDER_QUOTE_ERROR", provider_exc, route)

    def check(self):
        state = self.readiness()
        print("READINESS", json.dumps(state), flush=True)
        if state["productionReady"]:
            return None
        allowed = {"PIDGE_CREATE_DISABLED", "AUTHENTICATED_WEBHOOK_NOT_VERIFIED", "PROVIDER_CATALOG_INACTIVE"}
        assert set(state["blockers"]) <= allowed, "Runtime prerequisites are incomplete"
        for name in ("CRAVES_DELIVERY_COMMAND_ENABLED", "CRAVES_DELIVERY_RECONCILIATION_ENABLED",
                     "CRAVES_DELIVERY_WEBHOOK_PROCESSING_ENABLED", "CRAVES_DELIVERY_TRACKING_RECONCILIATION_ENABLED",
                     "CRAVES_DELIVERY_STATUS_PUBLISHER_ENABLED", "PIDGE_MANUAL_ALLOCATION_VERIFIED"):
            assert self.env.get(name, {}).get("value") == "true", name + " is not enabled"
        consumer = az("containerapp", "show", "-g", self.args.resource_group, "-n", "ca-craves-order-service-prodlow",
                      "--query", "properties.template.containers[0].env[?name=='CRAVES_DELIVERY_STATUS_CONSUMER_ENABLED'].value | [0]", "-o", "tsv")
        print("ORDER_STATUS_CONSUMER_ENABLED", consumer, flush=True)
        assert consumer == "true", "Order Service delivery status consumer is not enabled"
        command_id = str(uuid.UUID(self.args.route_command_id))
        data = self.sql("SELECT payload->'deliveryRequest' FROM delivery_schema.delivery_command WHERE id='" + command_id + "'")
        assert data, "Selected real Craves route is unavailable"
        route = json.loads(data)
        for stop in (route["pickup"], route["dropoff"]):
            assert stop["city"].strip().lower() == "hyderabad", "Canary is limited to Hyderabad"
            assert re.fullmatch(r"[1-9][0-9]{5}", stop["postalCode"]), "Real pincode required"
        assert route["paymentCollectionMode"].upper() == "PREPAID" and route["totalWeightGrams"] > 0
        for label, token, expected in (("UNAUTHORIZED", "invalid-pidge-probe", 401), ("AUTHENTICATED_EMPTY", self.webhook, 400)):
            try:
                http("https://api.craves.in/api/v1/webhooks/delivery/pidge", {"Authorization": "Bearer " + token}, {})
                raise RuntimeError("Invalid callback was accepted")
            except HttpFailure as exc:
                print(label + "_CALLBACK_HTTP", exc.status, flush=True)
                assert exc.status == expected, "Callback authentication does not match the configured secret"
        try:
            quote = http(self.base + "/internal/v1/delivery-provider-readiness/pidge/quote",
                         {"X-Craves-Internal-Secret": self.internal}, route)
        except HttpFailure as exc:
            self.diagnose_quote(route, exc)
            raise
        print("LIVE_QUOTE", json.dumps({k: quote.get(k) for k in ("available", "deliveryFeeAmount", "currency", "warnings", "providerMetadata")}), flush=True)
        assert quote["available"] and quote["providerMetadata"].get("pickup_now") is True, "No immediate Pidge partner is available"
        return route

    @staticmethod
    def stop(stop):
        phone = re.sub(r"[ ()-]", "", stop["contactPhone"]).removeprefix("+91")
        assert re.fullmatch(r"[6-9][0-9]{9}", phone), "Valid Indian mobile required"
        return {"name": stop["contactName"], "mobile": phone,
                "address": {"address_line_1": stop.get("addressLine1") or stop["address"],
                            "city": stop["city"], "state": stop["state"], "country": "India",
                            "pincode": stop["postalCode"], "latitude": stop["latitude"], "longitude": stop["longitude"]}}

    def callback_canary(self, route):
        # A new UUID claim commits before the sole create. No retry or fulfilment is possible.
        reference = "craves-pidge-canary-" + str(uuid.uuid4())
        assert self.sql("INSERT INTO delivery_schema.pidge_booking(client_reference,state) VALUES ('" + reference + "','ATTEMPTING') RETURNING client_reference").splitlines()[0] == reference
        sender = self.stop(route["pickup"])
        trip = {"receiver_detail": self.stop(route["dropoff"]), "source_order_id": reference,
                "reference_id": reference, "order_category": "food", "cod_amount": 0,
                "bill_amount": route["declaredGoodsValue"],
                "packages": [{"label": "CRAVES API VERIFICATION - DO NOT DISPATCH", "quantity": 1,
                              "dead_weight": route["totalWeightGrams"]}],
                "products": [{"name": i["itemName"], "sku": str(i.get("menuItemId") or i["itemName"]),
                              "price": i["unitPrice"], "quantity": i["quantity"]} for i in route["items"]]}
        print("CANARY_REFERENCE", reference, flush=True)
        try:
            response = self.vendor("/order", {"channel": self.env["PIDGE_CHANNEL"]["value"],
                                               "sender_detail": sender, "poc_detail": {k: sender[k] for k in ("name", "mobile")},
                                               "trips": [trip]})
            order_id = str(response.get("data", {}).get(reference, ""))
            assert re.fullmatch(r"[A-Za-z0-9_-]{1,200}", order_id), "Uncertain create: no Pidge order ID; do not retry"
        except Exception:
            print("CANARY_CREATE_UNCERTAIN - preserve the journal; do not retry or dispatch", flush=True)
            raise
        self.sql("UPDATE delivery_schema.pidge_booking SET provider_order_id='" + order_id + "',state='CREATED',updated_at=now() WHERE client_reference='" + reference + "'")
        print("CANARY_ORDER_ID", order_id, flush=True)
        order = self.vendor("/order/" + order_id)["data"]
        assert str(order.get("id")) == order_id
        manual = str(order.get("status")).upper() in ("PENDING", "1")
        # Cancellation must be confirmed even if the callback is delayed or unavailable.
        self.vendor("/" + order_id + "/cancel", {})
        cancelled = self.vendor("/order/" + order_id)["data"]
        assert str(cancelled.get("id")) == order_id and str(cancelled.get("status")).upper() in ("CANCELLED", "0"), "Canary cancellation not confirmed"
        self.sql("UPDATE delivery_schema.pidge_booking SET state='CANCELLED',updated_at=now() WHERE client_reference='" + reference + "'")
        assert manual, "Channel auto-allocation was detected; canary cancelled and activation blocked"
        for _ in range(18):
            count = int(self.sql("SELECT count(*) FROM delivery_schema.delivery_webhook_inbox WHERE provider_id='pidge' AND raw_payload->>'id'='" + order_id + "' AND received_at>now()-interval '10 minutes'"))
            if count:
                print("PROVIDER_ORIGIN_CALLBACK_VERIFIED", count, "CANARY_CANCELLED", flush=True)
                return
            time.sleep(5)
        raise RuntimeError("No authenticated Pidge-origin callback arrived; activation remains off")

    def activate(self):
        assert self.args.confirm_activation.lower() == "true", "Explicit production activation confirmation required"
        route = self.check()
        if route is None:
            print("PIDGE_ALREADY_ACTIVE_AND_READY")
            return
        pending = int(self.sql("SELECT count(*) FROM delivery_schema.delivery_command WHERE status NOT IN ('COMPLETED','FAILED','DEAD_LETTER','CANCELLED')"))
        assert pending == 0, "Pending command backlog requires review before activation"
        self.callback_canary(route)
        original_image = self.app["properties"]["template"]["containers"][0]["image"]
        previous_revision = self.app["properties"]["latestRevisionName"]
        az("containerapp", "update", "-g", self.args.resource_group, "-n", self.args.app,
           "--set-env-vars", "PIDGE_WEBHOOK_VERIFIED=true", "PIDGE_CREATE_ENABLED=true",
           "PIDGE_PRODUCTION_ACTIVATION_APPROVED=true", "--no-wait", "-o", "none")
        for _ in range(150):
            self.refresh()
            props = self.app["properties"]
            assert props["template"]["containers"][0]["image"] == original_image, "Concurrent application deployment detected"
            if props["latestRevisionName"] != previous_revision and props["latestReadyRevisionName"] == props["latestRevisionName"] and self.env.get("PIDGE_CREATE_ENABLED", {}).get("value") == "true":
                break
            time.sleep(10)
        else:
            raise RuntimeError("Pidge activation revision did not become ready; catalog remains inactive")
        self.sql("UPDATE delivery_schema.delivery_provider SET is_active=true,updated_at=now() WHERE provider_id='pidge'")
        state = self.readiness()
        if not state["productionReady"]:
            self.sql("UPDATE delivery_schema.delivery_provider SET is_active=false,updated_at=now() WHERE provider_id='pidge'")
            raise RuntimeError("Pidge readiness failed after catalog activation; routing deactivated")
        print("PIDGE_PRODUCTION_ACTIVATED", json.dumps(state), flush=True)
        print("First real fulfilled delivery remains a separate production acceptance observation.")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--resource-group", required=True)
    p.add_argument("--app", required=True)
    p.add_argument("--operation", choices=("check", "activate"), required=True)
    p.add_argument("--route-command-id", required=True)
    p.add_argument("--confirm-activation", default="false")
    args = p.parse_args()
    assert args.resource_group == "rg-craves-prodlow-centralindia" and args.app == "ca-craves-integration-service-pr", "Unexpected production target"
    if args.operation == "activate":
        assert args.confirm_activation.lower() == "true", "Explicit activation confirmation required"
    Acceptance(args).activate() if args.operation == "activate" else Acceptance(args).check()


if __name__ == "__main__":
    try:
        main()
    except HttpFailure as exc:
        print("PIDGE_CHECK_FAILED_HTTP", exc.status, flush=True)
        raise SystemExit(1)
