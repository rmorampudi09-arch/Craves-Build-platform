#!/usr/bin/env bash
# Rolls back configure-rider-fleet-apim.sh: removes every operation in infra/apim/rider-fleet/routes.txt from
# craves-rider-v1 (api/v1/rider) and craves-admin-fleet-v1 (api/v1/admin/fleet), then deletes each of those two APIs once
# it has no operation left, so the gateway is as it was before the first configure. An operation the table does not list
# keeps its API. To go back to an earlier version instead, run the configure pipeline at that main commit.
#
#   CONFIRM_APIM_ROLLBACK=true bash scripts/apim/rollback-rider-fleet-apim.sh   (az login first)
#
# Touches nothing else: no backend, flag, data or other API. Riders and the ops console get 404 from the gateway afterwards.
set -euo pipefail
set +x
: "${CONFIRM_APIM_ROLLBACK:=false}"
RG=rg-craves-prodlow-centralindia
APIM=apim-craves-prodlow-kmqgfy
EXPECTED_SUBSCRIPTION=721906c9-4a72-4606-830b-d3e7ace093ff
EXPECTED_TENANT=1e7e43ac-c7f5-4d47-a74f-289a7cc21508
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ROUTES_FILE="$ROOT/infra/apim/rider-fleet/routes.txt"
fail() { echo "ERROR: $*" >&2; exit 1; }

[[ "${CONFIRM_APIM_ROLLBACK,,}" == true ]] || fail 'Set CONFIRM_APIM_ROLLBACK=true for the controlled rollback'
for tool in az awk sed; do command -v "$tool" >/dev/null || fail "$tool is required"; done
[[ -f "$ROUTES_FILE" ]] || fail 'infra/apim/rider-fleet/routes.txt is missing'
mapfile -t APIS < <(sed -n 's/^api|//p' "$ROUTES_FILE")
mapfile -t ROUTES < <(sed -n 's/^route|//p' "$ROUTES_FILE")
[[ $(az account show --query id -o tsv --only-show-errors) == "$EXPECTED_SUBSCRIPTION" &&
  $(az account show --query tenantId -o tsv --only-show-errors) == "$EXPECTED_TENANT" ]] || fail 'Wrong Azure subscription or tenant; nothing removed.'

API_LIST=$(az apim api list -g "$RG" --service-name "$APIM" --query '[].[name,path]' -o tsv --only-show-errors)
for ROW in "${APIS[@]}"; do
  IFS='|' read -r KEY PATH_PART API_ID NAME <<<"$ROW"
  FOUND_PATH=$(awk -F'\t' -v id="$API_ID" '$1==id {print $2}' <<<"$API_LIST")
  if [[ -z "$(awk -F'\t' -v id="$API_ID" '$1==id {print $1}' <<<"$API_LIST")" ]]; then
    echo "SKIP: API $API_ID is already absent"
    continue
  fi
  [[ "$FOUND_PATH" == "$PATH_PART" ]] || fail "API $API_ID has path /$FOUND_PATH, not /$PATH_PART; review it by hand. Nothing more removed."
  # Operations are matched by method and URL template (parameter names ignored), whatever their management id.
  OPS=$(az apim api operation list -g "$RG" --service-name "$APIM" --api-id "$API_ID" --query '[].[name,method,urlTemplate]' -o tsv \
    --only-show-errors | sed -E 's/\{[^}]*\}/{}/g')
  for ROUTE in "${ROUTES[@]}"; do
    IFS='|' read -r R_KEY ID METHOD TEMPLATE KIND <<<"$ROUTE"
    [[ "$R_KEY" == "$KEY" ]] || continue
    while read -r OP_ID; do
      [[ -n "$OP_ID" ]] || continue
      az apim api operation delete -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$OP_ID" --yes --only-show-errors
      echo "REMOVED: $METHOD /$PATH_PART$TEMPLATE ($OP_ID)"
    done < <(awk -F'\t' -v m="$METHOD" -v t="$(sed -E 's/\{[^}]*\}/{}/g' <<<"$TEMPLATE")" 'toupper($2)==m && $3==t {print $1}' <<<"$OPS")
  done
  mapfile -t REMAINING < <(az apim api operation list -g "$RG" --service-name "$APIM" --api-id "$API_ID" --query '[].name' -o tsv --only-show-errors | sed '/^$/d')
  if (( ${#REMAINING[@]} == 0 )); then
    az apim api delete -g "$RG" --service-name "$APIM" --api-id "$API_ID" --yes --only-show-errors
    echo "REMOVED API: $API_ID (/$PATH_PART)"
  else
    echo "KEPT API $API_ID: operations outside routes.txt remain (${REMAINING[*]}); review them by hand."
  fi
done

echo "SUCCESS: Rider fleet APIM rollback completed without touching backend services, flags or data."
