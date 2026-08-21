#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
USER_APP="${USER_APP:-ca-craves-user-chef-service-prod}"
CATALOG_APP="${CATALOG_APP:-ca-craves-catalog-service-prodlo}"
ORDER_APP="${ORDER_APP:-ca-craves-order-service-prodlow}"
CUSTOMER_API_PATH="${CUSTOMER_API_PATH:-api/v1/customer}"
CATALOG_API_PATH="${CATALOG_API_PATH:-api/v1/discovery}"
ORDER_API_PATH="${ORDER_API_PATH:-api/v1/orders}"
CART_API_PATH="${CART_API_PATH:-api/v1/cart}"
API_VERSION="${API_VERSION:-2022-08-01}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
POLICY_TEMPLATE="$ROOT/infra/apim/favorites-p2-p3/favorites-private-operation-policy.xml"

fail() { echo "ERROR: $*" >&2; exit 1; }
for tool in az jq curl sed; do command -v "$tool" >/dev/null || fail "$tool is required"; done
[[ -f "$POLICY_TEMPLATE" ]] || fail "Favorites P2/P3 APIM policy template is missing"

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
[[ -n "$SUBSCRIPTION_ID" ]] || fail "No active Azure subscription is selected"

container_fqdn() {
  local app="$1" label="$2" health_path="$3"
  local app_json fqdn latest ready running
  app_json="$(az containerapp show -g "$RG" -n "$app" -o json)"
  fqdn="$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$app_json")"
  latest="$(jq -r '.properties.latestRevisionName // ""' <<<"$app_json")"
  ready="$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$app_json")"
  running="$(jq -r '.properties.runningStatus // ""' <<<"$app_json")"
  [[ -n "$fqdn" && "$latest" == "$ready" && "$running" == "Running" ]] || fail "$label is not ready"
  curl --silent --show-error --fail --retry 4 --retry-delay 3 --retry-all-errors --max-time 25 \
    "https://${fqdn}${health_path}" >/dev/null
  printf '%s\n' "$fqdn"
}

USER_FQDN="$(container_fqdn "$USER_APP" 'User/Chef Service' '/actuator/health/readiness')"
CATALOG_FQDN="$(container_fqdn "$CATALOG_APP" 'Catalog Service' '/actuator/health')"
ORDER_FQDN="$(container_fqdn "$ORDER_APP" 'Order Service' '/actuator/health')"

CUSTOMER_BACKEND="https://${USER_FQDN}/api/v1/customer"
CATALOG_BACKEND="https://${CATALOG_FQDN}/api/v1/discovery"
ORDER_BACKEND="https://${ORDER_FQDN}/api/v1/orders"
CART_BACKEND="https://${ORDER_FQDN}/api/v1/cart"

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

assert_api_safe() {
  local api_id="$1" label="$2"
  local subscription_required api_mgmt global_policy api_policy
  subscription_required="$(az apim api show -g "$RG" --service-name "$APIM" --api-id "$api_id" --query subscriptionRequired -o tsv)"
  [[ "${subscription_required,,}" == "false" ]] || fail "$label API requires a subscription key; this script will not relax it"
  api_mgmt="$(mgmt_url "$api_id")"
  global_policy="$(az rest --method get --url "https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/policies/policy?api-version=${API_VERSION}" --query properties.value -o tsv 2>/dev/null || true)"
  api_policy="$(az rest --method get --url "${api_mgmt}/policies/policy?api-version=${API_VERSION}" --query properties.value -o tsv 2>/dev/null || true)"
  [[ "$global_policy" != *'set-backend-service backend-id='* ]] || fail "Global inherited backend-id policy cannot be safely overridden for $label"
  [[ "$api_policy" != *'set-backend-service backend-id='* ]] || fail "API inherited backend-id policy cannot be safely overridden for $label"
}

assert_api_safe "$CUSTOMER_API_ID" 'customer'
assert_api_safe "$CATALOG_API_ID" 'Catalog discovery'
assert_api_safe "$ORDER_API_ID" 'orders'
assert_api_safe "$CART_API_ID" 'cart'

