#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
CUSTOMER_API_PATH="${CUSTOMER_API_PATH:-api/v1/customer}"
CATALOG_API_PATH="${CATALOG_API_PATH:-api/v1/discovery}"
ORDER_API_PATH="${ORDER_API_PATH:-api/v1/orders}"
CART_API_PATH="${CART_API_PATH:-api/v1/cart}"
API_VERSION="${API_VERSION:-2022-08-01}"

fail() { echo "ERROR: $*" >&2; exit 1; }
for tool in az jq; do command -v "$tool" >/dev/null || fail "$tool is required"; done
[[ "${CONFIRM_FAVORITES_P2_P3_APIM_ROLLBACK:-false}" == "true" ]] || fail "Set CONFIRM_FAVORITES_P2_P3_APIM_ROLLBACK=true to remove Favorites P2/P3 APIM operations"

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
[[ -n "$SUBSCRIPTION_ID" ]] || fail "No active Azure subscription is selected"

api_id_for_path() {
  local path="$1" label="$2"
  local -a ids
  mapfile -t ids < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${path}'].name" -o tsv)
  (( ${#ids[@]} == 1 )) || fail "Expected exactly one APIM API at $path for $label; found ${#ids[@]}"
  printf '%s\n' "${ids[0]}"
}

CUSTOMER_API_ID="$(api_id_for_path "$CUSTOMER_API_PATH" 'customer favorites')"
CATALOG_API_ID="$(api_id_for_path "$CATALOG_API_PATH" 'Catalog discovery')"
ORDER_API_ID="$(api_id_for_path "$ORDER_API_PATH" 'customer orders')"
CART_API_ID="$(api_id_for_path "$CART_API_PATH" 'customer cart')"

mgmt_url() {
  local api_id="$1"
  printf 'https://management.azure.com/subscriptions/%s/resourceGroups/%s/providers/Microsoft.ApiManagement/service/%s/apis/%s' \
    "$SUBSCRIPTION_ID" "$RG" "$APIM" "$api_id"
}

normalize_template() {
  local value="$1"
  [[ "$value" == /* ]] && printf '%s' "$value" || printf '/%s' "$value"
}

remove_exact_operation() {
  local api_id="$1" operation_id="$2" expected_method="$3" expected_template="$4"
  local api_mgmt operation actual_method actual_template
  api_mgmt="$(mgmt_url "$api_id")"
  operation="$(az rest --method get --url "${api_mgmt}/operations/${operation_id}?api-version=${API_VERSION}" -o json 2>/dev/null || true)"
  if [[ -z "$operation" ]]; then
    echo "SKIP: $api_id/$operation_id does not exist"
    return
  fi
  actual_method="$(jq -r '.properties.method // .method // ""' <<<"$operation" | tr '[:lower:]' '[:upper:]')"
  actual_template="$(normalize_template "$(jq -r '.properties.urlTemplate // .urlTemplate // ""' <<<"$operation")")"
  [[ "$actual_method" == "${expected_method^^}" ]] || fail "$api_id/$operation_id method changed to $actual_method; refusing to delete"
  [[ "$actual_template" == "$(normalize_template "$expected_template")" ]] || fail "$api_id/$operation_id route changed to $actual_template; refusing to delete"
  az rest --method delete --url "${api_mgmt}/operations/${operation_id}?api-version=${API_VERSION}" -o none
  echo "REMOVED: $api_id $actual_method $actual_template ($operation_id)"
}

remove_exact_operation "$CUSTOMER_API_ID" 'list-favorite-home-chefs' 'GET' '/favorite-chefs'
remove_exact_operation "$CUSTOMER_API_ID" 'save-favorite-home-chef' 'PUT' '/favorite-chefs/{chefIdentityId}'
remove_exact_operation "$CUSTOMER_API_ID" 'remove-favorite-home-chef' 'DELETE' '/favorite-chefs/{chefIdentityId}'
remove_exact_operation "$CUSTOMER_API_ID" 'list-favorite-kitchens' 'GET' '/favorite-kitchens'
remove_exact_operation "$CUSTOMER_API_ID" 'save-favorite-kitchen' 'PUT' '/favorite-kitchens/{kitchenId}'
remove_exact_operation "$CUSTOMER_API_ID" 'remove-favorite-kitchen' 'DELETE' '/favorite-kitchens/{kitchenId}'
remove_exact_operation "$CUSTOMER_API_ID" 'list-favorite-watches' 'GET' '/favorite-watches'
remove_exact_operation "$CUSTOMER_API_ID" 'upsert-favorite-watch' 'PUT' '/favorite-watches/{entityType}/{entityId}'
remove_exact_operation "$CUSTOMER_API_ID" 'remove-favorite-watch' 'DELETE' '/favorite-watches/{entityType}/{entityId}'
remove_exact_operation "$CATALOG_API_ID" 'resolve-favorite-home-feed' 'POST' '/favorites/home/resolve'
remove_exact_operation "$ORDER_API_ID" 'list-repeat-order-candidates' 'GET' '/repeat-candidates'
remove_exact_operation "$CART_API_ID" 'reorder-customer-cart' 'POST' '/reorder/{orderId}'

echo "SUCCESS: Favorites P2/P3 APIM operation rollback complete. APIs and unrelated operations were preserved."
