#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
APP="${CATALOG_APP:-ca-craves-catalog-service-prodlo}"
API_PATH="api/v1/catalog"
API_ID_DEFAULT="craves-catalog-v1"
OPERATION_ID="get-internal-kitchen"
API_VERSION="${API_VERSION:-2022-08-01}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
POLICY_FILE="$ROOT/infra/apim/catalog-internal/catalog-internal-kitchen-policy.xml"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

for tool in az jq curl python3; do
  command -v "$tool" >/dev/null || fail "$tool is required"
done
[[ -f "$POLICY_FILE" ]] || fail "Policy file is missing: $POLICY_FILE"

python3 - "$POLICY_FILE" <<'PY'
import sys
import xml.etree.ElementTree as ET
ET.parse(sys.argv[1])
print("XML PASS: " + sys.argv[1])
PY

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
[[ -n "$SUBSCRIPTION_ID" ]] || fail "Azure subscription is not selected"

APP_JSON=$(az containerapp show -g "$RG" -n "$APP" -o json)
FQDN=$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$APP_JSON")
LATEST=$(jq -r '.properties.latestRevisionName // ""' <<<"$APP_JSON")
READY=$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$APP_JSON")
RUNNING=$(jq -r '.properties.runningStatus // ""' <<<"$APP_JSON")

[[ -n "$FQDN" ]] || fail "Catalog Container App FQDN is missing"
[[ -n "$LATEST" && "$LATEST" == "$READY" ]] || fail "Catalog latest revision is not the latest ready revision"
[[ "$RUNNING" == "Running" ]] || fail "Catalog Container App is not Running"

curl -sS --fail --max-time 30 "https://${FQDN}/actuator/health" >/dev/null

mapfile -t API_IDS < <(
  az apim api list \
    -g "$RG" \
    --service-name "$APIM" \
    --query "[?path=='${API_PATH}'].name" \
    -o tsv
)

(( ${#API_IDS[@]} == 1 )) || fail "Expected exactly one APIM API to own /${API_PATH}; found ${#API_IDS[@]}"
API_ID="${API_IDS[0]}"
[[ "$API_ID" == "$API_ID_DEFAULT" ]] || fail "Unexpected Catalog API owner: $API_ID"

SUB_REQUIRED=$(az apim api show \
  -g "$RG" \
  --service-name "$APIM" \
  --api-id "$API_ID" \
  --query subscriptionRequired \
  -o tsv)
[[ "${SUB_REQUIRED,,}" == "false" ]] || fail "Catalog API unexpectedly requires a subscription key"

SERVICE_URL=$(az apim api show \
  -g "$RG" \
  --service-name "$APIM" \
  --api-id "$API_ID" \
  --query serviceUrl \
  -o tsv)
EXPECTED_SERVICE_URL="https://${FQDN}/api/v1/catalog"
[[ "${SERVICE_URL%/}" == "${EXPECTED_SERVICE_URL%/}" ]] || fail "Catalog API backend does not match the healthy Catalog Container App"

MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/apis/${API_ID}"

EXISTING=$(az apim api operation show \
  -g "$RG" \
  --service-name "$APIM" \
  --api-id "$API_ID" \
  --operation-id "$OPERATION_ID" \
  -o json 2>/dev/null || true)

if [[ -n "$EXISTING" ]]; then
  EXISTING_METHOD=$(jq -r '.method // ""' <<<"$EXISTING")
  EXISTING_TEMPLATE=$(jq -r '.urlTemplate // ""' <<<"$EXISTING")
  [[ "$EXISTING_METHOD" == "GET" && "$EXISTING_TEMPLATE" == "/internal/kitchens/{kitchenId}" ]] \
    || fail "Operation ID $OPERATION_ID is already owned by a different contract"
fi

BODY=$(mktemp)
POLICY_BODY=$(mktemp)
trap 'rm -f "$BODY" "$POLICY_BODY"' EXIT

jq -n '{
  properties: {
    displayName: "Internal get kitchen",
    method: "GET",
    urlTemplate: "/internal/kitchens/{kitchenId}",
    templateParameters: [
      {name: "kitchenId", type: "string", required: true}
    ],
    responses: [
      {statusCode: 200, description: "Internal kitchen profile"},
      {statusCode: 401, description: "Internal service credential required"},
      {statusCode: 403, description: "Internal service credential invalid"},
      {statusCode: 404, description: "Kitchen not found"}
    ]
  }
}' >"$BODY"

az rest \
  --method put \
  --url "${MGMT}/operations/${OPERATION_ID}?api-version=${API_VERSION}" \
  --body @"$BODY" \
  -o none

jq -Rs '{properties:{format:"rawxml",value:.}}' "$POLICY_FILE" >"$POLICY_BODY"
az rest \
  --method put \
  --url "${MGMT}/operations/${OPERATION_ID}/policies/policy?api-version=${API_VERSION}" \
  --body @"$POLICY_BODY" \
  -o none

READBACK=$(az apim api operation show \
  -g "$RG" \
  --service-name "$APIM" \
  --api-id "$API_ID" \
  --operation-id "$OPERATION_ID" \
  -o json)

[[ "$(jq -r '.method' <<<"$READBACK")" == "GET" ]] || fail "Operation method readback mismatch"
[[ "$(jq -r '.urlTemplate' <<<"$READBACK")" == "/internal/kitchens/{kitchenId}" ]] || fail "Operation path readback mismatch"

POLICY_READBACK=$(az rest \
  --method get \
  --url "${MGMT}/operations/${OPERATION_ID}/policies/policy?api-version=${API_VERSION}" \
  --query properties.value \
  -o tsv)
[[ "$POLICY_READBACK" == *"X-Craves-Internal-Key"* ]] || fail "Internal header guard is missing after policy readback"
[[ "$POLICY_READBACK" == *"no-store"* ]] || fail "No-store policy is missing after policy readback"

echo "SUCCESS: ${API_ID}/${OPERATION_ID} is configured for GET /internal/kitchens/{kitchenId}."
