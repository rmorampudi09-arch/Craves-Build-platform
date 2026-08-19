#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
USER_CHEF_APP="${USER_CHEF_APP:-ca-craves-user-chef-service-prod}"
REQUESTER_API_PATH="${REQUESTER_API_PATH:-api/v1/support/cases}"
REQUESTER_API_ID_DEFAULT="${REQUESTER_API_ID_DEFAULT:-craves-support-cases-v1}"
ADMIN_API_PATH="${ADMIN_API_PATH:-api/v1/admin/support/cases}"
ADMIN_API_ID_DEFAULT="${ADMIN_API_ID_DEFAULT:-craves-admin-support-cases-v1}"
API_VERSION="${API_VERSION:-2022-08-01}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
POLICY_TEMPLATE="${POLICY_TEMPLATE:-$ROOT/infra/apim/support-cases-v1/support-case-policy.xml}"

fail(){ echo "ERROR: $*" >&2; exit 1; }
for tool in az jq curl sed grep; do command -v "$tool" >/dev/null || fail "$tool is required"; done
[[ -f "$POLICY_TEMPLATE" ]] || fail "Support case policy template is missing"

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
[[ -n "$SUBSCRIPTION_ID" ]] || fail "No active Azure subscription is selected"
az apim show -g "$RG" -n "$APIM" -o none

APP_JSON="$(az containerapp show -g "$RG" -n "$USER_CHEF_APP" -o json)"
FQDN="$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$APP_JSON")"
LATEST="$(jq -r '.properties.latestRevisionName // ""' <<<"$APP_JSON")"
READY="$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$APP_JSON")"
RUNNING="$(jq -r '.properties.runningStatus // ""' <<<"$APP_JSON")"
[[ -n "$FQDN" ]] || fail "User-Chef Service FQDN could not be resolved"
[[ -n "$LATEST" && "$LATEST" == "$READY" ]] || fail "User-Chef Service latest revision is not Ready"
[[ "$RUNNING" == "Running" ]] || fail "User-Chef Service is not Running"
curl -sS --fail --max-time 30 "https://$FQDN/actuator/health" >/dev/null

echo "User-Chef backend health verified: https://$FQDN"

SERVICE_MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}"

