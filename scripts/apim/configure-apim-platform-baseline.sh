#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
APIM="${APIM:-apim-craves-prodlow-l3ing6}"
DISCOVERY_API_PATH="${DISCOVERY_API_PATH:-api/v1/discovery}"
DISCOVERY_RATE_LIMIT_CALLS="${DISCOVERY_RATE_LIMIT_CALLS:-6000}"
DISCOVERY_RATE_LIMIT_RENEWAL_SECONDS="${DISCOVERY_RATE_LIMIT_RENEWAL_SECONDS:-60}"
ENABLE_DISCOVERY_RATE_LIMIT="${ENABLE_DISCOVERY_RATE_LIMIT:-true}"
ALLOW_REPLACE_DISCOVERY_OPERATION_POLICY="${ALLOW_REPLACE_DISCOVERY_OPERATION_POLICY:-false}"
API_VERSION="${API_VERSION:-2024-05-01}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FRAGMENT_DIR="$ROOT/infra/apim/platform-baseline"

fail(){ echo "ERROR: $*" >&2; exit 1; }
for tool in az jq grep sed; do command -v "$tool" >/dev/null || fail "$tool is required"; done
for file in \
  "$FRAGMENT_DIR/craves-correlation-inbound.xml" \
  "$FRAGMENT_DIR/craves-security-outbound.xml" \
  "$FRAGMENT_DIR/craves-json-body-guard.xml"; do
  [[ -f "$file" ]] || fail "Missing APIM fragment source: $file"
done
[[ "$DISCOVERY_RATE_LIMIT_CALLS" =~ ^[1-9][0-9]*$ ]] || fail "DISCOVERY_RATE_LIMIT_CALLS must be a positive integer"
[[ "$DISCOVERY_RATE_LIMIT_RENEWAL_SECONDS" =~ ^[1-9][0-9]*$ ]] || fail "DISCOVERY_RATE_LIMIT_RENEWAL_SECONDS must be a positive integer"
(( DISCOVERY_RATE_LIMIT_RENEWAL_SECONDS <= 300 )) || fail "DISCOVERY_RATE_LIMIT_RENEWAL_SECONDS must be <= 300"

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
[[ -n "$SUBSCRIPTION_ID" ]] || fail "No active Azure subscription selected"
az apim show -g "$RG" -n "$APIM" -o none
APIM_SKU="$(az apim show -g "$RG" -n "$APIM" --query 'sku.name' -o tsv)"
[[ -n "$APIM_SKU" ]] || fail "APIM SKU could not be resolved"
SERVICE_MGMT="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.ApiManagement/service/${APIM}"

echo "APIM service: $APIM"
echo "APIM SKU:     $APIM_SKU"

put_fragment(){
  local fragment_id="$1" source_file="$2" description="$3"
  local url="${SERVICE_MGMT}/policyFragments/${fragment_id}?api-version=${API_VERSION}"
  local body current etag
  body="$(mktemp)"
  jq -Rs --arg description "$description" '{properties:{format:"xml",description:$description,value:.}}' "$source_file" >"$body"
  current="$(mktemp)"
  if az rest --method get --url "$url" -o json >"$current" 2>/dev/null; then
    etag="$(jq -r '.etag // empty' "$current")"
    [[ -n "$etag" ]] || fail "Could not read ETag for existing fragment $fragment_id"
    az rest --method put --url "$url" --headers "If-Match=$etag" --body @"$body" -o none
  else
    az rest --method put --url "$url" --body @"$body" -o none
  fi
  rm -f "$body" "$current"
  VALUE="$(az rest --method get --url "$url" --query properties.value -o tsv)"
  [[ -n "$VALUE" ]] || fail "Fragment $fragment_id was not readable after update"
  echo "Fragment ready: $fragment_id"
}

put_fragment "CravesCorrelationInbound" "$FRAGMENT_DIR/craves-correlation-inbound.xml" "Craves correlation ID propagation for inbound API requests."
put_fragment "CravesSecurityOutbound" "$FRAGMENT_DIR/craves-security-outbound.xml" "Craves correlation and safe API response headers."
put_fragment "CravesJsonBodyGuard" "$FRAGMENT_DIR/craves-json-body-guard.xml" "Craves 1 MiB maximum body guard for JSON API operations; do not apply to media upload operations."

RATE_LIMIT_SUPPORTED=true
if [[ "${APIM_SKU,,}" == "consumption" ]]; then
  RATE_LIMIT_SUPPORTED=false
