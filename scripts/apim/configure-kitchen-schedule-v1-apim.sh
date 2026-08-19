#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
CATALOG_APP="${CATALOG_APP:-ca-craves-catalog-service-prodlo}"
CHEF_API_PATH="${CHEF_API_PATH:-api/v1/kitchens/me}"
CHEF_API_ID_DEFAULT="${CHEF_API_ID_DEFAULT:-craves-chef-kitchen-v1}"
DISCOVERY_API_PATH="${DISCOVERY_API_PATH:-api/v1/discovery}"
DISCOVERY_API_ID_DEFAULT="${DISCOVERY_API_ID_DEFAULT:-craves-catalog-discovery-v1}"
API_VERSION="${API_VERSION:-2022-08-01}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHEF_POLICY_TEMPLATE="${CHEF_POLICY_TEMPLATE:-$ROOT/infra/apim/chef-kitchen/chef-kitchen-policy.xml}"
PUBLIC_POLICY_TEMPLATE="${PUBLIC_POLICY_TEMPLATE:-$ROOT/infra/apim/kitchen-schedule-v1/public-availability-policy.xml}"

fail(){ echo "ERROR: $*" >&2; exit 1; }
for tool in az jq curl sed grep; do command -v "$tool" >/dev/null || fail "$tool is required"; done
[[ -f "$CHEF_POLICY_TEMPLATE" ]] || fail "Chef kitchen policy template is missing"
[[ -f "$PUBLIC_POLICY_TEMPLATE" ]] || fail "Public availability policy template is missing"

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
APP_JSON="$(az containerapp show -g "$RG" -n "$CATALOG_APP" -o json)"
FQDN="$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$APP_JSON")"
LATEST="$(jq -r '.properties.latestRevisionName // ""' <<<"$APP_JSON")"
READY="$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$APP_JSON")"
RUNNING="$(jq -r '.properties.runningStatus // ""' <<<"$APP_JSON")"
[[ -n "$FQDN" && "$LATEST" == "$READY" && "$RUNNING" == "Running" ]] || fail "Catalog Service is not ready"
curl -sS --fail --max-time 30 "https://$FQDN/actuator/health" >/dev/null

SERVICE_MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}"

