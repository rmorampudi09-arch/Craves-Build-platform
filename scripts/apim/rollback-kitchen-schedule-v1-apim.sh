#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
CHEF_API_PATH="${CHEF_API_PATH:-api/v1/kitchens/me}"
DISCOVERY_API_PATH="${DISCOVERY_API_PATH:-api/v1/discovery}"
API_VERSION="${API_VERSION:-2022-08-01}"

fail(){ echo "ERROR: $*" >&2; exit 1; }
command -v az >/dev/null || fail "az is required"
SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
SERVICE_MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}"

resolve_single_api(){
  local path="$1"
  local -a ids
  mapfile -t ids < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${path}'].name" -o tsv)
  (( ${#ids[@]} <= 1 )) || fail "Multiple APIs own $path; refusing rollback"
  (( ${#ids[@]} == 1 )) || { printf ''; return; }
  printf '%s' "${ids[0]}"
}

delete_if_present(){
  local api_id="$1" operation_id="$2"
  [[ -n "$api_id" ]] || return 0
  if az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$api_id" --operation-id "$operation_id" >/dev/null 2>&1; then
    az rest --method delete --url "${SERVICE_MGMT}/apis/${api_id}/operations/${operation_id}?api-version=${API_VERSION}" -o none
    echo "Deleted $operation_id"
  else
    echo "$operation_id already absent"
  fi
}

CHEF_API_ID="$(resolve_single_api "$CHEF_API_PATH")"
DISCOVERY_API_ID="$(resolve_single_api "$DISCOVERY_API_PATH")"
for ID in get-my-kitchen-schedule-v1 replace-my-kitchen-schedule-v1 get-my-kitchen-schedule-override-v1 put-my-kitchen-schedule-override-v1 delete-my-kitchen-schedule-override-v1; do
  delete_if_present "$CHEF_API_ID" "$ID"
done
delete_if_present "$DISCOVERY_API_ID" "get-kitchen-live-availability-v1"

echo "SUCCESS: Kitchen schedule APIM rollback completed without deleting existing APIs or legacy operations."
