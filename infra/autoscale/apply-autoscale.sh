#!/usr/bin/env bash
# Autoscaling for Craves production (subscription 34eefd95). Read infra/autoscale/README.md first.
#
#   bash infra/autoscale/apply-autoscale.sh                      plan: prints every change, writes nothing
#   CONFIRM_AUTOSCALE_WRITE=true bash infra/autoscale/apply-autoscale.sh apps [app ...]
#   CONFIRM_AUTOSCALE_WRITE=true bash infra/autoscale/apply-autoscale.sh capacity
#   CONFIRM_AUTOSCALE_WRITE=true bash infra/autoscale/apply-autoscale.sh rollback <app> <old-revision> <new-revision>
#
# An app change rolls out like a release (templates/release.yml): new revision -> Healthy -> 10 % for 2 min
# -> 100 % -> old revision deactivated. Min and max replicas only ever go up, and the app's own HTTP rule is
# copied unchanged with a CPU rule added next to it. The first failure stops the run with traffic on the old revision.
set -euo pipefail

SUB=${AUTOSCALE_SUBSCRIPTION:-34eefd95-1a19-416f-b9df-92b326500615}
APP_API=2024-03-01
AUTOSCALE_API=2022-10-01
CPU_PERCENT=70
CANARY_SECONDS=${CANARY_SECONDS:-120}
HEALTH_TIMEOUT_SECONDS=${HEALTH_TIMEOUT_SECONDS:-900}
POLL_SECONDS=${POLL_SECONDS:-15}

# app, min replicas, max replicas. The customer path (web, auth, catalog, order, user-chef) may grow to 20;
# voice keeps a second replica so a restart never drops every live call. Internal tools stay small.
TARGETS='ca-craves-admin-prod 1 3
ca-craves-delivery-intel-prod 1 3
ca-craves-referral-members-prod 2 10
ca-craves-referral-prod 2 10
ca-craves-advanced-prod 2 10
ca-craves-notification-prod 2 10
ca-craves-subscription-prod 2 10
ca-craves-integration-prod 2 10
ca-craves-voice-prod 2 6
ca-craves-user-chef-prod 2 20
ca-craves-catalog-prod 2 20
ca-craves-order-prod 2 20
ca-craves-auth-prod 2 20
ca-craves-web-prod 2 20'

die() { echo "STOP: $*" >&2; exit 1; }
need_write() { [ "${CONFIRM_AUTOSCALE_WRITE:-}" = true ] || die "plan only; set CONFIRM_AUTOSCALE_WRITE=true to change anything"; }

app_json() {
  local json
  json=$(az containerapp list --subscription "$SUB" --query "[?name=='$1'] | [0]" -o json)
  [ -n "$json" ] && [ "$json" != null ] || die "$1: no such container app"
  printf '%s' "$json"
}

