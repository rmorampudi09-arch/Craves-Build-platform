#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
API_VERSION="${API_VERSION:-2022-08-01}"
SUBSCRIPTION_ID=$(az account show --query id -o tsv)

fail() { echo "ERROR: $*" >&2; exit 1; }
for tool in az jq; do command -v "$tool" >/dev/null || fail "$tool is required"; done

check_api() {
  local PATH_VALUE="$1" EXPECT_AUTH="$2"; shift 2
  local -a IDS
  mapfile -t IDS < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${PATH_VALUE}'].name" -o tsv)
  (( ${#IDS[@]} == 1 )) || fail "Expected exactly one API for ${PATH_VALUE}"
  local API_ID="${IDS[0]}" MGMT ID POLICY
  MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/apis/${API_ID}"
  for ID in "$@"; do
    az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$ID" -o none
    POLICY=$(az rest --method get --url "${MGMT}/operations/${ID}/policies/policy?api-version=${API_VERSION}" --query properties.value -o tsv)
    [[ "$POLICY" == *"no-store"* && "$POLICY" == *"nosniff"* && "$POLICY" == *"set-backend-service base-url="* ]] || fail "Policy verification failed for ${ID}"
    case ",${EXPECT_AUTH}," in
      *,"${ID}",*) [[ "$POLICY" == *"Authorization"* && "$POLICY" == *"Bearer"* ]] || fail "Bearer guard missing for ${ID}" ;;
      *) [[ "$POLICY" != *"A Bearer access token is required"* ]] || fail "Public operation ${ID} unexpectedly requires Bearer" ;;
    esac
  done
  echo "OK: ${PATH_VALUE} -> ${API_ID}"
}

SUB_AUTH="create-customer-subscription,list-customer-subscriptions,get-customer-subscription,list-subscription-occurrences,pause-customer-subscription,resume-customer-subscription,cancel-customer-subscription,skip-subscription-meal"
check_api "api/v1/subscriptions" "$SUB_AUTH" \
  list-subscription-plans \
  get-subscription-plan \
  get-subscription-plan-schedule \
  get-subscription-plan-policy \
  create-customer-subscription \
  list-customer-subscriptions \
  get-customer-subscription \
  list-subscription-occurrences \
  pause-customer-subscription \
  resume-customer-subscription \
  cancel-customer-subscription \
  skip-subscription-meal

ADMIN_PLAN_AUTH="list-admin-subscription-plans,create-admin-subscription-plan,update-admin-subscription-plan-status,get-admin-plan-schedule,put-admin-plan-schedule,activate-admin-plan-schedule,get-admin-plan-policy,put-admin-plan-policy,activate-admin-plan-policy,get-admin-plan-readiness"
check_api "api/v1/admin/subscription-plans" "$ADMIN_PLAN_AUTH" \
  list-admin-subscription-plans \
  create-admin-subscription-plan \
  update-admin-subscription-plan-status \
  get-admin-plan-schedule \
  put-admin-plan-schedule \
  activate-admin-plan-schedule \
  get-admin-plan-policy \
  put-admin-plan-policy \
  activate-admin-plan-policy \
  get-admin-plan-readiness

ADMIN_SUB_AUTH="list-admin-subscriptions,get-admin-subscription-history,update-admin-subscription-status"
check_api "api/v1/admin/subscriptions" "$ADMIN_SUB_AUTH" \
  list-admin-subscriptions \
  get-admin-subscription-history \
  update-admin-subscription-status

CHEF_REVIEW_AUTH="list-chef-reviews,get-chef-review,approve-chef-review,reject-chef-review,get-chef-proof-content"
check_api "api/v1/backoffice/chef-reviews" "$CHEF_REVIEW_AUTH" \
  list-chef-reviews \
  get-chef-review \
  approve-chef-review \
  reject-chef-review \
  get-chef-proof-content

echo "SUCCESS: Complete subscription and backoffice APIM status is valid."
