#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
INTEGRATION_APP="${INTEGRATION_APP:-ca-craves-integration-service-pr}"
API_ID="${API_ID:-craves-admin-operational-investigations-v1}"
API_PATH="${API_PATH:-api/v1/admin/operations}"
API_VERSION="${API_VERSION:-2022-08-01}"
CONFIRM_APIM_WRITE="${CONFIRM_APIM_WRITE:-false}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
POLICY_TEMPLATE="$ROOT/infra/apim/admin-operational-investigations/authenticated-policy.xml"

fail() { echo "ERROR: $*" >&2; exit 1; }
for tool in az jq curl sed; do command -v "$tool" >/dev/null || fail "$tool is required"; done
[[ -f "$POLICY_TEMPLATE" ]] || fail "APIM policy template is missing"
[[ "${CONFIRM_APIM_WRITE,,}" == "true" ]] || fail "Set CONFIRM_APIM_WRITE=true for the controlled APIM write"

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
[[ -n "$SUBSCRIPTION_ID" ]] || fail "Azure subscription could not be resolved"

APP_JSON=$(az containerapp show -g "$RG" -n "$INTEGRATION_APP" -o json --only-show-errors)
FQDN=$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$APP_JSON")
LATEST=$(jq -r '.properties.latestRevisionName // ""' <<<"$APP_JSON")
READY=$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$APP_JSON")
[[ -n "$FQDN" && "$LATEST" == "$READY" ]] || fail "Integration Service is not ready for APIM binding"
curl --silent --show-error --fail --max-time 30 "https://$FQDN/actuator/health" >/dev/null
INTEGRATION_OPERATION_BASE="https://${FQDN}/api/v1/admin/operations"

API_MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/apis/${API_ID}"
az apim api show -g "$RG" --service-name "$APIM" --api-id "$API_ID" -o none --only-show-errors \
  || fail "Existing admin operational investigations API was not found; refusing to create another API"
SUB_REQUIRED=$(az apim api show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --query subscriptionRequired -o tsv --only-show-errors)
[[ "${SUB_REQUIRED,,}" == "false" ]] || fail "Existing admin operations API unexpectedly requires subscription keys"

put_operation() {
  local ID="$1" TEMPLATE="$2" DISPLAY="$3" PARAMETER="${4:-}"
  local BODY RENDERED POLICY_BODY
  BODY=$(mktemp); RENDERED=$(mktemp); POLICY_BODY=$(mktemp)
  if [[ -n "$PARAMETER" ]]; then
    jq -n --arg display "$DISPLAY" --arg template "$TEMPLATE" --arg parameter "$PARAMETER" \
      '{properties:{displayName:$display,method:"GET",urlTemplate:$template,templateParameters:[{name:$parameter,type:"string",required:true}],responses:[{statusCode:200,description:"Delivery intelligence administrator view"},{statusCode:400,description:"Invalid request"},{statusCode:401,description:"Authentication required"},{statusCode:403,description:"ADMIN access required"},{statusCode:404,description:"Delivery activity not found"}]}}' >"$BODY"
  else
    jq -n --arg display "$DISPLAY" --arg template "$TEMPLATE" \
      '{properties:{displayName:$display,method:"GET",urlTemplate:$template,templateParameters:[],responses:[{statusCode:200,description:"Delivery intelligence administrator summary"},{statusCode:400,description:"Invalid request"},{statusCode:401,description:"Authentication required"},{statusCode:403,description:"ADMIN access required"}]}}' >"$BODY"
  fi
  az rest --method put --url "${API_MGMT}/operations/${ID}?api-version=${API_VERSION}" --body @"$BODY" -o none
  sed "s|__BACKEND_URL__|${INTEGRATION_OPERATION_BASE}|g" "$POLICY_TEMPLATE" >"$RENDERED"
  jq -Rs '{properties:{format:"rawxml",value:.}}' "$RENDERED" >"$POLICY_BODY"
  az rest --method put --url "${API_MGMT}/operations/${ID}/policies/policy?api-version=${API_VERSION}" --body @"$POLICY_BODY" -o none
  rm -f "$BODY" "$RENDERED" "$POLICY_BODY"
}

put_operation "get-admin-delivery-intelligence-summary" "/delivery-intelligence/summary" "Delivery intelligence summary"
put_operation "get-admin-delivery-intelligence-order" "/delivery-intelligence/orders/{resourceId}" "Investigate delivery intelligence order" "resourceId"

verify_operation() {
  local ID="$1" POLICY OPERATION
  OPERATION=$(az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$ID" -o json --only-show-errors)
  [[ "$(jq -r '.method' <<<"$OPERATION")" == "GET" ]] || fail "$ID is not GET"
  POLICY=$(az rest --method get --url "${API_MGMT}/operations/${ID}/policies/policy?api-version=${API_VERSION}" --query properties.value -o tsv)
  [[ "$POLICY" == *"$INTEGRATION_OPERATION_BASE"* ]] || fail "$ID backend read-back failed"
  [[ "$POLICY" == *"Authorization"* && "$POLICY" == *"Bearer"* ]] || fail "$ID Bearer guard is missing"
  [[ "$POLICY" == *"no-store"* && "$POLICY" == *"nosniff"* ]] || fail "$ID response hardening is missing"
}
verify_operation "get-admin-delivery-intelligence-summary"
verify_operation "get-admin-delivery-intelligence-order"

GATEWAY_URL=$(az apim show -g "$RG" -n "$APIM" --query gatewayUrl -o tsv --only-show-errors)
[[ "$GATEWAY_URL" == https://* ]] || fail "APIM HTTPS gateway URL was not returned"
SMOKE_ID="00000000-0000-4000-8000-000000000001"
for URL in \
  "${GATEWAY_URL%/}/${API_PATH}/delivery-intelligence/summary?windowHours=24" \
  "${GATEWAY_URL%/}/${API_PATH}/delivery-intelligence/orders/${SMOKE_ID}"; do
  STATUS=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 30 "$URL")
  [[ "$STATUS" == "401" ]] || fail "Unauthenticated gateway guard returned HTTP $STATUS for $URL instead of 401"
done

echo "SUCCESS: Delivery Intelligence admin APIM operations are configured, authenticated and no-store hardened."
