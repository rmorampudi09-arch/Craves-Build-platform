#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
ORDER_APP="${ORDER_APP:-ca-craves-order-service-prodlow}"
CUSTOMER_API_PATH="${CUSTOMER_API_PATH:-api/v1/orders}"
CUSTOMER_API_ID_DEFAULT="${CUSTOMER_API_ID_DEFAULT:-craves-order-customer-v1}"
CHEF_API_PATH="${CHEF_API_PATH:-api/v1/chef/orders}"
CHEF_API_ID_DEFAULT="${CHEF_API_ID_DEFAULT:-craves-chef-orders-v1}"
API_VERSION="${API_VERSION:-2022-08-01}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
POLICY_TEMPLATE="${POLICY_TEMPLATE:-$ROOT/infra/apim/order-history-v2/order-history-policy.xml}"

fail() { echo "ERROR: $*" >&2; exit 1; }
for tool in az jq curl sed grep; do command -v "$tool" >/dev/null || fail "$tool is required"; done
[[ -f "$POLICY_TEMPLATE" ]] || fail "Policy template not found: $POLICY_TEMPLATE"

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
[[ -n "$SUBSCRIPTION_ID" ]] || fail "No active Azure subscription is selected."
az apim show -g "$RG" -n "$APIM" -o none

APP_JSON="$(az containerapp show -g "$RG" -n "$ORDER_APP" -o json)"
FQDN="$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$APP_JSON")"
LATEST="$(jq -r '.properties.latestRevisionName // ""' <<<"$APP_JSON")"
READY="$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$APP_JSON")"
RUNNING="$(jq -r '.properties.runningStatus // ""' <<<"$APP_JSON")"
[[ -n "$FQDN" ]] || fail "Order Service FQDN could not be resolved."
[[ -n "$LATEST" && "$LATEST" == "$READY" ]] || fail "Order Service latest revision is not Ready."
[[ "$RUNNING" == "Running" ]] || fail "Order Service is not Running."
curl -sS --fail --max-time 30 "https://$FQDN/actuator/health" >/dev/null

echo "Order backend health verified: https://$FQDN"

SERVICE_MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}"

read_policy_value() {
  az rest --method get --url "$1" --query properties.value -o tsv 2>/dev/null || true
}

reject_incompatible_backend_inheritance() {
  local scope="$1" value="$2"
  if grep -Eqi '<set-backend-service[^>]+backend-id=' <<<"$value"; then
    fail "$scope contains inherited backend-id routing. No change was made; use the approved backend entity instead of overriding it."
  fi
}

resolve_api() {
  local path="$1" default_id="$2" display_name="$3"
  local -a ids
  mapfile -t ids < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${path}'].name" -o tsv)
  (( ${#ids[@]} <= 1 )) || fail "Multiple APIM APIs already own public path $path."
  local api_id
  if (( ${#ids[@]} == 1 )); then
    api_id="${ids[0]}"
  else
    api_id="$default_id"
    az apim api create \
      -g "$RG" --service-name "$APIM" --api-id "$api_id" \
      --display-name "$display_name" --path "$path" \
      --service-url "https://${FQDN}" --protocols https \
      --subscription-required false -o none
  fi
  local sub_required
  sub_required="$(az apim api show -g "$RG" --service-name "$APIM" --api-id "$api_id" --query subscriptionRequired -o tsv)"
  [[ "${sub_required,,}" == "false" ]] || fail "Existing API $api_id requires an APIM subscription key; this script will not relax it."
  printf '%s' "$api_id"
}

put_page_operation() {
  local api_id="$1" backend="$2" operation_id="$3" display_name="$4"
  local mgmt="${SERVICE_MGMT}/apis/${api_id}"
  local global_policy api_policy
  global_policy="$(read_policy_value "${SERVICE_MGMT}/policies/policy?api-version=${API_VERSION}")"
  api_policy="$(read_policy_value "${mgmt}/policies/policy?api-version=${API_VERSION}")"
  reject_incompatible_backend_inheritance "APIM global policy" "$global_policy"
  reject_incompatible_backend_inheritance "API $api_id policy" "$api_policy"

  local body rendered policy_body
  body="$(mktemp)"; rendered="$(mktemp)"; policy_body="$(mktemp)"
  cat >"$body" <<'JSON'
{
  "properties": {
    "displayName": "__DISPLAY_NAME__",
    "method": "GET",
    "urlTemplate": "/page",
    "templateParameters": [],
    "responses": [
      {"statusCode": 200, "description": "Cursor-paged order history"},
      {"statusCode": 400, "description": "Invalid cursor, limit or status"},
      {"statusCode": 401, "description": "Authentication required"},
      {"statusCode": 403, "description": "Required Craves role is missing"}
    ]
  }
}
JSON
  sed -i "s|__DISPLAY_NAME__|${display_name}|g" "$body"
  az rest --method put --url "${mgmt}/operations/${operation_id}?api-version=${API_VERSION}" --body @"$body" -o none

  sed "s|__ORDER_HISTORY_BACKEND_URL__|${backend}|g" "$POLICY_TEMPLATE" >"$rendered"
  grep -q '__ORDER_HISTORY_BACKEND_URL__' "$rendered" && fail "Backend placeholder was not fully rendered."
  jq -Rs '{properties:{format:"rawxml",value:.}}' "$rendered" >"$policy_body"
  az rest --method put --url "${mgmt}/operations/${operation_id}/policies/policy?api-version=${API_VERSION}" --body @"$policy_body" -o none

  local policy_value
  policy_value="$(az rest --method get --url "${mgmt}/operations/${operation_id}/policies/policy?api-version=${API_VERSION}" --query properties.value -o tsv)"
  [[ "$policy_value" == *"Authorization"* ]] || fail "$operation_id policy does not enforce Authorization."
  [[ "$policy_value" == *"Bearer "* ]] || fail "$operation_id policy does not enforce Bearer syntax."
  [[ "$policy_value" == *"$backend"* ]] || fail "$operation_id policy does not point to expected backend."
  [[ "$policy_value" == *"no-store"* ]] || fail "$operation_id policy does not disable caching."

  rm -f "$body" "$rendered" "$policy_body"
}

CUSTOMER_API_ID="$(resolve_api "$CUSTOMER_API_PATH" "$CUSTOMER_API_ID_DEFAULT" "Craves Customer Orders API")"
CHEF_API_ID="$(resolve_api "$CHEF_API_PATH" "$CHEF_API_ID_DEFAULT" "Craves Chef Orders API")"

put_page_operation \
  "$CUSTOMER_API_ID" \
  "https://${FQDN}/api/v1/orders" \
  "list-customer-orders-page-v2" \
  "List customer order history page"

put_page_operation \
  "$CHEF_API_ID" \
  "https://${FQDN}/api/v1/chef/orders" \
  "list-chef-orders-page-v2" \
  "List chef order history page"

echo "SUCCESS: Order History v2 APIM operations configured."
echo "Customer: /${CUSTOMER_API_PATH}/page on API ${CUSTOMER_API_ID}"
echo "Chef:     /${CHEF_API_PATH}/page on API ${CHEF_API_ID}"
