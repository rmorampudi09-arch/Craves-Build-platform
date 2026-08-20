#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
API_PATH="${API_PATH:-api/v1/chef/orders}"
API_ID="${API_ID:-}"
OPERATION_ID="${OPERATION_ID:-get-my-chef-order-delivery-status}"
API_VERSION="${API_VERSION:-2022-08-01}"
CONFIRM_OPERATION_ROLLBACK="${CONFIRM_OPERATION_ROLLBACK:-false}"

fail(){ echo "ERROR: $*" >&2; exit 1; }
command -v az >/dev/null 2>&1 || fail "Azure CLI is required"
[[ "${CONFIRM_OPERATION_ROLLBACK,,}" == "true" ]] || fail "Set CONFIRM_OPERATION_ROLLBACK=true to remove only the chef delivery-status APIM operation"

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
[[ -n "$SUBSCRIPTION_ID" ]] || fail "No active Azure subscription is selected"

if [[ -z "$API_ID" ]]; then
  mapfile -t API_IDS < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${API_PATH}'].name" -o tsv)
  (( ${#API_IDS[@]} == 1 )) || fail "Expected exactly one API at path $API_PATH"
  API_ID="${API_IDS[0]}"
fi

if ! az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$OPERATION_ID" >/dev/null 2>&1; then
  echo "Chef delivery-status operation is already absent."
  exit 0
fi

MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/apis/${API_ID}"
az rest --method delete --url "${MGMT}/operations/${OPERATION_ID}?api-version=${API_VERSION}" -o none

echo "SUCCESS: removed only $OPERATION_ID; the Chef Orders API and all other operations were preserved."
