#!/usr/bin/env bash
# Publishes M25's delivery exception routes (integration-service, docs/advanced-features/modules.md) as four operations on
# the existing admin operations API (craves-admin-operational-investigations-v1, api/v1/admin/operations) of the mobile
# gateway (apim-craves-prod-34eefd, api.craves.in), for the admin console's /admin/delivery-exceptions page.
# Writes only these four operations and their policies (infra/apim/admin-operational-investigations/authenticated-policy.xml:
# Bearer required, no-store), routed to ca-craves-integration-prod's ingress (FQDN read at run time); every other
# operation stays as it is. The backend answers 404 until CRAVES_DELIVERY_EXCEPTIONS_ENABLED=true and checks roles itself.
#
#   DRY_RUN=true bash scripts/apim/configure-delivery-exceptions-admin-apim.sh             lists the operations, calls nothing
#   CONFIRM_APIM_WRITE=true bash scripts/apim/configure-delivery-exceptions-admin-apim.sh  scoped, idempotent write (az login first)
# Rollback: az apim api operation delete -g rg-craves-shared-prod --service-name apim-craves-prod-34eefd
#   --api-id craves-admin-operational-investigations-v1 --operation-id <each id below>
set -euo pipefail
set +x
: "${CONFIRM_APIM_WRITE:=false}"
: "${DRY_RUN:=false}"
RG=rg-craves-shared-prod
APIM=apim-craves-prod-34eefd
API_ID=craves-admin-operational-investigations-v1
API_PATH=api/v1/admin/operations
API_VERSION=2022-08-01
PUBLIC_HOST=https://api.craves.in
EXPECTED_SUBSCRIPTION=34eefd95-1a19-416f-b9df-92b326500615
INTEGRATION_RG=rg-craves-integration-prod
INTEGRATION_APP=ca-craves-integration-prod
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
POLICY_TEMPLATE="$ROOT/infra/apim/admin-operational-investigations/authenticated-policy.xml"
# operation id|method|template|display name
OPERATIONS=(
  "list-admin-delivery-exceptions|GET|/delivery-exceptions|List delivery exception cases"
  "open-admin-delivery-exception|POST|/delivery-exceptions|Open a delivery exception case"
  "get-admin-delivery-exception|GET|/delivery-exceptions/{caseId}|Read a delivery exception case"
  "act-admin-delivery-exception|POST|/delivery-exceptions/{caseId}/actions|Act on a delivery exception case"
)
fail() { echo "ERROR: $*" >&2; exit 1; }

[[ -f "$POLICY_TEMPLATE" ]] || fail "APIM policy template is missing"
echo "Operations on $API_ID (/$API_PATH) of $APIM, routed to $INTEGRATION_APP:"
printf '  %s\n' "${OPERATIONS[@]}"
if [[ "${DRY_RUN,,}" == true ]]; then echo "DRY_RUN: no az or curl call was made; nothing was written."; exit 0; fi
[[ "${CONFIRM_APIM_WRITE,,}" == true ]] || fail 'Set CONFIRM_APIM_WRITE=true for the scoped APIM write (or DRY_RUN=true to preview).'
for tool in az jq curl sed; do command -v "$tool" >/dev/null || fail "$tool is required"; done

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
BACKEND="https://$FQDN/$API_PATH"
# The delivery-command investigation should already go there; say so when it does not (it is not changed here).
SOURCE_POLICY=$(az rest --method get --url "$API_MGMT/operations/get-admin-delivery-command-investigation/policies/policy?api-version=$API_VERSION" \
  --query properties.value -o tsv --only-show-errors 2>/dev/null || true)
[[ "$SOURCE_POLICY" == *"base-url=\"$BACKEND\""* ]] || echo "WARNING: get-admin-delivery-command-investigation does not route to $BACKEND; check it separately."
echo "Backend: $BACKEND"

for ROW in "${OPERATIONS[@]}"; do
  IFS='|' read -r ID METHOD TEMPLATE DISPLAY <<<"$ROW"
  BODY=$(mktemp); RENDERED=$(mktemp); POLICY_BODY=$(mktemp)
  jq -n --arg display "$DISPLAY" --arg method "$METHOD" --arg template "$TEMPLATE" \
    '{properties:{displayName:$display,method:$method,urlTemplate:$template,
      templateParameters:(if ($template|test("\\{caseId\\}")) then [{name:"caseId",type:"string",required:true}] else [] end),
      responses:[{statusCode:200,description:"Delivery exception cases"},{statusCode:400,description:"Invalid request"},
        {statusCode:401,description:"Authentication required"},{statusCode:403,description:"Admin role required"},
        {statusCode:404,description:"Not found or switched off"},{statusCode:409,description:"Case changed"}]}}' >"$BODY"
  az rest --method put --url "$API_MGMT/operations/$ID?api-version=$API_VERSION" --body @"$BODY" -o none --only-show-errors
  sed "s|__BACKEND_URL__|${BACKEND}|g" "$POLICY_TEMPLATE" >"$RENDERED"
  jq -Rs '{properties:{format:"rawxml",value:.}}' "$RENDERED" >"$POLICY_BODY"
  az rest --method put --url "$API_MGMT/operations/$ID/policies/policy?api-version=$API_VERSION" --body @"$POLICY_BODY" -o none --only-show-errors
  rm -f "$BODY" "$RENDERED" "$POLICY_BODY"
  OPERATION=$(az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$ID" -o json --only-show-errors)
  [[ $(jq -r .method <<<"$OPERATION") == "$METHOD" && $(jq -r .urlTemplate <<<"$OPERATION") == "$TEMPLATE" ]] || fail "$ID read-back failed"
  POLICY=$(az rest --method get --url "$API_MGMT/operations/$ID/policies/policy?api-version=$API_VERSION" --query properties.value -o tsv --only-show-errors)
  [[ "$POLICY" == *"$BACKEND"* && "$POLICY" == *Bearer* && "$POLICY" == *no-store* ]] || fail "$ID policy read-back failed"
  echo "OK $METHOD /$API_PATH$TEMPLATE"
done

STATUS=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 30 "$PUBLIC_HOST/$API_PATH/delivery-exceptions")
[[ "$STATUS" == 401 ]] || fail "Unauthenticated list returned HTTP $STATUS through $PUBLIC_HOST, expected 401"
echo "SUCCESS: delivery exception operations published; an unauthenticated call gets 401."
