#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
NOTIFICATION_APP="${NOTIFICATION_APP:-ca-craves-notification-service-p}"
API_PATH="${API_PATH:-api/v1/notifications}"
API_ID_DEFAULT="${API_ID_DEFAULT:-craves-notifications-v1}"
API_VERSION="${API_VERSION:-2022-08-01}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
POLICY_TEMPLATE="${POLICY_TEMPLATE:-$ROOT/infra/apim/notification-inbox-v2/notification-inbox-policy.xml}"

fail() { echo "ERROR: $*" >&2; exit 1; }
for tool in az jq curl sed grep; do command -v "$tool" >/dev/null || fail "$tool is required"; done
[[ -f "$POLICY_TEMPLATE" ]] || fail "Policy template not found: $POLICY_TEMPLATE"

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
[[ -n "$SUBSCRIPTION_ID" ]] || fail "No active Azure subscription is selected."
az apim show -g "$RG" -n "$APIM" -o none

APP_JSON="$(az containerapp show -g "$RG" -n "$NOTIFICATION_APP" -o json)"
FQDN="$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$APP_JSON")"
LATEST="$(jq -r '.properties.latestRevisionName // ""' <<<"$APP_JSON")"
READY="$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$APP_JSON")"
RUNNING="$(jq -r '.properties.runningStatus // ""' <<<"$APP_JSON")"
[[ -n "$FQDN" ]] || fail "Notification Service FQDN could not be resolved."
[[ -n "$LATEST" && "$LATEST" == "$READY" ]] || fail "Notification Service latest revision is not Ready."
[[ "$RUNNING" == "Running" ]] || fail "Notification Service is not Running."
curl -sS --fail --max-time 30 "https://$FQDN/actuator/health" >/dev/null

echo "Notification backend health verified: https://$FQDN"

SERVICE_MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}"

read_policy_value() {
  az rest --method get --url "$1" --query properties.value -o tsv 2>/dev/null || true
}

reject_incompatible_backend_inheritance() {
  local scope="$1" value="$2"
  if grep -Eqi '<set-backend-service[^>]+backend-id=' <<<"$value"; then
    fail "$scope contains inherited backend-id routing. No change was made."
  fi
}

mapfile -t API_IDS < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${API_PATH}'].name" -o tsv)
(( ${#API_IDS[@]} <= 1 )) || fail "Multiple APIM APIs already own public path $API_PATH."
if (( ${#API_IDS[@]} == 1 )); then
  API_ID="${API_IDS[0]}"
else
  API_ID="$API_ID_DEFAULT"
  az apim api create \
    -g "$RG" --service-name "$APIM" --api-id "$API_ID" \
    --display-name "Craves Notifications API" --path "$API_PATH" \
    --service-url "https://${FQDN}" --protocols https \
    --subscription-required false -o none
fi

SUB_REQUIRED="$(az apim api show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --query subscriptionRequired -o tsv)"
[[ "${SUB_REQUIRED,,}" == "false" ]] || fail "Existing API $API_ID requires an APIM subscription key; this script will not relax it."

MGMT="${SERVICE_MGMT}/apis/${API_ID}"
GLOBAL_POLICY="$(read_policy_value "${SERVICE_MGMT}/policies/policy?api-version=${API_VERSION}")"
API_POLICY="$(read_policy_value "${MGMT}/policies/policy?api-version=${API_VERSION}")"
reject_incompatible_backend_inheritance "APIM global policy" "$GLOBAL_POLICY"
reject_incompatible_backend_inheritance "API $API_ID policy" "$API_POLICY"

put_operation() {
  local operation_id="$1" method="$2" template="$3" display_name="$4"
  local body rendered policy_body
  body="$(mktemp)"; rendered="$(mktemp)"; policy_body="$(mktemp)"
  cat >"$body" <<JSON
{
  "properties": {
    "displayName": "$display_name",
    "method": "$method",
    "urlTemplate": "$template",
    "templateParameters": [],
    "responses": [
      {"statusCode": 200, "description": "Notification inbox response"},
      {"statusCode": 204, "description": "Notification state updated"},
      {"statusCode": 400, "description": "Invalid cursor or limit"},
      {"statusCode": 401, "description": "Authentication required"},
      {"statusCode": 403, "description": "Authenticated identity is not allowed"}
    ]
  }
}
JSON
  az rest --method put --url "${MGMT}/operations/${operation_id}?api-version=${API_VERSION}" --body @"$body" -o none
  sed "s|__NOTIFICATION_INBOX_BACKEND_URL__|https://${FQDN}/api/v1/notifications|g" "$POLICY_TEMPLATE" >"$rendered"
  grep -q '__NOTIFICATION_INBOX_BACKEND_URL__' "$rendered" && fail "Notification backend placeholder was not fully rendered."
  jq -Rs '{properties:{format:"rawxml",value:.}}' "$rendered" >"$policy_body"
  az rest --method put --url "${MGMT}/operations/${operation_id}/policies/policy?api-version=${API_VERSION}" --body @"$policy_body" -o none
  rm -f "$body" "$rendered" "$policy_body"
}

put_operation "list-notification-inbox-page-v2" "GET" "/in-app/page" "List notification inbox page"
put_operation "get-notification-unread-count-v2" "GET" "/in-app/unread-count" "Get notification unread count"
put_operation "mark-all-notifications-read-v2" "PATCH" "/in-app/read-all" "Mark all notifications read"

for OPERATION_ID in \
  list-notification-inbox-page-v2 \
  get-notification-unread-count-v2 \
  mark-all-notifications-read-v2; do
  az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$OPERATION_ID" -o none
  POLICY_VALUE="$(az rest --method get --url "${MGMT}/operations/${OPERATION_ID}/policies/policy?api-version=${API_VERSION}" --query properties.value -o tsv)"
  [[ "$POLICY_VALUE" == *"Authorization"* ]] || fail "$OPERATION_ID policy does not enforce Authorization."
  [[ "$POLICY_VALUE" == *"Bearer "* ]] || fail "$OPERATION_ID policy does not enforce Bearer syntax."
  [[ "$POLICY_VALUE" == *"https://${FQDN}/api/v1/notifications"* ]] || fail "$OPERATION_ID policy targets the wrong backend."
  [[ "$POLICY_VALUE" == *"no-store"* ]] || fail "$OPERATION_ID policy does not disable caching."
done

echo "SUCCESS: Notification Inbox v2 APIM operations configured on API $API_ID."
