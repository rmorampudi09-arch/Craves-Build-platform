#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
SUB_APP="${SUB_APP:-ca-craves-subscription-service-p}"
APIM_HOST="${APIM_HOST:-apim-craves-prodlow-l3ing6.azure-api.net}"
API_ID="craves-subscriptions-v1"
API_VERSION="2022-08-01"

fail() { echo "ERROR: $*" >&2; exit 1; }
for tool in az jq curl; do command -v "$tool" >/dev/null || fail "$tool is required"; done

SUBSCRIPTION_ID="$(az account show --query id -o tsv --only-show-errors)"
[[ -n "$SUBSCRIPTION_ID" ]] || fail "Azure subscription ID could not be resolved"

SUB_FQDN="$(az containerapp show \
  --resource-group "$RG" \
  --name "$SUB_APP" \
  --query 'properties.configuration.ingress.fqdn' \
  -o tsv \
  --only-show-errors)"
[[ -n "$SUB_FQDN" ]] || fail "Subscription Service FQDN could not be resolved"

EXPECTED_PATH="api/v1/subscriptions"
EXPECTED_SERVICE_URL="https://${SUB_FQDN}/api/v1/subscriptions"
MGMT_BASE="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/apis"

API_JSON="$(az rest \
  --method get \
  --url "${MGMT_BASE}/${API_ID}?api-version=${API_VERSION}" \
  -o json)"

ACTUAL_PATH="$(jq -r '.properties.path // ""' <<<"$API_JSON")"
ACTUAL_SERVICE_URL="$(jq -r '.properties.serviceUrl // ""' <<<"$API_JSON")"
SUB_REQUIRED="$(jq -r '.properties.subscriptionRequired // false' <<<"$API_JSON")"

[[ "$ACTUAL_PATH" == "$EXPECTED_PATH" ]] || fail "APIM path mismatch: expected=$EXPECTED_PATH actual=$ACTUAL_PATH"
[[ "$ACTUAL_SERVICE_URL" == "$EXPECTED_SERVICE_URL" ]] || fail "APIM backend mismatch: expected=$EXPECTED_SERVICE_URL actual=$ACTUAL_SERVICE_URL"
[[ "$SUB_REQUIRED" == "false" ]] || fail "APIM subscriptionRequired must be false"
echo "PASS: core Subscription API points to the current Subscription Service"

OPS_JSON="$(az rest \
  --method get \
  --url "${MGMT_BASE}/${API_ID}/operations?api-version=${API_VERSION}" \
  -o json)"

require_operation() {
  local OP_ID="$1" METHOD="$2" TEMPLATE="$3"
  local COUNT
  COUNT="$(jq --arg id "$OP_ID" --arg method "$METHOD" --arg template "$TEMPLATE" \
    '[.value[] | select(.name == $id and .properties.method == $method and .properties.urlTemplate == $template)] | length' \
    <<<"$OPS_JSON")"
  [[ "$COUNT" == "1" ]] || fail "Missing or incorrect APIM operation: $OP_ID $METHOD $TEMPLATE"
  echo "PASS: $OP_ID $METHOD $TEMPLATE"
}

require_operation "list-plans" "GET" "/plans"
require_operation "get-plan" "GET" "/plans/{planId}"
require_operation "create-subscription" "POST" "/"
require_operation "list-my-subscriptions" "GET" "/"
require_operation "get-subscription" "GET" "/{subscriptionId}"
require_operation "pause-subscription" "PATCH" "/{subscriptionId}/pause"
require_operation "cancel-subscription" "PATCH" "/{subscriptionId}/cancel"

PLANS_BODY="$(mktemp)"
trap 'rm -f "$PLANS_BODY"' EXIT
PLANS_CODE="$(curl \
  --silent \
  --show-error \
  --connect-timeout 10 \
  --max-time 30 \
  --output "$PLANS_BODY" \
  --write-out '%{http_code}' \
  "https://${APIM_HOST}/api/v1/subscriptions/plans" || true)"
[[ "$PLANS_CODE" == "200" ]] || {
  echo "Public plans response:" >&2
  head -c 1000 "$PLANS_BODY" >&2 || true
  echo >&2
  fail "Public Subscription plans route returned HTTP=$PLANS_CODE instead of 200"
}
jq -e 'type == "array"' "$PLANS_BODY" >/dev/null \
  || fail "Public Subscription plans route did not return a JSON array"
echo "PASS: APIM public subscription plans route -> HTTP 200 JSON array"

PROTECTED_BODY="$(mktemp)"
PROTECTED_CODE="$(curl \
  --silent \
  --show-error \
  --connect-timeout 10 \
  --max-time 30 \
  --output "$PROTECTED_BODY" \
  --write-out '%{http_code}' \
  "https://${APIM_HOST}/api/v1/subscriptions" || true)"
rm -f "$PROTECTED_BODY"
case "$PROTECTED_CODE" in
  401|403) echo "PASS: protected subscriptions root is routed and rejects an unauthenticated request with HTTP $PROTECTED_CODE" ;;
  *) fail "Protected subscriptions root returned HTTP=$PROTECTED_CODE; expected 401 or 403. A 404/5xx indicates a gateway/backend routing problem." ;;
esac

echo "============================================================"
echo "SUCCESS: CORE SUBSCRIPTIONS APIM STATUS PASSED"
echo "No Azure resource was changed by this status check."
echo "============================================================"
