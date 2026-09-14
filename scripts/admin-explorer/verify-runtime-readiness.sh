#!/usr/bin/env bash
# Read-only release inventory. Authentication acceptance remains part of the approved release evidence.
set -euo pipefail
set +x
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RG="${RG:-rg-craves-prodlow-centralindia}"
ACR="${ACR:-cravesprodlowacr82121}"
ADMIN_APP="${ADMIN_APP:-ca-craves-admin-web-prodlow}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
fail(){ echo "ERROR: $* Existing admin image preserved." >&2; exit 1; }
[[ "${EXPECTED_RELEASE_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || fail 'Exact reviewed source SHA is required.'
[[ "$(git -C "$ROOT" rev-parse HEAD)" == "$EXPECTED_RELEASE_SHA" ]] || fail 'Readiness checkout differs from reviewed source.'
for tool in az jq curl python3; do command -v "$tool" >/dev/null || fail "$tool is required."; done
APIM_SKU=$(az apim show -g "$RG" --name "$APIM" --query sku.name -o tsv --only-show-errors)
[[ -n "$APIM_SKU" ]] || fail 'APIM tier could not be verified.'
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
SUB=$(az account show --query id -o tsv)
[[ "$SUB" =~ ^[a-fA-F0-9-]{36}$ ]] || fail 'Azure account is unavailable.'
LOGIN=$(az acr show --name "$ACR" --query loginServer -o tsv)
[[ "$LOGIN" =~ ^[a-z0-9]+\.azurecr\.io$ ]] || fail 'Existing registry origin is invalid.'
BASE="https://management.azure.com/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.ApiManagement/service/$APIM"
API="$BASE/apis/craves-admin-explorer-v1"
VERSION=2022-08-01
az rest --method get --url "$API?api-version=$VERSION" -o json >"$TMP/api.json"
jq -e '.properties.path == "api/v1/admin/explorer" and .properties.subscriptionRequired == false' "$TMP/api.json" >/dev/null || fail 'Explorer API ownership or subscription settings differ.'
az rest --method get --url "$BASE/policies/policy?api-version=$VERSION" --query properties.value -o tsv >"$TMP/global.xml"
python3 "$ROOT/scripts/admin-explorer/verify-runtime-policy.py" inherited "$TMP/global.xml"
optional_policy(){
  if az rest --method get --url "$1" --query properties.value -o tsv >"$2" 2>"$TMP/policy-error"; then
    python3 "$ROOT/scripts/admin-explorer/verify-runtime-policy.py" inherited "$2"
  elif python3 -c 'import pathlib,re,sys; sys.exit(0 if re.search(r"\(ResourceNotFound\)|Code: ResourceNotFound",pathlib.Path(sys.argv[1]).read_text()) else 1)' "$TMP/policy-error"; then
    : # An absent scoped policy inherits its already checked parent.
  else fail 'Inherited policy inventory is incomplete.'; fi
}
optional_policy "$API/policies/policy?api-version=$VERSION" "$TMP/api-policy.xml"
az rest --method get --url "$API/products?api-version=$VERSION" -o json >"$TMP/products.json"
jq -e '(.value | type) == "array" and (.nextLink == null or .nextLink == "")' "$TMP/products.json" >/dev/null || fail 'Product policy inventory is incomplete.'
while IFS= read -r product; do
  [[ "$product" =~ ^[A-Za-z0-9._-]+$ ]] || fail 'Unexpected API product identity.'
  optional_policy "$BASE/products/$product/policies/policy?api-version=$VERSION" "$TMP/product-policy.xml"
done < <(jq -r '.value[]?.name' "$TMP/products.json")
az apim api list -g "$RG" --service-name "$APIM" -o json >"$TMP/apis.json"
python3 "$ROOT/scripts/admin-explorer/verify-route-ownership.py" inventory "$TMP/apis.json" >"$TMP/ancestors"
while IFS= read -r ancestor; do
  az apim api operation list -g "$RG" --service-name "$APIM" --api-id "$ancestor" -o json >"$TMP/ancestor-operations.json"
  python3 "$ROOT/scripts/admin-explorer/verify-route-ownership.py" ancestor "$TMP/apis.json" "$ancestor" "$TMP/ancestor-operations.json"
done <"$TMP/ancestors"
az apim api operation list -g "$RG" --service-name "$APIM" --api-id craves-admin-explorer-v1 -o json >"$TMP/operations.json"
jq -e 'length == 3 and ([.[] | select(.method == "POST") | .urlTemplate] | sort) == ["/chefs/query","/orders/query","/users/query"]' "$TMP/operations.json" >/dev/null || fail 'Explorer operation inventory contains an unexpected owner or wildcard.'
az containerapp show -g "$RG" -n "$ADMIN_APP" -o json >"$TMP/admin.json"
python3 "$ROOT/scripts/admin-explorer/verify-admin-runtime.py" capture "$TMP/admin.json" "${ADMIN_RUNTIME_SNAPSHOT_FILE:-$TMP/admin-snapshot.json}"
jq -e '.properties.template.scale.minReplicas == 1 and .properties.template.scale.maxReplicas == 1
  and ([.properties.template.containers[0].env[]? | select(.name == "CRAVES_ADMIN_PORTAL" and .value == "true")] | length) == 1' "$TMP/admin.json" >/dev/null || fail 'Existing admin replica or portal configuration differs.'
az apim show -g "$RG" --name "$APIM" -o json >"$TMP/apim.json"
GATEWAY=$(jq -r '.gatewayUrl // .properties.gatewayUrl // ""' "$TMP/apim.json")
[[ "$GATEWAY" == https://* ]] || fail 'Verified APIM gateway is unavailable.'
# Existing admin configuration is preserved by the image-only deployment.
python3 - "$TMP/admin.json" "$TMP/apim.json" <<'PY'
import json,sys,urllib.parse
app=json.load(open(sys.argv[1])); apim=json.load(open(sys.argv[2])); properties=apim.get('properties',apim)
gateway=urllib.parse.urlsplit(properties.get('gatewayUrl',''))
allowed={gateway.hostname}|{v.get('hostName','').lower() for v in properties.get('hostnameConfigurations',[]) if v.get('type')=='Proxy'}
settings={v['name']:v for v in app['properties']['template']['containers'][0].get('env',[])}
setting=settings.get('CRAVES_API_BASE_URL',{})
if setting.get('secretRef'):
    raise SystemExit('ERROR: Secret-referenced admin API origin requires separate resolved-origin release verification; no secret is read or replaced.')
origin=urllib.parse.urlsplit(setting.get('value',''))
if not (origin.scheme=='https' and origin.hostname in allowed and origin.path.rstrip('/')=='/api/v1' and not origin.query and not origin.fragment and not origin.username and not origin.password):
    raise SystemExit('ERROR: Existing admin API origin does not match the inventoried APIM gateway; no setting is changed.')
PY
apps=(ca-craves-auth-service-prodlow ca-craves-user-chef-service-prod ca-craves-order-service-prodlow)
domains=(users chefs orders)
for i in 0 1 2; do
  app="${apps[$i]}"; domain="${domains[$i]}"
  az containerapp show -g "$RG" -n "$app" -o json >"$TMP/app.json"
  jq -e '.properties.latestRevisionName == .properties.latestReadyRevisionName
    and .properties.latestRevisionName != null and .properties.runningStatus == "Running"
    and .properties.configuration.activeRevisionsMode == "Single"
    and .properties.template.scale.minReplicas == 1 and .properties.template.scale.maxReplicas == 1
    and ([.properties.template.containers[0].env[]? | select(.name == "CRAVES_ADMIN_EXPLORER_ENABLED" and .value == "true")] | length) == 1' "$TMP/app.json" >/dev/null || fail "$app is not a ready single-replica Explorer dependency."
  ready=$(jq -r '.properties.latestReadyRevisionName' "$TMP/app.json")
  az containerapp replica list -g "$RG" -n "$app" --revision "$ready" -o json >"$TMP/backend-replicas.json"
  jq -e 'type == "array" and length == 1' "$TMP/backend-replicas.json" >/dev/null || fail "$app actual replica count is not one."
  fqdn=$(jq -r '.properties.configuration.ingress.fqdn // ""' "$TMP/app.json")
  [[ "$fqdn" =~ ^[a-z0-9][a-z0-9.-]+\.azurecontainerapps\.io$ ]] || fail "$app origin is invalid."
  image=$(jq -r '.properties.template.containers[0].image // ""' "$TMP/app.json")
  [[ "$image" == "$LOGIN/"* && "$image" =~ @sha256:[0-9a-f]{64}$ ]] || fail "$app must run a digest-pinned image from the verified registry."
  reference="${image#"$LOGIN/"}"; repository="${reference%%[@:]*}"
  [[ "$repository" =~ ^[a-z0-9._/-]+$ ]] || fail "$app repository reference is invalid."
  current=$(az acr repository show --name "$ACR" --image "$reference" --query digest -o tsv)
  reviewed=$(az acr repository show --name "$ACR" --image "$repository:$EXPECTED_RELEASE_SHA" --query digest -o tsv)
  [[ "$current" =~ ^sha256:[0-9a-f]{64}$ && "$current" == "${image##*@}" && "$current" == "$reviewed" ]] || fail "$app image differs from its reviewed-release SHA tag."
  curl --fail --silent --show-error --max-time 20 "https://$fqdn/actuator/health" >/dev/null
  op="post-explorer-$domain-query"
  az rest --method get --url "$API/operations/$op?api-version=$VERSION" -o json >"$TMP/operation.json"
  jq -e --arg path "/$domain/query" '.properties.method == "POST" and .properties.urlTemplate == $path' "$TMP/operation.json" >/dev/null || fail "$domain operation does not match the implemented route."
  az rest --method get --url "$API/operations/$op/policies/policy?api-version=$VERSION" --query properties.value -o tsv >"$TMP/operation.xml"
  python3 "$ROOT/scripts/admin-explorer/verify-runtime-policy.py" operation "$TMP/operation.xml" "$ROOT/infra/apim/admin-explorer/authenticated-policy.xml" "https://$fqdn/api/v1/admin/explorer"
  status=$(curl --silent --show-error --max-time 20 --output /dev/null --write-out '%{http_code}' -X POST "$GATEWAY/api/v1/admin/explorer/$domain/query" -H 'Content-Type: application/json' --data '{"mode":"summary"}')
  [[ "$status" == 401 ]] || fail "$domain anonymous route is not denied."
  revision=$(jq -r '.properties.latestReadyRevisionName' "$TMP/app.json")
  echo "READY: $domain revision=$revision runningDigest=$current release=$EXPECTED_RELEASE_SHA"
done
echo 'PASS: deployed source-linked dependencies, active flags, routes and anonymous denial verified. Authenticated success/role-denial acceptance is separate required release evidence.'