fi
if [[ "${ENABLE_DISCOVERY_RATE_LIMIT,,}" != "true" ]]; then
  RATE_LIMIT_SUPPORTED=false
fi

mapfile -t DISCOVERY_API_IDS < <(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='${DISCOVERY_API_PATH}'].name" -o tsv)
(( ${#DISCOVERY_API_IDS[@]} == 1 )) || fail "Expected exactly one discovery API at /${DISCOVERY_API_PATH} before hardening"
DISCOVERY_API_ID="${DISCOVERY_API_IDS[0]}"
DISCOVERY_MGMT="${SERVICE_MGMT}/apis/${DISCOVERY_API_ID}"

is_safe_to_replace(){
  local current="$1"
  [[ -z "$current" ]] && return 0
  [[ "$current" == *"CravesCorrelationInbound"* ]] && return 0
  local compact
  compact="$(tr -d '[:space:]' <<<"$current")"
  [[ "$compact" == "<policies><inbound><base/></inbound><backend><base/></backend><outbound><base/></outbound><on-error><base/></on-error></policies>" ]]
}

harden_discovery_operation(){
  local operation_id="$1"
  az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$DISCOVERY_API_ID" --operation-id "$operation_id" -o none
  local policy_url="${DISCOVERY_MGMT}/operations/${operation_id}/policies/policy?api-version=${API_VERSION}"
  local current
  current="$(az rest --method get --url "$policy_url" --query properties.value -o tsv 2>/dev/null || true)"
  if ! is_safe_to_replace "$current" && [[ "${ALLOW_REPLACE_DISCOVERY_OPERATION_POLICY,,}" != "true" ]]; then
    fail "Discovery operation $operation_id already has a custom policy. Review it first or explicitly set ALLOW_REPLACE_DISCOVERY_OPERATION_POLICY=true."
  fi

  local xml body
  xml="$(mktemp)"; body="$(mktemp)"
  {
    echo '<policies>'
    echo '  <inbound>'
    echo '    <base />'
    echo '    <include-fragment fragment-id="CravesCorrelationInbound" />'
    if [[ "$RATE_LIMIT_SUPPORTED" == "true" ]]; then
      printf '    <rate-limit-by-key calls="%s" renewal-period="%s" counter-key="@(&quot;craves-discovery|&quot; + context.Api.Id + &quot;|&quot; + context.Request.IpAddress)" />\n' \
        "$DISCOVERY_RATE_LIMIT_CALLS" "$DISCOVERY_RATE_LIMIT_RENEWAL_SECONDS"
    fi
    echo '  </inbound>'
    echo '  <backend><base /></backend>'
    echo '  <outbound>'
    echo '    <base />'
    echo '    <include-fragment fragment-id="CravesSecurityOutbound" />'
    echo '  </outbound>'
    echo '  <on-error><base /></on-error>'
    echo '</policies>'
  } >"$xml"
  jq -Rs '{properties:{format:"rawxml",value:.}}' "$xml" >"$body"
  az rest --method put --url "$policy_url" --body @"$body" -o none
  rm -f "$xml" "$body"

  local installed
  installed="$(az rest --method get --url "$policy_url" --query properties.value -o tsv)"
  [[ "$installed" == *"CravesCorrelationInbound"* ]] || fail "$operation_id correlation fragment missing after update"
  [[ "$installed" == *"CravesSecurityOutbound"* ]] || fail "$operation_id outbound security fragment missing after update"
  if [[ "$RATE_LIMIT_SUPPORTED" == "true" ]]; then
    [[ "$installed" == *"rate-limit-by-key"* ]] || fail "$operation_id rate limit missing after update"
  fi
  echo "Discovery operation hardened: $operation_id"
}

harden_discovery_operation "discover-nearby-kitchens"
harden_discovery_operation "discover-nearby-menu-items"

if [[ "$RATE_LIMIT_SUPPORTED" == "true" ]]; then
  echo "Public discovery burst guard: ${DISCOVERY_RATE_LIMIT_CALLS} calls / ${DISCOVERY_RATE_LIMIT_RENEWAL_SECONDS}s per source IP and API."
elif [[ "${APIM_SKU,,}" == "consumption" ]]; then
  echo "Public discovery rate-limit-by-key skipped because the active APIM SKU is Consumption; correlation/security fragments were still installed."
else
  echo "Public discovery rate limit disabled by configuration; correlation/security fragments were still installed."
fi

echo "SUCCESS: Craves APIM platform baseline configured without modifying unrelated API policies."
