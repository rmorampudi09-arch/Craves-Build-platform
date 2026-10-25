#!/usr/bin/env bash
set -Eeuo pipefail
set +x

log() {
  printf '[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 2
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command is missing: $1"
}

require_env() {
  local name="$1"
  [[ -n "${!name:-}" ]] || fail "Required environment variable is missing: $name"
}

for command_name in az curl dig jq openssl awk sed sort grep head; do
  require_command "$command_name"
done

for env_name in \
  SUBSCRIPTION_ID \
  RESOURCE_GROUP \
  CONTAINER_APP_ENVIRONMENT_NAME \
  CUSTOMER_WEB_APP_NAME \
  CUSTOMER_WEB_APP_FQDN \
  CUSTOMER_WEB_STATIC_IP \
  CUSTOMER_APEX_HOSTNAME \
  CUSTOMER_WWW_HOSTNAME \
  FRONT_DOOR_PROFILE_NAME \
  FRONT_DOOR_ENDPOINT_HOSTNAME \
  API_HOSTNAME \
  ADMIN_HOSTNAME; do
  require_env "$env_name"
done

# Every public hostname is a Front Door custom domain; Front Door terminates TLS for all of them.
PUBLIC_HOSTNAMES=("$CUSTOMER_APEX_HOSTNAME" "$CUSTOMER_WWW_HOSTNAME" "$API_HOSTNAME" "$ADMIN_HOSTNAME")
CERT_MIN_REMAINING_DAYS="${CERT_MIN_REMAINING_DAYS:-30}"

if ! [[ "$CERT_MIN_REMAINING_DAYS" =~ ^[0-9]+$ ]]; then
  fail "CERT_MIN_REMAINING_DAYS must be a non-negative integer."
fi

CERT_MIN_REMAINING_SECONDS=$((CERT_MIN_REMAINING_DAYS * 86400))
RESULT="PASS"
FAILURES=0

record_failure() {
  RESULT="FAIL"
  FAILURES=$((FAILURES + 1))
  printf 'FAILED: %s\n' "$*" >&2
}

record_pass() {
  printf 'PASSED: %s\n' "$*"
}

log "Selecting Azure subscription."
az account set --subscription "$SUBSCRIPTION_ID"

ACTIVE_SUBSCRIPTION_ID="$(
  az account show \
    --query id \
    --output tsv \
    --only-show-errors
)"

if [[ "$ACTIVE_SUBSCRIPTION_ID" != "$SUBSCRIPTION_ID" ]]; then
  fail "Authenticated Azure context is using the wrong subscription."
fi

echo "============================================================"
echo "1. CUSTOMER CONTAINER APP RUNTIME"
echo "============================================================"

APP_STATE="$(
  az containerapp show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$CUSTOMER_WEB_APP_NAME" \
    --query '{running:properties.runningStatus,latest:properties.latestRevisionName,ready:properties.latestReadyRevisionName,fqdn:properties.configuration.ingress.fqdn}' \
    --output json \
    --only-show-errors
)"

echo "$APP_STATE"

RUNNING_STATUS="$(
  az containerapp show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$CUSTOMER_WEB_APP_NAME" \
    --query properties.runningStatus \
    --output tsv \
    --only-show-errors
)"

LATEST_REVISION="$(
  az containerapp show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$CUSTOMER_WEB_APP_NAME" \
    --query properties.latestRevisionName \
    --output tsv \
    --only-show-errors
)"

READY_REVISION="$(
  az containerapp show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$CUSTOMER_WEB_APP_NAME" \
    --query properties.latestReadyRevisionName \
    --output tsv \
    --only-show-errors
)"

APP_FQDN="$(
  az containerapp show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$CUSTOMER_WEB_APP_NAME" \
    --query properties.configuration.ingress.fqdn \
    --output tsv \
    --only-show-errors
)"

ENVIRONMENT_IP="$(
  az containerapp env show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$CONTAINER_APP_ENVIRONMENT_NAME" \
    --query properties.staticIp \
    --output tsv \
    --only-show-errors
)"

if [[ "$RUNNING_STATUS" == "Running" ]]; then
  record_pass "Container App running status is Running."
