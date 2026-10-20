#!/usr/bin/env bash
# Publishes the Craves rider API (craves-rider-v1, api/v1/rider) and the ops console's admin fleet API
# (craves-admin-fleet-v1, api/v1/admin/fleet) on the mobile gateway (apim-craves-prodlow-kmqgfy, api.craves.in). Both go
# to integration-service. Contracts: contracts/openapi/rider-v1.yaml and admin-fleet-v1.yaml. APIs, operations and their
# policies: infra/apim/rider-fleet (routes.txt is kept equal to the contracts by scripts/apim/tests/test_rider_fleet_apim.py).
#
#   DRY_RUN=true bash scripts/apim/configure-rider-fleet-apim.sh            prints every API, operation and policy, calls nothing
#   CONFIRM_APIM_WRITE=true bash scripts/apim/configure-rider-fleet-apim.sh scoped, idempotent APIM write (az login first)
#
# Both APIs belong to this script. It creates one when no API owns its path and refuses a path another API id owns. Each
# run makes them match routes.txt exactly: every operation and its policy is written, and an operation the table no longer
# lists is removed. So running this script from an earlier main commit restores that version; the rollback script removes
# both APIs. Parent APIs: APIM serves a request from the API with the longest matching path, so a new API beneath an
# existing parent (api/v1, api/v1/admin) hides whatever the parent serves under the new prefix; the run stops if the parent
# serves anything there. All read-only checks run first; nothing is written until they have passed.
# Release order: the integration-service image first (its fleet flags may stay off; the routes then answer 403 or 404).
# This script only wires the gateway; backend JWT, role and shift-credential checks stay authoritative.
set -euo pipefail
set +x
: "${CONFIRM_APIM_WRITE:=false}"
: "${DRY_RUN:=false}"
RG=rg-craves-prodlow-centralindia
APIM=apim-craves-prodlow-kmqgfy
API_VERSION=2022-08-01
PUBLIC_HOST=https://api.craves.in
EXPECTED_SUBSCRIPTION=721906c9-4a72-4606-830b-d3e7ace093ff
EXPECTED_TENANT=1e7e43ac-c7f5-4d47-a74f-289a7cc21508
INTEGRATION_APP=ca-craves-integration-service-pr
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
POLICY_DIR="$ROOT/infra/apim/rider-fleet"
fail() { echo "ERROR: $*" >&2; exit 1; }

