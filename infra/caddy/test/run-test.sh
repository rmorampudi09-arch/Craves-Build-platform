#!/usr/bin/env bash
# Runs fix-program.caddy in stock caddy:2.10 against a stand-in integration upstream and checks every route.
# Needs Docker and curl. Starts and removes only its own containers and network (names start with caddy-fixtest).
# Usage: bash infra/caddy/test/run-test.sh   (from anywhere; PORT=18000 by default)
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
IMAGE=caddy:2.10
NET=caddy-fixtest-net
GW=caddy-fixtest-gateway
UP=caddy-fixtest-integration
PORT=${PORT:-18000}
BASE="http://localhost:$PORT"

cleanup() { docker rm -fv "$GW" "$UP" >/dev/null 2>&1 || true; docker network rm "$NET" >/dev/null 2>&1 || true; rm -rf "${OUT:-}"; }
trap cleanup EXIT
cleanup
OUT=$(mktemp -d)

mounts=(-v "$HERE/Caddyfile:/etc/caddy/Caddyfile:ro" -v "$HERE/../fix-program.caddy:/etc/caddy/fix-program.caddy:ro")
echo "== caddy validate"
docker run --rm "${mounts[@]}" "$IMAGE" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | tail -1
echo "== caddy adapt: fix routes come before the webhook catch-all"
order=$(docker run --rm "${mounts[@]}" "$IMAGE" caddy adapt --config /etc/caddy/Caddyfile --adapter caddyfile 2>/dev/null \
  | grep -o 'webhooks/delivery/borzo\|webhooks/delivery/pidge\|webhooks/\.\*' | tr '\n' ' ')
echo "$order"
[[ "$order" == "webhooks/delivery/borzo webhooks/delivery/pidge webhooks/.* " ]] || { echo "FAIL: route order"; exit 1; }

docker network create "$NET" >/dev/null
docker run -d --name "$UP" --network "$NET" --network-alias integration \
  -v "$HERE/upstream.Caddyfile:/etc/caddy/Caddyfile:ro" "$IMAGE" >/dev/null
docker run -d --name "$GW" --network "$NET" -p "$PORT:8000" "${mounts[@]}" "$IMAGE" >/dev/null
for _ in $(seq 30); do curl -s -o /dev/null "$BASE/" && break; sleep 0.5; done

head -c 300000 /dev/zero | tr '\0' a > "$OUT/big"   # over 262144
head -c 20000 /dev/zero | tr '\0' a > "$OUT/mid"    # over 16384, under 262144
fails=0
# check <name> <expected status> <text expected in the response headers or body, or -> <curl args...>
check() {
  local name=$1 want=$2 text=$3; shift 3
  local got ok=PASS
  got=$(curl -s -D "$OUT/h" -o "$OUT/b" -w '%{http_code}' "$@" || true)
  [[ "$got" == "$want" ]] || ok=FAIL
  [[ "$text" == - ]] || grep -qF -- "$text" "$OUT/h" "$OUT/b" || ok=FAIL
  [[ $ok == PASS ]] || fails=$((fails + 1))
  printf '%s %s (want %s) %s | %s\n' "$ok" "$got" "$want" "$name" "$(head -c 90 "$OUT/b" | tr -d '\n')"
}
J=(-H 'Content-Type: application/json')
B=(-H 'Authorization: Bearer test-token')
S=(-H 'X-Craves-Shift-Credential: cred-1')
W="$BASE/api/v1/webhooks"
R="$BASE/api/v1/rider/offers/abc-123/rang"
C="$BASE/api/v1/admin/fleet/courier-billing"
check "borzo webhook, 300000 bytes"             413 - -X POST "${J[@]}" --data-binary @"$OUT/big" "$W/delivery/borzo"
check "pidge webhook, 300000 bytes"             413 - -X POST "${J[@]}" --data-binary @"$OUT/big" "$W/delivery/pidge"
check "pidge webhook, 300000 bytes, chunked"    413 - -X POST "${J[@]}" -H 'Transfer-Encoding: chunked' --data-binary @"$OUT/big" "$W/delivery/pidge"
check "borzo webhook, small"                    200 "POST /api/v1/webhooks/delivery/borzo fdid=test-fdid" -X POST "${J[@]}" --data '{"event":"x"}' "$W/delivery/borzo"
check "pidge webhook, small"                    200 "POST /api/v1/webhooks/delivery/pidge fdid=test-fdid" -X POST "${J[@]}" --data '{"event":"x"}' "$W/delivery/pidge"
check "pidge webhook, 20000 bytes"              200 "integration-standin" -X POST "${J[@]}" --data-binary @"$OUT/mid" "$W/delivery/pidge"
check "other webhook, 300000 bytes (catch-all)" 200 "POST /api/v1/webhooks/payments/razorpay" -X POST "${J[@]}" --data-binary @"$OUT/big" "$W/payments/razorpay"
check "borzo GET (catch-all, as before)"        200 "GET /api/v1/webhooks/delivery/borzo" "$W/delivery/borzo"
check "sample @op21 route"                      200 "GET /api/v1/rider/me" "${B[@]}" "$BASE/api/v1/rider/me/"
check "ring receipt, shift credential"          200 "POST /api/v1/rider/offers/abc-123/rang fdid=test-fdid shift=cred-1" -X POST "${J[@]}" "${S[@]}" --data '{"channel":"FCM","ageMs":5}' "$R/"
check "ring receipt, Bearer"                    200 "private, no-store" -X POST "${J[@]}" "${B[@]}" --data '{}' "$R"
check "ring receipt, no credential"             401 "AUTHENTICATION_REQUIRED" -X POST "${J[@]}" --data '{}' "$R"
check "ring receipt, 20000 bytes"               413 - -X POST "${J[@]}" "${S[@]}" --data-binary @"$OUT/mid" "$R"
check "GET settings (shift credential dropped)" 200 "GET /api/v1/admin/fleet/courier-billing/settings fdid=test-fdid shift= " "${B[@]}" "${S[@]}" "$C/settings"
check "PUT settings/{courier}"                  200 "PUT /api/v1/admin/fleet/courier-billing/settings/PIDGE?x=1" -X PUT "${J[@]}" "${B[@]}" --data '{}' "$C/settings/PIDGE/?x=1"
check "GET invoices"                            200 "X-Frame-Options: DENY" "${B[@]}" "$C/invoices"
check "POST invoices"                           200 "POST /api/v1/admin/fleet/courier-billing/invoices " -X POST "${J[@]}" "${B[@]}" --data '{}' "$C/invoices"
check "GET invoices/{importId}"                 200 "no-store, no-cache, must-revalidate" "${B[@]}" "$C/invoices/42"
check "admin route without Bearer"              401 "AUTHENTICATION_REQUIRED" "$C/settings"

echo "== $fails failed"
[[ $fails -eq 0 ]]
