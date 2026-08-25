#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
CATALOG_APP="${CATALOG_APP:-ca-craves-catalog-service-prodlo}"
API_PATH="${API_PATH:-api/v1/discovery}"
API_VERSION="${API_VERSION:-2022-08-01}"
OPERATION_ID="discover-advanced-search"
URL_TEMPLATE="/search"

fail() { echo "ERROR: $*" >&2; exit 1; }
for tool in az jq curl; do command -v "$tool" >/dev/null || fail "$tool is required"; done

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
APP_JSON="$(az containerapp show -g "$RG" -n "$CATALOG_APP" -o json)"
FQDN="$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$APP_JSON")"
LATEST="$(jq -r '.properties.latestRevisionName // ""' <<<"$APP_JSON")"
READY="$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$APP_JSON")"
RUNNING="$(jq -r '.properties.runningStatus // ""' <<<"$APP_JSON")"
[[ -n "$FQDN" && "$LATEST" == "$READY" && "$RUNNING" == "Running" ]] || fail "Catalog Service is not ready"
curl -sS --fail --max-time 30 "https://${FQDN}/actuator/health" >/dev/null

mapfile -t API_IDS < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${API_PATH}'].name" -o tsv)
(( ${#API_IDS[@]} == 1 )) || fail "Expected exactly one APIM API at ${API_PATH}; found ${#API_IDS[@]}"
API_ID="${API_IDS[0]}"
SUB_REQUIRED="$(az apim api show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --query subscriptionRequired -o tsv)"
[[ "${SUB_REQUIRED,,}" == "false" ]] || fail "Existing discovery API requires a subscription key; refusing to change its security model"

mapfile -t COLLISIONS < <(az apim api operation list -g "$RG" --service-name "$APIM" --api-id "$API_ID" --query "[?urlTemplate=='${URL_TEMPLATE}' && name!='${OPERATION_ID}'].name" -o tsv)
(( ${#COLLISIONS[@]} == 0 )) || fail "Another APIM operation already owns ${URL_TEMPLATE}: ${COLLISIONS[*]}"

MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}/apis/${API_ID}"
BODY="$(mktemp)"
POLICY_BODY="$(mktemp)"
cleanup() { rm -f "$BODY" "$POLICY_BODY"; }
trap cleanup EXIT

cat >"$BODY" <<JSON
{"properties":{"displayName":"Advanced catalog search","method":"GET","urlTemplate":"${URL_TEMPLATE}","templateParameters":[],"responses":[{"statusCode":200,"description":"Bounded public catalog search response"},{"statusCode":400,"description":"Invalid search request"},{"statusCode":503,"description":"Catalog unavailable"}]}}
JSON
az rest --method put --url "${MGMT}/operations/${OPERATION_ID}?api-version=${API_VERSION}" --body @"$BODY" -o none

cat >"$POLICY_BODY" <<'JSON'
{"properties":{"format":"rawxml","value":"<policies><inbound><base /></inbound><backend><base /></backend><outbound><base /><set-header name=\"Cache-Control\" exists-action=\"override\"><value>no-store</value></set-header><set-header name=\"X-Content-Type-Options\" exists-action=\"override\"><value>nosniff</value></set-header></outbound><on-error><base /></on-error></policies>"}}
JSON
az rest --method put --url "${MGMT}/operations/${OPERATION_ID}/policies/policy?api-version=${API_VERSION}" --body @"$POLICY_BODY" -o none

METHOD="$(az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$OPERATION_ID" --query method -o tsv)"
TEMPLATE="$(az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API_ID" --operation-id "$OPERATION_ID" --query urlTemplate -o tsv)"
[[ "$METHOD" == "GET" && "$TEMPLATE" == "$URL_TEMPLATE" ]] || fail "Advanced search APIM verification failed"

echo "SUCCESS: Added ${URL_TEMPLATE} to existing discovery API ${API_ID}; no API/resource ownership was replaced."
