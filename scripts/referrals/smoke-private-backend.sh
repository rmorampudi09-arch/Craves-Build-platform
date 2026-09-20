#!/usr/bin/env bash
# Read-only health and fail-closed boundary checks from the private ACA environment.
set -euo pipefail
REFERRAL_SMOKE_HOST=${REFERRAL_SMOKE_HOST:?private referral hostname required}
[[ "$REFERRAL_SMOKE_HOST" =~ ^ca-craves-referral-[a-z0-9.-]+\.azurecontainerapps\.io$ ]]
command -v openssl >/dev/null
request() {
  local method=$1 path=$2 expected=$3 marker=$4 body=${5:-} response actual
  response=$(printf '%s %s HTTP/1.1\r\nHost: %s\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: %s\r\n\r\n%s' \
    "$method" "$path" "$REFERRAL_SMOKE_HOST" "${#body}" "$body" |
    timeout 20 openssl s_client -quiet -ignore_unexpected_eof -connect "$REFERRAL_SMOKE_HOST:443" \
      -servername "$REFERRAL_SMOKE_HOST" -verify_hostname "$REFERRAL_SMOKE_HOST" \
      -verify_return_error -CAfile /etc/ssl/certs/ca-certificates.crt 2>/tmp/referral-smoke-tls.log) || {
        cat /tmp/referral-smoke-tls.log >&2; return 1;
      }
  actual=${response%%$'\r\n'*}; actual=${actual#* }; actual=${actual%% *}
  [[ "$actual" == "$expected" ]] || { printf 'FAIL %s %s expected=%s actual=%s\n' "$method" "$path" "$expected" "$actual"; return 1; }
  [[ "$response" == *"$marker"* ]] || { printf 'FAIL response marker %s\n' "$path"; return 1; }
  printf 'PASS %s %s HTTP=%s marker=%s\n' "$method" "$path" "$actual" "$marker"
}
request GET /actuator/health/liveness 200 '"status":"UP"'
request GET /actuator/health/readiness 200 '"status":"UP"'
request POST /internal/v1/referrals/events 401 INVALID_SOURCE_HEADERS '{}'
request POST /internal/v1/referrals/operations 401 INVALID_SOURCE_HEADERS '{}'
request GET /api/v1/referrals/me 503 REFERRALS_DISABLED
request GET /api/v1/referrals/admin/policies 503 REFERRALS_DISABLED
printf 'REFERRAL_PRIVATE_SMOKE_PASS checks=6 no_business_writes=true\n'
