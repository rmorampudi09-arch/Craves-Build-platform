#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
API_VERSION="${API_VERSION:-2022-08-01}"
CONFIRM_APIM_ROLLBACK="${CONFIRM_APIM_ROLLBACK:-false}"
SUBSCRIPTION_ID=$(az account show --query id -o tsv)

fail() { echo "ERROR: $*" >&2; exit 1; }
command -v az >/dev/null || fail "az is required"
[[ "${CONFIRM_APIM_ROLLBACK,,}" == "true" ]] || fail "Set CONFIRM_APIM_ROLLBACK=true for the controlled rollback"

delete_operations() {
  local PATH_VALUE="$1"; shift
  local -a IDS
  mapfile -t IDS < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${PATH_VALUE}'].name" -o tsv)
  (( ${#IDS[@]} <= 1 )) || fail "Multiple APIM APIs own ${PATH_VALUE}"
  if (( ${#IDS[@]} == 0 )); then
    echo "SKIP: no API owns ${PATH_VALUE}"
    return
  fi
  local API_ID="${IDS[0]}" MGMT ID
  MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/apis/${API_ID}"
  for ID in "$@"; do
    if az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$ID" -o none 2>/dev/null; then
      az rest --method delete --url "${MGMT}/operations/${ID}?api-version=${API_VERSION}" -o none
      echo "REMOVED: ${PATH_VALUE} operation ${ID}"
    else
      echo "SKIP: ${PATH_VALUE} operation ${ID} is absent"
    fi
  done
}

delete_operations "api/v1/subscriptions" list-subscription-plans get-subscription-plan create-customer-subscription list-customer-subscriptions get-customer-subscription pause-customer-subscription cancel-customer-subscription
delete_operations "api/v1/admin/subscription-plans" list-admin-subscription-plans create-admin-subscription-plan update-admin-subscription-plan-status
delete_operations "api/v1/admin/subscriptions" update-admin-subscription-status
delete_operations "api/v1/backoffice/chef-reviews" list-chef-reviews get-chef-review approve-chef-review reject-chef-review get-chef-proof-content

echo "SUCCESS: Named subscription/backoffice operations removed. API containers were retained."
