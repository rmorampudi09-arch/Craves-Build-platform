#!/usr/bin/env bash
# Existing APIM configuration only. No Container App, database, replica or provider is created/changed.
set -euo pipefail
set +x
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
API_ID=craves-admin-explorer-v1
API_PATH=api/v1/admin/explorer
API_VERSION=2022-08-01
fail(){ echo "ERROR: $*" >&2; exit 1; }
[[ "${CONFIRM_APIM_WRITE:-false}" == true ]] || fail 'Review the three module routes and set CONFIRM_APIM_WRITE=true. This is not a deployment approval.'
for tool in az jq curl python3; do command -v "$tool" >/dev/null || fail "$tool is required"; done
[[ "$(git -C "$ROOT" rev-parse HEAD)" == "${EXPECTED_RELEASE_SHA:-}" ]] || fail 'EXPECTED_RELEASE_SHA must equal the reviewed checkout commit'
[[ -z "$(git -C "$ROOT" status --porcelain --untracked-files=no)" ]] || fail 'Tracked release files are dirty'
APIM_SKU=$(az apim show -g "$RG" --name "$APIM" --query sku.name -o tsv --only-show-errors)
[[ -n "$APIM_SKU" ]] || fail 'APIM tier could not be verified; no routes were modified'
SUB=$(az account show --query id -o tsv)
[[ "$SUB" =~ ^[a-fA-F0-9-]{36}$ ]] || fail 'Azure subscription unavailable'
BASE="https://management.azure.com/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.ApiManagement/service/$APIM"
API="$BASE/apis/$API_ID"
GLOBAL=$(az rest --method get --url "$BASE/policies/policy?api-version=$API_VERSION" --query properties.value -o tsv)
[[ "$GLOBAL" != *'backend-id='* ]] || fail 'Inherited backend-id needs a separate reviewed routing change'
apps=("${AUTH_APP:-ca-craves-auth-service-prodlow}" "${USER_CHEF_APP:-ca-craves-user-chef-service-prod}" "${ORDER_APP:-ca-craves-order-service-prodlow}")
domains=(users chefs orders)
backends=()
for app in "${apps[@]}"; do
  app_json=$(az containerapp show -g "$RG" -n "$app" -o json)
  fqdn=$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$app_json")
  [[ "$fqdn" =~ ^[a-z0-9][a-z0-9.-]+\.azurecontainerapps\.io$ ]] || fail "$app has an unexpected ingress hostname"
  [[ "$(jq -r '.properties.latestRevisionName' <<<"$app_json")" == "$(jq -r '.properties.latestReadyRevisionName' <<<"$app_json")" ]] || fail "$app latest revision is not ready"
  [[ "$(jq -r '.properties.runningStatus' <<<"$app_json")" == Running ]] || fail "$app is not running"
  curl --silent --show-error --fail --max-time 20 "https://$fqdn/actuator/health" >/dev/null
  backends+=("https://$fqdn/api/v1/admin/explorer")
done
api_list=$(az apim api list -g "$RG" --service-name "$APIM" -o json)
owners=$(jq --arg path "$API_PATH" '[.[]|select(.path==$path)]' <<<"$api_list")
[[ "$(jq length <<<"$owners")" -le 1 ]] || fail 'Multiple APIs own this module path'
existing=$(jq --arg id "$API_ID" '[.[]|select(.name==$id)]' <<<"$api_list")
if [[ "$(jq length <<<"$existing")" -gt 0 ]]; then
  [[ "$(jq -r '.[0].path' <<<"$existing")" == "$API_PATH" ]] || fail 'API ID is already used for a different path'
fi
if [[ "$(jq length <<<"$owners")" == 0 ]]; then
  az apim api create -g "$RG" --service-name "$APIM" --api-id "$API_ID" --display-name 'Craves Admin Record Explorer' --path "$API_PATH" --service-url "${backends[0]}" --protocols https --subscription-required false -o none
else
  [[ "$(jq -r '.[0].name' <<<"$owners")" == "$API_ID" ]] || fail 'A different API owns the module path'
  [[ "$(jq -r '.[0].subscriptionRequired' <<<"$owners")" == false ]] || fail 'Existing subscription-key requirement will not be relaxed'
fi
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
for i in 0 1 2; do
  domain="${domains[$i]}"; backend="${backends[$i]}"; op="post-explorer-$domain-query"
  jq -n --arg d "$domain" '{properties:{displayName:("Read "+$d+" analytics and records"),method:"POST",urlTemplate:("/"+$d+"/query"),request:{representations:[{contentType:"application/json"}]},responses:[{statusCode:200,description:"Audited read"},{statusCode:400,description:"Invalid filters or cursor"},{statusCode:401,description:"Sign in required"},{statusCode:403,description:"Platform or audit role required"},{statusCode:429,description:"Reporting capacity busy"},{statusCode:503,description:"Not activated or unavailable"}]}}' >"$TMP/op.json"
  python3 - "$ROOT/infra/apim/admin-explorer/authenticated-policy.xml" "$TMP/policy.json" "$backend" <<'PY'
import json,pathlib,sys,xml.etree.ElementTree as ET
value=pathlib.Path(sys.argv[1]).read_text().replace('__BACKEND_URL__',sys.argv[3])
ET.fromstring(value)
pathlib.Path(sys.argv[2]).write_text(json.dumps({'properties':{'format':'rawxml','value':value}}))
PY
  az rest --method put --url "$API/operations/$op?api-version=$API_VERSION" --body @"$TMP/op.json" -o none
  az rest --method put --url "$API/operations/$op/policies/policy?api-version=$API_VERSION" --body @"$TMP/policy.json" -o none
  policy=$(az rest --method get --url "$API/operations/$op/policies/policy?api-version=$API_VERSION" --query properties.value -o tsv)
  [[ "$policy" == *"$backend"* && "$policy" == *no-store* && "$policy" == *CRAVES_ADMIN_EXPLORER_V1* ]] || fail "$domain policy readback failed"
done
GATEWAY=$(az apim show -g "$RG" --name "$APIM" --query gatewayUrl -o tsv)
[[ "$GATEWAY" == https://* ]] || fail 'Gateway hostname unavailable'
for domain in "${domains[@]}"; do
 code=$(curl --silent --show-error --max-time 20 --output /dev/null --write-out '%{http_code}' -X POST "$GATEWAY/$API_PATH/$domain/query" -H 'Content-Type: application/json' --data '{"mode":"summary"}')
 [[ "$code" == 401 ]] || fail "$domain unauthenticated guard returned $code"
done
echo 'PASS: three module routes read back and anonymous access denied. Authenticated acceptance is still required.'
