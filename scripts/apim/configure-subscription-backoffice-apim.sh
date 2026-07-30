#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
SUBSCRIPTION_APP="${SUBSCRIPTION_APP:-ca-craves-subscription-service-p}"
USER_CHEF_APP="${USER_CHEF_APP:-ca-craves-user-chef-service-prodlow}"
API_VERSION="${API_VERSION:-2022-08-01}"
CONFIRM_APIM_WRITE="${CONFIRM_APIM_WRITE:-false}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
AUTH_POLICY="$ROOT/infra/apim/subscription-backoffice/authenticated-policy.xml"
PUBLIC_POLICY="$ROOT/infra/apim/subscription-backoffice/public-policy.xml"

fail() { echo "ERROR: $*" >&2; exit 1; }
for tool in az jq curl sed; do command -v "$tool" >/dev/null || fail "$tool is required"; done
[[ -f "$AUTH_POLICY" && -f "$PUBLIC_POLICY" ]] || fail "APIM policy templates are missing"
[[ "${CONFIRM_APIM_WRITE,,}" == "true" ]] || fail "Set CONFIRM_APIM_WRITE=true for the controlled APIM write"

SUBSCRIPTION_ID=$(az account show --query id -o tsv)

ready_backend() {
  local APP="$1" LABEL="$2" APP_JSON FQDN LATEST READY RUNNING
  APP_JSON=$(az containerapp show -g "$RG" -n "$APP" -o json)
  FQDN=$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$APP_JSON")
  LATEST=$(jq -r '.properties.latestRevisionName // ""' <<<"$APP_JSON")
  READY=$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$APP_JSON")
  RUNNING=$(jq -r '.properties.runningStatus // ""' <<<"$APP_JSON")
  [[ -n "$FQDN" && "$LATEST" == "$READY" && "$RUNNING" == "Running" ]] || fail "$LABEL is not ready"
  curl -sS --fail --max-time 30 "https://$FQDN/actuator/health" >/dev/null
  printf 'https://%s' "$FQDN"
}

SUB_BASE=$(ready_backend "$SUBSCRIPTION_APP" "Subscription Service")
USER_BASE=$(ready_backend "$USER_CHEF_APP" "User-Chef Service")

check_inherited_backend_policy() {
  local API_ID="$1" MGMT="$2" POLICY SCOPE_URL
  for SCOPE_URL in \
    "https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/policies/policy?api-version=${API_VERSION}" \
    "${MGMT}/policies/policy?api-version=${API_VERSION}"; do
    POLICY=$(az rest --method get --url "$SCOPE_URL" --query properties.value -o tsv 2>/dev/null || true)
    [[ "$POLICY" != *'set-backend-service backend-id='* ]] || fail "Inherited backend-id policy blocks safe base-url override for API $API_ID"
  done
}

