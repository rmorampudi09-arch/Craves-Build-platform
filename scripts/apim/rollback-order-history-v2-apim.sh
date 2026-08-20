#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
CUSTOMER_API_PATH="${CUSTOMER_API_PATH:-api/v1/orders}"
CHEF_API_PATH="${CHEF_API_PATH:-api/v1/chef/orders}"
API_VERSION="${API_VERSION:-2022-08-01}"

fail() { echo "ERROR: $*" >&2; exit 1; }
for tool in az; do command -v "$tool" >/dev/null || fail "$tool is required"; done
SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
SERVICE_MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}"

resolve_single_api() {
  local path="$1"
  local -a ids
  mapfile -t ids < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${path}'].name" -o tsv)
  (( ${#ids[@]} <= 1 )) || fail "Multiple APIs own $path; refusing rollback."
  (( ${#ids[@]} == 1 )) || { printf ''; return; }
  printf '%s' "${ids[0]}"
}

delete_operation_if_present() {
  local api_id="$1" operation_id="$2"
  [[ -n "$api_id" ]] || return 0
  if az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$api_id" --operation-id "$operation_id" >/dev/null 2>&1; then
    az rest --method delete --url "${SERVICE_MGMT}/apis/${api_id}/operations/${operation_id}?api-version=${API_VERSION}" -o none
    echo "Deleted operation $operation_id from API $api_id"
  else
    echo "Operation $operation_id is already absent from API $api_id"
  fi
}

CUSTOMER_API_ID="$(resolve_single_api "$CUSTOMER_API_PATH")"
CHEF_API_ID="$(resolve_single_api "$CHEF_API_PATH")"

delete_operation_if_present "$CUSTOMER_API_ID" "list-customer-orders-page-v2"
delete_operation_if_present "$CHEF_API_ID" "list-chef-orders-page-v2"

echo "SUCCESS: Order History v2 APIM operation rollback completed. Existing APIs and legacy operations were preserved."
