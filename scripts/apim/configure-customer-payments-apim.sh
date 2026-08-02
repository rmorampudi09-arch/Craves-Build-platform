#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
INTEGRATION_APP="${INTEGRATION_APP:-ca-craves-integration-service-pr}"
API_PATH="${API_PATH:-api/v1/payments}"
NEW_API_ID="${NEW_API_ID:-craves-customer-payments-v1}"
API_VERSION="${API_VERSION:-2022-08-01}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
POLICY_TEMPLATE="$ROOT/infra/apim/customer-payments/customer-payment-policy.xml"

fail() { echo "ERROR: $*" >&2; exit 1; }
for tool in az jq curl sed; do command -v "$tool" >/dev/null || fail "$tool is required"; done
[[ -f "$POLICY_TEMPLATE" ]] || fail "Policy template is missing"
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
APP_JSON=$(az containerapp show -g "$RG" -n "$INTEGRATION_APP" -o json)
FQDN=$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$APP_JSON")
LATEST=$(jq -r '.properties.latestRevisionName // ""' <<<"$APP_JSON")
READY=$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$APP_JSON")
RUNNING=$(jq -r '.properties.runningStatus // ""' <<<"$APP_JSON")
[[ -n "$FQDN" && "$LATEST" == "$READY" && "$RUNNING" == "Running" ]] || fail "Integration Service is not ready"
curl -sS --fail --max-time 30 "https://$FQDN/actuator/health" >/dev/null

mapfile -t API_IDS < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${API_PATH}'].name" -o tsv)
(( ${#API_IDS[@]} <= 1 )) || fail "Multiple APIM APIs own $API_PATH"
BACKEND="https://${FQDN}/api/v1/payments"
if (( ${#API_IDS[@]} == 0 )); then
  az apim api create -g "$RG" --service-name "$APIM" --api-id "$NEW_API_ID" --display-name "Craves Customer Payments API" --path "$API_PATH" --service-url "$BACKEND" --protocols https --subscription-required false -o none
  API_ID="$NEW_API_ID"
else
  API_ID="${API_IDS[0]}"
  SUB_REQUIRED=$(az apim api show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --query subscriptionRequired -o tsv)
  [[ "${SUB_REQUIRED,,}" == "false" ]] || fail "Existing payment API requires a subscription key; this script will not relax it"
fi
MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/apis/${API_ID}"
for SCOPE_URL in "https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/policies/policy?api-version=${API_VERSION}" "${MGMT}/policies/policy?api-version=${API_VERSION}"; do
  POLICY=$(az rest --method get --url "$SCOPE_URL" --query properties.value -o tsv 2>/dev/null || true)
  [[ "$POLICY" != *'set-backend-service backend-id='* ]] || fail "Inherited backend-id policy cannot be safely overridden"
done

put_operation() {
  local ID="$1" METHOD="$2" TEMPLATE="$3" DISPLAY="$4" PARAMS="$5"
  local BODY RENDERED POLICY_BODY
  BODY=$(mktemp); RENDERED=$(mktemp); POLICY_BODY=$(mktemp)
  cat >"$BODY" <<JSON
{"properties":{"displayName":"$DISPLAY","method":"$METHOD","urlTemplate":"$TEMPLATE","templateParameters":$PARAMS,"responses":[{"statusCode":200,"description":"Owned customer payment response"},{"statusCode":401,"description":"Authentication required"},{"statusCode":404,"description":"Payment not found"}]}}
JSON
  az rest --method put --url "${MGMT}/operations/${ID}?api-version=${API_VERSION}" --body @"$BODY" -o none
  sed "s|__PAYMENT_BACKEND_URL__|${BACKEND}|g" "$POLICY_TEMPLATE" >"$RENDERED"
  jq -Rs '{properties:{format:"rawxml",value:.}}' "$RENDERED" >"$POLICY_BODY"
  az rest --method put --url "${MGMT}/operations/${ID}/policies/policy?api-version=${API_VERSION}" --body @"$POLICY_BODY" -o none
  rm -f "$BODY" "$RENDERED" "$POLICY_BODY"
}

PAYMENT_PARAM='[{"name":"paymentOrderId","type":"string","required":true}]'
put_operation "create-customer-payment-order" "POST" "/orders" "Create customer payment order" '[]'
put_operation "get-customer-payment-order" "GET" "/orders/{paymentOrderId}" "Get customer payment order" "$PAYMENT_PARAM"
put_operation "verify-customer-payment-order" "POST" "/orders/{paymentOrderId}/verify" "Verify customer payment order" "$PAYMENT_PARAM"

for ID in create-customer-payment-order get-customer-payment-order verify-customer-payment-order; do
  az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$ID" -o none
  POLICY=$(az rest --method get --url "${MGMT}/operations/${ID}/policies/policy?api-version=${API_VERSION}" --query properties.value -o tsv)
  [[ "$POLICY" == *"$BACKEND"* && "$POLICY" == *"Authorization"* && "$POLICY" == *"no-store"* ]] || fail "Operation $ID policy verification failed"
done

echo "SUCCESS: Customer payment operations configured on APIM API $API_ID. Webhook operations were not changed."