# The scale block an app should have: min/max never lowered, every rule except "cpu" kept as it is, CPU rule added.
desired_scale() { # app-json min max
  jq -c --argjson min "$2" --argjson max "$3" --arg cpu "$CPU_PERCENT" '
    .properties.template.scale as $s
    | ([$s.minReplicas // 0, $min] | max) as $lo
    | {minReplicas: $lo,
       maxReplicas: ([$s.maxReplicas // 0, $max, $lo] | max),
       rules: ([($s.rules // [])[] | select(.name != "cpu")]
               + [{name: "cpu", custom: {type: "cpu", metadata: {type: "Utilization", value: $cpu}}}])}
    | walk(if type == "object" then with_entries(select(.value != null)) else . end)' <<<"$1"
}

summary() { jq -c '{min: .minReplicas, max: .maxReplicas, rules: ([.rules[]?.name] | sort)}'; }

plan_app() { # app min max; returns 0 when the app needs a change
  local json cur want
  json=$(app_json "$1")
  cur=$(jq '.properties.template.scale' <<<"$json" | summary)
  want=$(desired_scale "$json" "$2" "$3" | summary)
  if [ "$cur" = "$want" ]; then echo "$1: unchanged $cur"; return 1; fi
  echo "$1: $cur -> $want"
}

wait_healthy() { # rg app revision
  local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS)) state
  while :; do
    state=$(az containerapp revision show --subscription "$SUB" -g "$1" -n "$2" --revision "$3" \
      --query "[properties.runningState, properties.healthState]" -o tsv 2>/dev/null | tr '\t\n' '  ' || true)
    case "$state" in
      "Running Healthy "*|"RunningAtMaxScale Healthy "*) return 0 ;;
      Failed*) echo "$3: $state"; return 1 ;;
    esac
    if [ "$SECONDS" -ge "$deadline" ]; then echo "$3: still '$state'"; return 1; fi
    sleep "$POLL_SECONDS"
  done
}

rules_match() { # rg app revision expected-names
  local names
  names=$(az containerapp revision show --subscription "$SUB" -g "$1" -n "$2" --revision "$3" \
    --query "properties.template.scale.rules[].name" -o tsv | sort | tr '\n' ' ')
  [ "$names" = "$4" ] || { echo "$3: rules are '$names', expected '$4'"; return 1; }
}

traffic() { # rg app revision=weight...
  local rg=$1 app=$2; shift 2
  az containerapp ingress traffic set --subscription "$SUB" -g "$rg" -n "$app" --revision-weight "$@" -o none
}

deactivate() { az containerapp revision deactivate --subscription "$SUB" -g "$1" -n "$2" --revision "$3" -o none; }

apply_app() { # app min max
  local app=$1 json id rg old scale expected suffix new
  json=$(app_json "$app")
  id=$(jq -r .id <<<"$json")
  rg=$(jq -r .resourceGroup <<<"$json")
  [ "$(jq '[.properties.configuration.ingress.traffic[]? | select(.weight > 0)] | length' <<<"$json")" = 1 ] \
    || die "$app: traffic is not on exactly one revision; finish that rollout first"
  old=$(jq -r '.properties.configuration.ingress.traffic[] | select(.weight > 0) | .revisionName // empty' <<<"$json")
  [ -n "$old" ] || old=$(jq -r '.properties.latestReadyRevisionName' <<<"$json")
  scale=$(desired_scale "$json" "$2" "$3")
  expected=$(jq -r '[.rules[].name] | sort | join(" ") + " "' <<<"$scale")
  suffix="as$(date -u +%m%d%H%M%S)"
  new="$app--$suffix"

  echo "$app: creating $new (traffic stays on $old)"
  az rest --method patch --url "https://management.azure.com$id?api-version=$APP_API" \
    --body "$(jq -cn --arg s "$suffix" --argjson scale "$scale" '{properties: {template: {revisionSuffix: $s, scale: $scale}}}')" \
    -o none
  if ! wait_healthy "$rg" "$app" "$new" || ! rules_match "$rg" "$app" "$new" "$expected"; then
    deactivate "$rg" "$app" "$new" || true
    die "$app: $new did not come up healthy with the expected rules; traffic never left $old"
  fi

  traffic "$rg" "$app" "$new=10" "$old=90"
  echo "$app: 10% on $new for ${CANARY_SECONDS}s"
  sleep "$CANARY_SECONDS"
  if ! wait_healthy "$rg" "$app" "$new"; then
    traffic "$rg" "$app" "$old=100"
    deactivate "$rg" "$app" "$new" || true
    die "$app: $new turned unhealthy during the canary; 100% back on $old"
  fi
  traffic "$rg" "$app" "$new=100"
  deactivate "$rg" "$app" "$old"
  echo "$app: DONE 100% on $new. Rollback: CONFIRM_AUTOSCALE_WRITE=true bash infra/autoscale/apply-autoscale.sh rollback $app $old $new"
}

rollback() { # app old-revision new-revision
  local rg
  rg=$(app_json "$1" | jq -r .resourceGroup)
  az containerapp revision activate --subscription "$SUB" -g "$rg" -n "$1" --revision "$2" -o none
  wait_healthy "$rg" "$1" "$2" || die "$1: $2 did not come back healthy; traffic left on $3"
  traffic "$rg" "$1" "$2=100"
  deactivate "$rg" "$1" "$3"
  echo "$1: rolled back to $2"
}

# Azure Monitor autoscale for the gateway (APIM units) and the message bus (Service Bus messaging units).
metric_rule() { # resource-id metric operator threshold window direction action-type cooldown
  jq -cn --arg id "$1" --arg m "$2" --arg op "$3" --argjson t "$4" --arg w "$5" --arg d "$6" --arg ty "$7" --arg c "$8" \
    '{metricTrigger: {metricName: $m, metricResourceUri: $id, timeGrain: "PT1M", statistic: "Average",
                      timeWindow: $w, timeAggregation: "Average", operator: $op, threshold: $t},
      scaleAction: {direction: $d, type: $ty, value: "1", cooldown: $c}}'
}