else
  record_failure "Container App running status is ${RUNNING_STATUS:-empty}."
fi

if [[ -n "$LATEST_REVISION" && "$LATEST_REVISION" == "$READY_REVISION" ]]; then
  record_pass "Latest revision equals latest ready revision: $LATEST_REVISION"
else
  record_failure "Latest revision ($LATEST_REVISION) does not equal latest ready revision ($READY_REVISION)."
fi

if [[ "$APP_FQDN" == "$CUSTOMER_WEB_APP_FQDN" ]]; then
  record_pass "Container App FQDN matches expected production hostname."
else
  record_failure "Container App FQDN changed to $APP_FQDN."
fi

if [[ "$ENVIRONMENT_IP" == "$CUSTOMER_WEB_STATIC_IP" ]]; then
  record_pass "Container Apps environment IP is $ENVIRONMENT_IP."
else
  record_failure "Environment IP changed to $ENVIRONMENT_IP."
fi

echo ""
echo "============================================================"
echo "2. PUBLIC TLS CERTIFICATES"
echo "============================================================"

TEMP_CERT_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_CERT_DIR"' EXIT

for HOSTNAME in "${PUBLIC_HOSTNAMES[@]}"; do
  SERVED_CERT="$TEMP_CERT_DIR/${HOSTNAME}.pem"

  if ! openssl s_client -connect "${HOSTNAME}:443" -servername "$HOSTNAME" </dev/null 2>/dev/null \
    | openssl x509 -outform PEM >"$SERVED_CERT" 2>/dev/null; then
    record_failure "$HOSTNAME did not present a TLS certificate."
    continue
  fi

  echo "$HOSTNAME certificate expiry: $(openssl x509 -in "$SERVED_CERT" -noout -enddate | cut -d= -f2-)"

  if openssl x509 -in "$SERVED_CERT" -noout -checkhost "$HOSTNAME" | grep -Fq ' does match '; then
    record_pass "$HOSTNAME certificate covers the hostname."
  else
    record_failure "$HOSTNAME certificate does not cover the hostname."
  fi

  if openssl x509 -in "$SERVED_CERT" -noout -checkend "$CERT_MIN_REMAINING_SECONDS" >/dev/null 2>&1; then
    record_pass "$HOSTNAME certificate has more than ${CERT_MIN_REMAINING_DAYS} days remaining."
  else
    record_failure "$HOSTNAME certificate has ${CERT_MIN_REMAINING_DAYS} days or less remaining."
  fi
done

echo ""
echo "============================================================"
echo "3. AUTHORITATIVE AND PUBLIC DNS"
echo "============================================================"

az extension add \
  --name cdn \
  --upgrade \
  --yes \
  --only-show-errors >/dev/null

FRONT_DOOR_ENDPOINTS="$(
  az afd endpoint list \
    --resource-group "$RESOURCE_GROUP" \
    --profile-name "$FRONT_DOOR_PROFILE_NAME" \
    --output json \
    --only-show-errors
)"

FRONT_DOOR_ENDPOINT="$(
  jq -c \
    --arg hostname "$FRONT_DOOR_ENDPOINT_HOSTNAME" \
    '[.[] | select((.hostName // .properties.hostName) == $hostname)] | first // {}' \
    <<<"$FRONT_DOOR_ENDPOINTS"
)"

FRONT_DOOR_ENDPOINT_NAME="$(jq -r '.name // empty' <<<"$FRONT_DOOR_ENDPOINT")"
FRONT_DOOR_ENDPOINT_STATE="$(jq -r '.enabledState // .properties.enabledState // empty' <<<"$FRONT_DOOR_ENDPOINT")"
FRONT_DOOR_ENDPOINT_PROVISIONING="$(jq -r '.provisioningState // .properties.provisioningState // empty' <<<"$FRONT_DOOR_ENDPOINT")"

FRONT_DOOR_DOMAINS="$(
  az afd custom-domain list \
    --resource-group "$RESOURCE_GROUP" \
    --profile-name "$FRONT_DOOR_PROFILE_NAME" \
    --output json \
    --only-show-errors
)"

echo "$FRONT_DOOR_ENDPOINT"

