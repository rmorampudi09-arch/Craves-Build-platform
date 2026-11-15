#!/usr/bin/env bash
# Offline check of apply-browse-5k.sh against a fake `az`: bash infra/autoscale/test-apply-browse-5k.sh
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin" "$work/apps" "$work/rev"

# Fake az. Like Azure: the app shows value "" next to a secret reference, a revision shows none; `containerapp update`
# changes the app template and creates a revision from it. Writes are logged.
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
  "containerapp update"*)
    app=$(arg -n "$@"); sfx=$(arg --revision-suffix "$@"); envs=()
    seen=0; for a in "$@"; do
      case "$a" in --set-env-vars) seen=1; continue ;; -*) seen=0 ;; esac
      [ "$seen" = 1 ] && envs+=("$a")
    done
    echo "UPDATE $app $(arg --min-replicas "$@")-$(arg --max-replicas "$@") ${envs[*]}" >>"$W/log"
    pairs=$(printf '%s\n' "${envs[@]}" | jq -R 'split("=") | {name: .[0], value: (.[1:] | join("="))}' | jq -s .)
    jq --argjson min "$(arg --min-replicas "$@")" --argjson max "$(arg --max-replicas "$@")" --argjson p "$pairs" \
       --arg drift "${FAKE_DRIFT:-}" '
      .properties.template.scale.minReplicas = $min | .properties.template.scale.maxReplicas = $max
      | .properties.template.containers[0].env |= ([.[] | select(.name as $n | $p | map(.name) | index($n) | not)] + $p)
      | if $drift == "" then . else .properties.template.containers[0].env += [{name: $drift, value: "x"}] end' \
      "$W/apps/$app.json" >"$W/apps/$app.json.new"
    mv "$W/apps/$app.json.new" "$W/apps/$app.json"
    jq '.properties.template.containers[0].env |= map(if .secretRef then del(.value) else . end)
        | .properties.template.scale.rules |= map(del(.tcp))' "$W/apps/$app.json" >"$W/rev/$app--$sfx.json" ;;
  "containerapp revision show"*)
    if [[ "$args" == *"runningState"* ]]; then printf '%s\n' "${FAKE_STATE:-Running	Healthy}"
    else cat "$W/rev/$(arg --revision "$@").json"; fi ;;
  "containerapp ingress traffic set"*) w=${args##*--revision-weight }; echo "TRAFFIC $(arg -n "$@") ${w% -o none}" >>"$W/log" ;;
  "containerapp revision deactivate"*) echo "DEACTIVATE $(arg --revision "$@")" >>"$W/log" ;;
  *) echo "fake az: unexpected: $args" >&2; exit 9 ;;
esac
FAKE
chmod +x "$work/bin/az"

