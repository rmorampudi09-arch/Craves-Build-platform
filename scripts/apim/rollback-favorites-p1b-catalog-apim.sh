#!/usr/bin/env bash
set -euo pipefail
set +x

[[ "${CONFIRM_FAVORITES_P1B_APIM_ROLLBACK:-false}" == "true" ]] || {
  echo "ERROR: set CONFIRM_FAVORITES_P1B_APIM_ROLLBACK=true to remove the Favorites P1B APIM operation." >&2
  exit 1
}

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
API_PATH="${API_PATH:-api/v1/discovery}"
API_VERSION="${API_VERSION:-2022-08-01}"
OPERATION_ID="${OPERATION_ID:-resolve-saved-menu-items-p1b}"

fail(){ echo "ERROR: $*" >&2; exit 1; }
for tool in az; do command -v "$tool" >/dev/null || fail "$tool is required"; done

mapfile -t IDS < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${API_PATH}'].name" -o tsv)
(( ${#IDS[@]} == 1 )) || fail "Expected exactly one APIM API at $API_PATH; found ${#IDS[@]}"
API_ID="${IDS[0]}"
SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/apis/${API_ID}"

if ! az apim api operation show \
  -g "$RG" \
  --service-name "$APIM" \
  --api-id "$API_ID" \
  --operation-id "$OPERATION_ID" \
  >/dev/null 2>&1; then
  echo "Favorites P1B APIM operation is already absent; nothing to roll back."
  exit 0
fi

az rest \
  --method delete \
  --url "${MGMT}/operations/${OPERATION_ID}?api-version=${API_VERSION}" \
  -o none

if az apim api operation show \
  -g "$RG" \
  --service-name "$APIM" \
  --api-id "$API_ID" \
  --operation-id "$OPERATION_ID" \
  >/dev/null 2>&1; then
  fail "Favorites P1B APIM operation still exists after rollback"
fi

echo "SUCCESS: Favorites P1B APIM operation removed without modifying the shared Discovery API."
