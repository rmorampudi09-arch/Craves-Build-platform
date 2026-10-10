#!/usr/bin/env bash
# APIM routes for the support assistant chat and the admin support inbox (both served by User/Chef).
set -euo pipefail
set +x
: "${CONFIRM_APIM_WRITE:=false}"
[[ "$CONFIRM_APIM_WRITE" == "true" ]] || { echo 'Set CONFIRM_APIM_WRITE=true for the scoped APIM update.' >&2; exit 1; }
RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-kmqgfy}"
APP="${USER_CHEF_APP:-ca-craves-user-chef-service-prod}"
API_VERSION=2022-08-01
for tool in az jq curl; do command -v "$tool" >/dev/null; done
EXPECTED_SUBSCRIPTION=721906c9-4a72-4606-830b-d3e7ace093ff
EXPECTED_TENANT=1e7e43ac-c7f5-4d47-a74f-289a7cc21508
[[ "$RG" == rg-craves-prodlow-centralindia && "$APIM" == apim-craves-prodlow-kmqgfy && "$APP" == ca-craves-user-chef-service-prod ]] || {
  echo 'Unexpected support resource target; no update applied.' >&2; exit 1;
}
ACCOUNT=$(az account show -o json --only-show-errors)
SUB=$(jq -r '.id' <<<"$ACCOUNT")
TENANT=$(jq -r '.tenantId' <<<"$ACCOUNT")
[[ "$SUB" == "$EXPECTED_SUBSCRIPTION" && "$TENANT" == "$EXPECTED_TENANT" ]] || {
  echo 'Wrong Azure subscription or tenant; no update applied.' >&2; exit 1;
}
az apim show -g "$RG" -n "$APIM" -o none --only-show-errors
APP_JSON=$(az containerapp show -g "$RG" -n "$APP" -o json --only-show-errors)
FQDN=$(jq -r '.properties.configuration.ingress.fqdn' <<<"$APP_JSON")
[[ $(jq -r '.properties.runningStatus' <<<"$APP_JSON") == Running ]]
[[ $(jq -r '.properties.latestRevisionName' <<<"$APP_JSON") == $(jq -r '.properties.latestReadyRevisionName' <<<"$APP_JSON") ]]
curl --fail --silent --show-error --max-time 30 "https://$FQDN/actuator/health" | jq -e '.status=="UP"' >/dev/null
TEMP_DIR=$(mktemp -d)
trap 'rm -rf -- "$TEMP_DIR"' EXIT
configure_api() {
  local API_ID="$1" PATH_PART="$2" NAME="$3"
  mapfile -t MATCHES < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='$PATH_PART'].name" -o tsv)
  [[ "${#MATCHES[@]}" -le 1 ]] || { echo 'Ambiguous APIM path; no update applied.' >&2; exit 1; }
  if [[ "${#MATCHES[@]}" -eq 1 ]]; then
    [[ "${MATCHES[0]}" == "$API_ID" ]] || { echo 'An existing API owns this path; review it before release.' >&2; exit 1; }
  else
    az apim api create -g "$RG" --service-name "$APIM" --api-id "$API_ID" --display-name "$NAME" \
      --path "$PATH_PART" --protocols https --subscription-required false -o none
  fi
}
operation() {
  local API_ID="$1" ID="$2" METHOD="$3" TEMPLATE="$4" TARGET="$5"
  local PARAMS='[]'
  if [[ "$TEMPLATE" == *'{id}'* ]]; then PARAMS='[{"name":"id","type":"string","required":true}]'; fi
  local MGMT="https://management.azure.com/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.ApiManagement/service/$APIM/apis/$API_ID"
  jq -n --arg id "$ID" --arg method "$METHOD" --arg template "$TEMPLATE" --argjson params "$PARAMS" \
    '{properties:{displayName:$id,method:$method,urlTemplate:$template,templateParameters:$params,responses:[]}}' >"$TEMP_DIR/operation.json"
  az rest --method put --url "$MGMT/operations/$ID?api-version=$API_VERSION" --body @"$TEMP_DIR/operation.json" -o none
  # Bodies are capped at 64 KB (a full 20-message chat fits); the backend still verifies the JWT and roles.
  cat >"$TEMP_DIR/policy.xml" <<XML
<policies><inbound><base />
<choose><when condition="@(string.IsNullOrWhiteSpace(context.Request.Headers.GetValueOrDefault(&quot;Authorization&quot;,&quot;&quot;)) || !context.Request.Headers.GetValueOrDefault(&quot;Authorization&quot;,&quot;&quot;).StartsWith(&quot;Bearer &quot;, StringComparison.OrdinalIgnoreCase))">
<return-response><set-status code="401" reason="Unauthorized" /><set-header name="Content-Type" exists-action="override"><value>application/json</value></set-header><set-body>{"code":"AUTHENTICATION_REQUIRED"}</set-body></return-response>
</when></choose>
<validate-content unspecified-content-type-action="ignore" max-size="65536" size-exceeded-action="prevent" />
<set-backend-service base-url="https://$FQDN" />
<rewrite-uri template="$TARGET" copy-unmatched-params="true" />
</inbound><backend><base /></backend><outbound><base /><set-header name="Cache-Control" exists-action="override"><value>private, no-store</value></set-header></outbound><on-error><base /></on-error></policies>
XML
  jq -Rs '{properties:{format:"rawxml",value:.}}' "$TEMP_DIR/policy.xml" >"$TEMP_DIR/policy.json"
  az rest --method put --url "$MGMT/operations/$ID/policies/policy?api-version=$API_VERSION" --body @"$TEMP_DIR/policy.json" -o none
  az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$ID" -o none
}
SUPPORT=craves-support
ADMIN=craves-admin-support
configure_api "$SUPPORT" "api/v1/support" "Craves Support"
configure_api "$ADMIN" "api/v1/admin/support" "Craves Admin Support"
operation "$SUPPORT" chat POST /chat /api/v1/support/chat
operation "$ADMIN" cases GET /cases /api/v1/admin/support/cases
operation "$ADMIN" case GET '/cases/{id}' '/api/v1/admin/support/cases/{id}'
operation "$ADMIN" case-message POST '/cases/{id}/messages' '/api/v1/admin/support/cases/{id}/messages'
operation "$ADMIN" case-status PATCH '/cases/{id}/status' '/api/v1/admin/support/cases/{id}/status'
operation "$ADMIN" case-assign POST '/cases/{id}/assign-to-me' '/api/v1/admin/support/cases/{id}/assign-to-me'
# Unauthenticated probe through the public gateway proves the route exists and is guarded.
STATUS=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 30 -X POST \
  -H 'Content-Type: application/json' -d '{}' https://api.craves.in/api/v1/support/chat)
[[ "$STATUS" == 401 ]] || { echo "Expected 401 from the unauthenticated chat probe, got $STATUS" >&2; exit 1; }
echo 'Support APIM operations configured. Backend JWT verification and role checks remain authoritative.'
