#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
API_ID="${API_ID:-craves-admin-notification-recovery-v1}"
API_VERSION="${API_VERSION:-2022-08-01}"

fail() { echo "ERROR: $*" >&2; exit 1; }
command -v az >/dev/null || fail "az is required"
if ! az apim api show -g "$RG" --service-name "$APIM" --api-id "$API_ID" -o none 2>/dev/null; then
  echo "NOT_CONFIGURED: $API_ID"
  exit 2
fi
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/apis/${API_ID}"
for ID in get-admin-notification-recovery-backlog post-admin-notification-recovery-retry; do
  OP=$(az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$ID" --query '{method:method,urlTemplate:urlTemplate}' -o json)
  POLICY=$(az rest --method get --url "${MGMT}/operations/${ID}/policies/policy?api-version=${API_VERSION}" --query properties.value -o tsv)
  [[ "$POLICY" == *"Bearer"* && "$POLICY" == *"no-store"* && "$POLICY" != *'backend-id='* ]] || fail "$ID policy is unsafe or incomplete"
  echo "$ID $OP"
done

echo "SUCCESS: Admin notification recovery APIM status is ready."
