#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
API_PATH="${API_PATH:-api/v1/customer}"
API_VERSION="${API_VERSION:-2022-08-01}"
CONFIRM_FAVORITES_APIM_ROLLBACK="${CONFIRM_FAVORITES_APIM_ROLLBACK:-false}"

fail() { echo "ERROR: $*" >&2; exit 1; }
command -v az >/dev/null 2>&1 || fail "Azure CLI is required"
[[ "${CONFIRM_FAVORITES_APIM_ROLLBACK,,}" == "true" ]] || fail "Set CONFIRM_FAVORITES_APIM_ROLLBACK=true to remove only Favorites operations"

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
[[ -n "$SUBSCRIPTION_ID" ]] || fail "No active Azure subscription is selected"

mapfile -t API_IDS < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${API_PATH}'].name" -o tsv)
(( ${#API_IDS[@]} == 1 )) || fail "Expected exactly one API at $API_PATH; found ${#API_IDS[@]}"
API_ID="${API_IDS[0]}"
MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/apis/${API_ID}"

for operation_id in list-customer-favorites save-customer-favorite remove-customer-favorite; do
  if az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$operation_id" >/dev/null 2>&1; then
    az rest --method delete --url "${MGMT}/operations/${operation_id}?api-version=${API_VERSION}" -o none
    echo "Removed $operation_id"
  else
    echo "$operation_id already absent"
  fi
done

echo "SUCCESS: Favorites operations removed. Shared customer API and backend were preserved."
