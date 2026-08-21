#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
USER_CHEF_APP="${USER_CHEF_APP:-ca-craves-user-chef-service-prod}"
API_ID="${API_ID:-craves-admin-directory-v1}"
API_PATH="${API_PATH:-api/v1/admin/directory}"
API_VERSION="${API_VERSION:-2022-08-01}"
CONFIRM_APIM_WRITE="${CONFIRM_APIM_WRITE:-false}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
POLICY_TEMPLATE="$ROOT/infra/apim/admin-directory/authenticated-policy.xml"

fail() { echo "ERROR: $*" >&2; exit 1; }
for tool in az jq curl sed; do command -v "$tool" >/dev/null || fail "$tool is required"; done
[[ -f "$POLICY_TEMPLATE" ]] || fail "Admin directory APIM policy template is missing"
[[ "${CONFIRM_APIM_WRITE,,}" == "true" ]] || fail "Set CONFIRM_APIM_WRITE=true for the controlled APIM write"

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
[[ -n "$SUBSCRIPTION_ID" ]] || fail "Azure subscription could not be resolved"
APP_JSON=$(az containerapp show -g "$RG" -n "$USER_CHEF_APP" -o json)
FQDN=$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$APP_JSON")
LATEST=$(jq -r '.properties.latestRevisionName // ""' <<<"$APP_JSON")
READY=$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$APP_JSON")
RUNNING=$(jq -r '.properties.runningStatus // ""' <<<"$APP_JSON")
[[ -n "$FQDN" && "$LATEST" == "$READY" && "$RUNNING" == "Running" ]] || fail "User/Chef Service is not ready"
curl --silent --show-error --fail --max-time 30 "https://$FQDN/actuator/health" >/dev/null
BACKEND="https://${FQDN}/api/v1/admin/directory"

API_MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/apis/${API_ID}"
GLOBAL_POLICY_URL="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/policies/policy?api-version=${API_VERSION}"
GLOBAL_POLICY=$(az rest --method get --url "$GLOBAL_POLICY_URL" --query properties.value -o tsv 2>/dev/null || true)
[[ "$GLOBAL_POLICY" != *'set-backend-service backend-id='* ]] || fail "Inherited global backend-id policy blocks safe operation routing"

mapfile -t OWNERS < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${API_PATH}'].name" -o tsv)
(( ${#OWNERS[@]} <= 1 )) || fail "Multiple APIM APIs own ${API_PATH}"
if (( ${#OWNERS[@]} == 0 )); then
  az apim api create -g "$RG" --service-name "$APIM" --api-id "$API_ID" \
    --display-name "Craves Admin Directory" --path "$API_PATH" --service-url "$BACKEND" \
    --protocols https --subscription-required false -o none
else
  [[ "${OWNERS[0]}" == "$API_ID" ]] || fail "A different API owns ${API_PATH}"
  SUB_REQUIRED=$(az apim api show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --query subscriptionRequired -o tsv)
  [[ "${SUB_REQUIRED,,}" == "false" ]] || fail "Existing API requires a subscription key; this script will not relax it"
fi

API_POLICY=$(az rest --method get --url "${API_MGMT}/policies/policy?api-version=${API_VERSION}" --query properties.value -o tsv 2>/dev/null || true)
[[ "$API_POLICY" != *'set-backend-service backend-id='* ]] || fail "Inherited API backend-id policy blocks safe operation routing"

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
RENDERED="$TMP_DIR/policy.xml"
POLICY_BODY="$TMP_DIR/policy.json"
sed "s|__BACKEND_URL__|${BACKEND}|g" "$POLICY_TEMPLATE" >"$RENDERED"
jq -Rs '{properties:{format:"rawxml",value:.}}' "$RENDERED" >"$POLICY_BODY"

put_operation() {
  local operation_id="$1" method="$2" template="$3" display="$4" has_identity_param="$5"
  local body="$TMP_DIR/${operation_id}.json"
  if [[ "$has_identity_param" == "true" ]]; then
    jq -n --arg display "$display" --arg method "$method" --arg template "$template" \
      '{properties:{displayName:$display,method:$method,urlTemplate:$template,templateParameters:[{name:"identityId",type:"string",required:true}],responses:[{statusCode:200,description:"Audited directory response"},{statusCode:400,description:"Invalid request"},{statusCode:401,description:"Authentication required"},{statusCode:403,description:"ADMIN access required"},{statusCode:404,description:"Not found"}]}}' >"$body"
  else
    jq -n --arg display "$display" --arg method "$method" --arg template "$template" \
      '{properties:{displayName:$display,method:$method,urlTemplate:$template,responses:[{statusCode:200,description:"Audited directory response"},{statusCode:400,description:"Invalid request"},{statusCode:401,description:"Authentication required"},{statusCode:403,description:"ADMIN access required"},{statusCode:404,description:"Not found"}]}}' >"$body"
  fi
  az rest --method put --url "${API_MGMT}/operations/${operation_id}?api-version=${API_VERSION}" --body @"$body" -o none
  az rest --method put --url "${API_MGMT}/operations/${operation_id}/policies/policy?api-version=${API_VERSION}" --body @"$POLICY_BODY" -o none
}

put_operation "post-admin-directory-search" "POST" "/search" "Search customer and chef directory" "false"
put_operation "get-admin-directory-customer" "GET" "/customers/{identityId}" "Read audited customer case" "true"
put_operation "get-admin-directory-chef" "GET" "/chefs/{identityId}" "Read audited chef case" "true"

verify_operation() {
  local operation_id="$1" expected_method="$2" operation policy
  operation=$(az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$operation_id" -o json)
  [[ "$(jq -r '.method' <<<"$operation")" == "$expected_method" ]] || fail "$operation_id method read-back failed"
  policy=$(az rest --method get --url "${API_MGMT}/operations/${operation_id}/policies/policy?api-version=${API_VERSION}" --query properties.value -o tsv)
  [[ "$policy" == *"$BACKEND"* ]] || fail "$operation_id backend read-back failed"
  [[ "$policy" == *"Authorization"* && "$policy" == *"Bearer"* ]] || fail "$operation_id Bearer guard is missing"
  [[ "$policy" == *"no-store"* && "$policy" == *"nosniff"* ]] || fail "$operation_id response hardening is missing"
  [[ "$policy" != *'backend-id='* ]] || fail "$operation_id unexpectedly uses backend-id"
}

verify_operation "post-admin-directory-search" "POST"
verify_operation "get-admin-directory-customer" "GET"
verify_operation "get-admin-directory-chef" "GET"

GATEWAY_URL=$(az apim show -g "$RG" -n "$APIM" --query gatewayUrl -o tsv)
[[ "$GATEWAY_URL" == https://* ]] || fail "APIM HTTPS gateway URL was not returned"
HTTP_STATUS=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 30 -X POST "${GATEWAY_URL%/}/${API_PATH}/search" -H 'Content-Type: application/json' --data '{"query":"probe@example.invalid"}')
[[ "$HTTP_STATUS" == "401" ]] || fail "Unauthenticated directory guard returned HTTP $HTTP_STATUS instead of 401"

echo "SUCCESS: Admin directory APIM operations configured and verified."
