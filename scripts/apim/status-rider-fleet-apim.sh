#!/usr/bin/env bash
# Read-only check of configure-rider-fleet-apim.sh on the mobile gateway: both APIs own their paths without a subscription
# key, each has exactly the operations in infra/apim/rider-fleet/routes.txt, every policy routes to integration-service with
# the Bearer guard and no-store, the shift credential is dropped everywhere except /locations, /devices and trip steps, and every
# route answers 401 to an unauthenticated probe. Writes nothing and sends no authenticated request.
#
#   bash scripts/apim/status-rider-fleet-apim.sh   (az login first)
set -euo pipefail
set +x
RG=rg-craves-prodlow-centralindia
APIM=apim-craves-prodlow-kmqgfy
API_VERSION=2022-08-01
PUBLIC_HOST=https://api.craves.in
INTEGRATION_APP=ca-craves-integration-service-pr
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ROUTES_FILE="$ROOT/infra/apim/rider-fleet/routes.txt"
fail() { echo "ERROR: $*" >&2; exit 1; }

for tool in az jq curl awk sed; do command -v "$tool" >/dev/null || fail "$tool is required"; done
[[ -f "$ROUTES_FILE" ]] || fail 'infra/apim/rider-fleet/routes.txt is missing'
mapfile -t APIS < <(sed -n 's/^api|//p' "$ROUTES_FILE")
mapfile -t ROUTES < <(sed -n 's/^route|//p' "$ROUTES_FILE")
SUB=$(az account show --query id -o tsv --only-show-errors)
MGMT_BASE="https://management.azure.com/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.ApiManagement/service/$APIM"
FQDN=$(az containerapp show -g "$RG" -n "$INTEGRATION_APP" --query properties.configuration.ingress.fqdn -o tsv --only-show-errors)
[[ -n "$FQDN" ]] || fail "$INTEGRATION_APP has no ingress FQDN"

api_field() { local ROW f; for ROW in "${APIS[@]}"; do IFS='|' read -r -a f <<<"$ROW"; [[ "${f[0]}" == "$1" ]] && { echo "${f[$2]}"; return; }; done; fail "unknown api key $1"; }

PROBLEMS=0
problem() { echo "FAIL $*" >&2; PROBLEMS=$((PROBLEMS+1)); }
declare -A OPS
for ROW in "${APIS[@]}"; do
  IFS='|' read -r KEY PATH_PART API_ID NAME <<<"$ROW"
  API_JSON=$(az apim api show -g "$RG" --service-name "$APIM" --api-id "$API_ID" -o json --only-show-errors 2>/dev/null) ||
    fail "API $API_ID is absent; run the configure pipeline."
  [[ "$(jq -r '.path' <<<"$API_JSON")" == "$PATH_PART" ]] || problem "API $API_ID path is not /$PATH_PART"
  [[ "$(jq -r '.subscriptionRequired' <<<"$API_JSON")" == false ]] || problem "API $API_ID requires a subscription key"
  OPS[$KEY]=$(az apim api operation list -g "$RG" --service-name "$APIM" --api-id "$API_ID" --query '[].[name,method,urlTemplate]' -o tsv \
    --only-show-errors | sed -E 's/\{[^}]*\}/{}/g')
  EXPECTED=$(grep -c "^route|$KEY|" "$ROUTES_FILE")
  ACTUAL=$(grep -c . <<<"${OPS[$KEY]}" || true)
  [[ "$ACTUAL" == "$EXPECTED" ]] || problem "API $API_ID has $ACTUAL operations, routes.txt lists $EXPECTED"
done

for ROUTE in "${ROUTES[@]}"; do
  IFS='|' read -r KEY ID METHOD TEMPLATE KIND <<<"$ROUTE"
  API=$(api_field "$KEY" 2); TARGET="/$(api_field "$KEY" 1)$TEMPLATE"; BACKEND="https://$FQDN/$(api_field "$KEY" 1)"
  mapfile -t SAME < <(awk -F'\t' -v m="$METHOD" -v t="$(sed -E 's/\{[^}]*\}/{}/g' <<<"$TEMPLATE")" 'toupper($2)==m && $3==t {print $1}' <<<"${OPS[$KEY]}")
  if (( ${#SAME[@]} != 1 )); then problem "$METHOD $TARGET: expected one operation, found ${#SAME[@]}"; continue; fi
  POLICY=$(az rest --method get --url "$MGMT_BASE/apis/$API/operations/${SAME[0]}/policies/policy?api-version=$API_VERSION" \
    --query properties.value -o tsv --only-show-errors)
  [[ "$POLICY" == *"$BACKEND"* && "$POLICY" == *Bearer* && "$POLICY" == *no-store* && "$POLICY" == *nosniff* ]] ||
    problem "$METHOD $TARGET: policy lacks this backend, the Bearer guard or no-store"
  [[ "$POLICY" != *'backend-id='* && "$POLICY" != *cache-lookup* ]] || problem "$METHOD $TARGET: policy uses backend-id or caching"
  DROPS=false; [[ "$POLICY" == *'name="X-Craves-Shift-Credential" exists-action="delete"'* ]] && DROPS=true
  PASSES=false; [[ "$KIND" == location || "$KIND" == trip ]] && PASSES=true
  [[ "$PASSES" != "$DROPS" ]] ||
    problem "$METHOD $TARGET: the shift credential must pass only on /locations, /devices and trip steps"
  BODY_ARGS=(); [[ "$METHOD" == POST || "$METHOD" == PUT || "$METHOD" == PATCH ]] && BODY_ARGS=(-H 'Content-Type: application/json' --data '{}')
  STATUS=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 30 -X "$METHOD" ${BODY_ARGS[@]+"${BODY_ARGS[@]}"} \
    "$PUBLIC_HOST$(sed -E 's/\{[^}]*\}/probe/g' <<<"$TARGET")" || true)
  [[ "$STATUS" == 401 ]] && echo "OK   $METHOD $TARGET -> $API/${SAME[0]} ($KIND, 401 unauthenticated)" ||
    problem "$METHOD $TARGET: unauthenticated probe answered ${STATUS:-nothing}, not 401"
done

(( PROBLEMS == 0 )) || fail "$PROBLEMS problem(s); see FAIL lines above."
echo "SUCCESS: Rider fleet APIM status is healthy."