app() { # name min max [traffic-json] [extra-env-json]: the app and its live revision X--b1
  local t=${4:-'[{"revisionName":"X--b1","weight":100,"latestRevision":false}]'}
  jq -n --arg n "$1" --argjson min "$2" --argjson max "$3" --argjson t "${t//X/$1}" --argjson extra "${5:-[]}" \
    '{name: $n, resourceGroup: ("rg-" + $n),
      properties: {configuration: {ingress: {traffic: $t}},
        template: {containers: [{name: "main", image: "cr/x:1",
                                 env: ([{name: "A", value: "1"}, {name: "S", secretRef: "s", value: ""}] + $extra)}],
                   scale: {minReplicas: $min, maxReplicas: $max, rules: [
                     {name: "http", http: {metadata: {concurrentRequests: "50"}}, tcp: null},
                     {name: "cpu", custom: {type: "cpu", metadata: {type: "Utilization", value: "70"}}, tcp: null}]}}}}' \
    >"$work/apps/$1.json"
  jq '.properties.template.containers[0].env |= map(if .secretRef then del(.value) else . end)' "$work/apps/$1.json" >"$work/rev/$1--b1.json"
}
reset() { rm -f "$work"/rev/*; for n in ca-craves-user-chef-prod ca-craves-integration-prod ca-craves-catalog-prod; do app "$n" 2 20; done; }
run() { : >"$work/log"; PATH="$work/bin:$PATH" FAKE_WORK="$work" CANARY_SECONDS=0 POLL_SECONDS=0 HEALTH_TIMEOUT_SECONDS=0 \
  bash "$here/apply-browse-5k.sh" "$@"; }
fail() { echo "FAIL: $*"; echo "--- log"; cat "$work/log"; exit 1; }
writes() { grep -cE '^(UPDATE|TRAFFIC|DEACTIVATE)' "$work/log" || true; }
ours='SERVER_SHUTDOWN=graceful SPRING_LIFECYCLE_TIMEOUTPERSHUTDOWNPHASE=20s'

# 1. Plan writes nothing and shows each change.
reset; out=$(run plan)
[ "$(writes)" = 0 ] || fail "plan wrote something"
grep -q 'ca-craves-catalog-prod: replicas 2-20 -> 4-20; set SERVER_SHUTDOWN=graceful SPRING_DATASOURCE_HIKARI_MAX_POOL_SIZE=8 SPRING_LIFECYCLE_TIMEOUTPERSHUTDOWNPHASE=20s' <<<"$out" || fail "plan line for catalog: $out"
grep -q "ca-craves-integration-prod: replicas 2-20 -> 4-20; set $ours\$" <<<"$out" || fail "plan line for integration: $out"

# 2. Writes need the confirmation.
if run apply ca-craves-catalog-prod >/dev/null 2>&1; then fail "apply ran without CONFIRM_AUTOSCALE_WRITE"; fi

# 3. One app rolls out like a release, with only our settings changed (secret references compare as equal).
reset; CONFIRM_AUTOSCALE_WRITE=true run apply ca-craves-catalog-prod >/dev/null
new=$(basename "$(ls "$work"/rev/ca-craves-catalog-prod--cap*.json)" .json)
[ "$(grep -E '^(UPDATE|TRAFFIC|DEACTIVATE)' "$work/log")" = "UPDATE ca-craves-catalog-prod 4-20 $ours SPRING_DATASOURCE_HIKARI_MAX_POOL_SIZE=8
TRAFFIC ca-craves-catalog-prod $new=10 ca-craves-catalog-prod--b1=90
TRAFFIC ca-craves-catalog-prod $new=100
DEACTIVATE ca-craves-catalog-prod--b1" ] || fail "rollout order"

# 4. Integration keeps its own pool size.
reset; CONFIRM_AUTOSCALE_WRITE=true run apply ca-craves-integration-prod >/dev/null
grep '^UPDATE' "$work/log" | grep -q HIKARI && fail "integration pool changed"

# 5. A new revision that is not healthy never gets traffic and is switched off.
reset; if FAKE_STATE=$'Failed\tUnhealthy' CONFIRM_AUTOSCALE_WRITE=true run apply ca-craves-user-chef-prod >/dev/null 2>&1; then fail "unhealthy revision went ahead"; fi
grep -q '^TRAFFIC' "$work/log" && fail "traffic moved to an unhealthy revision"
grep -q '^DEACTIVATE ca-craves-user-chef-prod--cap' "$work/log" || fail "unhealthy revision left running"

# 6. Any other setting changing on the way stops before traffic moves.
reset; if FAKE_DRIFT=OTHER CONFIRM_AUTOSCALE_WRITE=true run apply ca-craves-user-chef-prod >/dev/null 2>&1; then fail "drift went ahead"; fi
grep -q '^TRAFFIC' "$work/log" && fail "traffic moved despite drift"

# 7. After a stopped run the app template already has our settings; the live revision does not, so it rolls out again.
reset; FAKE_DRIFT=OTHER CONFIRM_AUTOSCALE_WRITE=true run apply ca-craves-user-chef-prod >/dev/null 2>&1 || true
jq '.properties.template.containers[0].env |= map(select(.name != "OTHER"))' "$work/apps/ca-craves-user-chef-prod.json" >"$work/x" \
  && mv "$work/x" "$work/apps/ca-craves-user-chef-prod.json"
CONFIRM_AUTOSCALE_WRITE=true run apply ca-craves-user-chef-prod >/dev/null
grep -q '^TRAFFIC ca-craves-user-chef-prod ca-craves-user-chef-prod--cap[0-9]*=100$' "$work/log" || fail "second attempt did not roll out"

# 8. Split traffic stops before any write.
reset; app ca-craves-catalog-prod 2 20 '[{"revisionName":"X--b1","weight":90},{"revisionName":"X--b2","weight":10}]'
if CONFIRM_AUTOSCALE_WRITE=true run apply ca-craves-catalog-prod >/dev/null 2>&1; then fail "split traffic went ahead"; fi
[ "$(writes)" = 0 ] || fail "wrote despite split traffic"

# 9. An app already done is left alone, and nothing is lowered.
reset; app ca-craves-catalog-prod 6 30 '' \
  '[{"name":"SERVER_SHUTDOWN","value":"graceful"},{"name":"SPRING_LIFECYCLE_TIMEOUTPERSHUTDOWNPHASE","value":"20s"},{"name":"SPRING_DATASOURCE_HIKARI_MAX_POOL_SIZE","value":"8"}]'
CONFIRM_AUTOSCALE_WRITE=true run apply ca-craves-catalog-prod >/dev/null
[ "$(writes)" = 0 ] || fail "touched an app that needed nothing"
reset; app ca-craves-user-chef-prod 2 30
CONFIRM_AUTOSCALE_WRITE=true run apply ca-craves-user-chef-prod >/dev/null
grep -q '^UPDATE ca-craves-user-chef-prod 4-30 ' "$work/log" || fail "max lowered"

echo "OK: apply-browse-5k.sh passed 9 checks"
