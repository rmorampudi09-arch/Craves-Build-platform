#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
USER_APP="${USER_APP:-ca-craves-user-chef-service-prod}"
API_PATH="${API_PATH:-api/v1/customer}"
NEW_API_ID="${NEW_API_ID:-craves-customer-profile-v1}"
API_VERSION="${API_VERSION:-2022-08-01}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
POLICY_TEMPLATE="$ROOT/infra/apim/customer-favorites/customer-favorites-policy.xml"

fail() { echo "ERROR: $*" >&2; exit 1; }
for tool in az jq curl sed; do command -v "$tool" >/dev/null || fail "$tool is required"; done
[[ -f "$POLICY_TEMPLATE" ]] || fail "Favorites policy template is missing"

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
[[ -n "$SUBSCRIPTION_ID" ]] || fail "No active Azure subscription is selected"

APP_JSON=$(az containerapp show -g "$RG" -n "$USER_APP" -o json)
FQDN=$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$APP_JSON")
LATEST=$(jq -r '.properties.latestRevisionName // ""' <<<"$APP_JSON")
READY=$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$APP_JSON")
RUNNING=$(jq -r '.properties.runningStatus // ""' <<<"$APP_JSON")
[[ -n "$FQDN" && "$LATEST" == "$READY" && "$RUNNING" == "Running" ]] || fail "User/Chef Service is not ready"

curl \
  --silent \
  --show-error \
  --fail \
  --retry 6 \
  --retry-delay 5 \
  --retry-all-errors \
  --max-time 20 \
  "https://$FQDN/actuator/health/readiness" \
  >/dev/null

