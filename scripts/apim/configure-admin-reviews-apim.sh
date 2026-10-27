#!/usr/bin/env bash
# Publishes the review moderation routes of Order Service (AdminReviewController) on the gateway behind api.craves.in,
# for the admin page /admin/reviews.
#
#   CONFIRM_APIM_WRITE=true bash scripts/apim/configure-admin-reviews-apim.sh     (az login first)
#
# Creates API craves-admin-reviews-v1 at api/v1/admin/reviews if it is missing, then writes its two operations and
# their policies. No other API is changed. It stops before writing if another API owns the path, or if a parent API
# (api/v1/admin, api/v1, ...) already serves something under it, because APIM sends a request to the longest
# matching API path and the new API would take that route over.
# Undo: az apim api delete -g rg-craves-prodlow-centralindia --service-name apim-craves-prodlow-kmqgfy --api-id craves-admin-reviews-v1 --yes
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-kmqgfy}"
ORDER_APP="${ORDER_APP:-ca-craves-order-service-prodlow}"
API_ID="${API_ID:-craves-admin-reviews-v1}"
API_PATH="${API_PATH:-api/v1/admin/reviews}"
API_VERSION="${API_VERSION:-2022-08-01}"
PUBLIC_HOST="${PUBLIC_HOST:-https://api.craves.in}"
CONFIRM_APIM_WRITE="${CONFIRM_APIM_WRITE:-false}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
POLICY_TEMPLATE="$ROOT/infra/apim/admin-reviews/authenticated-policy.xml"
# operation id|method|url template (below /api/v1/admin/reviews, the same on the gateway and in Order Service)|display name
OPERATIONS=(
  'list-admin-review-queue|GET|/|List reviews by moderation status'
  'moderate-admin-review|PUT|/{reviewId}/moderation|Publish, hide or reject a review'
)

fail() { echo "ERROR: $*" >&2; exit 1; }
for tool in az jq curl sed awk; do command -v "$tool" >/dev/null || fail "$tool is required"; done
[[ -f "$POLICY_TEMPLATE" ]] || fail "APIM policy template is missing"
[[ "${CONFIRM_APIM_WRITE,,}" == "true" ]] || fail "Set CONFIRM_APIM_WRITE=true for the controlled APIM write"

# Read-only checks first: nothing is written until all of them pass.
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
APP_JSON=$(az containerapp show -g "$RG" -n "$ORDER_APP" -o json)
FQDN=$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$APP_JSON")
LATEST=$(jq -r '.properties.latestRevisionName // ""' <<<"$APP_JSON")
READY=$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$APP_JSON")
RUNNING=$(jq -r '.properties.runningStatus // ""' <<<"$APP_JSON")
[[ -n "$FQDN" && "$LATEST" == "$READY" && "$RUNNING" == "Running" ]] || fail "Order Service is not ready"
curl --silent --show-error --fail --max-time 30 "https://$FQDN/actuator/health" >/dev/null
BASE="https://${FQDN}"

API_LIST=$(az apim api list -g "$RG" --service-name "$APIM" --query '[].[name,path]' -o tsv)
OWNER=$(awk -F'\t' -v p="$API_PATH" '$2==p {print $1}' <<<"$API_LIST")
[[ -z "$OWNER" || "$OWNER" == "$API_ID" ]] || fail "A different API ($OWNER) owns /${API_PATH}; no update applied"
while IFS=$'\t' read -r P_ID P_PATH; do
  [[ -n "$P_ID" && "$P_PATH" != "$API_PATH" ]] || continue
  [[ -z "$P_PATH" || "$API_PATH" == "$P_PATH"/* ]] || continue
  REL="/${API_PATH#"$P_PATH"}"; REL="${REL//\/\//\/}"
  HIT=$(az apim api operation list -g "$RG" --service-name "$APIM" --api-id "$P_ID" --query '[].urlTemplate' -o tsv |
    awk -v r="$REL" 'index($0, r) == 1 { print; exit }')
  [[ -z "$HIT" ]] || fail "Parent API $P_ID (/${P_PATH}) already serves $HIT; creating /${API_PATH} would take it over. No update applied"
done <<<"$API_LIST"

# Writes.
if [[ -z "$OWNER" ]]; then
  az apim api create -g "$RG" --service-name "$APIM" --api-id "$API_ID" \
    --display-name "Craves Admin Reviews" --path "$API_PATH" --service-url "$BASE/api/v1/admin/reviews" \
    --protocols https --subscription-required false -o none
fi
API_MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/apis/${API_ID}"
TEMP_DIR=$(mktemp -d)
trap 'rm -rf -- "$TEMP_DIR"' EXIT
for ROW in "${OPERATIONS[@]}"; do
  IFS='|' read -r OP METHOD TEMPLATE NAME <<<"$ROW"
  TARGET="/api/v1/admin/reviews${TEMPLATE%/}"
  PARAMS=$(grep -oE '\{[A-Za-z]+\}' <<<"$TEMPLATE" | tr -d '{}' | jq -R '{name: ., type: "string", required: true}' | jq -s . || true)
  jq -n --arg name "$NAME" --arg method "$METHOD" --arg template "$TEMPLATE" --argjson params "${PARAMS:-[]}" \
    '{properties: {displayName: $name, method: $method, urlTemplate: $template, templateParameters: $params, responses: []}}' >"$TEMP_DIR/operation.json"
  az rest --method put --url "${API_MGMT}/operations/${OP}?api-version=${API_VERSION}" --body @"$TEMP_DIR/operation.json" -o none
  sed -e "s|__BACKEND_BASE_URL__|${BASE}|" -e "s|__REWRITE_TEMPLATE__|${TARGET}|" "$POLICY_TEMPLATE" >"$TEMP_DIR/policy.xml"
  jq -Rs '{properties: {format: "rawxml", value: .}}' "$TEMP_DIR/policy.xml" >"$TEMP_DIR/policy.json"
  az rest --method put --url "${API_MGMT}/operations/${OP}/policies/policy?api-version=${API_VERSION}" --body @"$TEMP_DIR/policy.json" -o none
  POLICY=$(az rest --method get --url "${API_MGMT}/operations/${OP}/policies/policy?api-version=${API_VERSION}" --query properties.value -o tsv)
  [[ "$POLICY" == *"$BASE"* && "$POLICY" == *"$TARGET"* && "$POLICY" == *Bearer* ]] || fail "Policy read-back failed for $METHOD $TARGET"
  echo "WRITTEN $METHOD $TARGET ($API_ID/$OP)"
done

# The gateway takes a little while to serve new operations, so each unauthenticated probe retries for up to two minutes.
for PROBE in "GET|$PUBLIC_HOST/$API_PATH" "PUT|$PUBLIC_HOST/$API_PATH/00000000-0000-4000-8000-000000000000/moderation"; do
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
echo "SUCCESS: admin review routes configured and verified. Order Service still checks the ADMIN or SUPPORT_ADMIN role."
