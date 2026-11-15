#!/usr/bin/env bash
# Offline check of apply-autoscale.sh against a fake `az`: bash infra/autoscale/test-apply-autoscale.sh
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin" "$work/apps"

# Fake az: answers from fixtures in $work/apps, logs every write to $work/log.
cat >"$work/bin/az" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail
W=${FAKE_WORK:?}
args="$*"
arg() { local want=$1; shift; while [ $# -gt 0 ]; do [ "$1" = "$want" ] && { echo "$2"; return; }; shift; done; }
case "$args" in
  "account set"*) ;;
  "containerapp list"*)
    name=$(sed -n "s/.*\[?name=='\([^']*\)'\].*/\1/p" <<<"$args")
    if [ -f "$W/apps/$name.json" ]; then cat "$W/apps/$name.json"; else echo null; fi ;;
  "rest --method patch"*) echo "PATCH $(arg --url "$@") $(arg --body "$@")" >>"$W/log" ;;
  "rest --method put"*) echo "PUT $(arg --url "$@") $(arg --body "$@")" >>"$W/log" ;;
  "containerapp revision show"*)
    if [[ "$args" == *"runningState"* ]]; then printf '%s\n' "${FAKE_STATE:-Running	Healthy}"
    else grep '^PATCH' "$W/log" | tail -1 | cut -d' ' -f3- | jq -r '.properties.template.scale.rules[].name'; fi ;;
  "containerapp ingress traffic set"*) w=${args##*--revision-weight }; echo "TRAFFIC $(arg -n "$@") ${w% -o none}" >>"$W/log" ;;
  "containerapp revision deactivate"*) echo "DEACTIVATE $(arg --revision "$@")" >>"$W/log" ;;
  "containerapp revision activate"*) echo "ACTIVATE $(arg --revision "$@")" >>"$W/log" ;;
  "apim list"*) printf 'apim\t/subscriptions/s/resourceGroups/rg-shared/providers/Microsoft.ApiManagement/service/apim-x\trg-shared\tcentralindia\tPremium\t1\n' ;;
  "servicebus namespace list"*) printf 'servicebus\t/subscriptions/s/resourceGroups/rg-shared/providers/Microsoft.ServiceBus/namespaces/sb-x\trg-shared\tcentralindia\tPremium\t1\n' ;;
  *) echo "fake az: unexpected: $args" >&2; exit 9 ;;
esac
FAKE
chmod +x "$work/bin/az"

app() { # name min max traffic-json [rules-json]
  local rules=${5:-'[{"name":"http","azureQueue":null,"custom":null,"http":{"auth":null,"metadata":{"concurrentRequests":"50"}},"tcp":null}]'}
  jq -n --arg n "$1" --argjson min "$2" --argjson max "$3" --argjson t "$4" --argjson r "$rules" \
    '{id: ("/subscriptions/s/resourceGroups/rg-" + $n + "/providers/Microsoft.App/containerApps/" + $n),
      name: $n, resourceGroup: ("rg-" + $n),
      properties: {latestReadyRevisionName: ($n + "--b1"),
                   configuration: {ingress: {traffic: $t}},
                   template: {scale: {minReplicas: $min, maxReplicas: $max, cooldownPeriod: 300, pollingInterval: 30, rules: $r}}}}' \
    >"$work/apps/$1.json"
}
one='[{"revisionName":"X--b1","weight":100,"latestRevision":false}]'
for n in ca-craves-admin-prod ca-craves-delivery-intel-prod; do app "$n" 1 3 "${one//X/$n}"; done
for n in ca-craves-referral-members-prod ca-craves-referral-prod ca-craves-advanced-prod ca-craves-notification-prod \
         ca-craves-subscription-prod ca-craves-integration-prod ca-craves-user-chef-prod ca-craves-catalog-prod \
         ca-craves-order-prod ca-craves-auth-prod ca-craves-web-prod; do app "$n" 2 10 "${one//X/$n}"; done
app ca-craves-voice-prod 1 3 "${one//X/ca-craves-voice-prod}"

run() { : >"$work/log"; PATH="$work/bin:$PATH" FAKE_WORK="$work" CANARY_SECONDS=0 POLL_SECONDS=0 HEALTH_TIMEOUT_SECONDS=0 \
  bash "$here/apply-autoscale.sh" "$@"; }
fail() { echo "FAIL: $*"; echo "--- log"; cat "$work/log"; exit 1; }
writes() { grep -cE '^(PATCH|PUT|TRAFFIC|DEACTIVATE|ACTIVATE)' "$work/log" || true; }

# 1. Plan writes nothing and shows the changes.
out=$(run plan)
[ "$(writes)" = 0 ] || fail "plan wrote something"
grep -q 'ca-craves-web-prod: {"min":2,"max":10,"rules":\["http"\]} -> {"min":2,"max":20,"rules":\["cpu","http"\]}' <<<"$out" || fail "plan line for web: $out"
grep -q 'ca-craves-voice-prod: {"min":1,"max":3,"rules":\["http"\]} -> {"min":2,"max":6,"rules":\["cpu","http"\]}' <<<"$out" || fail "plan line for voice"
grep -q 'autoscale 1-2 units' <<<"$out" || fail "plan misses APIM"

# 2. Writes need the confirmation.
if run apps ca-craves-web-prod >/dev/null 2>&1; then fail "apps ran without CONFIRM_AUTOSCALE_WRITE"; fi

