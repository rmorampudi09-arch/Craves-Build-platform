#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
ORDER_APP="${ORDER_APP:-ca-craves-order-service-prodlow}"
API_PATH="${API_PATH:-api/v1/orders}"
API_VERSION="${API_VERSION:-2022-08-01}"
OPERATION_ID="get-customer-order-timeline"
URL_TEMPLATE="/{orderId}/timeline"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
POLICY_TEMPLATE="$ROOT/infra/apim/order-customer-read/order-customer-read-policy.xml"

fail() { echo "ERROR: $*" >&2; exit 1; }
for tool in az jq curl sed; do command -v "$tool" >/dev/null || fail "$tool is required"; done
[[ -f "$POLICY_TEMPLATE" ]] || fail "Existing order-read policy template is missing"

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
APP_JSON="$(az containerapp show -g "$RG" -n "$ORDER_APP" -o json)"
FQDN="$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$APP_JSON")"
LATEST="$(jq -r '.properties.latestRevisionName // ""' <<<"$APP_JSON")"
READY="$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$APP_JSON")"
RUNNING="$(jq -r '.properties.runningStatus // ""' <<<"$APP_JSON")"
[[ -n "$FQDN" && "$LATEST" == "$READY" && "$RUNNING" == "Running" ]] || fail "Order Service is not ready"
curl -sS --fail --max-time 30 "https://${FQDN}/actuator/health" >/dev/null

mapfile -t API_IDS < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${API_PATH}'].name" -o tsv)
(( ${#API_IDS[@]} == 1 )) || fail "Expected exactly one APIM API at ${API_PATH}; found ${#API_IDS[@]}"
API_ID="${API_IDS[0]}"
SUB_REQUIRED="$(az apim api show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --query subscriptionRequired -o tsv)"
[[ "${SUB_REQUIRED,,}" == "false" ]] || fail "Existing Order API requires a subscription key; refusing to change its security model"

mapfile -t COLLISIONS < <(az apim api operation list -g "$RG" --service-name "$APIM" --api-id "$API_ID" --query "[?urlTemplate=='${URL_TEMPLATE}' && name!='${OPERATION_ID}'].name" -o tsv)
(( ${#COLLISIONS[@]} == 0 )) || fail "Another APIM operation already owns ${URL_TEMPLATE}: ${COLLISIONS[*]}"

MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/apis/${API_ID}"
for SCOPE_URL in \
  "https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/policies/policy?api-version=${API_VERSION}" \
  "${MGMT}/policies/policy?api-version=${API_VERSION}"; do
  POLICY="$(az rest --method get --url "$SCOPE_URL" --query properties.value -o tsv 2>/dev/null || true)"
  [[ "$POLICY" != *'set-backend-service backend-id='* ]] || fail "Inherited backend-id policy cannot be safely overridden"
done

BACKEND="https://${FQDN}/api/v1/orders"
BODY="$(mktemp)"
RENDERED="$(mktemp)"
POLICY_BODY="$(mktemp)"
cleanup() { rm -f "$BODY" "$RENDERED" "$POLICY_BODY"; }
trap cleanup EXIT

cat >"$BODY" <<JSON
{"properties":{"displayName":"Get customer order timeline","method":"GET","urlTemplate":"${URL_TEMPLATE}","templateParameters":[{"name":"orderId","type":"string","required":true}],"responses":[{"statusCode":200,"description":"Customer-owned order timeline"},{"statusCode":401,"description":"Authentication required"},{"statusCode":404,"description":"Order not found"}]}}
JSON
az rest --method put --url "${MGMT}/operations/${OPERATION_ID}?api-version=${API_VERSION}" --body @"$BODY" -o none

sed "s|__ORDER_READ_BACKEND_URL__|${BACKEND}|g" "$POLICY_TEMPLATE" >"$RENDERED"
jq -Rs '{properties:{format:"rawxml",value:.}}' "$RENDERED" >"$POLICY_BODY"
az rest --method put --url "${MGMT}/operations/${OPERATION_ID}/policies/policy?api-version=${API_VERSION}" --body @"$POLICY_BODY" -o none

METHOD="$(az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$OPERATION_ID" --query method -o tsv)"
TEMPLATE="$(az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$OPERATION_ID" --query urlTemplate -o tsv)"
POLICY="$(az rest --method get --url "${MGMT}/operations/${OPERATION_ID}/policies/policy?api-version=${API_VERSION}" --query properties.value -o tsv)"
[[ "$METHOD" == "GET" && "$TEMPLATE" == "$URL_TEMPLATE" ]] || fail "Order timeline operation verification failed"
[[ "$POLICY" == *"$BACKEND"* && "$POLICY" == *"Authorization"* && "$POLICY" == *"no-store"* ]] || fail "Order timeline policy verification failed"

echo "SUCCESS: Added only ${URL_TEMPLATE} to existing Order API ${API_ID}."
