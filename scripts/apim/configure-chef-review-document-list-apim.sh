#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
APP="${USER_CHEF_APP:-ca-craves-user-chef-service-prod}"
API_VERSION="${API_VERSION:-2022-08-01}"
CONFIRM_APIM_WRITE="${CONFIRM_APIM_WRITE:-false}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
POLICY_TEMPLATE="$ROOT/infra/apim/subscription-backoffice/authenticated-policy.xml"
API_PATH="api/v1/backoffice/chef-reviews"

fail() { echo "ERROR: $*" >&2; exit 1; }
for tool in az jq curl sed; do command -v "$tool" >/dev/null || fail "$tool is required"; done
[[ -f "$POLICY_TEMPLATE" ]] || fail "Authenticated APIM policy template is missing"
[[ "${CONFIRM_APIM_WRITE,,}" == "true" ]] || fail "Set CONFIRM_APIM_WRITE=true for the controlled APIM write"

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
APP_JSON=$(az containerapp show -g "$RG" -n "$APP" -o json --only-show-errors)
FQDN=$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$APP_JSON")
LATEST=$(jq -r '.properties.latestRevisionName // ""' <<<"$APP_JSON")
READY=$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$APP_JSON")
RUNNING=$(jq -r '.properties.runningStatus // ""' <<<"$APP_JSON")
[[ -n "$FQDN" && "$LATEST" == "$READY" && "$RUNNING" == "Running" ]] || fail "User-Chef Service is not ready"
curl -sS --fail --max-time 30 "https://$FQDN/actuator/health" >/dev/null
BACKEND="https://${FQDN}/api/v1/backoffice/chef-reviews"

mapfile -t API_IDS < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${API_PATH}'].name" -o tsv)
(( ${#API_IDS[@]} == 1 )) || fail "Expected exactly one existing APIM API for ${API_PATH}; refusing to create an overlapping API"
API_ID="${API_IDS[0]}"
SUB_REQUIRED=$(az apim api show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --query subscriptionRequired -o tsv)
[[ "${SUB_REQUIRED,,}" == "false" ]] || fail "Existing API ${API_ID} unexpectedly requires a subscription key"

MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/apis/${API_ID}"
OP_ID="list-chef-review-documents"
TEMPLATE="/{applicationId}/documents"
PARAMS='[{"name":"applicationId","type":"string","required":true}]'
BODY=$(mktemp); RENDERED=$(mktemp); POLICY_BODY=$(mktemp)
trap 'rm -f "$BODY" "$RENDERED" "$POLICY_BODY"' EXIT

jq -n --argjson params "$PARAMS" '{properties:{displayName:"List Chef review documents",method:"GET",urlTemplate:"/{applicationId}/documents",templateParameters:$params,responses:[{statusCode:200,description:"Document metadata"},{statusCode:401,description:"Authentication required"},{statusCode:403,description:"Access denied"},{statusCode:404,description:"Not found"}]}}' >"$BODY"
az rest --method put --url "${MGMT}/operations/${OP_ID}?api-version=${API_VERSION}" --body @"$BODY" -o none
sed "s|__BACKEND_URL__|${BACKEND}|g" "$POLICY_TEMPLATE" >"$RENDERED"
jq -Rs '{properties:{format:"rawxml",value:.}}' "$RENDERED" >"$POLICY_BODY"
az rest --method put --url "${MGMT}/operations/${OP_ID}/policies/policy?api-version=${API_VERSION}" --body @"$POLICY_BODY" -o none
POLICY=$(az rest --method get --url "${MGMT}/operations/${OP_ID}/policies/policy?api-version=${API_VERSION}" --query properties.value -o tsv)
[[ "$POLICY" == *"$BACKEND"* && "$POLICY" == *"Bearer"* && "$POLICY" == *"no-store"* ]] || fail "Admin Chef document-list policy verification failed"
az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$OP_ID" -o none --only-show-errors

echo "SUCCESS: Admin Chef review document-list operation configured on existing APIM API ${API_ID}."
