#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
API_PATH="${API_PATH:-api/v1/cart}"
API_VERSION="${API_VERSION:-2022-08-01}"
OPERATION_ID="preflight-customer-cart-v1"

fail(){ echo "ERROR: $*" >&2; exit 1; }
command -v az >/dev/null || fail "az is required"
SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
mapfile -t API_IDS < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${API_PATH}'].name" -o tsv)
(( ${#API_IDS[@]} <= 1 )) || fail "Multiple customer cart APIs own /$API_PATH; refusing rollback"
if (( ${#API_IDS[@]} == 0 )); then
  echo "Customer cart API absent; preflight is already unreachable."
  exit 0
fi
API_ID="${API_IDS[0]}"
MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/apis/${API_ID}"
if az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$OPERATION_ID" >/dev/null 2>&1; then
  az rest --method delete --url "${MGMT}/operations/${OPERATION_ID}?api-version=${API_VERSION}" -o none
  echo "Deleted $OPERATION_ID."
else
  echo "$OPERATION_ID already absent."
fi

echo "SUCCESS: Cart preflight APIM rollback completed; all other cart operations were preserved."