autoscale_body() { # resource-id location min max rules-json
  jq -cn --arg id "$1" --arg loc "$2" --arg min "$3" --arg max "$4" --argjson rules "$5" \
    '{location: $loc, properties: {enabled: true, targetResourceUri: $id,
      profiles: [{name: "default", capacity: {minimum: $min, maximum: $max, default: $min}, rules: $rules}]}}'
}

capacity_targets() { # prints: kind id rg location sku capacity
  az apim list --subscription "$SUB" --query "[0].['apim', id, resourceGroup, location, sku.name, to_string(sku.capacity)]" -o tsv
  az servicebus namespace list --subscription "$SUB" --query "[0].['servicebus', id, resourceGroup, location, sku.name, to_string(sku.capacity)]" -o tsv
}

capacity() { # plan | apply
  local kind id rg loc sku cap name rules
  while IFS=$'\t' read -r kind id rg loc sku cap; do
    [ "$sku" = Premium ] || die "$kind ${id##*/} is $sku; autoscale here assumes Premium"
    if [ "$kind" = apim ]; then
      name=as-apim-craves-prod
      echo "${id##*/} (APIM Premium, $cap unit now): autoscale 1-2 units; +1 when Capacity > 70% for 10 min, -1 when < 30% for 30 min"
      rules=$(jq -cs . <(metric_rule "$id" Capacity GreaterThan 70 PT10M Increase ChangeCount PT60M) \
                        <(metric_rule "$id" Capacity LessThan 30 PT30M Decrease ChangeCount PT60M))
      body=$(autoscale_body "$id" "$loc" 1 2 "$rules")
    else
      name=as-sb-craves-prod
      echo "${id##*/} (Service Bus Premium, $cap messaging unit now): autoscale 1-4 units; next step up when CPU > 75% or memory > 60% for 10 min, down when CPU < 25% and memory < 30% for 30 min"
      rules=$(jq -cs . <(metric_rule "$id" NamespaceCpuUsage GreaterThan 75 PT10M Increase ServiceAllowedNextValue PT5M) \
                        <(metric_rule "$id" NamespaceMemoryUsage GreaterThan 60 PT10M Increase ServiceAllowedNextValue PT5M) \
                        <(metric_rule "$id" NamespaceCpuUsage LessThan 25 PT30M Decrease ServiceAllowedNextValue PT35M) \
                        <(metric_rule "$id" NamespaceMemoryUsage LessThan 30 PT30M Decrease ServiceAllowedNextValue PT35M))
      body=$(autoscale_body "$id" "$loc" 1 4 "$rules")
    fi
    if [ "$1" = apply ]; then
      az rest --method put \
        --url "https://management.azure.com/subscriptions/$SUB/resourceGroups/$rg/providers/Microsoft.Insights/autoscalesettings/$name?api-version=$AUTOSCALE_API" \
        --body "$body" -o none
      echo "  $name saved"
    fi
  done < <(capacity_targets)
}

az account set --subscription "$SUB"
case "${1:-plan}" in
  plan)
    echo "PLAN ONLY - nothing is changed"
    while read -r app lo hi; do plan_app "$app" "$lo" "$hi" || true; done <<<"$TARGETS"
    capacity plan
    ;;
  apps)
    need_write; shift
    while read -r app lo hi; do
      if [ $# -gt 0 ] && ! printf '%s\n' "$@" | grep -qx "$app"; then continue; fi
      if plan_app "$app" "$lo" "$hi"; then apply_app "$app" "$lo" "$hi"; fi
    done <<<"$TARGETS"
    echo "ALL DONE"
    ;;
  capacity) need_write; capacity apply; echo "ALL DONE" ;;
  rollback) need_write; [ $# -eq 4 ] || die "usage: rollback <app> <old-revision> <new-revision>"; rollback "$2" "$3" "$4" ;;
  *) die "unknown command '$1' (plan | apps [app...] | capacity | rollback <app> <old> <new>)" ;;
esac
