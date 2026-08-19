#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
INTEGRATION_APP="${INTEGRATION_APP:-ca-craves-integration-service-pr}"
API_PATH="${API_PATH:-api/v1/chef/earnings}"
API_ID_DEFAULT="${API_ID_DEFAULT:-craves-chef-financial-v1}"
API_VERSION="${API_VERSION:-2022-08-01}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
POLICY_TEMPLATE="${POLICY_TEMPLATE:-$ROOT/infra/apim/chef-financial-v1/chef-financial-policy.xml}"

fail(){ echo "ERROR: $*" >&2; exit 1; }
for tool in az jq curl sed grep; do command -v "$tool" >/dev/null || fail "$tool is required"; done
[[ -f "$POLICY_TEMPLATE" ]] || fail "Chef financial policy template is missing"

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
[[ -n "$SUBSCRIPTION_ID" ]] || fail "No active Azure subscription selected"
az apim show -g "$RG" -n "$APIM" -o none

APP_JSON="$(az containerapp show -g "$RG" -n "$INTEGRATION_APP" -o json)"
FQDN="$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$APP_JSON")"
LATEST="$(jq -r '.properties.latestRevisionName // ""' <<<"$APP_JSON")"
READY="$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$APP_JSON")"
RUNNING="$(jq -r '.properties.runningStatus // ""' <<<"$APP_JSON")"
[[ -n "$FQDN" ]] || fail "Integration Service FQDN could not be resolved"
[[ -n "$LATEST" && "$LATEST" == "$READY" ]] || fail "Integration Service latest revision is not Ready"
[[ "$RUNNING" == "Running" ]] || fail "Integration Service is not Running"
curl -sS --fail --max-time 30 "https://$FQDN/actuator/health" >/dev/null

SERVICE_MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}"
mapfile -t API_IDS < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${API_PATH}'].name" -o tsv)
(( ${#API_IDS[@]} <= 1 )) || fail "Multiple APIM APIs already own /$API_PATH"
if (( ${#API_IDS[@]} == 1 )); then
  API_ID="${API_IDS[0]}"
else
  API_ID="$API_ID_DEFAULT"
  az apim api create \
    -g "$RG" --service-name "$APIM" --api-id "$API_ID" \
    --display-name "Craves Chef Financial Read API" --path "$API_PATH" \
    --service-url "https://${FQDN}" --protocols https \
    --subscription-required false -o none
fi

SUB_REQUIRED="$(az apim api show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --query subscriptionRequired -o tsv)"
[[ "${SUB_REQUIRED,,}" == "false" ]] || fail "Existing API requires an APIM subscription key; refusing to relax it"
MGMT="${SERVICE_MGMT}/apis/${API_ID}"

read_policy(){ az rest --method get --url "$1" --query properties.value -o tsv 2>/dev/null || true; }
for SPEC in "${SERVICE_MGMT}/policies/policy?api-version=${API_VERSION}" "${MGMT}/policies/policy?api-version=${API_VERSION}"; do
  POLICY="$(read_policy "$SPEC")"
  if grep -Eqi '<set-backend-service[^>]+backend-id=' <<<"$POLICY"; then
    fail "Inherited backend-id routing detected; refusing to override it"
  fi
done

OPERATION_ID="list-chef-earnings-v1"
BODY="$(mktemp)"; RENDERED="$(mktemp)"; POLICY_BODY="$(mktemp)"
cat >"$BODY" <<'JSON'
{
  "properties": {
    "displayName": "List my chef earnings",
    "method": "GET",
    "urlTemplate": "/",
    "templateParameters": [],
    "responses": [
      {"statusCode": 200, "description": "Chef-owned earning ledger entries"},
      {"statusCode": 400, "description": "Invalid limit"},
      {"statusCode": 401, "description": "Authentication required"},
      {"statusCode": 403, "description": "Chef role required"}
    ]
  }
}
JSON
az rest --method put --url "${MGMT}/operations/${OPERATION_ID}?api-version=${API_VERSION}" --body @"$BODY" -o none
BACKEND="https://${FQDN}/api/v1/chef/earnings"
sed "s|__CHEF_FINANCIAL_BACKEND_URL__|${BACKEND}|g" "$POLICY_TEMPLATE" >"$RENDERED"
grep -q '__CHEF_FINANCIAL_BACKEND_URL__' "$RENDERED" && fail "Backend placeholder was not fully rendered"
jq -Rs '{properties:{format:"rawxml",value:.}}' "$RENDERED" >"$POLICY_BODY"
az rest --method put --url "${MGMT}/operations/${OPERATION_ID}/policies/policy?api-version=${API_VERSION}" --body @"$POLICY_BODY" -o none
rm -f "$BODY" "$RENDERED" "$POLICY_BODY"

POLICY="$(az rest --method get --url "${MGMT}/operations/${OPERATION_ID}/policies/policy?api-version=${API_VERSION}" --query properties.value -o tsv)"
[[ "$POLICY" == *"Authorization"* && "$POLICY" == *"Bearer "* ]] || fail "Bearer guard verification failed"
[[ "$POLICY" == *"$BACKEND"* ]] || fail "Backend verification failed"
[[ "$POLICY" == *"no-store"* ]] || fail "No-store verification failed"

echo "SUCCESS: Chef financial read API configured at /${API_PATH}."