if [[ -n "$FRONT_DOOR_ENDPOINT_NAME" && "$FRONT_DOOR_ENDPOINT_STATE" == "Enabled" && "$FRONT_DOOR_ENDPOINT_PROVISIONING" == "Succeeded" ]]; then
  record_pass "Front Door endpoint $FRONT_DOOR_ENDPOINT_HOSTNAME is enabled and provisioned."
else
  record_failure "Front Door endpoint is not healthy (name=${FRONT_DOOR_ENDPOINT_NAME:-empty}, enabled=${FRONT_DOOR_ENDPOINT_STATE:-empty}, provisioning=${FRONT_DOOR_ENDPOINT_PROVISIONING:-empty})."
fi

for HOSTNAME in "${PUBLIC_HOSTNAMES[@]}"; do
  DOMAIN_STATE="$(
    jq -r \
      --arg hostname "$HOSTNAME" \
      '[.[] | select((.hostName // .properties.hostName) == $hostname)] | first |
        [(.provisioningState // .properties.provisioningState // ""),
         (.domainValidationState // .properties.domainValidationState // "")] | @tsv' \
      <<<"$FRONT_DOOR_DOMAINS"
  )"

  if [[ "$DOMAIN_STATE" == $'Succeeded\tApproved' ]]; then
    record_pass "Front Door custom domain $HOSTNAME is provisioned and approved."
  else
    record_failure "Front Door custom domain $HOSTNAME is not ready: ${DOMAIN_STATE:-empty}."
  fi
done

AUTHORITATIVE_NS="$(dig "$CUSTOMER_APEX_HOSTNAME" NS +short | sort -u | head -n 1 | sed 's/\.$//')"

if [[ -n "$AUTHORITATIVE_NS" ]]; then
  record_pass "Authoritative nameserver discovered: $AUTHORITATIVE_NS"
else
  fail "No authoritative nameserver could be discovered for $CUSTOMER_APEX_HOSTNAME."
fi

AUTH_APEX="$(dig @"$AUTHORITATIVE_NS" "$CUSTOMER_APEX_HOSTNAME" A +short | sort -u)"
AUTH_WWW="$(dig @"$AUTHORITATIVE_NS" "$CUSTOMER_WWW_HOSTNAME" CNAME +short | sed 's/\.$//' | sort -u)"
GOOGLE_APEX="$(dig @8.8.8.8 "$CUSTOMER_APEX_HOSTNAME" A +short | sort -u)"
GOOGLE_WWW="$(dig @8.8.8.8 "$CUSTOMER_WWW_HOSTNAME" CNAME +short | sed 's/\.$//' | sort -u)"
CLOUDFLARE_APEX="$(dig @1.1.1.1 "$CUSTOMER_APEX_HOSTNAME" A +short | sort -u)"
CLOUDFLARE_WWW="$(dig @1.1.1.1 "$CUSTOMER_WWW_HOSTNAME" CNAME +short | sed 's/\.$//' | sort -u)"

printf 'Authoritative apex: %s\n' "$AUTH_APEX"
printf 'Authoritative www:  %s\n' "$AUTH_WWW"
printf 'Google apex:        %s\n' "$GOOGLE_APEX"
printf 'Google www:         %s\n' "$GOOGLE_WWW"
printf 'Cloudflare apex:    %s\n' "$CLOUDFLARE_APEX"
printf 'Cloudflare www:     %s\n' "$CLOUDFLARE_WWW"

for VALUE in "$AUTH_APEX" "$GOOGLE_APEX" "$CLOUDFLARE_APEX"; do
  if [[ -n "$VALUE" ]]; then
    record_pass "Apex DNS resolves through the checked resolver."
  else
    record_failure "Apex DNS did not resolve through the checked resolver."
  fi
done

for VALUE in "$AUTH_WWW" "$GOOGLE_WWW" "$CLOUDFLARE_WWW"; do
  if [[ "$VALUE" != "$FRONT_DOOR_ENDPOINT_HOSTNAME" ]]; then
    record_failure "WWW CNAME mismatch detected: ${VALUE:-empty}."
  else
    record_pass "WWW CNAME points to the Front Door endpoint."
  fi
done

echo ""
echo "============================================================"
echo "4. LIVE CUSTOMER HTTPS"
echo "============================================================"

for HOSTNAME in "$CUSTOMER_APEX_HOSTNAME" "$CUSTOMER_WWW_HOSTNAME"; do
  RESPONSE_HEADERS="$TEMP_CERT_DIR/${HOSTNAME}.headers"
  CURL_OUTPUT="$(
    curl -sS \
      -L \
      --max-redirs 5 \
      --connect-timeout 15 \
      --dump-header "$RESPONSE_HEADERS" \
      -o /dev/null \
      -w '%{http_code}|%{ssl_verify_result}|%{remote_ip}|%{url_effective}' \
      "https://${HOSTNAME}/" || true
  )"

  IFS='|' read -r HTTP_STATUS TLS_VERIFY REMOTE_IP FINAL_URL <<<"$CURL_OUTPUT"

  printf '%s -> HTTP %s, TLS %s, remote %s, final %s\n' \
    "$HOSTNAME" \
    "${HTTP_STATUS:-empty}" \
    "${TLS_VERIFY:-empty}" \
    "${REMOTE_IP:-empty}" \
    "${FINAL_URL:-empty}"

  if [[ "$HTTP_STATUS" == "200" ]]; then
    record_pass "$HOSTNAME returns HTTP 200."
  else
    record_failure "$HOSTNAME returned HTTP ${HTTP_STATUS:-empty}."
  fi

  if [[ "$TLS_VERIFY" == "0" ]]; then
    record_pass "$HOSTNAME TLS verification is successful."
  else
    record_failure "$HOSTNAME TLS verification result is ${TLS_VERIFY:-empty}."
  fi

  if grep -Eiq '^x-azure-ref:' "$RESPONSE_HEADERS"; then
    record_pass "$HOSTNAME is served through Azure Front Door."
  else
    record_failure "$HOSTNAME response did not include an Azure Front Door reference header (remote IP ${REMOTE_IP:-empty})."
  fi
done

echo ""
echo "============================================================"
echo "5. API GATEWAY DNS AND TLS"
echo "============================================================"

# api.craves.in goes through Front Door to APIM, like the customer site.
API_CNAME="$(dig @8.8.8.8 "$API_HOSTNAME" CNAME +short | sed 's/\.$//')"
API_CURL="$(
  curl -sS \
    --connect-timeout 15 \
    -o /dev/null \
    -w '%{http_code}|%{ssl_verify_result}|%{remote_ip}' \
    "https://${API_HOSTNAME}/" || true
)"

