#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
API_PATH="${API_PATH:-api/v1/discovery}"
API_VERSION="${API_VERSION:-2022-08-01}"
OPERATION_ID="discover-advanced-search"
EXPECTED_TEMPLATE="/search"

fail() { echo "ERROR: $*" >&2; exit 1; }
for tool in az; do command -v "$tool" >/dev/null || fail "$tool is required"; done

mapfile -t API_IDS < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${API_PATH}'].name" -o tsv)
(( ${#API_IDS[@]} == 1 )) || fail "Expected exactly one APIM API at ${API_PATH}; found ${#API_IDS[@]}"
API_ID="${API_IDS[0]}"

if ! az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$OPERATION_ID" >/dev/null 2>&1; then
  echo "Advanced search operation is already absent."
  exit 0
fi

TEMPLATE="$(az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$OPERATION_ID" --query urlTemplate -o tsv)"
[[ "$TEMPLATE" == "$EXPECTED_TEMPLATE" ]] || fail "Operation id exists but owns ${TEMPLATE}; refusing destructive rollback"

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
URL="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/apis/${API_ID}/operations/${OPERATION_ID}?api-version=${API_VERSION}"
az rest --method delete --url "$URL" -o none

echo "SUCCESS: Removed only ${OPERATION_ID}; existing discovery API and other operations were preserved."
