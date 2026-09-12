#!/usr/bin/env python3
"""Read-only deployment gate. Credentials remain in memory; no delivery is created."""
import argparse
import importlib.util
import json
import pathlib
import time

spec = importlib.util.spec_from_file_location("pidge_ops", pathlib.Path(__file__).with_name("pidge-production-acceptance.py"))
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=["preflight", "postflight"], required=True)
    args = parser.parse_args()
    rg, app_name = "rg-craves-prodlow-centralindia", "ca-craves-integration-service-pr"
    app = json.loads(ops.az("containerapp", "show", "-g", rg, "-n", app_name, "-o", "json"))
    env = {e["name"]: e for e in app["properties"]["template"]["containers"][0]["env"]}
    assert env.get("CRAVES_DELIVERY_INTELLIGENCE_ENABLED", {}).get("value") == "true", "Delivery intelligence must already be enabled"
    assert env.get("CRAVES_DELIVERY_FEEDBACK_ENABLED", {}).get("value", "true") == "true", "Feedback runtime override is disabled"
    print("FEEDBACK_RUNTIME", json.dumps({"phase": args.phase,
        "image": app["properties"]["template"]["containers"][0]["image"],
        "revision": app["properties"]["latestReadyRevisionName"],
        "minReplicas": app["properties"]["template"].get("scale", {}).get("minReplicas"),
        "maxReplicas": app["properties"]["template"].get("scale", {}).get("maxReplicas")}), flush=True)
    if args.phase == "preflight":
        return
    refs = json.loads(ops.az("containerapp", "secret", "list", "-g", rg, "-n", app_name, "-o", "json"))
    secret_ref = env["CRAVES_INTERNAL_SERVICE_KEY"]["secretRef"]
    secret_url = next(r["keyVaultUrl"] for r in refs if r["name"] == secret_ref)
    assert secret_url.startswith("https://kvcravesprodlowl3ing6.vault.azure.net/secrets/")
    secret = ops.az("keyvault", "secret", "show", "--id", secret_url, "--query", "value", "-o", "tsv")
    base = "https://" + app["properties"]["configuration"]["ingress"]["fqdn"]
    url = base + "/internal/v1/delivery-intelligence/feedback/readiness"
    try:
        ops.http(url, {"X-Craves-Internal-Secret": "invalid-feedback-verification"})
        raise AssertionError("Feedback readiness accepted an invalid credential")
    except ops.HttpFailure as exc:
        assert exc.status == 401, "Unexpected readiness authentication response"
    headers = {"X-Craves-Internal-Secret": secret}
    previous = None
    for _ in range(15):
        state = ops.http(url, headers)
        assert state["enabled"] and state["capture_enabled"], "Feedback processing or capture is disabled"
        assert state["dead_letters_capped"] == 0, "Feedback dead letters require investigation"
        poll = state.get("lastSuccessfulPoll")
        if previous and poll and poll != previous:
            pidge = ops.http(base + "/internal/v1/delivery-provider-readiness/pidge", headers)
            assert pidge["productionReady"] and pidge["catalogActive"], "Pidge activation was not preserved"
            print("DELIVERY_FEEDBACK_PRODUCTION_VERIFIED", json.dumps(state), flush=True)
            print("PIDGE_ACTIVATION_PRESERVED", json.dumps(pidge), flush=True)
            return
        previous = poll
        time.sleep(3)
    raise RuntimeError("No advancing feedback worker heartbeat was observed")

if __name__ == "__main__":
    main()