IFS='|' read -r API_HTTP API_TLS API_REMOTE <<<"$API_CURL"

printf 'API CNAME: %s\n' "$API_CNAME"
printf 'API root: HTTP %s, TLS %s, remote %s\n' \
  "${API_HTTP:-empty}" \
  "${API_TLS:-empty}" \
  "${API_REMOTE:-empty}"

if [[ "$API_CNAME" == "$FRONT_DOOR_ENDPOINT_HOSTNAME" ]]; then
  record_pass "$API_HOSTNAME CNAME points to the Front Door endpoint."
else
  record_failure "$API_HOSTNAME CNAME changed to ${API_CNAME:-empty}; expected $FRONT_DOOR_ENDPOINT_HOSTNAME."
fi

if [[ "$API_TLS" == "0" ]]; then
  record_pass "API TLS verification succeeds."
else
  record_failure "API TLS verification result is ${API_TLS:-empty}."
fi

if [[ "$API_HTTP" == "404" || "$API_HTTP" == "200" ]]; then
  record_pass "API root status is acceptable ($API_HTTP)."
else
  record_failure "Unexpected API root HTTP status ${API_HTTP:-empty}."
fi

echo ""
echo "============================================================"
echo "FINAL RESULT: $RESULT"
echo "FAILURES: $FAILURES"
echo "============================================================"

if [[ "$RESULT" != "PASS" ]]; then
  exit 2
fi

printf 'PRODUCTION_STABILIZATION_STATUS=PASS\n'
printf 'CUSTOMER_WEB_LATEST_READY_REVISION=%s\n' "$READY_REVISION"