# 3. One app rolls out like a release and keeps its HTTP rule.
CONFIRM_AUTOSCALE_WRITE=true run apps ca-craves-web-prod >/dev/null
patch=$(grep '^PATCH' "$work/log" | cut -d' ' -f3-)
[ "$(grep -c '^PATCH' "$work/log")" = 1 ] || fail "expected one PATCH"
jq -e '.properties.template.scale | .minReplicas == 2 and .maxReplicas == 20' <<<"$patch" >/dev/null || fail "min/max: $patch"
jq -e '.properties.template.scale.rules | map(.name) == ["http","cpu"]' <<<"$patch" >/dev/null || fail "rules: $patch"
jq -e '.properties.template.scale.rules[0].http.metadata.concurrentRequests == "50"' <<<"$patch" >/dev/null || fail "http rule changed"
jq -e '.properties.template.scale.rules[1].custom == {type: "cpu", metadata: {type: "Utilization", value: "70"}}' <<<"$patch" >/dev/null || fail "cpu rule"
jq -e '[.. | nulls] | length == 0' <<<"$patch" >/dev/null || fail "nulls sent"
jq -e '.properties | keys == ["template"] and (.template | keys == ["revisionSuffix","scale"])' <<<"$patch" >/dev/null || fail "patch touches more than scale"
suffix=$(jq -r .properties.template.revisionSuffix <<<"$patch")
new="ca-craves-web-prod--$suffix"
expected="TRAFFIC ca-craves-web-prod $new=10 ca-craves-web-prod--b1=90
TRAFFIC ca-craves-web-prod $new=100
DEACTIVATE ca-craves-web-prod--b1"
[ "$(grep -E '^(TRAFFIC|DEACTIVATE)' "$work/log")" = "$expected" ] || fail "rollout order"

# 4. Nothing is lowered: a max above the target stays.
app ca-craves-order-prod 3 30 "${one//X/ca-craves-order-prod}"
CONFIRM_AUTOSCALE_WRITE=true run apps ca-craves-order-prod >/dev/null
grep '^PATCH' "$work/log" | cut -d' ' -f3- | jq -e '.properties.template.scale | .minReplicas == 3 and .maxReplicas == 30' >/dev/null || fail "lowered order"

# 5. An app already done is left alone.
app ca-craves-auth-prod 2 20 "${one//X/ca-craves-auth-prod}" \
  '[{"name":"http","http":{"metadata":{"concurrentRequests":"50"}}},{"name":"cpu","custom":{"type":"cpu","metadata":{"type":"Utilization","value":"70"}}}]'
CONFIRM_AUTOSCALE_WRITE=true run apps ca-craves-auth-prod >/dev/null
[ "$(writes)" = 0 ] || fail "touched an app that needed nothing"

# 6. Split traffic stops before any write.
app ca-craves-catalog-prod 2 10 '[{"revisionName":"c--b1","weight":90},{"revisionName":"c--b2","weight":10}]'
if CONFIRM_AUTOSCALE_WRITE=true run apps ca-craves-catalog-prod >/dev/null 2>&1; then fail "split traffic went ahead"; fi
[ "$(writes)" = 0 ] || fail "wrote despite split traffic"

# 7. A new revision that fails never gets traffic and is switched off.
if FAKE_STATE=$'Failed\tUnhealthy' CONFIRM_AUTOSCALE_WRITE=true run apps ca-craves-user-chef-prod >/dev/null 2>&1; then fail "failed revision went ahead"; fi
grep -q '^TRAFFIC' "$work/log" && fail "traffic moved to a failed revision"
grep -q '^DEACTIVATE ca-craves-user-chef-prod--as' "$work/log" || fail "failed revision left running"

# 8. Capacity autoscale: APIM 1-2 units on Capacity, Service Bus 1-4 messaging units stepping 1-2-4.
CONFIRM_AUTOSCALE_WRITE=true run capacity >/dev/null
apim=$(grep '^PUT .*as-apim-craves-prod' "$work/log" | cut -d' ' -f3-)
sb=$(grep '^PUT .*as-sb-craves-prod' "$work/log" | cut -d' ' -f3-)
jq -e '.properties.profiles[0].capacity == {minimum: "1", maximum: "2", default: "1"}' <<<"$apim" >/dev/null || fail "apim capacity"
jq -e '[.properties.profiles[0].rules[].metricTrigger.metricName] == ["Capacity","Capacity"]' <<<"$apim" >/dev/null || fail "apim rules"
jq -e '.properties.profiles[0].capacity.maximum == "4" and ([.properties.profiles[0].rules[].scaleAction.type] | unique) == ["ServiceAllowedNextValue"]' <<<"$sb" >/dev/null || fail "sb rules"

# 9. Rollback brings the old revision back before moving traffic.
CONFIRM_AUTOSCALE_WRITE=true run rollback ca-craves-web-prod ca-craves-web-prod--b1 ca-craves-web-prod--as1 >/dev/null
[ "$(grep -E '^(ACTIVATE|TRAFFIC|DEACTIVATE)' "$work/log")" = "ACTIVATE ca-craves-web-prod--b1
TRAFFIC ca-craves-web-prod ca-craves-web-prod--b1=100
DEACTIVATE ca-craves-web-prod--as1" ] || fail "rollback order"

echo "OK: apply-autoscale.sh passed 9 checks"
