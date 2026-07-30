#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fail() { echo "ERROR: $*" >&2; exit 1; }
command -v python3 >/dev/null || fail "python3 is required"

python3 - "$ROOT" <<'PY'
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])
pipelines = {
    "auth": root / "azure-pipelines-auth-service.yml",
    "user-chef": root / "azure-pipelines-user-chef-service.yml",
    "catalog": root / "azure-pipelines-catalog-service.yml",
    "order": root / "azure-pipelines-order-service.yml",
    "subscription": root / "azure-pipelines-subscription-service.yml",
    "integration": root / "azure-pipelines-integration-service.yml",
    "notification": root / "azure-pipelines-notification-service.yml",
}
common_required = (
    "trigger: none",
    "pr: none",
    "versionSpec: '21'",
    "mvn -B -ntp clean verify",
    "docker build --pull",
    "docker push",
    "PREVIOUS_REVISION",
    "PREVIOUS_IMAGE",
    "LATEST_IMAGE",
    "latestReadyRevisionName",
    "properties.healthState",
    "Healthy",
    "/actuator/health",
    "Rollback image",
    "SPRING_DATASOURCE_PASSWORD=secretref:db-password",
)
required_by_service = {
    "auth": (
        "FIREBASE_SERVICE_ACCOUNT_JSON_BASE64=secretref:firebase-admin-json",
        "CRAVES_JWT_PRIVATE_KEY_PEM_BASE64=secretref:jwt-private-pem",
        "CRAVES_ADMIN_ACCOUNT_INTERVENTION_API_ENABLED=false",
        "CRAVES_ADMIN_ACCOUNT_INTERVENTION_FIREBASE_WORKER_ENABLED=false",
        "CRAVES_TOKEN_REVOCATION_PUBLISHER_ENABLED=false",
        "CRAVES_AUTH_RATE_LIMIT_ENABLED=false",
    ),
    "user-chef": (
        "CRAVES_JWT_VERIFICATION_PEM_BASE64=secretref:jwt-verify-pem",
        "CRAVES_NOTIFICATION_DIRECT_DISPATCH_ENABLED=false",
        "CRAVES_NOTIFICATION_OUTBOX_DISPATCHER_ENABLED=false",
        "CRAVES_TOKEN_REVOCATION_ENABLED=false",
    ),
    "catalog": (
        "CRAVES_JWT_VERIFICATION_PEM_BASE64=secretref:jwt-verify-pem",
        "CRAVES_TOKEN_REVOCATION_ENABLED=false",
    ),
    "order": (
        "CRAVES_JWT_VERIFICATION_PEM_BASE64=secretref:jwt-verify-pem",
        "CRAVES_NOTIFICATION_DIRECT_DISPATCH_ENABLED=false",
        "CRAVES_CHEF_ACCEPTANCE_WORKER_ENABLED=false",
        "CRAVES_REFUND_STATUS_CONSUMER_ENABLED=false",
        "CRAVES_DELIVERY_STATUS_CONSUMER_ENABLED=false",
        "CRAVES_SUBSCRIPTION_ORDER_CONSUMER_ENABLED=false",
        "CRAVES_DOMAIN_EVENT_SERVICE_BUS_ENABLED=false",
    ),
    "subscription": (
        "CRAVES_JWT_VERIFICATION_PEM_BASE64=secretref:jwt-verify-pem",
        "CRAVES_SUBSCRIPTION_OCCURRENCE_GENERATOR_ENABLED=false",
        "CRAVES_SUBSCRIPTION_BILLING_GENERATOR_ENABLED=false",
        "CRAVES_SUBSCRIPTION_PAYMENT_STATUS_CONSUMER_ENABLED=false",
        "CRAVES_SUBSCRIPTION_ORDER_REQUEST_WORKER_ENABLED=false",
    ),
    "integration": (
        "CRAVES_JWT_VERIFICATION_PEM_BASE64=secretref:jwt-verify-pem",
        "CRAVES_PAYMENT_ORDER_API_ENABLED=false",
        "CRAVES_CASHFREE_WEBHOOK_INGRESS_ENABLED=false",
        "CRAVES_DELIVERY_PROVIDER_EXECUTION_ENABLED=false",
        "CRAVES_REFUND_PROVIDER_EXECUTION_ENABLED=false",
        "CRAVES_SUBSCRIPTION_PAYMENT_CONSUMER_ENABLED=false",
        "BORZO_API_ENABLED=false",
    ),
    "notification": (
        "CRAVES_JWT_VERIFICATION_PEM_BASE64=secretref:jwt-verify-pem",
        "CRAVES_SERVICEBUS_ENABLED=false",
        "CRAVES_NOTIFICATION_DELIVERY_WORKER_ENABLED=false",
        "CRAVES_NOTIFICATION_PUSH_ENABLED=false",
        "CRAVES_NOTIFICATION_EMAIL_ENABLED=false",
        "CRAVES_NOTIFICATION_RECOVERY_API_ENABLED=false",
    ),
}
for service, path in pipelines.items():
    if not path.is_file():
        raise SystemExit(f"ERROR: Missing deployment pipeline for {service}: {path.name}")
    text = path.read_text(encoding="utf-8")
    for token in common_required + required_by_service[service]:
        if token not in text:
            raise SystemExit(f"ERROR: {path.name} lacks required deployment contract token: {token}")
    if "-DskipTests" in text or "maven.test.skip" in text:
        raise SystemExit(f"ERROR: {path.name} skips tests")
    if re.search(r"SPRING_DATASOURCE_PASSWORD=['\"]?\$\(", text):
        raise SystemExit(f"ERROR: {path.name} passes the database password as plaintext environment data")
    if re.search(r"CRAVES_JWT_(?:VERIFICATION|PRIVATE)_KEY_PEM_BASE64=['\"]?\$\(", text):
        raise SystemExit(f"ERROR: {path.name} passes JWT key material as plaintext environment data")
    if "--no-wait" not in text:
        raise SystemExit(f"ERROR: {path.name} does not use an explicit asynchronous revision followed by polling")
    print(f"DEPLOYMENT_CONTRACT_OK {service}={path.name}")

print("SUCCESS: All seven service deployment pipelines enforce tests, secret references, fail-closed flags and healthy revision evidence.")
PY
