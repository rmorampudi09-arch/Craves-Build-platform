#!/usr/bin/env bash
set -Eeuo pipefail
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

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
[[ -n "$SUBSCRIPTION_ID" ]] || fail "Azure subscription could not be resolved"

APP_JSON="$(az containerapp show -g "$RG" -n "$INTEGRATION_APP" -o json)"
INTEGRATION_FQDN="$(jq -r '.properties.configuration.ingress.fqdn // empty' <<<"$APP_JSON")"
LATEST="$(jq -r '.properties.latestRevisionName // empty' <<<"$APP_JSON")"
READY="$(jq -r '.properties.latestReadyRevisionName // empty' <<<"$APP_JSON")"
RUNNING="$(jq -r '.properties.runningStatus // empty' <<<"$APP_JSON")"
[[ -n "$INTEGRATION_FQDN" && "$LATEST" == "$READY" && "$RUNNING" == "Running" ]] || fail "Integration Service is not ready"
# The guarded deployment step has already verified the revision, traffic, and
# actuator liveness/readiness from the Container Apps control plane. This
# backend is consumed through APIM and its direct FQDN may reject public build
# agents, so a direct curl is not a valid APIM-registration prerequisite.
INTEGRATION_OPERATION_BASE="https://${INTEGRATION_FQDN}/api/v1/admin/operations"

API_MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/apis/${API_ID}"
mapfile -t PATH_OWNERS < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${API_PATH}'].name" -o tsv)
(( ${#PATH_OWNERS[@]} <= 1 )) || fail "Multiple APIM APIs own ${API_PATH}"

if (( ${#PATH_OWNERS[@]} == 0 )); then
  az apim api create \
    -g "$RG" \
    --service-name "$APIM" \
    --api-id "$API_ID" \
    --display-name "Craves Admin Operational Investigations" \
    --path "$API_PATH" \
    --service-url "$INTEGRATION_OPERATION_BASE" \
    --protocols https \
    --subscription-required false \
    -o none
else
  [[ "${PATH_OWNERS[0]}" == "$API_ID" ]] || fail "Existing path owner ${PATH_OWNERS[0]} is not ${API_ID}"
fi

put_operation() {
  local id="$1" template="$2" display="$3" parameter="${4:-}"
  local body rendered policy_body
  body="$(mktemp)"; rendered="$(mktemp)"; policy_body="$(mktemp)"
  if [[ -n "$parameter" ]]; then
    jq -n --arg display "$display" --arg template "$template" --arg parameter "$parameter" \
      '{properties:{displayName:$display,method:"GET",urlTemplate:$template,templateParameters:[{name:$parameter,type:"string",required:true}],responses:[{statusCode:200,description:"Read-only delivery intelligence"},{statusCode:400,description:"Invalid request"},{statusCode:401,description:"Authentication required"},{statusCode:403,description:"Admin access required"},{statusCode:404,description:"Delivery evidence not found"}]}}' >"$body"
  else
    jq -n --arg display "$display" --arg template "$template" \
      '{properties:{displayName:$display,method:"GET",urlTemplate:$template,responses:[{statusCode:200,description:"Read-only delivery intelligence"},{statusCode:400,description:"Invalid request"},{statusCode:401,description:"Authentication required"},{statusCode:403,description:"Admin access required"}]}}' >"$body"
  fi
  az rest --method put --url "${API_MGMT}/operations/${id}?api-version=${API_VERSION}" --body @"$body" -o none
  sed "s|__BACKEND_URL__|${INTEGRATION_OPERATION_BASE}|g" "$POLICY_TEMPLATE" >"$rendered"
  jq -Rs '{properties:{format:"rawxml",value:.}}' "$rendered" >"$policy_body"
  az rest --method put --url "${API_MGMT}/operations/${id}/policies/policy?api-version=${API_VERSION}" --body @"$policy_body" -o none
  rm -f "$body" "$rendered" "$policy_body"
}

put_operation \
  "get-admin-delivery-intelligence-overview" \
  "/delivery-intelligence/overview" \
  "Delivery Intelligence overview"
put_operation \
  "get-admin-delivery-intelligence-order" \
  "/delivery-intelligence/orders/{reference}" \
  "Investigate delivery order" \
  "reference"

verify_operation() {
  local id="$1" policy operation
  operation="$(az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$id" -o json)"
  [[ "$(jq -r '.method' <<<"$operation")" == "GET" ]] || fail "$id is not GET"
  policy="$(az rest --method get --url "${API_MGMT}/operations/${id}/policies/policy?api-version=${API_VERSION}" --query properties.value -o tsv)"
  [[ "$policy" == *"$INTEGRATION_OPERATION_BASE"* ]] || fail "$id backend read-back failed"
  [[ "$policy" == *"Authorization"* && "$policy" == *"Bearer"* ]] || fail "$id Bearer guard is missing"
  [[ "$policy" == *"no-store"* ]] || fail "$id no-store response policy is missing"
}

verify_operation "get-admin-delivery-intelligence-overview"
verify_operation "get-admin-delivery-intelligence-order"

GATEWAY_URL="$(az apim show -g "$RG" -n "$APIM" --query gatewayUrl -o tsv)"
[[ "$GATEWAY_URL" == https://* ]] || fail "APIM gateway URL was not returned"
OVERVIEW_STATUS="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  --connect-timeout 10 --max-time 30 --retry 4 --retry-delay 5 --retry-max-time 180 \
  "${GATEWAY_URL%/}/${API_PATH}/delivery-intelligence/overview")" \
  || fail "APIM gateway authentication check could not complete after bounded retries"
[[ "$OVERVIEW_STATUS" == "401" ]] || fail "Unauthenticated Delivery Intelligence overview returned HTTP ${OVERVIEW_STATUS}, expected 401"

echo "SUCCESS: Delivery Intelligence APIM operations are configured and protected."