[[ -f "$POLICY_DIR/routes.txt" ]] || fail 'infra/apim/rider-fleet/routes.txt is missing'
mapfile -t APIS < <(sed -n 's/^api|//p' "$POLICY_DIR/routes.txt")
mapfile -t ROUTES < <(sed -n 's/^route|//p' "$POLICY_DIR/routes.txt")
(( ${#APIS[@]} == 2 && ${#ROUTES[@]} > 0 )) || fail 'routes.txt must list the two APIs and their routes'
for KIND in json upload location admin; do [[ -f "$POLICY_DIR/$KIND-policy.xml" ]] || fail "Policy template $KIND-policy.xml is missing"; done

api_field() { local ROW f; for ROW in "${APIS[@]}"; do IFS='|' read -r -a f <<<"$ROW"; [[ "${f[0]}" == "$1" ]] && { echo "${f[$2]}"; return; }; done; fail "unknown api key $1"; }
normalise() { sed -E 's/\{[^}]*\}/{}/g' <<<"$1"; }

print_table() {
  local ROW f
  echo "APIM $APIM (rg $RG), public gateway $PUBLIC_HOST, backend $INTEGRATION_APP (FQDN read at run time)"
  echo; echo 'APIs (created when no API owns the path; a path another API id owns stops the run):'
  for ROW in "${APIS[@]}"; do IFS='|' read -r -a f <<<"$ROW"; printf '  %-6s /%-22s %s\n' "${f[0]}" "${f[1]}" "${f[2]}"; done
  echo; echo "Operations (${#ROUTES[@]}); gateway path = backend path. Operations no longer listed are removed from these two APIs."
  printf '  %-7s %-62s %s\n' METHOD 'GATEWAY PATH' POLICY
  for ROW in "${ROUTES[@]}"; do
    IFS='|' read -r -a f <<<"$ROW"
    printf '  %-7s %-62s %s\n' "${f[2]}" "/$(api_field "${f[0]}" 1)${f[3]}" "${f[4]}"
  done
  echo
}

print_table
if [[ "${DRY_RUN,,}" == true ]]; then
  echo "DRY_RUN complete: ${#ROUTES[@]} operations on ${#APIS[@]} APIs. No az or curl call was made; nothing was written."
  exit 0
fi

[[ "${CONFIRM_APIM_WRITE,,}" == true ]] || fail 'Set CONFIRM_APIM_WRITE=true for the scoped APIM update (or DRY_RUN=true to preview).'
for tool in az jq curl sed awk; do command -v "$tool" >/dev/null || fail "$tool is required"; done

# Phase 1, read-only: nothing from here to the "Phase 2" marker creates or changes anything in Azure.
SUB=$(az account show --query id -o tsv --only-show-errors)
TENANT=$(az account show --query tenantId -o tsv --only-show-errors)
[[ "$SUB" == "$EXPECTED_SUBSCRIPTION" && "$TENANT" == "$EXPECTED_TENANT" ]] || fail 'Wrong Azure subscription or tenant; no update applied.'
az apim show -g "$RG" -n "$APIM" -o none --only-show-errors
MGMT_BASE="https://management.azure.com/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.ApiManagement/service/$APIM"

APP_JSON=$(az containerapp show -g "$RG" -n "$INTEGRATION_APP" -o json --only-show-errors)
FQDN=$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$APP_JSON")
[[ -n "$FQDN" && $(jq -r '.properties.runningStatus // ""' <<<"$APP_JSON") == Running &&
  $(jq -r '.properties.latestRevisionName // ""' <<<"$APP_JSON") == $(jq -r '.properties.latestReadyRevisionName // ""' <<<"$APP_JSON") ]] ||
  fail "$INTEGRATION_APP is not ready; no update applied."
curl --fail --silent --show-error --max-time 30 "https://$FQDN/actuator/health" | jq -e '.status=="UP"' >/dev/null ||
  fail "$INTEGRATION_APP health is not UP; no update applied."

GLOBAL_POLICY=$(az rest --method get --url "$MGMT_BASE/policies/policy?api-version=$API_VERSION" --query properties.value -o tsv --only-show-errors 2>/dev/null || true)
[[ "$GLOBAL_POLICY" != *'backend-id='* ]] || fail 'Inherited global backend-id policy blocks base-url routing; no update applied.'

API_LIST=$(az apim api list -g "$RG" --service-name "$APIM" --query '[].[name,path]' -o tsv --only-show-errors)
declare -A CREATE OPS
for ROW in "${APIS[@]}"; do
  IFS='|' read -r KEY PATH_PART API_ID NAME <<<"$ROW"
  mapfile -t OWNERS < <(awk -F'\t' -v p="$PATH_PART" '$1!="" && $2==p {print $1}' <<<"$API_LIST")
  (( ${#OWNERS[@]} <= 1 )) || fail "Multiple APIM APIs own /$PATH_PART; no update applied."
  if (( ${#OWNERS[@]} == 1 )); then
    [[ "${OWNERS[0]}" == "$API_ID" ]] || fail "/$PATH_PART belongs to API ${OWNERS[0]}, not $API_ID; review it by hand. No update applied."
    [[ $(az apim api show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --query subscriptionRequired -o tsv --only-show-errors) == [Ff]alse ]] ||
      fail "API $API_ID requires a subscription key; the app and the console send none. No update applied."
    API_POLICY=$(az rest --method get --url "$MGMT_BASE/apis/$API_ID/policies/policy?api-version=$API_VERSION" --query properties.value -o tsv --only-show-errors 2>/dev/null || true)
    [[ "$API_POLICY" != *'backend-id='* ]] || fail "API $API_ID has a backend-id policy that blocks base-url routing; no update applied."
    # name, method, template per existing operation; templates normalised so {id} and {tripId} compare equal.
    OPS[$KEY]=$(az apim api operation list -g "$RG" --service-name "$APIM" --api-id "$API_ID" \
      --query '[].[name,method,urlTemplate]' -o tsv --only-show-errors | sed -E 's/\{[^}]*\}/{}/g')
    echo "API $KEY: $API_ID (/$PATH_PART) exists"
    continue
  fi
  TAKEN=$(awk -F'\t' -v id="$API_ID" '$1==id {print $2}' <<<"$API_LIST")
  [[ -z "$TAKEN" ]] || fail "API id $API_ID already exists with path /$TAKEN, not /$PATH_PART; refusing to re-path it. No update applied."
  # The longest strict parent (a path equal to a leading run of whole segments, or the empty path) is the only API that can
  # serve this prefix today. Any operation of it that matches under the prefix (a literal path there, or a wildcard whose
  # literal part leads into it) would be hidden by the new API.
  PARENT=$(awk -F'\t' -v pp="$PATH_PART" 'BEGIN{best=-1} $1!="" && $2!=pp && ($2=="" || index(pp,$2"/")==1) && length($2)>best {best=length($2); line=$1"\t"$2; f=1} END{if(f) print line}' <<<"$API_LIST")
  if [[ -n "$PARENT" ]]; then
    IFS=$'\t' read -r P_ID P_PATH <<<"$PARENT"
    REL="/$PATH_PART"; [[ -z "$P_PATH" ]] || REL="${REL#"/$P_PATH"}"
    HIDDEN=$(az apim api operation list -g "$RG" --service-name "$APIM" --api-id "$P_ID" --query '[].[name,urlTemplate]' -o tsv --only-show-errors |
      awk -F'\t' -v rel="$REL" '{ t=$2; i=index(t,"*"); lit=(i ? substr(t,1,i-1) : t); if (substr(lit,length(lit))=="{") lit=substr(lit,1,length(lit)-1)
        if (index(t, rel)==1 || (i && index(rel, lit)==1)) print $1 }' | tr '\n' ' ')
    [[ -z "$HIDDEN" ]] || fail "Parent API $P_ID (/$P_PATH) already serves routes under /$PATH_PART ($HIDDEN); creating $API_ID would hide them. Review by hand. No update applied."
    echo "API $KEY: $API_ID (/$PATH_PART) will be created; parent $P_ID (/$P_PATH) serves nothing under it"
  else
    echo "API $KEY: $API_ID (/$PATH_PART) will be created"
  fi
  CREATE[$KEY]=1; OPS[$KEY]=''
done

declare -a OP_IDS
for I in "${!ROUTES[@]}"; do
  IFS='|' read -r KEY ID METHOD TEMPLATE KIND <<<"${ROUTES[$I]}"
  mapfile -t SAME < <(awk -F'\t' -v m="$METHOD" -v t="$(normalise "$TEMPLATE")" 'toupper($2)==m && $3==t {print $1}' <<<"${OPS[$KEY]}")
  (( ${#SAME[@]} <= 1 )) || fail "Several operations own $METHOD $TEMPLATE on $(api_field "$KEY" 2); resolve by hand. No update applied."
  # An operation already serving this method and template keeps its management id; its definition and policy are rewritten.
  OP_IDS[$I]="${SAME[0]:-$ID}"
done

# Phase 2, writes: create the missing APIs, write every operation and policy, then remove operations the table no longer has.
for KEY in "${!CREATE[@]}"; do
  az apim api create -g "$RG" --service-name "$APIM" --api-id "$(api_field "$KEY" 2)" --display-name "$(api_field "$KEY" 3)" \
    --path "$(api_field "$KEY" 1)" --service-url "https://$FQDN/$(api_field "$KEY" 1)" --protocols https --subscription-required false \
    -o none --only-show-errors
  echo "CREATED API $(api_field "$KEY" 2) (/$(api_field "$KEY" 1))"
done

TEMP_DIR=$(mktemp -d)
trap 'rm -rf -- "$TEMP_DIR"' EXIT
declare -A KEEP
FAILED_PROBES=0
for I in "${!ROUTES[@]}"; do
  IFS='|' read -r KEY ID METHOD TEMPLATE KIND <<<"${ROUTES[$I]}"
  API=$(api_field "$KEY" 2); OP="${OP_IDS[$I]}"; BACKEND="https://$FQDN/$(api_field "$KEY" 1)"
  MGMT="$MGMT_BASE/apis/$API"
  PARAMS=$(grep -oE '\{[A-Za-z]+\}' <<<"$TEMPLATE" | tr -d '{}' | jq -R '{name: ., type: "string", required: true}' | jq -s . || true)
  jq -n --arg display "$ID" --arg method "$METHOD" --arg template "$TEMPLATE" --argjson params "${PARAMS:-[]}" \
    '{properties:{displayName:$display,method:$method,urlTemplate:$template,templateParameters:$params,responses:[]}}' >"$TEMP_DIR/operation.json"
  az rest --method put --url "$MGMT/operations/$OP?api-version=$API_VERSION" --body @"$TEMP_DIR/operation.json" -o none --only-show-errors
  sed "s|__BACKEND_URL__|$BACKEND|" "$POLICY_DIR/$KIND-policy.xml" >"$TEMP_DIR/policy.xml"
  jq -Rs '{properties:{format:"rawxml",value:.}}' "$TEMP_DIR/policy.xml" >"$TEMP_DIR/policy.json"
  az rest --method put --url "$MGMT/operations/$OP/policies/policy?api-version=$API_VERSION" --body @"$TEMP_DIR/policy.json" -o none --only-show-errors
  KEEP[$KEY]+=" $OP "
  # Read-back: this backend, the Bearer check and no-store; outside /locations and /devices the shift credential is dropped.
  POLICY=$(az rest --method get --url "$MGMT/operations/$OP/policies/policy?api-version=$API_VERSION" --query properties.value -o tsv --only-show-errors)
  [[ "$POLICY" == *"$BACKEND"* && "$POLICY" == *Bearer* && "$POLICY" == *no-store* && "$POLICY" == *nosniff* ]] ||
    fail "Policy read-back failed for $METHOD /$(api_field "$KEY" 1)$TEMPLATE on $API."
  if [[ "$KIND" == location ]]; then
    [[ "$POLICY" != *'name="X-Craves-Shift-Credential" exists-action="delete"'* ]] || fail "The shift credential is dropped on $METHOD $TEMPLATE."
  else
    [[ "$POLICY" == *'name="X-Craves-Shift-Credential" exists-action="delete"'* ]] || fail "The shift credential is not dropped on $METHOD $TEMPLATE."
  fi
  echo "WROTE $METHOD /$(api_field "$KEY" 1)$TEMPLATE ($API/$OP, $KIND)"
done

for ROW in "${APIS[@]}"; do
  IFS='|' read -r KEY PATH_PART API_ID NAME <<<"$ROW"
  while IFS=$'\t' read -r NAME_ METHOD_ TEMPLATE_; do
    [[ -n "$NAME_" && "${KEEP[$KEY]:-}" != *" $NAME_ "* ]] || continue
    az apim api operation delete -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$NAME_" --yes --only-show-errors
    echo "REMOVED $METHOD_ /$PATH_PART$TEMPLATE_ ($API_ID/$NAME_): no longer in routes.txt"
  done < <(az apim api operation list -g "$RG" --service-name "$APIM" --api-id "$API_ID" --query '[].[name,method,urlTemplate]' -o tsv --only-show-errors)
done

# Unauthenticated probes through the public gateway prove each route exists and is guarded (the policy answers first).
for ROW in "${ROUTES[@]}"; do
  IFS='|' read -r KEY ID METHOD TEMPLATE KIND <<<"$ROW"
  TARGET="/$(api_field "$KEY" 1)$TEMPLATE"
  BODY_ARGS=(); [[ "$METHOD" == POST || "$METHOD" == PUT || "$METHOD" == PATCH ]] && BODY_ARGS=(-H 'Content-Type: application/json' --data '{}')
  STATUS=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 30 -X "$METHOD" ${BODY_ARGS[@]+"${BODY_ARGS[@]}"} \
    "$PUBLIC_HOST$(sed -E 's/\{[^}]*\}/probe/g' <<<"$TARGET")" || true)
  if [[ "$STATUS" == 401 ]]; then echo "OK   $METHOD $TARGET (401 unauthenticated)"
  else echo "FAIL $METHOD $TARGET expected 401 from the unauthenticated probe, got ${STATUS:-none}" >&2; FAILED_PROBES=$((FAILED_PROBES+1)); fi
done
(( FAILED_PROBES == 0 )) || fail "$FAILED_PROBES route(s) did not answer 401 unauthenticated; run the rollback pipeline or review the gateway."
echo "SUCCESS: Rider fleet APIM configured: ${#ROUTES[@]} operations on craves-rider-v1 and craves-admin-fleet-v1, every route probed."
