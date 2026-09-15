#!/usr/bin/env bash
set -Eeuo pipefail
set +x

RG="${RESOURCE_GROUP:-rg-craves-prodlow-centralindia}"
PROFILE="${FRONT_DOOR_PROFILE:-afd-craves-prodlow}"
APP="${DELIVERY_INTELLIGENCE_CONTAINER_APP:-ca-craves-delivery-intel-prodlow}"
DOMAIN_RESOURCE="${ADMIN_DOMAIN_RESOURCE:-admin-craves-in}"
ORIGIN_GROUP="${DELIVERY_INTELLIGENCE_ORIGIN_GROUP:-craves-delivery-intel-origin-group}"
ORIGIN="${DELIVERY_INTELLIGENCE_ORIGIN:-craves-delivery-intel-origin}"
ROUTE="${DELIVERY_INTELLIGENCE_ROUTE:-craves-delivery-intel-route}"
ADMIN_RULESET="${ADMIN_RULESET:-cravesadminsecurityheaders}"
CONFIRM_WRITE="${CONFIRM_FRONTDOOR_WRITE:-false}"

fail() { echo "ERROR: $*" >&2; exit 1; }
for tool in az jq curl; do command -v "$tool" >/dev/null || fail "$tool is required"; done
[[ "${CONFIRM_WRITE,,}" == "true" ]] || fail "Set CONFIRM_FRONTDOOR_WRITE=true for the controlled Front Door write"
az account show >/dev/null
az extension add -n cdn --upgrade --yes --only-show-errors >/dev/null
az extension add -n front-door --upgrade --yes --only-show-errors >/dev/null || true

SUB="$(az account show --query id -o tsv)"
SUFFIX="$(tr -d '-' <<<"$SUB" | cut -c1-8 | tr '[:upper:]' '[:lower:]')"
ENDPOINT="${FRONT_DOOR_ENDPOINT_NAME:-craves-prodlow-$SUFFIX}"

az afd profile show -g "$RG" --profile-name "$PROFILE" >/dev/null || fail "Front Door profile $PROFILE was not found"
az afd endpoint show -g "$RG" --profile-name "$PROFILE" --endpoint-name "$ENDPOINT" >/dev/null || fail "Front Door endpoint $ENDPOINT was not found"
DOMAIN_ID="$(az afd custom-domain show -g "$RG" --profile-name "$PROFILE" --custom-domain-name "$DOMAIN_RESOURCE" --query id -o tsv)"
[[ -n "$DOMAIN_ID" ]] || fail "Existing admin custom domain was not found"

APP_JSON="$(az containerapp show -g "$RG" -n "$APP" -o json)"
APP_FQDN="$(jq -r '.properties.configuration.ingress.fqdn // empty' <<<"$APP_JSON")"
LATEST="$(jq -r '.properties.latestRevisionName // empty' <<<"$APP_JSON")"
READY="$(jq -r '.properties.latestReadyRevisionName // empty' <<<"$APP_JSON")"
RUNNING="$(jq -r '.properties.runningStatus // empty' <<<"$APP_JSON")"
EXTERNAL="$(jq -r '.properties.configuration.ingress.external // false' <<<"$APP_JSON")"
[[ -n "$APP_FQDN" && "$LATEST" == "$READY" && "$RUNNING" == "Running" && "$EXTERNAL" == "true" ]] || fail "Delivery Intelligence Container App is not ready for Front Door"
curl --silent --show-error --fail --max-time 30 "https://${APP_FQDN}/delivery-intelligence/api/health" >/dev/null

if ! az afd origin-group show -g "$RG" --profile-name "$PROFILE" --origin-group-name "$ORIGIN_GROUP" >/dev/null 2>&1; then
  az afd origin-group create \
    -g "$RG" \
    --profile-name "$PROFILE" \
    --origin-group-name "$ORIGIN_GROUP" \
    --probe-request-type GET \
    --probe-protocol Https \
    --probe-path /delivery-intelligence/api/health \
    --probe-interval-in-seconds 120 \
    --sample-size 4 \
    --successful-samples-required 3 \
    --additional-latency-in-milliseconds 50 \
    --only-show-errors >/dev/null
fi