ensure_api() {
  local PATH_VALUE="$1" NEW_ID="$2" DISPLAY="$3" SERVICE_URL="$4"
  local -a IDS
  mapfile -t IDS < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${PATH_VALUE}'].name" -o tsv)
  (( ${#IDS[@]} <= 1 )) || fail "Multiple APIM APIs own ${PATH_VALUE}"
  if (( ${#IDS[@]} == 0 )); then
    az apim api create -g "$RG" --service-name "$APIM" --api-id "$NEW_ID" --display-name "$DISPLAY" --path "$PATH_VALUE" --service-url "$SERVICE_URL" --protocols https --subscription-required false -o none
    API_ID="$NEW_ID"
  else
    API_ID="${IDS[0]}"
    local SUB_REQUIRED
    SUB_REQUIRED=$(az apim api show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --query subscriptionRequired -o tsv)
    [[ "${SUB_REQUIRED,,}" == "false" ]] || fail "Existing API $API_ID requires a subscription key; this script will not relax it"
  fi
  local MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/apis/${API_ID}"
  check_inherited_backend_policy "$API_ID" "$MGMT"
  printf '%s' "$API_ID"
}

put_operation() {
  local API_ID="$1" BACKEND="$2" POLICY_TEMPLATE="$3" ID="$4" METHOD="$5" TEMPLATE="$6" DISPLAY="$7" PARAMS="$8"
  local MGMT BODY RENDERED POLICY_BODY
  MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/apis/${API_ID}"
  BODY=$(mktemp); RENDERED=$(mktemp); POLICY_BODY=$(mktemp)
  jq -n --arg display "$DISPLAY" --arg method "$METHOD" --arg template "$TEMPLATE" --argjson params "$PARAMS" '{properties:{displayName:$display,method:$method,urlTemplate:$template,templateParameters:$params,responses:[{statusCode:200,description:"Craves response"},{statusCode:400,description:"Invalid request"},{statusCode:401,description:"Authentication required"},{statusCode:403,description:"Access denied"},{statusCode:404,description:"Not found"},{statusCode:409,description:"State conflict"}]}}' >"$BODY"
  az rest --method put --url "${MGMT}/operations/${ID}?api-version=${API_VERSION}" --body @"$BODY" -o none
  sed "s|__BACKEND_URL__|${BACKEND}|g" "$POLICY_TEMPLATE" >"$RENDERED"
  jq -Rs '{properties:{format:"rawxml",value:.}}' "$RENDERED" >"$POLICY_BODY"
  az rest --method put --url "${MGMT}/operations/${ID}/policies/policy?api-version=${API_VERSION}" --body @"$POLICY_BODY" -o none
  rm -f "$BODY" "$RENDERED" "$POLICY_BODY"
}

verify_operation() {
  local API_ID="$1" BACKEND="$2" ID="$3" AUTH_REQUIRED="$4" MGMT POLICY
  MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/apis/${API_ID}"
  az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$ID" -o none
  POLICY=$(az rest --method get --url "${MGMT}/operations/${ID}/policies/policy?api-version=${API_VERSION}" --query properties.value -o tsv)
  [[ "$POLICY" == *"$BACKEND"* && "$POLICY" == *"no-store"* && "$POLICY" == *"nosniff"* ]] || fail "Operation $ID policy verification failed"
  if [[ "$AUTH_REQUIRED" == "true" ]]; then
    [[ "$POLICY" == *"Authorization"* && "$POLICY" == *"Bearer"* ]] || fail "Operation $ID is missing the Bearer guard"
  else
    [[ "$POLICY" != *"A Bearer access token is required"* ]] || fail "Public operation $ID unexpectedly requires a Bearer token"
  fi
}

UUID_PARAM='[{"name":"subscriptionId","type":"string","required":true}]'
PLAN_PARAM='[{"name":"planId","type":"string","required":true}]'
APP_PARAM='[{"name":"applicationId","type":"string","required":true}]'
APP_DOC_PARAMS='[{"name":"applicationId","type":"string","required":true},{"name":"documentId","type":"string","required":true}]'
ADMIN_STATUS_PARAMS='[{"name":"subscriptionId","type":"string","required":true},{"name":"status","type":"string","required":true}]'

SUB_API=$(ensure_api "api/v1/subscriptions" "craves-subscriptions-v1" "Craves Subscriptions API" "${SUB_BASE}/api/v1/subscriptions")
ADMIN_PLAN_API=$(ensure_api "api/v1/admin/subscription-plans" "craves-admin-subscription-plans-v1" "Craves Admin Subscription Plans API" "${SUB_BASE}/api/v1/admin/subscription-plans")
ADMIN_SUB_API=$(ensure_api "api/v1/admin/subscriptions" "craves-admin-subscriptions-v1" "Craves Admin Subscriptions API" "${SUB_BASE}/api/v1/admin/subscriptions")
CHEF_REVIEW_API=$(ensure_api "api/v1/backoffice/chef-reviews" "craves-backoffice-chef-reviews-v1" "Craves Backoffice Chef Reviews API" "${USER_BASE}/api/v1/backoffice/chef-reviews")

put_operation "$SUB_API" "${SUB_BASE}/api/v1/subscriptions" "$PUBLIC_POLICY" "list-subscription-plans" "GET" "/plans" "List active subscription plans" '[]'
put_operation "$SUB_API" "${SUB_BASE}/api/v1/subscriptions" "$PUBLIC_POLICY" "get-subscription-plan" "GET" "/plans/{planId}" "Get active subscription plan" "$PLAN_PARAM"
put_operation "$SUB_API" "${SUB_BASE}/api/v1/subscriptions" "$AUTH_POLICY" "create-customer-subscription" "POST" "/" "Create customer subscription" '[]'
put_operation "$SUB_API" "${SUB_BASE}/api/v1/subscriptions" "$AUTH_POLICY" "list-customer-subscriptions" "GET" "/" "List customer subscriptions" '[]'
put_operation "$SUB_API" "${SUB_BASE}/api/v1/subscriptions" "$AUTH_POLICY" "get-customer-subscription" "GET" "/{subscriptionId}" "Get customer subscription" "$UUID_PARAM"
put_operation "$SUB_API" "${SUB_BASE}/api/v1/subscriptions" "$AUTH_POLICY" "pause-customer-subscription" "PATCH" "/{subscriptionId}/pause" "Pause customer subscription" "$UUID_PARAM"
put_operation "$SUB_API" "${SUB_BASE}/api/v1/subscriptions" "$AUTH_POLICY" "cancel-customer-subscription" "PATCH" "/{subscriptionId}/cancel" "Cancel customer subscription" "$UUID_PARAM"

put_operation "$ADMIN_PLAN_API" "${SUB_BASE}/api/v1/admin/subscription-plans" "$AUTH_POLICY" "list-admin-subscription-plans" "GET" "/" "List admin subscription plans" '[]'
put_operation "$ADMIN_PLAN_API" "${SUB_BASE}/api/v1/admin/subscription-plans" "$AUTH_POLICY" "create-admin-subscription-plan" "POST" "/" "Create admin subscription plan" '[]'
put_operation "$ADMIN_PLAN_API" "${SUB_BASE}/api/v1/admin/subscription-plans" "$AUTH_POLICY" "update-admin-subscription-plan-status" "PATCH" "/{planId}/status" "Update admin subscription plan status" "$PLAN_PARAM"

put_operation "$ADMIN_SUB_API" "${SUB_BASE}/api/v1/admin/subscriptions" "$AUTH_POLICY" "update-admin-subscription-status" "PATCH" "/{subscriptionId}/status/{status}" "Update admin subscription status" "$ADMIN_STATUS_PARAMS"

put_operation "$CHEF_REVIEW_API" "${USER_BASE}/api/v1/backoffice/chef-reviews" "$AUTH_POLICY" "list-chef-reviews" "GET" "/" "List chef reviews" '[]'
put_operation "$CHEF_REVIEW_API" "${USER_BASE}/api/v1/backoffice/chef-reviews" "$AUTH_POLICY" "get-chef-review" "GET" "/{applicationId}" "Get chef review" "$APP_PARAM"
put_operation "$CHEF_REVIEW_API" "${USER_BASE}/api/v1/backoffice/chef-reviews" "$AUTH_POLICY" "approve-chef-review" "POST" "/{applicationId}/approve" "Approve chef review" "$APP_PARAM"
put_operation "$CHEF_REVIEW_API" "${USER_BASE}/api/v1/backoffice/chef-reviews" "$AUTH_POLICY" "reject-chef-review" "POST" "/{applicationId}/reject" "Reject chef review" "$APP_PARAM"
put_operation "$CHEF_REVIEW_API" "${USER_BASE}/api/v1/backoffice/chef-reviews" "$AUTH_POLICY" "get-chef-proof-content" "GET" "/{applicationId}/documents/{documentId}/content" "Get chef proof content" "$APP_DOC_PARAMS"

verify_operation "$SUB_API" "${SUB_BASE}/api/v1/subscriptions" "list-subscription-plans" false
verify_operation "$SUB_API" "${SUB_BASE}/api/v1/subscriptions" "get-subscription-plan" false
for ID in create-customer-subscription list-customer-subscriptions get-customer-subscription pause-customer-subscription cancel-customer-subscription; do verify_operation "$SUB_API" "${SUB_BASE}/api/v1/subscriptions" "$ID" true; done
for ID in list-admin-subscription-plans create-admin-subscription-plan update-admin-subscription-plan-status; do verify_operation "$ADMIN_PLAN_API" "${SUB_BASE}/api/v1/admin/subscription-plans" "$ID" true; done
verify_operation "$ADMIN_SUB_API" "${SUB_BASE}/api/v1/admin/subscriptions" "update-admin-subscription-status" true
for ID in list-chef-reviews get-chef-review approve-chef-review reject-chef-review get-chef-proof-content; do verify_operation "$CHEF_REVIEW_API" "${USER_BASE}/api/v1/backoffice/chef-reviews" "$ID" true; done

echo "SUCCESS: Subscription and backoffice APIM operations configured and verified."
