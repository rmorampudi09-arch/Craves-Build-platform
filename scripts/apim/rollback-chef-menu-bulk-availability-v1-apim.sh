#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
API_PATH="${API_PATH:-api/v1/kitchens/me}"
API_VERSION="${API_VERSION:-2022-08-01}"
OPERATION_ID="bulk-update-chef-menu-availability-v1"

fail(){ echo "ERROR: $*" >&2; exit 1; }
command -v az >/dev/null || fail "az is required"
SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
SERVICE_MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}"
mapfile -t API_IDS < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${API_PATH}'].name" -o tsv)
(( ${#API_IDS[@]} <= 1 )) || fail "Multiple Chef Kitchen APIs own /$API_PATH; refusing rollback"
if (( ${#API_IDS[@]} == 0 )); then
  echo "Chef Kitchen API absent; operation already unreachable."
  exit 0
fi
API_ID="${API_IDS[0]}"
if az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$OPERATION_ID" >/dev/null 2>&1; then
  az rest --method delete --url "${SERVICE_MGMT}/apis/${API_ID}/operations/${OPERATION_ID}?api-version=${API_VERSION}" -o none
  echo "Deleted $OPERATION_ID."
else
  echo "$OPERATION_ID already absent."
fi

echo "SUCCESS: Bulk availability APIM rollback completed; unrelated Chef Kitchen operations were preserved."