resolve_api(){
  local path="$1" default_id="$2" display="$3"
  local -a ids
  mapfile -t ids < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${path}'].name" -o tsv)
  (( ${#ids[@]} <= 1 )) || fail "Multiple APIM APIs already own public path $path"
  local id
  if (( ${#ids[@]} == 1 )); then
    id="${ids[0]}"
  else
    id="$default_id"
    az apim api create \
      -g "$RG" --service-name "$APIM" --api-id "$id" \
      --display-name "$display" --path "$path" \
      --service-url "https://${FQDN}" --protocols https \
      --subscription-required false -o none
  fi
  local sub_required
  sub_required="$(az apim api show -g "$RG" --service-name "$APIM" --api-id "$id" --query subscriptionRequired -o tsv)"
  [[ "${sub_required,,}" == "false" ]] || fail "API $id requires an APIM subscription key; this script will not relax it"
  printf '%s' "$id"
}

read_policy(){
  az rest --method get --url "$1" --query properties.value -o tsv 2>/dev/null || true
}

reject_incompatible_backend(){
  local label="$1" value="$2"
  if grep -Eqi '<set-backend-service[^>]+backend-id=' <<<"$value"; then
    fail "$label contains inherited backend-id routing; no support route change was made"
  fi
}

REQUESTER_API_ID="$(resolve_api "$REQUESTER_API_PATH" "$REQUESTER_API_ID_DEFAULT" "Craves Support Cases API")"
ADMIN_API_ID="$(resolve_api "$ADMIN_API_PATH" "$ADMIN_API_ID_DEFAULT" "Craves Admin Support Cases API")"
REQUESTER_MGMT="${SERVICE_MGMT}/apis/${REQUESTER_API_ID}"
ADMIN_MGMT="${SERVICE_MGMT}/apis/${ADMIN_API_ID}"

GLOBAL_POLICY="$(read_policy "${SERVICE_MGMT}/policies/policy?api-version=${API_VERSION}")"
REQUESTER_POLICY="$(read_policy "${REQUESTER_MGMT}/policies/policy?api-version=${API_VERSION}")"
ADMIN_POLICY="$(read_policy "${ADMIN_MGMT}/policies/policy?api-version=${API_VERSION}")"
reject_incompatible_backend "APIM global policy" "$GLOBAL_POLICY"
reject_incompatible_backend "Requester support API policy" "$REQUESTER_POLICY"
reject_incompatible_backend "Admin support API policy" "$ADMIN_POLICY"

put_operation(){
  local mgmt="$1" operation_id="$2" method="$3" template="$4" display="$5" params="$6" backend="$7"
  local body rendered policy_body
  body="$(mktemp)"; rendered="$(mktemp)"; policy_body="$(mktemp)"
  cat >"$body" <<JSON
{
  "properties": {
    "displayName": "$display",
    "method": "$method",
    "urlTemplate": "$template",
    "templateParameters": $params,
    "responses": [
      {"statusCode": 200, "description": "Support case response"},
      {"statusCode": 201, "description": "Support case created"},
      {"statusCode": 400, "description": "Invalid request, cursor or status"},
      {"statusCode": 401, "description": "Authentication required"},
      {"statusCode": 403, "description": "Required Craves role is missing"},
      {"statusCode": 404, "description": "Support case was not found"},
      {"statusCode": 409, "description": "Support case state rejects the requested action"}
    ]
  }
}
JSON
  az rest --method put --url "${mgmt}/operations/${operation_id}?api-version=${API_VERSION}" --body @"$body" -o none
  sed "s|__SUPPORT_CASE_BACKEND_URL__|${backend}|g" "$POLICY_TEMPLATE" >"$rendered"
  grep -q '__SUPPORT_CASE_BACKEND_URL__' "$rendered" && fail "Support backend placeholder was not fully rendered"
  jq -Rs '{properties:{format:"rawxml",value:.}}' "$rendered" >"$policy_body"
  az rest --method put --url "${mgmt}/operations/${operation_id}/policies/policy?api-version=${API_VERSION}" --body @"$policy_body" -o none
  rm -f "$body" "$rendered" "$policy_body"
}

REQUESTER_BACKEND="https://${FQDN}/api/v1/support/cases"
ADMIN_BACKEND="https://${FQDN}/api/v1/admin/support/cases"
CASE_PARAM='[{"name":"caseId","type":"string","required":true}]'

put_operation "$REQUESTER_MGMT" "create-support-case-v1" "POST" "/" "Create support case" '[]' "$REQUESTER_BACKEND"
put_operation "$REQUESTER_MGMT" "list-my-support-cases-v1" "GET" "/" "List my support cases" '[]' "$REQUESTER_BACKEND"
put_operation "$REQUESTER_MGMT" "get-my-support-case-v1" "GET" "/{caseId}" "Get my support case" "$CASE_PARAM" "$REQUESTER_BACKEND"
put_operation "$REQUESTER_MGMT" "add-my-support-case-message-v1" "POST" "/{caseId}/messages" "Add support case message" "$CASE_PARAM" "$REQUESTER_BACKEND"

put_operation "$ADMIN_MGMT" "list-admin-support-cases-v1" "GET" "/" "List support cases" '[]' "$ADMIN_BACKEND"
put_operation "$ADMIN_MGMT" "get-admin-support-case-v1" "GET" "/{caseId}" "Get support case" "$CASE_PARAM" "$ADMIN_BACKEND"
put_operation "$ADMIN_MGMT" "add-admin-support-case-message-v1" "POST" "/{caseId}/messages" "Add support response or internal note" "$CASE_PARAM" "$ADMIN_BACKEND"
put_operation "$ADMIN_MGMT" "update-admin-support-case-status-v1" "PATCH" "/{caseId}/status" "Update support case status" "$CASE_PARAM" "$ADMIN_BACKEND"
put_operation "$ADMIN_MGMT" "assign-admin-support-case-to-me-v1" "POST" "/{caseId}/assign-to-me" "Assign support case to me" "$CASE_PARAM" "$ADMIN_BACKEND"

verify_operation(){
  local api_id="$1" mgmt="$2" operation_id="$3" backend="$4"
  az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$api_id" --operation-id "$operation_id" -o none
  local policy
  policy="$(az rest --method get --url "${mgmt}/operations/${operation_id}/policies/policy?api-version=${API_VERSION}" --query properties.value -o tsv)"
  [[ "$policy" == *"Authorization"* ]] || fail "$operation_id does not enforce Authorization header presence"
  [[ "$policy" == *"Bearer "* ]] || fail "$operation_id does not enforce Bearer syntax"
  [[ "$policy" == *"$backend"* ]] || fail "$operation_id points at an unexpected backend"
  [[ "$policy" == *"no-store"* ]] || fail "$operation_id does not disable caching"
}

for ID in create-support-case-v1 list-my-support-cases-v1 get-my-support-case-v1 add-my-support-case-message-v1; do
  verify_operation "$REQUESTER_API_ID" "$REQUESTER_MGMT" "$ID" "$REQUESTER_BACKEND"
done
for ID in list-admin-support-cases-v1 get-admin-support-case-v1 add-admin-support-case-message-v1 update-admin-support-case-status-v1 assign-admin-support-case-to-me-v1; do
  verify_operation "$ADMIN_API_ID" "$ADMIN_MGMT" "$ID" "$ADMIN_BACKEND"
done

echo "SUCCESS: Support case requester and admin APIM operations configured."
echo "Requester API: /${REQUESTER_API_PATH} (${REQUESTER_API_ID})"
echo "Admin API:     /${ADMIN_API_PATH} (${ADMIN_API_ID})"
