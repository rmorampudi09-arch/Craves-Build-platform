#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
CATALOG_APP="${CATALOG_APP:-ca-craves-catalog-service-prodlo}"
API_PATH="${API_PATH:-api/v1/kitchens/me}"
API_VERSION="${API_VERSION:-2022-08-01}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
POLICY_TEMPLATE="${POLICY_TEMPLATE:-$ROOT/infra/apim/chef-kitchen/chef-kitchen-policy.xml}"

fail(){ echo "ERROR: $*" >&2; exit 1; }
for tool in az jq curl sed grep; do command -v "$tool" >/dev/null || fail "$tool is required"; done
[[ -f "$POLICY_TEMPLATE" ]] || fail "Chef kitchen policy template is missing"

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
APP_JSON="$(az containerapp show -g "$RG" -n "$CATALOG_APP" -o json)"
FQDN="$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$APP_JSON")"
LATEST="$(jq -r '.properties.latestRevisionName // ""' <<<"$APP_JSON")"
READY="$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$APP_JSON")"
RUNNING="$(jq -r '.properties.runningStatus // ""' <<<"$APP_JSON")"
[[ -n "$FQDN" && -n "$LATEST" && "$LATEST" == "$READY" && "$RUNNING" == "Running" ]] || fail "Catalog Service is not Ready/Running"
curl -sS --fail --max-time 30 "https://$FQDN/actuator/health" >/dev/null

mapfile -t API_IDS < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${API_PATH}'].name" -o tsv)
(( ${#API_IDS[@]} == 1 )) || fail "Expected exactly one existing Chef Kitchen API at /$API_PATH"
API_ID="${API_IDS[0]}"
SUB_REQUIRED="$(az apim api show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --query subscriptionRequired -o tsv)"
[[ "${SUB_REQUIRED,,}" == "false" ]] || fail "Chef Kitchen API requires an APIM subscription key; refusing to change that security model"

SERVICE_MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}"
MGMT="${SERVICE_MGMT}/apis/${API_ID}"
for POLICY_URL in "${SERVICE_MGMT}/policies/policy?api-version=${API_VERSION}" "${MGMT}/policies/policy?api-version=${API_VERSION}"; do
  VALUE="$(az rest --method get --url "$POLICY_URL" --query properties.value -o tsv 2>/dev/null || true)"
  if grep -Eqi '<set-backend-service[^>]+backend-id=' <<<"$VALUE"; then
    fail "Inherited backend-id routing detected; refusing operation override"
  fi
done

OPERATION_ID="bulk-update-chef-menu-availability-v1"
BODY="$(mktemp)"; RENDERED="$(mktemp)"; POLICY_BODY="$(mktemp)"
cat >"$BODY" <<'JSON'
{
  "properties": {
    "displayName": "Bulk update my menu availability",
    "method": "PATCH",
    "urlTemplate": "/menu-items/availability",
    "templateParameters": [],
    "responses": [
      {"statusCode": 200, "description": "Atomic availability batch result"},
      {"statusCode": 400, "description": "Invalid batch or delivery metadata"},
      {"statusCode": 401, "description": "Authentication required"},
      {"statusCode": 403, "description": "Chef role required"},
      {"statusCode": 404, "description": "Menu item not owned by this kitchen"}
    ]
  }
}
JSON
az rest --method put --url "${MGMT}/operations/${OPERATION_ID}?api-version=${API_VERSION}" --body @"$BODY" -o none
BACKEND="https://${FQDN}/api/v1/kitchens/me"
sed "s|__CHEF_KITCHEN_BACKEND_URL__|${BACKEND}|g" "$POLICY_TEMPLATE" >"$RENDERED"
grep -q '__CHEF_KITCHEN_BACKEND_URL__' "$RENDERED" && fail "Chef kitchen backend placeholder was not rendered"
jq -Rs '{properties:{format:"rawxml",value:.}}' "$RENDERED" >"$POLICY_BODY"
az rest --method put --url "${MGMT}/operations/${OPERATION_ID}/policies/policy?api-version=${API_VERSION}" --body @"$POLICY_BODY" -o none
rm -f "$BODY" "$RENDERED" "$POLICY_BODY"

POLICY="$(az rest --method get --url "${MGMT}/operations/${OPERATION_ID}/policies/policy?api-version=${API_VERSION}" --query properties.value -o tsv)"
[[ "$POLICY" == *"Authorization"* && "$POLICY" == *"Bearer "* ]] || fail "Bearer guard verification failed"
[[ "$POLICY" == *"$BACKEND"* && "$POLICY" == *"no-store"* ]] || fail "Backend/no-store verification failed"
echo "SUCCESS: Chef bulk menu availability operation configured on existing Chef Kitchen API."