mapfile -t API_IDS < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${API_PATH}'].name" -o tsv)
(( ${#API_IDS[@]} <= 1 )) || fail "Multiple APIM APIs own $API_PATH"
BACKEND="https://${FQDN}/api/v1/customer"

if (( ${#API_IDS[@]} == 0 )); then
  az apim api create \
    -g "$RG" \
    --service-name "$APIM" \
    --api-id "$NEW_API_ID" \
    --display-name "Craves Customer Profile API" \
    --path "$API_PATH" \
    --service-url "$BACKEND" \
    --protocols https \
    --subscription-required false \
    -o none
  API_ID="$NEW_API_ID"
else
  API_ID="${API_IDS[0]}"
  SUB_REQUIRED=$(az apim api show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --query subscriptionRequired -o tsv)
  [[ "${SUB_REQUIRED,,}" == "false" ]] || fail "Existing customer API requires a subscription key; refusing to relax it"
fi

MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/apis/${API_ID}"

for SCOPE_URL in \
  "https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/policies/policy?api-version=${API_VERSION}" \
  "${MGMT}/policies/policy?api-version=${API_VERSION}"; do
  POLICY=$(az rest --method get --url "$SCOPE_URL" --query properties.value -o tsv 2>/dev/null || true)
  [[ "$POLICY" != *'set-backend-service backend-id='* ]] || fail "Inherited backend-id policy cannot be safely overridden"
done

resolve_operation_id() {
  local desired_id="$1" method="$2" template="$3"
  local operations_json actual_id
  local -a matching_ids desired_records

  operations_json=$(az apim api operation list -g "$RG" --service-name "$APIM" --api-id "$API_ID" -o json)

  mapfile -t matching_ids < <(
    jq -r \
      --arg method "$method" \
      --arg template "$template" '
        .[]
        | select(((.method // .properties.method // "") | ascii_upcase) == ($method | ascii_upcase))
        | select(("/" + ((.urlTemplate // .properties.urlTemplate // "") | ltrimstr("/"))) == ("/" + ($template | ltrimstr("/"))))
        | (.name // ((.id // "") | split("/")[-1]))
      ' <<<"$operations_json"
  )
  (( ${#matching_ids[@]} <= 1 )) || fail "Multiple APIM operations already use $method $template"

  mapfile -t desired_records < <(
    jq -r \
      --arg id "$desired_id" '
        .[]
        | select((.name // ((.id // "") | split("/")[-1])) == $id)
        | [(.method // .properties.method // ""), (.urlTemplate // .properties.urlTemplate // "")]
        | @tsv
      ' <<<"$operations_json"
  )
  (( ${#desired_records[@]} <= 1 )) || fail "APIM returned duplicate records for operation ID $desired_id"

  if (( ${#matching_ids[@]} == 1 )); then
    actual_id="${matching_ids[0]}"
    [[ -n "$actual_id" ]] || fail "Existing APIM operation for $method $template has no operation ID"
    if (( ${#desired_records[@]} == 1 )) && [[ "$actual_id" != "$desired_id" ]]; then
      fail "Operation ID $desired_id already belongs to another route; refusing to overwrite it"
    fi
    printf '%s\n' "$actual_id"
    return
  fi

  if (( ${#desired_records[@]} == 1 )); then
    fail "Operation ID $desired_id already exists with a different method or URL template"
  fi

  printf '%s\n' "$desired_id"
}

CONFIGURED_OPERATION_IDS=()

put_operation() {
  local desired_id="$1" method="$2" template="$3" display="$4" params="$5" success_status="$6"
  local actual_id body rendered policy_body

  actual_id=$(resolve_operation_id "$desired_id" "$method" "$template")
  body=$(mktemp)
  rendered=$(mktemp)
  policy_body=$(mktemp)

  cat >"$body" <<JSON
{"properties":{"displayName":"$display","method":"$method","urlTemplate":"$template","templateParameters":$params,"responses":[{"statusCode":$success_status,"description":"Favorites response"},{"statusCode":401,"description":"Authentication required"},{"statusCode":403,"description":"Customer role required"},{"statusCode":409,"description":"Favorites limit reached"},{"statusCode":500,"description":"Server error"}]}}
JSON

  az rest --method put --url "${MGMT}/operations/${actual_id}?api-version=${API_VERSION}" --body @"$body" -o none
  sed "s|__CUSTOMER_BACKEND_URL__|${BACKEND}|g" "$POLICY_TEMPLATE" >"$rendered"
  jq -Rs '{properties:{format:"rawxml",value:.}}' "$rendered" >"$policy_body"
  az rest --method put --url "${MGMT}/operations/${actual_id}/policies/policy?api-version=${API_VERSION}" --body @"$policy_body" -o none

  rm -f "$body" "$rendered" "$policy_body"
  CONFIGURED_OPERATION_IDS+=("$actual_id")
}

MENU_ITEM_PARAM='[{"name":"menuItemId","type":"string","required":true}]'
put_operation "list-customer-favorites" "GET" "/favorites" "List customer favorites" '[]' 200
put_operation "save-customer-favorite" "PUT" "/favorites/{menuItemId}" "Save customer favorite" "$MENU_ITEM_PARAM" 200
put_operation "remove-customer-favorite" "DELETE" "/favorites/{menuItemId}" "Remove customer favorite" "$MENU_ITEM_PARAM" 204

for id in "${CONFIGURED_OPERATION_IDS[@]}"; do
  az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$id" -o none
  policy=$(az rest --method get --url "${MGMT}/operations/${id}/policies/policy?api-version=${API_VERSION}" --query properties.value -o tsv)
  [[ "$policy" == *"$BACKEND"* ]] || fail "Operation $id backend policy verification failed"
  [[ "$policy" == *"Authorization"* ]] || fail "Operation $id authentication policy verification failed"
  [[ "$policy" == *"X-Correlation-Id"* ]] || fail "Operation $id correlation policy verification failed"
  [[ "$policy" == *"no-store"* ]] || fail "Operation $id cache policy verification failed"
done

echo "SUCCESS: Customer Favorites GET/PUT/DELETE operations configured on APIM API $API_ID."
