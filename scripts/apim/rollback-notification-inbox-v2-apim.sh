#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
API_PATH="${API_PATH:-api/v1/notifications}"
API_VERSION="${API_VERSION:-2022-08-01}"

fail() { echo "ERROR: $*" >&2; exit 1; }
command -v az >/dev/null || fail "az is required"
SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
SERVICE_MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}"

mapfile -t API_IDS < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${API_PATH}'].name" -o tsv)
(( ${#API_IDS[@]} <= 1 )) || fail "Multiple APIs own $API_PATH; refusing rollback."
if (( ${#API_IDS[@]} == 0 )); then
  echo "Notification API path is absent; nothing to roll back."
  exit 0
fi
API_ID="${API_IDS[0]}"

for OPERATION_ID in \
  list-notification-inbox-page-v2 \
  get-notification-unread-count-v2 \
  mark-all-notifications-read-v2; do
  if az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$OPERATION_ID" >/dev/null 2>&1; then
    az rest --method delete --url "${SERVICE_MGMT}/apis/${API_ID}/operations/${OPERATION_ID}?api-version=${API_VERSION}" -o none
    echo "Deleted operation $OPERATION_ID"
  else
    echo "Operation $OPERATION_ID is already absent"
  fi
done

echo "SUCCESS: Notification Inbox v2 APIM operation rollback completed. Existing APIs and legacy notification operations were preserved."
