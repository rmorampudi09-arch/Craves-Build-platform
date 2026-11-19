#!/usr/bin/env bash
# Runs fix-program.caddy in stock caddy:2.10 against a stand-in integration upstream and checks every route.
# Needs Docker, curl and jq. Starts and removes only its own containers and network (names start with caddy-fixtest).
# Usage: bash infra/caddy/test/run-test.sh   (from anywhere; PORT=18000 by default, published on loopback only)
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
docker run --rm "${mounts[@]}" "$IMAGE" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 \
  | grep -x 'Valid configuration' || { echo "FAIL: caddy validate"; exit 1; }
echo "== caddy adapt: every path matcher in the order Caddy tries them (the same command as README step 5)"
docker run --rm "${mounts[@]}" "$IMAGE" caddy adapt --config /etc/caddy/Caddyfile --adapter caddyfile 2>/dev/null \
  | jq -r '.. | objects | select(has("match")) | .match[] | (.path_regexp | select(.) | "\(.name) \(.pattern)") // ((.path // empty) | "path " + join(" "))' \
  | tee "$OUT/order"
# All eight fix routes first, then the house routes (@op21, the @op456 catch-all).
[[ $(head -8 "$OUT/order" | grep -c '^fix_') == 8 && $(sed -n 9p "$OUT/order") == op21* ]] || { echo "FAIL: route order"; exit 1; }

docker network create "$NET" >/dev/null
docker run -d --name "$UP" --network "$NET" --network-alias integration \
  -v "$HERE/upstream.Caddyfile:/etc/caddy/Caddyfile:ro" "$IMAGE" >/dev/null
docker run -d --name "$GW" --network "$NET" -p "127.0.0.1:$PORT:8000" "${mounts[@]}" "$IMAGE" >/dev/null
for _ in $(seq 30); do curl -s -o /dev/null "$BASE/" && break; sleep 0.5; done

