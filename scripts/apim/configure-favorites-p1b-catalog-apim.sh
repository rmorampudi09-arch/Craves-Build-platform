#!/usr/bin/env bash
set -euo pipefail
set +x

[[ "${CONFIRM_FAVORITES_P1B_APIM:-false}" == "true" ]] || {
  echo "ERROR: set CONFIRM_FAVORITES_P1B_APIM=true to publish the Favorites P1B Catalog route." >&2
  exit 1
}

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
CATALOG_APP="${CATALOG_APP:-ca-craves-catalog-service-prodlo}"
API_PATH="${API_PATH:-api/v1/discovery}"
API_ID_DEFAULT="${API_ID_DEFAULT:-craves-catalog-discovery-v1}"
API_VERSION="${API_VERSION:-2022-08-01}"
OPERATION_ID="${OPERATION_ID:-resolve-saved-menu-items-p1b}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
POLICY_TEMPLATE="${POLICY_TEMPLATE:-$ROOT/infra/apim/favorites-p1b/catalog-saved-resolver-policy.xml}"

fail(){ echo "ERROR: $*" >&2; exit 1; }
for tool in az jq curl sed grep; do command -v "$tool" >/dev/null || fail "$tool is required"; done
[[ -f "$POLICY_TEMPLATE" ]] || fail "Favorites P1B APIM policy template is missing"

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
APP_JSON="$(az containerapp show -g "$RG" -n "$CATALOG_APP" -o json)"
FQDN="$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$APP_JSON")"
LATEST="$(jq -r '.properties.latestRevisionName // ""' <<<"$APP_JSON")"
READY="$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$APP_JSON")"
RUNNING="$(jq -r '.properties.runningStatus // ""' <<<"$APP_JSON")"
[[ -n "$FQDN" && "$LATEST" == "$READY" && "$RUNNING" == "Running" ]] || fail "Catalog Service is not ready"
curl -sS --fail --max-time 30 "https://$FQDN/actuator/health" >/dev/null

mapfile -t IDS < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${API_PATH}'].name" -o tsv)
(( ${#IDS[@]} <= 1 )) || fail "Multiple APIM APIs own path $API_PATH"

if (( ${#IDS[@]} == 1 )); then
  API_ID="${IDS[0]}"
else
  API_ID="$API_ID_DEFAULT"
  az apim api create \
    -g "$RG" \
    --service-name "$APIM" \
    --api-id "$API_ID" \
    --display-name "Craves Catalog Discovery API" \
    --path "$API_PATH" \
    --service-url "https://${FQDN}/api/v1/discovery" \
    --protocols https \
    --subscription-required false \
    -o none
fi

SUB_REQUIRED="$(az apim api show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --query subscriptionRequired -o tsv)"
[[ "${SUB_REQUIRED,,}" == "false" ]] || fail "Discovery API requires a subscription key; refusing to alter its security model"

MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/apis/${API_ID}"

GLOBAL_POLICY="$(az rest --method get --url "https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/policies/policy?api-version=${API_VERSION}" --query properties.value -o tsv 2>/dev/null || true)"
API_POLICY="$(az rest --method get --url "${MGMT}/policies/policy?api-version=${API_VERSION}" --query properties.value -o tsv 2>/dev/null || true)"
if grep -Eqi '<set-backend-service[^>]+backend-id=' <<<"$GLOBAL_POLICY$API_POLICY"; then
  fail "Inherited backend-id routing detected; refusing an ambiguous Favorites P1B publication"
fi

BODY="$(mktemp)"
RENDERED="$(mktemp)"
POLICY_BODY="$(mktemp)"
trap 'rm -f "$BODY" "$RENDERED" "$POLICY_BODY"' EXIT

cat >"$BODY" <<JSON
{
  "properties": {
    "displayName": "Resolve Saved menu items",
    "method": "POST",
    "urlTemplate": "/saved/menu-items/resolve",
    "templateParameters": [],
    "responses": [
      {"statusCode": 200, "description": "Bounded Saved catalog projection"},
      {"statusCode": 400, "description": "Invalid or oversized menu item batch"}
    ]
  }
}
JSON

az rest \
  --method put \
  --url "${MGMT}/operations/${OPERATION_ID}?api-version=${API_VERSION}" \
  --body @"$BODY" \
  -o none

BACKEND="https://${FQDN}/api/v1/discovery"
sed "s|__CATALOG_SAVED_BACKEND_URL__|${BACKEND}|g" "$POLICY_TEMPLATE" >"$RENDERED"
grep -q '__CATALOG_SAVED_BACKEND_URL__' "$RENDERED" && fail "Favorites P1B backend placeholder was not fully rendered"
jq -Rs '{properties:{format:"rawxml",value:.}}' "$RENDERED" >"$POLICY_BODY"
az rest \
  --method put \
  --url "${MGMT}/operations/${OPERATION_ID}/policies/policy?api-version=${API_VERSION}" \
  --body @"$POLICY_BODY" \
  -o none

METHOD="$(az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$OPERATION_ID" --query method -o tsv)"
TEMPLATE="$(az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$OPERATION_ID" --query urlTemplate -o tsv)"
POLICY="$(az rest --method get --url "${MGMT}/operations/${OPERATION_ID}/policies/policy?api-version=${API_VERSION}" --query properties.value -o tsv)"

[[ "$METHOD" == "POST" ]] || fail "Favorites P1B APIM operation method verification failed"
[[ "$TEMPLATE" == "/saved/menu-items/resolve" ]] || fail "Favorites P1B APIM operation template verification failed"
[[ "$POLICY" == *"$BACKEND"* ]] || fail "Favorites P1B backend policy verification failed"
[[ "$POLICY" == *"no-store"* ]] || fail "Favorites P1B no-store policy verification failed"
[[ "$POLICY" == *"X-Correlation-ID"* ]] || fail "Favorites P1B correlation policy verification failed"

echo "SUCCESS: Favorites P1B Catalog Saved resolver published to APIM."
echo "API: $API_ID"
echo "Operation: $OPERATION_ID"
echo "Public path: /${API_PATH}/saved/menu-items/resolve"
