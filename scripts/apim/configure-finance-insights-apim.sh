#!/usr/bin/env bash
# Publishes the Admin Finance read routes (integration-service FinanceInsightsController, docs/finance/README.md) as five
# GET operations on the existing finance admin API (craves-finance-admin-v1, api/v1/admin/finance) of the mobile gateway
# (apim-craves-prod-34eefd, api.craves.in), for the Overview, Transactions and Payouts tabs of /admin/finance.
# Why: this API's own policy sends everything to the root of ca-craves-integration-prod, and each published operation
# adds a rewrite-uri to its backend path. Anything else falls to the API's /* operations, which have no rewrite, so
# integration-service receives /insights/... at its root and denies it: a signed-in finance admin got 403 on these
# paths on 14 Nov 2026. Without a token every path under this API answers 401, published or not, so that probe says
# nothing about a route.
# Writes only these five operations, each with the policy shape source-status-get has on this API (<base /> plus a
# rewrite-uri to the route's backend path), which the script checks first. The two list reads forward their query
# string (copy-unmatched-params="true"); the controller reads only the parameters it declares. The API's own policy
# (Bearer required, no-store, backend) and every other operation stay as they are. The backend checks the finance
# read role itself.
#
#   DRY_RUN=true bash scripts/apim/configure-finance-insights-apim.sh             lists the operations, calls nothing
#   CONFIRM_APIM_WRITE=true bash scripts/apim/configure-finance-insights-apim.sh  scoped, idempotent write (az login first)
# Rollback: az apim api operation delete -g rg-craves-shared-prod --service-name apim-craves-prod-34eefd
#   --api-id craves-finance-admin-v1 --operation-id <each id below>
set -euo pipefail
set +x
: "${CONFIRM_APIM_WRITE:=false}"
: "${DRY_RUN:=false}"
RG=rg-craves-shared-prod
APIM=apim-craves-prod-34eefd
API_ID=craves-finance-admin-v1
API_PATH=api/v1/admin/finance
API_VERSION=2022-08-01
PUBLIC_HOST=https://api.craves.in
EXPECTED_SUBSCRIPTION=34eefd95-1a19-416f-b9df-92b326500615
INTEGRATION_RG=rg-craves-integration-prod
INTEGRATION_APP=ca-craves-integration-prod
SOURCE_OPERATION=source-status-get
SOURCE_TEMPLATE=/source-status
# operation id|template|forward the query string|display name (every one is a GET)
OPERATIONS=(
  "insights-overview-get|/insights/overview|true|Finance overview for a period"
  "insights-transactions-get|/insights/transactions|true|Money movements, one page"
  "insights-order-get|/insights/orders/{checkoutId}|false|One order's money trail"
  "insights-payout-get|/insights/payouts/{payoutId}|false|One chef payout's money trail"
  "insights-chefs-get|/insights/chefs|false|What each chef is owed"
)
fail() { echo "ERROR: $*" >&2; exit 1; }
# The policy an operation of this API carries: the API's own policy, then the rewrite to the backend path.
operation_policy() {
  printf '<policies><inbound><base /><rewrite-uri template="/%s%s" copy-unmatched-params="%s" /></inbound><backend><base /></backend><outbound><base /></outbound><on-error><base /></on-error></policies>' \
    "$API_PATH" "$1" "$2"
}
squash() { tr -d ' \t\r\n'; }

echo "GET operations on $API_ID (/$API_PATH) of $APIM, each rewritten to the same path on $INTEGRATION_APP:"
printf '  %s\n' "${OPERATIONS[@]}"
if [[ "${DRY_RUN,,}" == true ]]; then echo "DRY_RUN: no az or curl call was made; nothing was written."; exit 0; fi
[[ "${CONFIRM_APIM_WRITE,,}" == true ]] || fail 'Set CONFIRM_APIM_WRITE=true for the scoped APIM write (or DRY_RUN=true to preview).'
for tool in az jq curl; do command -v "$tool" >/dev/null || fail "$tool is required"; done

# Read-only checks first: nothing is written until they pass.
SUB=$(az account show --query id -o tsv --only-show-errors)
[[ "$SUB" == "$EXPECTED_SUBSCRIPTION" ]] || fail 'Wrong Azure subscription; nothing written.'
[[ $(az apim api show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --query path -o tsv --only-show-errors) == "$API_PATH" ]] ||
  fail "$API_ID does not serve /$API_PATH; nothing written."
