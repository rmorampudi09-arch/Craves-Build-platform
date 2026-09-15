#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
API_ID="${CATALOG_API_ID:-craves-catalog-v1}"
OPERATION_ID="get-internal-kitchen"
API_VERSION="${API_VERSION:-2022-08-01}"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

for tool in az jq; do
  command -v "$tool" >/dev/null || fail "$tool is required"
done

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
[[ -n "$SUBSCRIPTION_ID" ]] || fail "Azure subscription is not selected"

EXISTING=$(az apim api operation show \
  -g "$RG" \
  --service-name "$APIM" \
  --api-id "$API_ID" \
  --operation-id "$OPERATION_ID" \
  -o json 2>/dev/null || true)

if [[ -z "$EXISTING" ]]; then
  echo "SUCCESS: $OPERATION_ID is already absent; nothing to roll back."
  exit 0
fi

METHOD=$(jq -r '.method // ""' <<<"$EXISTING")
TEMPLATE=$(jq -r '.urlTemplate // ""' <<<"$EXISTING")
[[ "$METHOD" == "GET" && "$TEMPLATE" == "/internal/kitchens/{kitchenId}" ]] \
  || fail "Refusing to delete $OPERATION_ID because its contract does not match this module"

MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/apis/${API_ID}"
az rest \
  --method delete \
  --url "${MGMT}/operations/${OPERATION_ID}?api-version=${API_VERSION}" \
  -o none

if az apim api operation show \
  -g "$RG" \
  --service-name "$APIM" \
  --api-id "$API_ID" \
  --operation-id "$OPERATION_ID" \
  -o none 2>/dev/null; then
  fail "$OPERATION_ID still exists after rollback"
fi

echo "SUCCESS: Removed only ${API_ID}/${OPERATION_ID}."
