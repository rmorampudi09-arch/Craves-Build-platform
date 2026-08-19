#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
DISCOVERY_API_PATH="${DISCOVERY_API_PATH:-api/v1/discovery}"
API_VERSION="${API_VERSION:-2024-05-01}"

fail(){ echo "ERROR: $*" >&2; exit 1; }
command -v az >/dev/null || fail "az is required"
SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
[[ -n "$SUBSCRIPTION_ID" ]] || fail "No active Azure subscription selected"
SERVICE_MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}"
mapfile -t API_IDS < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${DISCOVERY_API_PATH}'].name" -o tsv)
(( ${#API_IDS[@]} == 1 )) || fail "Expected exactly one discovery API at /${DISCOVERY_API_PATH}"
API_ID="${API_IDS[0]}"
MGMT="${SERVICE_MGMT}/apis/${API_ID}"

rollback_operation(){
  local operation_id="$1"
  local policy_url="${MGMT}/operations/${operation_id}/policies/policy?api-version=${API_VERSION}"
  local current
  current="$(az rest --method get --url "$policy_url" --query properties.value -o tsv 2>/dev/null || true)"
  if [[ -z "$current" ]]; then
    echo "$operation_id already inherits the API/global policy."
    return 0
  fi
  if [[ "$current" != *"CravesCorrelationInbound"* || "$current" != *"CravesSecurityOutbound"* ]]; then
    fail "$operation_id policy is not recognized as the Craves baseline; refusing destructive rollback"
  fi
  az rest --method delete --url "$policy_url" -o none
  echo "Removed Craves baseline policy from $operation_id; inherited API/global policy is active again."
}

rollback_operation "discover-nearby-kitchens"
rollback_operation "discover-nearby-menu-items"

echo "SUCCESS: Discovery operation baseline rolled back. Policy fragments were intentionally preserved because unreferenced fragments are inert."