if az afd origin show -g "$RG" --profile-name "$PROFILE" --origin-group-name "$ORIGIN_GROUP" --origin-name "$ORIGIN" >/dev/null 2>&1; then
  az afd origin update \
    -g "$RG" \
    --profile-name "$PROFILE" \
    --origin-group-name "$ORIGIN_GROUP" \
    --origin-name "$ORIGIN" \
    --host-name "$APP_FQDN" \
    --origin-host-header "$APP_FQDN" \
    --priority 1 \
    --weight 1000 \
    --enabled-state Enabled \
    --http-port 80 \
    --https-port 443 \
    --enforce-certificate-name-check true \
    --only-show-errors >/dev/null
else
  az afd origin create \
    -g "$RG" \
    --profile-name "$PROFILE" \
    --origin-group-name "$ORIGIN_GROUP" \
    --origin-name "$ORIGIN" \
    --host-name "$APP_FQDN" \
    --origin-host-header "$APP_FQDN" \
    --priority 1 \
    --weight 1000 \
    --enabled-state Enabled \
    --http-port 80 \
    --https-port 443 \
    --enforce-certificate-name-check true \
    --only-show-errors >/dev/null
fi

ORIGIN_GROUP_ID="$(az afd origin-group show -g "$RG" --profile-name "$PROFILE" --origin-group-name "$ORIGIN_GROUP" --query id -o tsv)"
RULESET_ID="$(az afd rule-set show -g "$RG" --profile-name "$PROFILE" --rule-set-name "$ADMIN_RULESET" --query id -o tsv)"
[[ -n "$ORIGIN_GROUP_ID" && -n "$RULESET_ID" ]] || fail "Front Door route dependencies were not resolved"
FORMATTED_RULESETS="$(jq -nc --arg id "$RULESET_ID" '[{id:$id}]')"
FORMATTED_DOMAINS="$(jq -nc --arg id "$DOMAIN_ID" '[{id:$id}]')"

if az afd route show -g "$RG" --profile-name "$PROFILE" --endpoint-name "$ENDPOINT" --route-name "$ROUTE" >/dev/null 2>&1; then
  az afd route update \
    -g "$RG" \
    --profile-name "$PROFILE" \
    --endpoint-name "$ENDPOINT" \
    --route-name "$ROUTE" \
    --origin-group "$ORIGIN_GROUP_ID" \
    --patterns-to-match '/delivery-intelligence' '/delivery-intelligence/*' \
    --supported-protocols Http Https \
    --forwarding-protocol HttpsOnly \
    --https-redirect Enabled \
    --link-to-default-domain Disabled \
    --formatted-rule-sets "$FORMATTED_RULESETS" \
    --formatted-custom-domains "$FORMATTED_DOMAINS" \
    --enabled-state Enabled \
    --only-show-errors >/dev/null
else
  az afd route create \
    -g "$RG" \
    --profile-name "$PROFILE" \
    --endpoint-name "$ENDPOINT" \
    --route-name "$ROUTE" \
    --origin-group "$ORIGIN_GROUP_ID" \
    --patterns-to-match '/delivery-intelligence' '/delivery-intelligence/*' \
    --supported-protocols Http Https \
    --forwarding-protocol HttpsOnly \
    --https-redirect Enabled \
    --link-to-default-domain Disabled \
    --formatted-rule-sets "$FORMATTED_RULESETS" \
    --formatted-custom-domains "$FORMATTED_DOMAINS" \
    --enabled-state Enabled \
    --only-show-errors >/dev/null
fi

ROUTE_JSON="$(az afd route show -g "$RG" --profile-name "$PROFILE" --endpoint-name "$ENDPOINT" --route-name "$ROUTE" -o json)"
jq -e --arg domain "$DOMAIN_ID" '((.customDomains // .properties.customDomains // []) | map(.id) | index($domain)) != null' <<<"$ROUTE_JSON" >/dev/null || fail "admin.craves.in is not associated with the Delivery Intelligence route"
jq -e '((.patternsToMatch // .properties.patternsToMatch // []) | index("/delivery-intelligence/*")) != null' <<<"$ROUTE_JSON" >/dev/null || fail "Delivery Intelligence wildcard path is missing"

echo "SUCCESS: Front Door Delivery Intelligence route is configured on existing admin.craves.in domain."
