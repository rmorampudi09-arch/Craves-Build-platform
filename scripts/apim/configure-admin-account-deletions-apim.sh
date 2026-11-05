#!/usr/bin/env bash
# Publishes the account deletion admin routes of auth-service (AdminAccountDeletionController) on the gateway behind
# api.craves.in, for the admin page /admin/account-deletions.
#
#   DRY_RUN=true bash scripts/apim/configure-admin-account-deletions-apim.sh              (az login first; writes nothing)
#   CONFIRM_APIM_WRITE=true bash scripts/apim/configure-admin-account-deletions-apim.sh
#
# Creates API craves-admin-account-deletions-v1 at api/v1/admin/account-deletions if it is missing, then writes its four
# operations and their policies. No other API is changed. It stops before writing if another API owns the path, if a
# parent API (api/v1/admin, api/v1, ...) already serves something under it, because APIM sends a request to the longest
# matching API path and the new API would take that route over, or if the gateway timeout is under 30 s.
# Env overrides: APIM, APIM_RG, AUTH_RG, AUTH_APP, PUBLIC_HOST.
# Undo: az apim api delete -g <APIM_RG> --service-name apim-craves-prod-34eefd --api-id craves-admin-account-deletions-v1 --yes
set -euo pipefail
set +x

DRY_RUN="${DRY_RUN:-false}"
CONFIRM_APIM_WRITE="${CONFIRM_APIM_WRITE:-false}"
fail() { echo "ERROR: $*" >&2; exit 1; }
# Azure CLI output is captured and never echoed: on failure only this script's own message is printed.
azq() { local what="$1" out; shift; out=$("$@" 2>/dev/null) || fail "Azure command failed: $what"; printf '%s' "$out"; }
# The gate comes first, so a missing tool never hides it.
[[ "${DRY_RUN,,}" == "true" || "${CONFIRM_APIM_WRITE,,}" == "true" ]] || fail "Set DRY_RUN=true to check only, or CONFIRM_APIM_WRITE=true for the controlled APIM write"

APIM="${APIM:-apim-craves-prod-34eefd}"
AUTH_RG="${AUTH_RG:-rg-craves-auth-prod}"
AUTH_APP="${AUTH_APP:-ca-craves-auth-prod}"
API_ID="${API_ID:-craves-admin-account-deletions-v1}"
API_PATH="${API_PATH:-api/v1/admin/account-deletions}"
API_VERSION="${API_VERSION:-2022-08-01}"
PUBLIC_HOST="${PUBLIC_HOST:-https://api.craves.in}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
POLICY_TEMPLATE="$ROOT/infra/apim/admin-account-deletions/authenticated-policy.xml"
# operation id|method|url template (below /api/v1/admin/account-deletions, the same on the gateway and in auth-service)|display name
OPERATIONS=(
  'list-admin-account-deletions|GET|/|List account deletion requests'
  'get-admin-account-deletion|GET|/{requestId}|One account deletion request with blockers and steps'
  'approve-admin-account-deletion|POST|/{requestId}/approve|Approve a chef account deletion'
  'reject-admin-account-deletion|POST|/{requestId}/reject|Reject an account deletion'
)

for tool in az jq curl sed awk; do command -v "$tool" >/dev/null || fail "$tool is required"; done
[[ -f "$POLICY_TEMPLATE" ]] || fail "APIM policy template is missing"

TEMP_DIR=$(mktemp -d)
trap 'rm -rf -- "$TEMP_DIR"' EXIT
ERR_FILE="$TEMP_DIR/az.err"

# Read-only checks first: nothing is written until all of them pass.
SUBSCRIPTION_ID=$(azq "read the subscription" az account show --query id -o tsv)
if [[ -z "${APIM_RG:-}" ]]; then
  APIM_RGS=$(azq "find the APIM resource group" az apim list --query "[?name=='$APIM'].resourceGroup" -o tsv)
  [[ -n "$APIM_RGS" && "$APIM_RGS" != *$'\n'* ]] || fail "Expected exactly one resource group for $APIM; set APIM_RG"
  APIM_RG="$APIM_RGS"
