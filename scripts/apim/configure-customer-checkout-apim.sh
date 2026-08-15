#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
ORDER_APP="${ORDER_APP:-ca-craves-order-service-prodlow}"
API_PATH="${API_PATH:-api/v1/checkout}"
NEW_API_ID="${NEW_API_ID:-craves-customer-checkout-v1}"
API_VERSION="${API_VERSION:-2022-08-01}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
POLICY_TEMPLATE="$ROOT/infra/apim/customer-checkout/customer-checkout-policy.xml"

fail() { echo "ERROR: $*" >&2; exit 1; }
for tool in az jq curl sed; do command -v "$tool" >/dev/null || fail "$tool is required"; done
[[ -f "$POLICY_TEMPLATE" ]] || fail "Policy template is missing"
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
APP_JSON=$(az containerapp show -g "$RG" -n "$ORDER_APP" -o json)
FQDN=$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$APP_JSON")
LATEST=$(jq -r '.properties.latestRevisionName // ""' <<<"$APP_JSON")
READY=$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$APP_JSON")
RUNNING=$(jq -r '.properties.runningStatus // ""' <<<"$APP_JSON")
[[ -n "$FQDN" && "$LATEST" == "$READY" && "$RUNNING" == "Running" ]] || fail "Order Service is not ready"
curl -sS --fail --max-time 30 "https://$FQDN/actuator/health" >/dev/null

mapfile -t API_IDS < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${API_PATH}'].name" -o tsv)
(( ${#API_IDS[@]} <= 1 )) || fail "Multiple APIM APIs own $API_PATH"
BACKEND="https://${FQDN}/api/v1/checkout"
if (( ${#API_IDS[@]} == 0 )); then
  az apim api create -g "$RG" --service-name "$APIM" --api-id "$NEW_API_ID" --display-name "Craves Customer Checkout API" --path "$API_PATH" --service-url "$BACKEND" --protocols https --subscription-required false -o none
  API_ID="$NEW_API_ID"
else
  API_ID="${API_IDS[0]}"
  SUB_REQUIRED=$(az apim api show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --query subscriptionRequired -o tsv)
  [[ "${SUB_REQUIRED,,}" == "false" ]] || fail "Existing checkout API requires a subscription key; this script will not relax it"
fi
MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/apis/${API_ID}"
for SCOPE_URL in "https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/policies/policy?api-version=${API_VERSION}" "${MGMT}/policies/policy?api-version=${API_VERSION}"; do
  POLICY=$(az rest --method get --url "$SCOPE_URL" --query properties.value -o tsv 2>/dev/null || true)
  [[ "$POLICY" != *'set-backend-service backend-id='* ]] || fail "Inherited backend-id policy cannot be safely overridden"
done

# Find an existing operation by method and URL template
find_operation_by_method_template() {
  local METHOD="$1" TEMPLATE="$2"
  local OPS_JSON FOUND_ID
  
  # List all operations in this API
  OPS_JSON=$(az apim api operation list -g "$RG" --service-name "$APIM" --api-id "$API_ID" -o json 2>/dev/null || echo "[]")
  
  # Extract operation IDs that match both method and template
  FOUND_ID=$(jq -r ".[]? | select(.method==\"${METHOD}\" and .urlTemplate==\"${TEMPLATE}\") | .name" <<<"$OPS_JSON" 2>/dev/null | head -1)
  [[ -n "$FOUND_ID" ]] && echo "$FOUND_ID" || echo ""
}

# Get operation details by ID
get_operation_details() {
  local OP_ID="$1"
  az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$OP_ID" -o json 2>/dev/null || echo "{}"
}

# Reconcile a single operation: match by method+template, reuse if exists, create if not
reconcile_operation() {
  local PREFERRED_ID="$1" METHOD="$2" TEMPLATE="$3" DISPLAY="$4" PARAMS="$5"
  local EXISTING_ID OP_JSON BODY RENDERED POLICY_BODY OP_ID
  
  # Step 1: Check if any operation already owns this method + URL template
  EXISTING_ID=$(find_operation_by_method_template "$METHOD" "$TEMPLATE")
  
  if [[ -n "$EXISTING_ID" ]]; then
    # Operation with this method+template already exists; reuse it
    if [[ "$EXISTING_ID" != "$PREFERRED_ID" ]]; then
      echo "INFO: Found existing operation '$EXISTING_ID' for $METHOD $TEMPLATE (preferred ID was $PREFERRED_ID); will reuse."
    fi
    OP_ID="$EXISTING_ID"
  else
    # No operation owns this method+template yet; use preferred ID
    OP_ID="$PREFERRED_ID"
  fi
  
  # Step 2: Create or update the operation definition using az rest
  BODY=$(mktemp)
  cat >"$BODY" <<JSON
{"properties":{"displayName":"$DISPLAY","method":"$METHOD","urlTemplate":"$TEMPLATE","templateParameters":$PARAMS,"responses":[{"statusCode":200,"description":"Customer checkout response"},{"statusCode":400,"description":"Checkout validation failed"},{"statusCode":401,"description":"Authentication required"},{"statusCode":404,"description":"Checkout not found"},{"statusCode":409,"description":"Pricing quote stale or changed"},{"statusCode":503,"description":"Delivery route service unavailable"}]}}
JSON
  
  echo "DEBUG: Creating/updating operation $OP_ID for $METHOD $TEMPLATE"
  az rest --method put --url "${MGMT}/operations/${OP_ID}?api-version=${API_VERSION}" --body @"$BODY" -o none || fail "Failed to create/update operation $OP_ID"
  rm -f "$BODY"
  
  # Step 3: Apply the policy to the operation
  RENDERED=$(mktemp); POLICY_BODY=$(mktemp)
  sed "s|__CHECKOUT_BACKEND_URL__|${BACKEND}|g" "$POLICY_TEMPLATE" >"$RENDERED"
  jq -Rs '{properties:{format:"rawxml",value:.}}' "$RENDERED" >"$POLICY_BODY"
  
  echo "DEBUG: Applying policy to operation $OP_ID"
  az rest --method put --url "${MGMT}/operations/${OP_ID}/policies/policy?api-version=${API_VERSION}" --body @"$POLICY_BODY" -o none || fail "Failed to apply policy to operation $OP_ID"
  rm -f "$RENDERED" "$POLICY_BODY"
  
  # Return the actual resolved operation ID
  echo "$OP_ID"
}

# Reconcile all three operations and capture their actual resolved IDs
QUOTE_OP=$(reconcile_operation "quote-customer-checkout" "POST" "/quote" "Calculate customer checkout price" '[]')
CREATE_OP=$(reconcile_operation "create-customer-checkout" "POST" "/" "Create customer checkout" '[]')
GET_OP=$(reconcile_operation "get-customer-checkout" "GET" "/{checkoutId}" "Get customer checkout" '[{"name":"checkoutId","type":"string","required":true}]')

# Verify all operations using their actual resolved IDs
for ID in "$QUOTE_OP" "$CREATE_OP" "$GET_OP"; do
  az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$ID" -o none
  POLICY=$(az rest --method get --url "${MGMT}/operations/${ID}/policies/policy?api-version=${API_VERSION}" --query properties.value -o tsv)
  [[ "$POLICY" == *"$BACKEND"* && "$POLICY" == *"Authorization"* && "$POLICY" == *"no-store"* ]] || fail "Operation $ID policy verification failed"
done

echo "SUCCESS: Customer checkout quote/create/get operations configured on APIM API $API_ID (actual IDs: $QUOTE_OP, $CREATE_OP, $GET_OP)."