API_MGMT="https://management.azure.com/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.ApiManagement/service/$APIM/apis/$API_ID"
APP_JSON=$(az containerapp show -g "$INTEGRATION_RG" -n "$INTEGRATION_APP" -o json --only-show-errors)
FQDN=$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$APP_JSON")
READY=$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$APP_JSON")
[[ -n "$FQDN" && $(jq -r '.properties.runningStatus // ""' <<<"$APP_JSON") == Running && $(jq -r '.properties.latestRevisionName // ""' <<<"$APP_JSON") == "$READY" ]] ||
  fail "$INTEGRATION_APP is not ready; nothing written."
[[ $(az containerapp revision show -g "$INTEGRATION_RG" -n "$INTEGRATION_APP" --revision "$READY" --query properties.healthState -o tsv --only-show-errors) == Healthy ]] ||
  fail "$INTEGRATION_APP's ready revision is not Healthy; nothing written."
# $1 = the API or one of its operations. az prints the policy XML itself, with a note on stderr.
policy() { az rest --method get --url "$1/policies/policy?api-version=$API_VERSION&format=rawxml" \
  --query properties.value -o tsv --only-show-errors 2>/dev/null; }
API_POLICY=$(policy "$API_MGMT") || fail "Could not read $API_ID's policy; nothing written."
[[ $(squash <<<"$API_POLICY") == *"<set-backend-servicebase-url=\"https://$FQDN\"/>"* && "$API_POLICY" == *Bearer* && "$API_POLICY" == *no-store* ]] ||
  fail "$API_ID's policy does not send requests to the root of https://$FQDN with the Bearer and no-store guards; review it by hand. Nothing written."
SOURCE_POLICY=$(policy "$API_MGMT/operations/$SOURCE_OPERATION") || fail "Could not read $SOURCE_OPERATION's policy; nothing written."
[[ $(squash <<<"$SOURCE_POLICY") == "$(operation_policy "$SOURCE_TEMPLATE" false | squash)" ]] ||
  fail "$SOURCE_OPERATION's policy is no longer <base /> plus a rewrite-uri to /$API_PATH$SOURCE_TEMPLATE; review it by hand. Nothing written."
echo "Backend: https://$FQDN (set by $API_ID's policy; operation policy shape checked against $SOURCE_OPERATION)"

for ROW in "${OPERATIONS[@]}"; do
  IFS='|' read -r ID TEMPLATE FORWARD DISPLAY <<<"$ROW"
  BODY=$(mktemp); POLICY_BODY=$(mktemp)
  jq -n --arg display "$DISPLAY" --arg template "$TEMPLATE" \
    '{properties:{displayName:$display,method:"GET",urlTemplate:$template,
      templateParameters:[$template|scan("\\{([A-Za-z]+)\\}")|{name:.[0],type:"string",required:true}],
      responses:[{statusCode:200,description:"Finance figures"},{statusCode:400,description:"Invalid request"},
        {statusCode:401,description:"Authentication required"},{statusCode:403,description:"Finance read role required"},
        {statusCode:404,description:"Not found"}]}}' >"$BODY"
  az rest --method put --url "$API_MGMT/operations/$ID?api-version=$API_VERSION" --body @"$BODY" -o none --only-show-errors >/dev/null
  operation_policy "$TEMPLATE" "$FORWARD" | jq -Rs '{properties:{format:"rawxml",value:.}}' >"$POLICY_BODY"
  # A policy PUT prints the XML even with -o none.
  az rest --method put --url "$API_MGMT/operations/$ID/policies/policy?api-version=$API_VERSION" --body @"$POLICY_BODY" -o none --only-show-errors >/dev/null
  rm -f "$BODY" "$POLICY_BODY"
  OPERATION=$(az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$ID" -o json --only-show-errors)
  [[ $(jq -r .method <<<"$OPERATION") == GET && $(jq -r .urlTemplate <<<"$OPERATION") == "$TEMPLATE" ]] || fail "$ID read-back failed"
  POLICY=$(policy "$API_MGMT/operations/$ID") || fail "$ID policy read-back failed"
  [[ $(squash <<<"$POLICY") == "$(operation_policy "$TEMPLATE" "$FORWARD" | squash)" ]] || fail "$ID policy read-back failed"
  echo "OK GET /$API_PATH$TEMPLATE"
done

STATUS=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 30 "$PUBLIC_HOST/$API_PATH/insights/chefs")
[[ "$STATUS" == 401 ]] || fail "Unauthenticated read returned HTTP $STATUS through $PUBLIC_HOST, expected 401"
echo "SUCCESS: the five finance read operations are published; an unauthenticated call gets 401."
echo "That 401 does not prove the route. Open /admin/finance signed in as a finance admin: the three tabs must show figures."
