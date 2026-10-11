#!/usr/bin/env bash
# Upserts (or with --rollback removes) ONLY the public meal plan image operation:
#   GET /api/v1/subscriptions/plans/{planId}/image   (operation id get-public-meal-plan-image)
# It carries public-image-policy.xml, which unlike public-policy.xml lets the backend's
# "Cache-Control: public, max-age=86400" through, so the plan image and its ?v= cache-buster stay cacheable.
# Nothing else in the subscriptions API is touched, so this is safe to run against production on its own.
set -euo pipefail
set +x
# Without inherit_errexit (bash 4.4+) a failing az call inside $(...) or a function run through $(...) would not stop the
# script, and a failed operation listing would read as "absent" (a silent no-op rollback or a duplicate create).
shopt -s inherit_errexit || { echo "ERROR: bash 4.4 or newer is required" >&2; exit 1; }

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
SUBSCRIPTION_APP="${SUBSCRIPTION_APP:-ca-craves-subscription-service-p}"
API_VERSION="${API_VERSION:-2022-08-01}"
CONFIRM_APIM_WRITE="${CONFIRM_APIM_WRITE:-false}"
CONFIRM_APIM_ROLLBACK="${CONFIRM_APIM_ROLLBACK:-false}"
HEALTH_ATTEMPTS="${CRAVES_APIM_BACKEND_HEALTH_ATTEMPTS:-12}"
HEALTH_SLEEP_SECONDS="${CRAVES_APIM_BACKEND_HEALTH_SLEEP_SECONDS:-10}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
IMAGE_POLICY="$ROOT/infra/apim/subscription-backoffice/public-image-policy.xml"

API_PATH="api/v1/subscriptions"
OP_ID="get-public-meal-plan-image"
METHOD="GET"
TEMPLATE="/plans/{planId}/image"
OP_DISPLAY="Get meal plan photo"
PARAMS='[{"name":"planId","type":"string","required":true}]'

fail() { echo "ERROR: $*" >&2; exit 1; }

MODE="configure"
case "${1:-}" in
  "") ;;
  --rollback) MODE="rollback" ;;
  *) fail "Unknown argument '$1'; the only supported option is --rollback" ;;
esac

for tool in az jq; do command -v "$tool" >/dev/null || fail "$tool is required"; done
if [[ "$MODE" == "rollback" ]]; then
  [[ "${CONFIRM_APIM_ROLLBACK,,}" == "true" ]] || fail "Set CONFIRM_APIM_ROLLBACK=true for the controlled rollback"
else
  for tool in curl sed; do command -v "$tool" >/dev/null || fail "$tool is required"; done
  [[ -f "$IMAGE_POLICY" ]] || fail "APIM policy template is missing: ${IMAGE_POLICY#$ROOT/}"
  [[ "${CONFIRM_APIM_WRITE,,}" == "true" ]] || fail "Set CONFIRM_APIM_WRITE=true for the controlled APIM write"
  [[ "$HEALTH_ATTEMPTS" =~ ^[1-9][0-9]*$ ]] || fail "CRAVES_APIM_BACKEND_HEALTH_ATTEMPTS must be a positive integer"
  [[ "$HEALTH_SLEEP_SECONDS" =~ ^[0-9]+$ ]] || fail "CRAVES_APIM_BACKEND_HEALTH_SLEEP_SECONDS must be a non-negative integer"
fi

SUBSCRIPTION_ID=$(az account show --query id -o tsv)

