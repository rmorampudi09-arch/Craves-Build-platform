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
POLICY_TEMPLATE="$ROOT/infra/apim/customer-addresses/customer-address-policy.xml"

fail() { echo "ERROR: $*" >&2; exit 1; }
for tool in az jq curl sed; do command -v "$tool" >/dev/null || fail "$tool is required"; done
[[ -f "$POLICY_TEMPLATE" ]] || fail "Policy template is missing"

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
APP_JSON=$(az containerapp show -g "$RG" -n "$USER_APP" -o json)
FQDN=$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$APP_JSON")
LATEST=$(jq -r '.properties.latestRevisionName // ""' <<<"$APP_JSON")
READY=$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$APP_JSON")
RUNNING=$(jq -r '.properties.runningStatus // ""' <<<"$APP_JSON")
[[ -n "$FQDN" && "$LATEST" == "$READY" && "$RUNNING" == "Running" ]] || fail "User/Chef Service is not ready"
curl -sS --fail --max-time 30 "https://$FQDN/actuator/health" >/dev/null

mapfile -t API_IDS < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${API_PATH}'].name" -o tsv)
(( ${#API_IDS[@]} <= 1 )) || fail "Multiple APIM APIs own $API_PATH"
BACKEND="https://${FQDN}/api/v1/customer"
if (( ${#API_IDS[@]} == 0 )); then
  az apim api create -g "$RG" --service-name "$APIM" --api-id "$NEW_API_ID" --display-name "Craves Customer Profile API" --path "$API_PATH" --service-url "$BACKEND" --protocols https --subscription-required false -o none
  API_ID="$NEW_API_ID"
else
  API_ID="${API_IDS[0]}"
  SUB_REQUIRED=$(az apim api show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --query subscriptionRequired -o tsv)
  [[ "${SUB_REQUIRED,,}" == "false" ]] || fail "Existing customer API requires a subscription key; this script will not relax it"
fi

MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/apis/${API_ID}"
for SCOPE_URL in \
  "https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/policies/policy?api-version=${API_VERSION}" \
  "${MGMT}/policies/policy?api-version=${API_VERSION}"; do
  POLICY=$(az rest --method get --url "$SCOPE_URL" --query properties.value -o tsv 2>/dev/null || true)
  [[ "$POLICY" != *'set-backend-service backend-id='* ]] || fail "Inherited backend-id policy cannot be safely overridden"
done

# Resolve an operation by HTTP method and route shape before writing it.
# APIM operation IDs are operator-defined and may differ between earlier runs.
# Route-shape matching also treats /addresses/{id} and
# /addresses/{addressId} as the same operation, matching APIM's uniqueness rule.
resolve_operation_id() {
  local DESIRED_ID="$1" METHOD="$2" TEMPLATE="$3"
  local OPERATIONS_JSON DESIRED_ID_COUNT
  local -a MATCH_IDS=()

  OPERATIONS_JSON=$(az apim api operation list \
    -g "$RG" \
    --service-name "$APIM" \
    --api-id "$API_ID" \
    -o json)

  mapfile -t MATCH_IDS < <(
    jq -r \
      --arg method "$METHOD" \
      --arg template "$TEMPLATE" '
        def route_shape:
          ltrimstr("/")
          | gsub("\\{[^/{}]+\\}"; "{}");
        .[]
        | select(
            (((.method // "") | ascii_upcase) == ($method | ascii_upcase))
            and (((.urlTemplate // "") | route_shape) == ($template | route_shape))
          )
        | .name
      ' <<<"$OPERATIONS_JSON"
  )

  (( ${#MATCH_IDS[@]} <= 1 )) || fail "Multiple APIM operations match $METHOD $TEMPLATE; refusing to choose one"

  if (( ${#MATCH_IDS[@]} == 1 )); then
    echo "INFO: Reusing existing APIM operation ${MATCH_IDS[0]} for $METHOD $TEMPLATE." >&2
    printf '%s\n' "${MATCH_IDS[0]}"
    return
  fi

  DESIRED_ID_COUNT=$(jq -r --arg id "$DESIRED_ID" '[.[] | select(.name == $id)] | length' <<<"$OPERATIONS_JSON")
  [[ "$DESIRED_ID_COUNT" == "0" ]] || fail "Desired operation ID $DESIRED_ID already owns another route; refusing to overwrite it"

  echo "INFO: Creating APIM operation $DESIRED_ID for $METHOD $TEMPLATE." >&2
  printf '%s\n' "$DESIRED_ID"
}

put_operation() {
  local DESIRED_ID="$1" METHOD="$2" TEMPLATE="$3" DISPLAY="$4" PARAMS="$5" STATUS="$6"
  local EFFECTIVE_ID BODY RENDERED POLICY_BODY OPERATION_JSON POLICY ACTUAL_METHOD ACTUAL_TEMPLATE

  EFFECTIVE_ID=$(resolve_operation_id "$DESIRED_ID" "$METHOD" "$TEMPLATE")
  BODY=$(mktemp)
  RENDERED=$(mktemp)
  POLICY_BODY=$(mktemp)

  cat >"$BODY" <<JSON
{"properties":{"displayName":"$DISPLAY","method":"$METHOD","urlTemplate":"$TEMPLATE","templateParameters":$PARAMS,"responses":[{"statusCode":$STATUS,"description":"Customer address response"},{"statusCode":401,"description":"Authentication required"},{"statusCode":404,"description":"Address not found"}]}}
JSON

  az rest --method put --url "${MGMT}/operations/${EFFECTIVE_ID}?api-version=${API_VERSION}" --body @"$BODY" -o none

  sed "s|__CUSTOMER_BACKEND_URL__|${BACKEND}|g" "$POLICY_TEMPLATE" >"$RENDERED"
  jq -Rs '{properties:{format:"rawxml",value:.}}' "$RENDERED" >"$POLICY_BODY"
  az rest --method put --url "${MGMT}/operations/${EFFECTIVE_ID}/policies/policy?api-version=${API_VERSION}" --body @"$POLICY_BODY" -o none

  OPERATION_JSON=$(az apim api operation show \
    -g "$RG" \
    --service-name "$APIM" \
    --api-id "$API_ID" \
    --operation-id "$EFFECTIVE_ID" \
    -o json)
  ACTUAL_METHOD=$(jq -r '.method // "" | ascii_upcase' <<<"$OPERATION_JSON")
  ACTUAL_TEMPLATE=$(jq -r '.urlTemplate // ""' <<<"$OPERATION_JSON")
  [[ "$ACTUAL_METHOD" == "${METHOD^^}" && "$ACTUAL_TEMPLATE" == "$TEMPLATE" ]] || fail "Operation $EFFECTIVE_ID route verification failed"

  POLICY=$(az rest --method get --url "${MGMT}/operations/${EFFECTIVE_ID}/policies/policy?api-version=${API_VERSION}" --query properties.value -o tsv)
  [[ "$POLICY" == *"$BACKEND"* && "$POLICY" == *"Authorization"* && "$POLICY" == *"no-store"* ]] || fail "Operation $EFFECTIVE_ID policy verification failed"

  rm -f "$BODY" "$RENDERED" "$POLICY_BODY"
  echo "VERIFIED: $METHOD $TEMPLATE uses APIM operation $EFFECTIVE_ID."
}

ADDRESS_PARAM='[{"name":"addressId","type":"string","required":true}]'
put_operation "list-customer-addresses" "GET" "/addresses" "List customer addresses" '[]' 200
put_operation "create-customer-address" "POST" "/addresses" "Create customer address" '[]' 200
put_operation "get-customer-address" "GET" "/addresses/{addressId}" "Get customer address" "$ADDRESS_PARAM" 200
put_operation "update-customer-address" "PUT" "/addresses/{addressId}" "Update customer address" "$ADDRESS_PARAM" 200
put_operation "delete-customer-address" "DELETE" "/addresses/{addressId}" "Delete customer address" "$ADDRESS_PARAM" 204
put_operation "recommend-customer-location" "GET" "/addresses/recommendation" "Recommend customer location" '[]' 200

echo "SUCCESS: Customer address operations configured idempotently on APIM API $API_ID."
