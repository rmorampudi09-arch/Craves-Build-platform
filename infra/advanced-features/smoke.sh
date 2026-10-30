#!/usr/bin/env bash
# Live smoke test through the public gateway. Without a token: every user/admin route must answer 401 from the gateway
# (proves the route exists and is protected), public routes must answer from the service. With TOKEN=<customer access
# token> it also runs a food-list round trip. Usage: bash smoke.sh [routes.txt]
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROUTES=${1:-$HERE/../apim/advanced-features/routes.txt}
API=${API:-https://api.craves.in}
fail=0; pass=0
check() { # name expected-status-regex actual
  if [[ "$3" =~ ^($2)$ ]]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL $1: got $3, want $2"; fi
}
declare -A paths
while IFS='|' read -r kind a b c d e; do
  [ "$kind" = api ] && paths[$a]=$b
done < <(grep -v '^#' "$ROUTES")
while IFS='|' read -r kind api op method template policy; do
  [ "$kind" = route ] || continue
  url="$API/${paths[$api]}${template%/}"
  url=$(sed -E 's#\{[A-Za-z]+\}#00000000-0000-4000-8000-000000000000#g' <<<"$url")
  body=$(curl -s -w '\n%{http_code}' -X "$method" -H 'Content-Type: application/json' --data '{}' "$url")
  status=${body##*$'\n'}; body=${body%$'\n'*}
  case "$policy" in
    user|admin) check "$method $url" 401 "$status" ;;
    # A public route must be answered by the service itself (200, or its own error envelope with a code), not by the gateway.
    public) if [ "$status" = 200 ] || grep -q '"code"' <<<"$body"; then check "$method $url" '200|400|404' "$status"; \
            else check "$method $url (service envelope)" 'service' "gateway-$status"; fi ;;
  esac
done < <(grep '^route|' "$ROUTES")
features=$(curl -s "$API/api/v1/advanced/features")
echo "Features: $features"
grep -q '"food-lists"' <<<"$features" && pass=$((pass+1)) || { fail=$((fail+1)); echo "FAIL features list"; }
if [ -n "${TOKEN:-}" ]; then
  auth=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json')
  name="Smoke $(date +%s)"
  id=$(curl -s "${auth[@]}" -X POST "$API/api/v1/food-lists" --data "{\"name\":\"$name\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
  check "create list" '[0-9a-f-]{36}' "$id"
  check "read list" 200 "$(curl -s -o /dev/null -w '%{http_code}' "${auth[@]}" "$API/api/v1/food-lists/$id")"
  check "delete list" 204 "$(curl -s -o /dev/null -w '%{http_code}' "${auth[@]}" -X DELETE "$API/api/v1/food-lists/$id")"
fi
echo "Smoke: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