# The subscriptions API must already exist (it serves the public plans); this script never creates or re-points it.
resolve_api() {
  local LISTING
  local -a IDS
  LISTING=$(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${API_PATH}'].name" -o tsv --only-show-errors)
  IDS=(); [[ -z "$LISTING" ]] || mapfile -t IDS <<<"$LISTING"
  (( ${#IDS[@]} <= 1 )) || fail "Multiple APIM APIs own ${API_PATH}"
  if (( ${#IDS[@]} == 0 )); then
    printf ''
    return
  fi
  printf '%s' "${IDS[0]}"
}

# Lists the management IDs owning the route. The az call is a plain assignment and errexit is inherited by command substitutions
# (inherit_errexit above), so a failed listing aborts the script instead of reading as "absent".
matching_operation_ids() {
  local OPS_JSON
  OPS_JSON=$(az apim api operation list -g "$RG" --service-name "$APIM" --api-id "$1" -o json --only-show-errors)
  jq -r --arg method "$METHOD" --arg template "$TEMPLATE" '.[] | select((.method | ascii_upcase) == ($method | ascii_upcase) and .urlTemplate == $template) | .name' <<<"$OPS_JSON"
}

API_ID=$(resolve_api)

if [[ "$MODE" == "rollback" ]]; then
  if [[ -z "$API_ID" ]]; then
    echo "SKIP: no API owns ${API_PATH}; ${METHOD} ${TEMPLATE} is absent"
    exit 0
  fi
  MATCHES=$(matching_operation_ids "$API_ID")
  MATCH_IDS=(); [[ -z "$MATCHES" ]] || mapfile -t MATCH_IDS <<<"$MATCHES"
  (( ${#MATCH_IDS[@]} <= 1 )) || fail "Multiple operations own ${METHOD} ${TEMPLATE} in API ${API_ID}"
  if (( ${#MATCH_IDS[@]} == 0 )); then
    echo "SKIP: ${API_PATH} ${METHOD} ${TEMPLATE} is absent"
    exit 0
  fi
  az apim api operation delete -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "${MATCH_IDS[0]}" --yes --only-show-errors
  echo "SUCCESS: removed ${API_PATH} ${METHOD} ${TEMPLATE} (${MATCH_IDS[0]}); no other operation was touched."
  exit 0
fi

[[ -n "$API_ID" ]] || fail "No APIM API owns ${API_PATH}; configure the subscriptions API first (this script only adds the image operation)"
SUB_REQUIRED=$(az apim api show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --query subscriptionRequired -o tsv --only-show-errors)
[[ "${SUB_REQUIRED,,}" == "false" ]] || fail "API $API_ID requires a subscription key; this script will not relax it"

APP_JSON=$(az containerapp show -g "$RG" -n "$SUBSCRIPTION_APP" -o json --only-show-errors)
FQDN=$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$APP_JSON")
LATEST=$(jq -r '.properties.latestRevisionName // ""' <<<"$APP_JSON")
READY=$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$APP_JSON")
RUNNING=$(jq -r '.properties.runningStatus // ""' <<<"$APP_JSON")
[[ -n "$FQDN" && "$LATEST" == "$READY" && "$RUNNING" == "Running" ]] || fail "Subscription Service is not ready: latest=$LATEST ready=$READY running=$RUNNING"
SUB_BASE="https://${FQDN}"
BACKEND="${SUB_BASE}/api/v1/subscriptions"

wait_for_backend_health() {
  local ATTEMPT BODY CODE STATUS
  BODY="/tmp/craves-meal-plan-image-apim-health-${BASHPID}.json"
  for ((ATTEMPT=1; ATTEMPT<=HEALTH_ATTEMPTS; ATTEMPT++)); do
    : >"$BODY"
    CODE=$(curl --silent --show-error --connect-timeout 10 --max-time 30 --output "$BODY" --write-out '%{http_code}' "${SUB_BASE}/actuator/health" || true)
    STATUS=$(jq -r '.status // empty' "$BODY" 2>/dev/null || true)
    if [[ "$CODE" == "200" && "$STATUS" == "UP" ]]; then
      rm -f "$BODY"
      echo "PASS: Subscription Service aggregate health is UP attempt=$ATTEMPT/$HEALTH_ATTEMPTS"
      return 0
    fi
    echo "WAIT: Subscription Service aggregate health attempt=$ATTEMPT/$HEALTH_ATTEMPTS HTTP=${CODE:-curl-error} status=${STATUS:-unavailable}" >&2
    if (( ATTEMPT < HEALTH_ATTEMPTS )); then
      sleep "$HEALTH_SLEEP_SECONDS"
    fi
  done
  rm -f "$BODY"
  return 1
}
wait_for_backend_health || fail "Subscription Service aggregate health did not become UP; APIM write was not attempted"

MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/apis/${API_ID}"

# Same guard as the backoffice script: an inherited backend-id policy would defeat the base-url override.
for SCOPE_URL in \
  "https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/policies/policy?api-version=${API_VERSION}" \
  "${MGMT}/policies/policy?api-version=${API_VERSION}"; do
  INHERITED=$(az rest --method get --url "$SCOPE_URL" --query properties.value -o tsv 2>/dev/null || true)
  [[ "$INHERITED" != *'set-backend-service backend-id='* ]] || fail "Inherited backend-id policy blocks safe base-url override for API $API_ID"
  [[ "$INHERITED" != *'no-store'* ]] || echo "WARN: an inherited APIM policy mentions no-store; verify the served Cache-Control header after this write" >&2
done

MATCHES=$(matching_operation_ids "$API_ID")
MATCH_IDS=(); [[ -z "$MATCHES" ]] || mapfile -t MATCH_IDS <<<"$MATCHES"
(( ${#MATCH_IDS[@]} <= 1 )) || fail "Multiple operations already own ${METHOD} ${TEMPLATE} in API ${API_ID}"
EFFECTIVE_ID="$OP_ID"
if (( ${#MATCH_IDS[@]} == 1 )); then
  EFFECTIVE_ID="${MATCH_IDS[0]}"
  if [[ "$EFFECTIVE_ID" != "$OP_ID" ]]; then
    echo "ADOPT: ${METHOD} ${TEMPLATE} already exists as operation ${EFFECTIVE_ID}; preserving that management ID and applying the cacheable image policy."
  fi
else
  TARGET_JSON=$(az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$OP_ID" -o json --only-show-errors 2>/dev/null || true)
  if [[ -n "$TARGET_JSON" ]] && jq -e . >/dev/null 2>&1 <<<"$TARGET_JSON"; then
    fail "Operation ID ${OP_ID} already owns $(jq -r '.method // ""' <<<"$TARGET_JSON") $(jq -r '.urlTemplate // ""' <<<"$TARGET_JSON"); refusing to rewrite it as ${METHOD} ${TEMPLATE}"
  fi
fi

BODY=$(mktemp); RENDERED=$(mktemp); POLICY_BODY=$(mktemp)
trap 'rm -f "$BODY" "$RENDERED" "$POLICY_BODY"' EXIT
jq -n --arg display "$OP_DISPLAY" --arg method "$METHOD" --arg template "$TEMPLATE" --argjson params "$PARAMS" \
  '{properties:{displayName:$display,method:$method,urlTemplate:$template,templateParameters:$params,responses:[{statusCode:200,description:"Plan image"},{statusCode:404,description:"Not found"}]}}' >"$BODY"
az rest --method put --url "${MGMT}/operations/${EFFECTIVE_ID}?api-version=${API_VERSION}" --body @"$BODY" -o none
sed "s|__BACKEND_URL__|${BACKEND}|g" "$IMAGE_POLICY" >"$RENDERED"
jq -Rs '{properties:{format:"rawxml",value:.}}' "$RENDERED" >"$POLICY_BODY"
az rest --method put --url "${MGMT}/operations/${EFFECTIVE_ID}/policies/policy?api-version=${API_VERSION}" --body @"$POLICY_BODY" -o none

# Read-back verification: exact route, anonymous, nosniff present, and no Cache-Control override of any kind.
OPERATION_JSON=$(az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$EFFECTIVE_ID" -o json --only-show-errors)
[[ "$(jq -r '.method | ascii_upcase' <<<"$OPERATION_JSON")" == "$METHOD" && "$(jq -r '.urlTemplate' <<<"$OPERATION_JSON")" == "$TEMPLATE" ]] || fail "Operation ${EFFECTIVE_ID} does not own ${METHOD} ${TEMPLATE} after the write"
POLICY=$(az rest --method get --url "${MGMT}/operations/${EFFECTIVE_ID}/policies/policy?api-version=${API_VERSION}" --query properties.value -o tsv)
[[ "$POLICY" == *"$BACKEND"* ]] || fail "Policy verification failed for ${EFFECTIVE_ID}: backend URL missing"
[[ "$POLICY" == *"nosniff"* ]] || fail "Policy verification failed for ${EFFECTIVE_ID}: X-Content-Type-Options nosniff missing"
[[ "$POLICY" != *"no-store"* && "$POLICY" != *"Cache-Control"* ]] || fail "Policy verification failed for ${EFFECTIVE_ID}: the policy overrides Cache-Control"
[[ "$POLICY" != *"A Bearer access token is required"* && "$POLICY" != *"Authorization"* ]] || fail "Public operation ${EFFECTIVE_ID} unexpectedly requires Bearer authentication"

echo "SUCCESS: ${METHOD} /${API_PATH}${TEMPLATE} configured as ${EFFECTIVE_ID}: anonymous, nosniff, backend Cache-Control passes through. No other operation was touched."
