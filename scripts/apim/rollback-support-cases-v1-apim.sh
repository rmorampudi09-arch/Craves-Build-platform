#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
REQUESTER_API_PATH="${REQUESTER_API_PATH:-api/v1/support/cases}"
ADMIN_API_PATH="${ADMIN_API_PATH:-api/v1/admin/support/cases}"
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

REQUESTER_API_ID="$(resolve_single_api "$REQUESTER_API_PATH")"
ADMIN_API_ID="$(resolve_single_api "$ADMIN_API_PATH")"

for ID in create-support-case-v1 list-my-support-cases-v1 get-my-support-case-v1 add-my-support-case-message-v1; do
  delete_if_present "$REQUESTER_API_ID" "$ID"
done
for ID in list-admin-support-cases-v1 get-admin-support-case-v1 add-admin-support-case-message-v1 update-admin-support-case-status-v1 assign-admin-support-case-to-me-v1; do
  delete_if_present "$ADMIN_API_ID" "$ID"
done

echo "SUCCESS: Support case APIM rollback completed. Existing unrelated APIs and operations were preserved."