fi
APP_JSON=$(azq "read the auth container app" az containerapp show -g "$AUTH_RG" -n "$AUTH_APP" -o json)
FQDN=$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$APP_JSON")
LATEST=$(jq -r '.properties.latestRevisionName // ""' <<<"$APP_JSON")
READY=$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$APP_JSON")
RUNNING=$(jq -r '.properties.runningStatus // ""' <<<"$APP_JSON")
[[ -n "$FQDN" && "$LATEST" == "$READY" && "$RUNNING" == "Running" ]] || fail "Auth Service is not ready"
HEALTH=$(azq "read auth's revision health" az containerapp revision show -g "$AUTH_RG" -n "$AUTH_APP" --revision "$READY" --query properties.healthState -o tsv)
[[ "$HEALTH" == Healthy ]] || fail "Auth Service revision $READY is not Healthy"
BASE="https://${FQDN}"

API_LIST=$(azq "list APIM APIs" az apim api list -g "$APIM_RG" --service-name "$APIM" --query '[].[name,path]' -o tsv)
OWNER=$(awk -F'\t' -v p="$API_PATH" '$2==p {print $1}' <<<"$API_LIST")
[[ -z "$OWNER" || "$OWNER" == "$API_ID" ]] || fail "A different API ($OWNER) owns /${API_PATH}; no update applied"
while IFS=$'\t' read -r P_ID P_PATH; do
  [[ -n "$P_ID" && "$P_PATH" != "$API_PATH" ]] || continue
  [[ -z "$P_PATH" || "$API_PATH" == "$P_PATH"/* ]] || continue
  REL="/${API_PATH#"$P_PATH"}"; REL="${REL//\/\//\/}"
  HIT=$(azq "list operations of $P_ID" az apim api operation list -g "$APIM_RG" --service-name "$APIM" --api-id "$P_ID" --query '[].urlTemplate' -o tsv |
    awk -v r="$REL" 'index($0, r) == 1 { print; exit }')
  [[ -z "$HIT" ]] || fail "Parent API $P_ID (/${P_PATH}) already serves $HIT; creating /${API_PATH} would take it over. No update applied"
done <<<"$API_LIST"

# Approve and the detail page call several services; a forward-request timeout under 30 s would cut them.
APIM_MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${APIM_RG}/providers/Microsoft.ApiManagement/service/${APIM}"
API_MGMT="${APIM_MGMT}/apis/${API_ID}"
POLICY_URLS=("${APIM_MGMT}/policies/policy")
[[ -z "$OWNER" ]] || POLICY_URLS+=("${API_MGMT}/policies/policy")
for URL in "${POLICY_URLS[@]}"; do
  # Fail closed: only a genuine not-found on the API's own policy (no policy set yet) counts as "no policy".
  if XML=$(az rest --method get --url "${URL}?api-version=${API_VERSION}" --query properties.value -o tsv 2>"$ERR_FILE"); then :
  elif [[ "$URL" == "$API_MGMT"* ]] && grep -qiE 'ResourceNotFound|NotFound|\(404\)' "$ERR_FILE"; then XML=''
  else fail "Azure command failed: read the gateway policy (${URL#"$APIM_MGMT"/}); cannot confirm the 30 s timeout"; fi
  # Flatten newlines so a forward-request tag split over lines is still matched.
  FLAT=$(tr '\n\r' '  ' <<<"$XML")
  while read -r LIMIT; do
    [[ -z "$LIMIT" || $((10#$LIMIT)) -ge 30 ]] || fail "gateway timeout under 30 s would cut approve/detail (forward-request timeout=$LIMIT in ${URL#"$APIM_MGMT"/})"
  done < <(grep -oE '<forward-request[^>]*timeout="[0-9]+"' <<<"$FLAT" | grep -oE 'timeout="[0-9]+"' | grep -oE '[0-9]+' || true)
done

if [[ "${DRY_RUN,,}" == "true" ]]; then
  for ROW in "${OPERATIONS[@]}"; do
    IFS='|' read -r OP METHOD TEMPLATE _ <<<"$ROW"
    echo "WOULD WRITE $METHOD /api/v1/admin/account-deletions${TEMPLATE%/} ($API_ID/$OP)"
  done
  echo "DRY RUN: all read-only checks passed, nothing written."
  exit 0
fi

# Writes.
if [[ -z "$OWNER" ]]; then
  azq "create the API" az apim api create -g "$APIM_RG" --service-name "$APIM" --api-id "$API_ID" \
    --display-name "Craves Admin Account Deletions" --path "$API_PATH" --service-url "$BASE/api/v1/admin/account-deletions" \
    --protocols https --subscription-required false -o none
fi
for ROW in "${OPERATIONS[@]}"; do
  IFS='|' read -r OP METHOD TEMPLATE NAME <<<"$ROW"
  TARGET="/api/v1/admin/account-deletions${TEMPLATE%/}"
  PARAMS=$(grep -oE '\{[A-Za-z]+\}' <<<"$TEMPLATE" | tr -d '{}' | jq -R '{name: ., type: "string", required: true}' | jq -s . || true)
  jq -n --arg name "$NAME" --arg method "$METHOD" --arg template "$TEMPLATE" --argjson params "${PARAMS:-[]}" \
    '{properties: {displayName: $name, method: $method, urlTemplate: $template, templateParameters: $params, responses: []}}' >"$TEMP_DIR/operation.json"
  azq "write operation $OP" az rest --method put --url "${API_MGMT}/operations/${OP}?api-version=${API_VERSION}" --body @"$TEMP_DIR/operation.json" -o none
  sed -e "s|__BACKEND_BASE_URL__|${BASE}|" -e "s|__REWRITE_TEMPLATE__|${TARGET}|" "$POLICY_TEMPLATE" >"$TEMP_DIR/policy.xml"
  jq -Rs '{properties: {format: "rawxml", value: .}}' "$TEMP_DIR/policy.xml" >"$TEMP_DIR/policy.json"
  azq "write policy of $OP" az rest --method put --url "${API_MGMT}/operations/${OP}/policies/policy?api-version=${API_VERSION}" --body @"$TEMP_DIR/policy.json" -o none
  POLICY=$(azq "read back policy of $OP" az rest --method get --url "${API_MGMT}/operations/${OP}/policies/policy?api-version=${API_VERSION}" --query properties.value -o tsv)
  [[ "$POLICY" == *"$BASE"* && "$POLICY" == *"$TARGET"* && "$POLICY" == *Bearer* ]] || fail "Policy read-back failed for $METHOD $TARGET"
  echo "WRITTEN $METHOD $TARGET ($API_ID/$OP)"
done

# The gateway takes a little while to serve new operations, so each unauthenticated probe retries for up to two minutes.
for PROBE in "GET|$PUBLIC_HOST/$API_PATH" "POST|$PUBLIC_HOST/$API_PATH/00000000-0000-4000-8000-000000000000/approve"; do
  IFS='|' read -r METHOD URL <<<"$PROBE"
  STATUS=''
  for _ in $(seq 1 12); do
    STATUS=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 30 -X "$METHOD" \
      -H 'Content-Type: application/json' --data '{}' "$URL" || true)
    [[ "$STATUS" == 401 ]] && break
    sleep 10
  done
  [[ "$STATUS" == 401 ]] || fail "$METHOD $URL answered ${STATUS:-nothing} instead of 401 without a login"
  echo "OK   $METHOD $URL -> 401 without a login"
done
echo "SUCCESS: admin account deletion routes configured and verified. auth-service still checks the admin role."