head -c 300000 /dev/zero | tr '\0' a > "$OUT/big"     # over 262144
head -c 20000 /dev/zero | tr '\0' a > "$OUT/mid"      # over 16384, under 262144
head -c 1100000 /dev/zero | tr '\0' a > "$OUT/huge"   # over 1048576
head -c 600000 /dev/zero | tr '\0' a > "$OUT/csv"     # under 1048576
fails=0
# check <name> <expected status> <needles> <curl args...>
# needles: '-' for none, else texts separated by ';;' that must appear in the response headers or body;
# a needle starting with '!' must NOT appear. The stand-in upstream echoes "<method> <uri> fdid=… cip=… shift=… body=…".
check() {
  local name=$1 want=$2 needles=$3 needle got ok=PASS; shift 3
  got=$(curl -s -D "$OUT/h" -o "$OUT/b" -w '%{http_code}' "$@" || true)
  [[ "$got" == "$want" ]] || ok=FAIL
  while [[ "$needles" != - && -n "$needles" ]]; do
    needle=${needles%%;;*}
    if [[ $needle == !* ]]; then grep -qF -- "${needle#!}" "$OUT/h" "$OUT/b" && ok=FAIL
    else grep -qF -- "$needle" "$OUT/h" "$OUT/b" || ok=FAIL; fi
    [[ $needles == *';;'* ]] && needles=${needles#*;;} || needles=
  done
  [[ $ok == PASS ]] || fails=$((fails + 1))
  printf '%s %s (want %s) %s | %s\n' "$ok" "$got" "$want" "$name" "$(head -c 100 "$OUT/b" | tr -d '\n')"
}
J=(-H 'Content-Type: application/json')
B=(-H 'Authorization: Bearer test-token')
S=(-H 'X-Craves-Shift-Credential: cred-1')
W="$BASE/api/v1/webhooks"
R="$BASE/api/v1/rider/offers/abc-123/rang"
C="$BASE/api/v1/admin/fleet/courier-billing"
UPSTREAM="integration-standin"
check "borzo webhook, 300000 bytes"             413 "!$UPSTREAM" -X POST "${J[@]}" --data-binary @"$OUT/big" "$W/delivery/borzo"
check "pidge webhook, 300000 bytes"             413 "!$UPSTREAM" -X POST "${J[@]}" --data-binary @"$OUT/big" "$W/delivery/pidge"
check "pidge webhook, 300000 bytes, chunked"    413 "!$UPSTREAM" -X POST "${J[@]}" -H 'Transfer-Encoding: chunked' --data-binary @"$OUT/big" "$W/delivery/pidge"
check "borzo webhook, small"                    200 "POST /api/v1/webhooks/delivery/borzo fdid=test-fdid" -X POST "${J[@]}" --data '{"event":"x"}' "$W/delivery/borzo"
check "pidge webhook, small"                    200 "POST /api/v1/webhooks/delivery/pidge fdid=test-fdid" -X POST "${J[@]}" --data '{"event":"x"}' "$W/delivery/pidge"
check "pidge webhook, 20000 bytes"              200 "POST /api/v1/webhooks/delivery/pidge " -X POST "${J[@]}" --data-binary @"$OUT/mid" "$W/delivery/pidge"
check "client X-Azure-* headers replaced"       200 "fdid=test-fdid;;!spoofed" -X POST "${J[@]}" -H 'X-Azure-FDID: spoofed' -H 'X-Azure-ClientIP: spoofed' --data '{}' "$W/delivery/borzo"
check "other webhook, 300000 bytes (catch-all)" 200 "POST /api/v1/webhooks/payments/razorpay " -X POST "${J[@]}" --data-binary @"$OUT/big" "$W/payments/razorpay"
check "borzo GET (catch-all, as before)"        200 "GET /api/v1/webhooks/delivery/borzo " "$W/delivery/borzo"
check "sample @op21 route"                      200 "GET /api/v1/rider/me " "${B[@]}" "$BASE/api/v1/rider/me/"
check "ring receipt, shift credential"          200 "POST /api/v1/rider/offers/abc-123/rang fdid=test-fdid;;shift=cred-1 " -X POST "${J[@]}" "${S[@]}" --data '{"channel":"FCM","ageMs":5}' "$R/"
check "ring receipt, Bearer"                    200 "POST /api/v1/rider/offers/abc-123/rang ;;private, no-store" -X POST "${J[@]}" "${B[@]}" --data '{}' "$R"
check "ring receipt, no credential"             401 "AUTHENTICATION_REQUIRED;;!$UPSTREAM" -X POST "${J[@]}" --data '{}' "$R"
check "ring receipt, empty credential"          401 "AUTHENTICATION_REQUIRED;;!$UPSTREAM" -X POST "${J[@]}" -H 'X-Craves-Shift-Credential;' --data '{}' "$R"
# curl drops a header whose value is only spaces, so send that one raw.
raw=$(exec 3<>"/dev/tcp/localhost/$PORT"
  printf 'POST /api/v1/rider/offers/abc-123/rang HTTP/1.1\r\nHost: localhost\r\nX-Craves-Shift-Credential:    \t \r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}' >&3
  cat <&3)
if [[ $raw == "HTTP/1.1 401"* && $raw == *AUTHENTICATION_REQUIRED* && $raw != *"$UPSTREAM"* ]]; then ok=PASS; else ok=FAIL; fails=$((fails + 1)); fi
printf '%s %s (want 401) ring receipt, whitespace-only credential (raw request)\n' "$ok" "$(head -1 <<<"$raw" | cut -d' ' -f2)"
check "ring receipt, 20000 bytes"               413 "!$UPSTREAM" -X POST "${J[@]}" "${S[@]}" --data-binary @"$OUT/mid" "$R"
check "ring receipt, offerId %252e%252e"        200 "!$UPSTREAM;;!/rang" -X POST "${J[@]}" "${S[@]}" --data '{}' "$BASE/api/v1/rider/offers/%252e%252e/rang"
check "GET settings (shift credential dropped)" 200 "GET /api/v1/admin/fleet/courier-billing/settings fdid=test-fdid;;shift= body" "${B[@]}" "${S[@]}" "$C/settings"
check "PUT settings/{courier}"                  200 "PUT /api/v1/admin/fleet/courier-billing/settings/pidge?x=1 " -X PUT "${J[@]}" "${B[@]}" --data '{}' "$C/settings/pidge/?x=1"
check "GET invoices"                            200 "GET /api/v1/admin/fleet/courier-billing/invoices ;;X-Frame-Options: DENY" "${B[@]}" "$C/invoices"
check "POST invoices"                           200 "POST /api/v1/admin/fleet/courier-billing/invoices " -X POST "${J[@]}" "${B[@]}" --data '{}' "$C/invoices"
check "POST invoices, 1100000 bytes"            413 "!$UPSTREAM" -X POST "${J[@]}" "${B[@]}" --data-binary @"$OUT/huge" "$C/invoices"
check "POST invoices, 600000 bytes"             200 "POST /api/v1/admin/fleet/courier-billing/invoices " -X POST "${J[@]}" "${B[@]}" --data-binary @"$OUT/csv" "$C/invoices"
check "GET invoices/{importId}"                 200 "GET /api/v1/admin/fleet/courier-billing/invoices/42 ;;no-store, no-cache, must-revalidate" "${B[@]}" "$C/invoices/42"
check "admin route without Bearer"              401 "AUTHENTICATION_REQUIRED;;!$UPSTREAM" "$C/settings"

echo "== $fails failed"
[[ $fails -eq 0 ]]
