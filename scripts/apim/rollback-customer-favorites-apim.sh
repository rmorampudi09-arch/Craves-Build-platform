#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
API_PATH="${API_PATH:-api/v1/customer}"
API_VERSION="${API_VERSION:-2022-08-01}"
CONFIRM_FAVORITES_APIM_ROLLBACK="${CONFIRM_FAVORITES_APIM_ROLLBACK:-false}"

fail() { echo "ERROR: $*" >&2; exit 1; }
for tool in az jq; do command -v "$tool" >/dev/null 2>&1 || fail "$tool is required"; done
[[ "${CONFIRM_FAVORITES_APIM_ROLLBACK,,}" == "true" ]] || fail "Set CONFIRM_FAVORITES_APIM_ROLLBACK=true to remove only Favorites operations"

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
[[ -n "$SUBSCRIPTION_ID" ]] || fail "No active Azure subscription is selected"

mapfile -t API_IDS < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${API_PATH}'].name" -o tsv)
(( ${#API_IDS[@]} == 1 )) || fail "Expected exactly one API at $API_PATH; found ${#API_IDS[@]}"
API_ID="${API_IDS[0]}"
MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/apis/${API_ID}"

OPERATIONS_JSON=$(az apim api operation list -g "$RG" --service-name "$APIM" --api-id "$API_ID" -o json)

remove_route() {
  local method="$1" template="$2"
  local -a matching_ids

  mapfile -t matching_ids < <(
    jq -r \
      --arg method "$method" \
      --arg template "$template" '
        .[]
        | select(((.method // .properties.method // "") | ascii_upcase) == ($method | ascii_upcase))
        | select(("/" + ((.urlTemplate // .properties.urlTemplate // "") | ltrimstr("/"))) == ("/" + ($template | ltrimstr("/"))))
        | (.name // ((.id // "") | split("/")[-1]))
      ' <<<"$OPERATIONS_JSON"
  )

  (( ${#matching_ids[@]} <= 1 )) || fail "Multiple APIM operations match $method $template; refusing ambiguous rollback"

  if (( ${#matching_ids[@]} == 0 )); then
    echo "$method $template already absent"
    return
  fi

  local operation_id="${matching_ids[0]}"
  [[ -n "$operation_id" ]] || fail "APIM operation for $method $template has no operation ID"
  az rest --method delete --url "${MGMT}/operations/${operation_id}?api-version=${API_VERSION}" -o none
  echo "Removed $operation_id ($method $template)"
}

remove_route "GET" "/favorites"
remove_route "PUT" "/favorites/{menuItemId}"
remove_route "DELETE" "/favorites/{menuItemId}"

echo "SUCCESS: Favorites operations removed by route identity. Shared customer API and backend were preserved."
