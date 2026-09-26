#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RESOURCE_GROUP:-rg-craves-prodlow-centralindia}"
PROFILE="${FRONT_DOOR_PROFILE:-afd-craves-prodlow}"
ENDPOINT="${FRONT_DOOR_ENDPOINT:-}"
APIM_NAME="${APIM_NAME:-}"
API_HOSTNAME="${API_HOSTNAME:-api.craves.in}"
DNS_ZONE_NAME="${DNS_ZONE_NAME:-craves.in}"
API_DOMAIN_RESOURCE="${API_DOMAIN_RESOURCE:-api-craves-in}"
ORIGIN_GROUP="${API_ORIGIN_GROUP:-craves-api-origin-group}"
ORIGIN="${API_ORIGIN:-craves-apim-origin}"
ROUTE="${API_ROUTE:-craves-api-route}"
PROBE_PATH="${API_PROBE_PATH:-/api/v1/catalog/kitchens}"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

info() {
  echo "INFO: $*"
}

az account show --only-show-errors >/dev/null
az extension add -n cdn --upgrade --yes --only-show-errors >/dev/null || true

if [[ -z "$ENDPOINT" ]]; then
  ENDPOINT="$(az afd endpoint list \
    -g "$RG" \
    --profile-name "$PROFILE" \
    --query "[?starts_with(name, 'craves-prodlow-')].name | [0]" \
    -o tsv \
    --only-show-errors)"
fi
[[ -n "$ENDPOINT" ]] || fail "Front Door endpoint could not be resolved."

ENDPOINT_HOST="$(az afd endpoint show \
  -g "$RG" \
  --profile-name "$PROFILE" \
  --endpoint-name "$ENDPOINT" \
  --query hostName \
  -o tsv \
  --only-show-errors)"
[[ -n "$ENDPOINT_HOST" ]] || fail "Front Door endpoint host could not be resolved."

if [[ -z "$APIM_NAME" ]]; then
  APIM_NAME="$(az apim list \
    -g "$RG" \
    --query "[?starts_with(name, 'apim-craves-prodlow-')].name | [0]" \
    -o tsv \
    --only-show-errors)"
fi
[[ -n "$APIM_NAME" ]] || fail "API Management service could not be resolved."

APIM_GATEWAY_URL="$(az apim show \
  -g "$RG" \
  -n "$APIM_NAME" \
  --query gatewayUrl \
  -o tsv \
  --only-show-errors)"