resolve_operation_id() {
  local api_id="$1" desired_id="$2" method="$3" template="$4"
  local operations_json actual_id
  local -a matching_ids desired_records
  operations_json="$(az apim api operation list -g "$RG" --service-name "$APIM" --api-id "$api_id" -o json)"
  mapfile -t matching_ids < <(
    jq -r --arg method "$method" --arg template "$template" '
      .[]
      | select(((.method // .properties.method // "") | ascii_upcase) == ($method | ascii_upcase))
      | select(("/" + ((.urlTemplate // .properties.urlTemplate // "") | ltrimstr("/"))) == ("/" + ($template | ltrimstr("/"))))
      | (.name // ((.id // "") | split("/")[-1]))
    ' <<<"$operations_json"
  )
  (( ${#matching_ids[@]} <= 1 )) || fail "Multiple APIM operations already use $method $template on $api_id"
  mapfile -t desired_records < <(
    jq -r --arg id "$desired_id" '
      .[]
      | select((.name // ((.id // "") | split("/")[-1])) == $id)
      | [(.method // .properties.method // ""), (.urlTemplate // .properties.urlTemplate // "")]
      | @tsv
    ' <<<"$operations_json"
  )
  (( ${#desired_records[@]} <= 1 )) || fail "APIM returned duplicate operation ID $desired_id on $api_id"
  if (( ${#matching_ids[@]} == 1 )); then
    actual_id="${matching_ids[0]}"
    [[ -n "$actual_id" ]] || fail "Existing $method $template operation has no ID"
    if (( ${#desired_records[@]} == 1 )) && [[ "$actual_id" != "$desired_id" ]]; then
      fail "Operation ID $desired_id belongs to another route on $api_id"
    fi
    printf '%s\n' "$actual_id"
    return
  fi
  (( ${#desired_records[@]} == 0 )) || fail "Operation ID $desired_id already exists with another route on $api_id"
  printf '%s\n' "$desired_id"
}

CONFIGURED=()
put_operation() {
  local api_id="$1" backend="$2" desired_id="$3" method="$4" template="$5" display="$6" params="$7" success_status="$8"
  local actual_id api_mgmt body rendered policy_body
  actual_id="$(resolve_operation_id "$api_id" "$desired_id" "$method" "$template")"
  api_mgmt="$(mgmt_url "$api_id")"
  body="$(mktemp)"; rendered="$(mktemp)"; policy_body="$(mktemp)"
  cat >"$body" <<JSON
{"properties":{"displayName":"$display","method":"$method","urlTemplate":"$template","templateParameters":$params,"responses":[{"statusCode":$success_status,"description":"Favorites P2/P3 response"},{"statusCode":400,"description":"Request validation failed"},{"statusCode":401,"description":"Authentication required"},{"statusCode":403,"description":"Customer role required"},{"statusCode":404,"description":"Referenced resource not found"},{"statusCode":409,"description":"Current state conflict"},{"statusCode":500,"description":"Server error"}]}}
JSON
  az rest --method put --url "${api_mgmt}/operations/${actual_id}?api-version=${API_VERSION}" --body @"$body" -o none
  sed "s|__FAVORITES_BACKEND_URL__|${backend}|g" "$POLICY_TEMPLATE" >"$rendered"
  jq -Rs '{properties:{format:"rawxml",value:.}}' "$rendered" >"$policy_body"
  az rest --method put --url "${api_mgmt}/operations/${actual_id}/policies/policy?api-version=${API_VERSION}" --body @"$policy_body" -o none
  rm -f "$body" "$rendered" "$policy_body"
  CONFIGURED+=("${api_id}|${actual_id}|${backend}")
}

CHEF_PARAM='[{"name":"chefIdentityId","type":"string","required":true}]'
KITCHEN_PARAM='[{"name":"kitchenId","type":"string","required":true}]'
WATCH_PARAMS='[{"name":"entityType","type":"string","required":true},{"name":"entityId","type":"string","required":true}]'
ORDER_PARAM='[{"name":"orderId","type":"string","required":true}]'

put_operation "$CUSTOMER_API_ID" "$CUSTOMER_BACKEND" 'list-favorite-home-chefs' 'GET' '/favorite-chefs' 'List favorite home chefs' '[]' 200
put_operation "$CUSTOMER_API_ID" "$CUSTOMER_BACKEND" 'save-favorite-home-chef' 'PUT' '/favorite-chefs/{chefIdentityId}' 'Save favorite home chef' "$CHEF_PARAM" 200
put_operation "$CUSTOMER_API_ID" "$CUSTOMER_BACKEND" 'remove-favorite-home-chef' 'DELETE' '/favorite-chefs/{chefIdentityId}' 'Remove favorite home chef' "$CHEF_PARAM" 204
put_operation "$CUSTOMER_API_ID" "$CUSTOMER_BACKEND" 'list-favorite-kitchens' 'GET' '/favorite-kitchens' 'List favorite kitchens' '[]' 200
put_operation "$CUSTOMER_API_ID" "$CUSTOMER_BACKEND" 'save-favorite-kitchen' 'PUT' '/favorite-kitchens/{kitchenId}' 'Save favorite kitchen' "$KITCHEN_PARAM" 200
put_operation "$CUSTOMER_API_ID" "$CUSTOMER_BACKEND" 'remove-favorite-kitchen' 'DELETE' '/favorite-kitchens/{kitchenId}' 'Remove favorite kitchen' "$KITCHEN_PARAM" 204
put_operation "$CUSTOMER_API_ID" "$CUSTOMER_BACKEND" 'list-favorite-watches' 'GET' '/favorite-watches' 'List favorite notification watches' '[]' 200
put_operation "$CUSTOMER_API_ID" "$CUSTOMER_BACKEND" 'upsert-favorite-watch' 'PUT' '/favorite-watches/{entityType}/{entityId}' 'Update favorite notification watch' "$WATCH_PARAMS" 200
put_operation "$CUSTOMER_API_ID" "$CUSTOMER_BACKEND" 'remove-favorite-watch' 'DELETE' '/favorite-watches/{entityType}/{entityId}' 'Remove favorite notification watch' "$WATCH_PARAMS" 204
put_operation "$CATALOG_API_ID" "$CATALOG_BACKEND" 'resolve-favorite-home-feed' 'POST' '/favorites/home/resolve' 'Resolve favorite home Cooking Today feed' '[]' 200
put_operation "$ORDER_API_ID" "$ORDER_BACKEND" 'list-repeat-order-candidates' 'GET' '/repeat-candidates' 'List Order Like Last Time candidates' '[]' 200
put_operation "$CART_API_ID" "$CART_BACKEND" 'reorder-customer-cart' 'POST' '/reorder/{orderId}' 'Rebuild cart from previous order' "$ORDER_PARAM" 200

for record in "${CONFIGURED[@]}"; do
  IFS='|' read -r api_id operation_id backend <<<"$record"
  api_mgmt="$(mgmt_url "$api_id")"
  az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$api_id" --operation-id "$operation_id" -o none
  policy="$(az rest --method get --url "${api_mgmt}/operations/${operation_id}/policies/policy?api-version=${API_VERSION}" --query properties.value -o tsv)"
  [[ "$policy" == *"$backend"* ]] || fail "$api_id/$operation_id backend verification failed"
  [[ "$policy" == *'Authorization'* ]] || fail "$api_id/$operation_id authentication policy verification failed"
  [[ "$policy" == *'X-Correlation-Id'* ]] || fail "$api_id/$operation_id correlation policy verification failed"
  [[ "$policy" == *'no-store'* ]] || fail "$api_id/$operation_id no-store policy verification failed"
done

echo "SUCCESS: Favorites P2/P3 private APIM operations configured and verified."
echo "NOTE: Notification dispatch remains disabled; this publishes preference APIs only."