resolve_api(){
  local path="$1" default_id="$2" display="$3"
  local -a ids
  mapfile -t ids < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${path}'].name" -o tsv)
  (( ${#ids[@]} <= 1 )) || fail "Multiple APIM APIs own $path"
  local id
  if (( ${#ids[@]} == 1 )); then
    id="${ids[0]}"
  else
    id="$default_id"
    az apim api create -g "$RG" --service-name "$APIM" --api-id "$id" \
      --display-name "$display" --path "$path" --service-url "https://${FQDN}" \
      --protocols https --subscription-required false -o none
  fi
  local sub_required
  sub_required="$(az apim api show -g "$RG" --service-name "$APIM" --api-id "$id" --query subscriptionRequired -o tsv)"
  [[ "${sub_required,,}" == "false" ]] || fail "API $id requires a subscription key; refusing to relax it"
  printf '%s' "$id"
}

reject_backend_id_policy(){
  local url="$1" label="$2" value
  value="$(az rest --method get --url "$url" --query properties.value -o tsv 2>/dev/null || true)"
  if grep -Eqi '<set-backend-service[^>]+backend-id=' <<<"$value"; then
    fail "$label contains inherited backend-id routing"
  fi
}

CHEF_API_ID="$(resolve_api "$CHEF_API_PATH" "$CHEF_API_ID_DEFAULT" "Craves Chef Kitchen API")"
DISCOVERY_API_ID="$(resolve_api "$DISCOVERY_API_PATH" "$DISCOVERY_API_ID_DEFAULT" "Craves Catalog Discovery API")"
CHEF_MGMT="${SERVICE_MGMT}/apis/${CHEF_API_ID}"
DISCOVERY_MGMT="${SERVICE_MGMT}/apis/${DISCOVERY_API_ID}"

reject_backend_id_policy "${SERVICE_MGMT}/policies/policy?api-version=${API_VERSION}" "APIM global policy"
reject_backend_id_policy "${CHEF_MGMT}/policies/policy?api-version=${API_VERSION}" "Chef kitchen API policy"
reject_backend_id_policy "${DISCOVERY_MGMT}/policies/policy?api-version=${API_VERSION}" "Discovery API policy"

put_operation(){
  local mgmt="$1" id="$2" method="$3" template="$4" display="$5" params="$6" policy_template="$7" placeholder="$8" backend="$9"
  local body rendered policy_body
  body="$(mktemp)"; rendered="$(mktemp)"; policy_body="$(mktemp)"
  printf '%s' "{\"properties\":{\"displayName\":\"$display\",\"method\":\"$method\",\"urlTemplate\":\"$template\",\"templateParameters\":$params,\"responses\":[{\"statusCode\":200,\"description\":\"Kitchen schedule response\"},{\"statusCode\":204,\"description\":\"Schedule override removed\"},{\"statusCode\":400,\"description\":\"Invalid schedule request\"},{\"statusCode\":401,\"description\":\"Authentication required when applicable\"},{\"statusCode\":403,\"description\":\"Chef role required when applicable\"},{\"statusCode\":404,\"description\":\"Kitchen or override not found\"}]}}" >"$body"
  az rest --method put --url "${mgmt}/operations/${id}?api-version=${API_VERSION}" --body @"$body" -o none
  sed "s|${placeholder}|${backend}|g" "$policy_template" >"$rendered"
  grep -q "$placeholder" "$rendered" && fail "Policy placeholder $placeholder was not fully rendered"
  jq -Rs '{properties:{format:"rawxml",value:.}}' "$rendered" >"$policy_body"
  az rest --method put --url "${mgmt}/operations/${id}/policies/policy?api-version=${API_VERSION}" --body @"$policy_body" -o none
  rm -f "$body" "$rendered" "$policy_body"
}

CHEF_BACKEND="https://${FQDN}/api/v1/kitchens/me"
put_operation "$CHEF_MGMT" "get-my-kitchen-schedule-v1" "GET" "/schedule" "Get my kitchen schedule" '[]' "$CHEF_POLICY_TEMPLATE" '__CHEF_KITCHEN_BACKEND_URL__' "$CHEF_BACKEND"
put_operation "$CHEF_MGMT" "replace-my-kitchen-schedule-v1" "PUT" "/schedule" "Replace my kitchen schedule" '[]' "$CHEF_POLICY_TEMPLATE" '__CHEF_KITCHEN_BACKEND_URL__' "$CHEF_BACKEND"
put_operation "$CHEF_MGMT" "get-my-kitchen-schedule-override-v1" "GET" "/schedule/overrides/{serviceDate}" "Get my kitchen schedule override" '[{"name":"serviceDate","type":"string","required":true}]' "$CHEF_POLICY_TEMPLATE" '__CHEF_KITCHEN_BACKEND_URL__' "$CHEF_BACKEND"
put_operation "$CHEF_MGMT" "put-my-kitchen-schedule-override-v1" "PUT" "/schedule/overrides/{serviceDate}" "Create or replace my kitchen schedule override" '[{"name":"serviceDate","type":"string","required":true}]' "$CHEF_POLICY_TEMPLATE" '__CHEF_KITCHEN_BACKEND_URL__' "$CHEF_BACKEND"
put_operation "$CHEF_MGMT" "delete-my-kitchen-schedule-override-v1" "DELETE" "/schedule/overrides/{serviceDate}" "Delete my kitchen schedule override" '[{"name":"serviceDate","type":"string","required":true}]' "$CHEF_POLICY_TEMPLATE" '__CHEF_KITCHEN_BACKEND_URL__' "$CHEF_BACKEND"

PUBLIC_BACKEND="https://${FQDN}/api/v1/catalog/kitchens"
put_operation "$DISCOVERY_MGMT" "get-kitchen-live-availability-v1" "GET" "/kitchens/{kitchenId}/availability" "Get kitchen live availability" '[{"name":"kitchenId","type":"string","required":true}]' "$PUBLIC_POLICY_TEMPLATE" '__KITCHEN_AVAILABILITY_BACKEND_URL__' "$PUBLIC_BACKEND"

for ID in get-my-kitchen-schedule-v1 replace-my-kitchen-schedule-v1 get-my-kitchen-schedule-override-v1 put-my-kitchen-schedule-override-v1 delete-my-kitchen-schedule-override-v1; do
  az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$CHEF_API_ID" --operation-id "$ID" -o none
  POLICY="$(az rest --method get --url "${CHEF_MGMT}/operations/${ID}/policies/policy?api-version=${API_VERSION}" --query properties.value -o tsv)"
  [[ "$POLICY" == *"Authorization"* && "$POLICY" == *"$CHEF_BACKEND"* ]] || fail "Chef schedule operation $ID verification failed"
done

az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$DISCOVERY_API_ID" --operation-id "get-kitchen-live-availability-v1" -o none
PUBLIC_POLICY="$(az rest --method get --url "${DISCOVERY_MGMT}/operations/get-kitchen-live-availability-v1/policies/policy?api-version=${API_VERSION}" --query properties.value -o tsv)"
[[ "$PUBLIC_POLICY" == *"$PUBLIC_BACKEND"* && "$PUBLIC_POLICY" == *"no-store"* ]] || fail "Public availability policy verification failed"

echo "SUCCESS: Kitchen schedule and live availability APIM operations configured."