[[ "$APIM_GATEWAY_URL" == https://* ]] || fail "APIM gateway URL is invalid: ${APIM_GATEWAY_URL:-empty}"
APIM_DEFAULT_HOST="${APIM_GATEWAY_URL#https://}"
APIM_DEFAULT_HOST="${APIM_DEFAULT_HOST%/}"

DNS_ZONE_RG="$(az network dns zone list \
  --query "[?name=='${DNS_ZONE_NAME}'].resourceGroup | [0]" \
  -o tsv \
  --only-show-errors)"
[[ -n "$DNS_ZONE_RG" ]] || fail "Azure DNS zone ${DNS_ZONE_NAME} was not found in this subscription."

DNS_ZONE_ID="$(az network dns zone show \
  -g "$DNS_ZONE_RG" \
  -n "$DNS_ZONE_NAME" \
  --query id \
  -o tsv \
  --only-show-errors)"
[[ -n "$DNS_ZONE_ID" ]] || fail "Azure DNS zone id could not be resolved."

info "Configuring Front Door API origin ${APIM_DEFAULT_HOST}."
az afd origin-group show \
  -g "$RG" \
  --profile-name "$PROFILE" \
  --origin-group-name "$ORIGIN_GROUP" \
  --only-show-errors >/dev/null 2>&1 || \
  az afd origin-group create \
    -g "$RG" \
    --profile-name "$PROFILE" \
    --origin-group-name "$ORIGIN_GROUP" \
    --probe-request-type GET \
    --probe-protocol Https \
    --probe-path "$PROBE_PATH" \
    --probe-interval-in-seconds 120 \
    --sample-size 4 \
    --successful-samples-required 3 \
    --additional-latency-in-milliseconds 50 \
    --only-show-errors \
    --output none

if az afd origin show \
  -g "$RG" \
  --profile-name "$PROFILE" \
  --origin-group-name "$ORIGIN_GROUP" \
  --origin-name "$ORIGIN" \
  --only-show-errors >/dev/null 2>&1; then
  az afd origin update \
    -g "$RG" \
    --profile-name "$PROFILE" \
    --origin-group-name "$ORIGIN_GROUP" \
    --origin-name "$ORIGIN" \
    --host-name "$APIM_DEFAULT_HOST" \
    --origin-host-header "$APIM_DEFAULT_HOST" \
    --priority 1 \
    --weight 1000 \
    --enabled-state Enabled \
    --http-port 80 \
    --https-port 443 \
    --enforce-certificate-name-check true \
    --only-show-errors \
    --output none
else
  az afd origin create \
    -g "$RG" \
    --profile-name "$PROFILE" \
    --origin-group-name "$ORIGIN_GROUP" \
    --origin-name "$ORIGIN" \
    --host-name "$APIM_DEFAULT_HOST" \
    --origin-host-header "$APIM_DEFAULT_HOST" \
    --priority 1 \
    --weight 1000 \
    --enabled-state Enabled \
    --http-port 80 \
    --https-port 443 \
    --enforce-certificate-name-check true \
    --only-show-errors \
    --output none
fi

info "Pointing ${API_HOSTNAME} to Front Door endpoint ${ENDPOINT_HOST} in Azure DNS."
RECORD_NAME="${API_HOSTNAME%.${DNS_ZONE_NAME}}"
[[ "$RECORD_NAME" != "$API_HOSTNAME" && -n "$RECORD_NAME" ]] || fail "${API_HOSTNAME} is not inside DNS zone ${DNS_ZONE_NAME}."
az network dns record-set cname create \
  -g "$DNS_ZONE_RG" \
  -z "$DNS_ZONE_NAME" \
  -n "$RECORD_NAME" \
  --ttl 300 \
  --only-show-errors \
  --output none >/dev/null 2>&1 || true
az network dns record-set cname set-record \
  -g "$DNS_ZONE_RG" \
  -z "$DNS_ZONE_NAME" \
  -n "$RECORD_NAME" \
  -c "$ENDPOINT_HOST" \
  --only-show-errors \
  --output none

info "Ensuring ${API_HOSTNAME} Front Door managed certificate."
if ! az afd custom-domain show \
  -g "$RG" \
  --profile-name "$PROFILE" \
  --custom-domain-name "$API_DOMAIN_RESOURCE" \
  --only-show-errors >/dev/null 2>&1; then
  az afd custom-domain create \
    -g "$RG" \
    --profile-name "$PROFILE" \
    --custom-domain-name "$API_DOMAIN_RESOURCE" \
    --host-name "$API_HOSTNAME" \
    --azure-dns-zone "$DNS_ZONE_ID" \
    --certificate-type ManagedCertificate \
    --minimum-tls-version TLS12 \
    --only-show-errors \
    --output none
fi

domain_state=""
validation_state=""
for _ in $(seq 1 80); do
  domain_state="$(az afd custom-domain show \
    -g "$RG" \
    --profile-name "$PROFILE" \
    --custom-domain-name "$API_DOMAIN_RESOURCE" \
    --query "provisioningState" \
    -o tsv \
    --only-show-errors 2>/dev/null || true)"
  validation_state="$(az afd custom-domain show \
    -g "$RG" \
    --profile-name "$PROFILE" \
    --custom-domain-name "$API_DOMAIN_RESOURCE" \
    --query "domainValidationState" \
    -o tsv \
    --only-show-errors 2>/dev/null || true)"
  [[ "$domain_state" == "Failed" ]] && fail "Front Door API custom domain provisioning failed."
  [[ "$domain_state" == "Succeeded" && "$validation_state" == "Approved" ]] && break
  sleep 15
done
[[ "$domain_state" == "Succeeded" && "$validation_state" == "Approved" ]] || \
  fail "Front Door API custom domain did not become ready: provisioning=${domain_state:-empty} validation=${validation_state:-empty}"

DOMAIN_ID="$(az afd custom-domain show \
  -g "$RG" \
  --profile-name "$PROFILE" \
  --custom-domain-name "$API_DOMAIN_RESOURCE" \
  --query id \
  -o tsv \
  --only-show-errors)"
ORIGIN_GROUP_ID="$(az afd origin-group show \
  -g "$RG" \
  --profile-name "$PROFILE" \
  --origin-group-name "$ORIGIN_GROUP" \
  --query id \
  -o tsv \
  --only-show-errors)"
FORMATTED_DOMAINS="[{id:${DOMAIN_ID}}]"

info "Associating ${API_HOSTNAME} with the API route."
if az afd route show \
  -g "$RG" \
  --profile-name "$PROFILE" \
  --endpoint-name "$ENDPOINT" \
  --route-name "$ROUTE" \
  --only-show-errors >/dev/null 2>&1; then
  az afd route update \
    -g "$RG" \
    --profile-name "$PROFILE" \
    --endpoint-name "$ENDPOINT" \
    --route-name "$ROUTE" \
    --origin-group "$ORIGIN_GROUP_ID" \
    --patterns-to-match '/*' \
    --supported-protocols Http Https \
    --forwarding-protocol HttpsOnly \
    --https-redirect Enabled \
    --link-to-default-domain Disabled \
    --formatted-custom-domains "$FORMATTED_DOMAINS" \
    --enabled-state Enabled \
    --only-show-errors \
    --output none
else
  az afd route create \
    -g "$RG" \
    --profile-name "$PROFILE" \
    --endpoint-name "$ENDPOINT" \
    --route-name "$ROUTE" \
    --origin-group "$ORIGIN_GROUP_ID" \
    --patterns-to-match '/*' \
    --supported-protocols Http Https \
    --forwarding-protocol HttpsOnly \
    --https-redirect Enabled \
    --link-to-default-domain Disabled \
    --formatted-custom-domains "$FORMATTED_DOMAINS" \
    --enabled-state Enabled \
    --only-show-errors \
    --output none
fi

info "Waiting for public API host smoke test."
for _ in $(seq 1 40); do
  if curl -fsS --max-time 30 "https://${API_HOSTNAME}${PROBE_PATH}" >/tmp/craves-api-frontdoor-smoke.json; then
    echo "SUCCESS: ${API_HOSTNAME} is routed through Front Door and serving APIM traffic."
    cat /tmp/craves-api-frontdoor-smoke.json
    exit 0
  fi
  sleep 15
done

fail "https://${API_HOSTNAME}${PROBE_PATH} did not pass the public smoke test."
