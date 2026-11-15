#!/usr/bin/env bash
# Browse path sized for 5,000 people browsing at once (about 1,000 requests/s). Read infra/autoscale/README.md.
#
#   bash infra/autoscale/apply-browse-5k.sh                                  plan: prints every change, writes nothing
#   CONFIRM_AUTOSCALE_WRITE=true bash infra/autoscale/apply-browse-5k.sh apply [app ...]
#
# Every public catalog request also asks integration, which asks user-chef, which chefs may sell
# (docs/finance/CATALOG_SELLING_ELIGIBILITY.md), so the three grow together. Each app rolls out like
# apply-autoscale.sh: new revision -> Healthy -> 10 % for 2 min -> 100 % -> old revision deactivated. The new
# revision is compared with the one serving traffic: same image, scale rules and other settings, or traffic stays.
# Rollback: CONFIRM_AUTOSCALE_WRITE=true bash infra/autoscale/apply-autoscale.sh rollback <app> <old> <new>
set -euo pipefail

SUB=${AUTOSCALE_SUBSCRIPTION:-34eefd95-1a19-416f-b9df-92b326500615}
CANARY_SECONDS=${CANARY_SECONDS:-120}
HEALTH_TIMEOUT_SECONDS=${HEALTH_TIMEOUT_SECONDS:-900}
POLL_SECONDS=${POLL_SECONDS:-15}

# app, min replicas, max replicas, DB connections per replica ("-" keeps the app's default).
# Load test 15 Nov: with 2 connections per replica (sized for the old ~50-connection server) these apps queue at
# under 30 % CPU. Worst case at these maximums: business DB about 500 of 1,718 connections, integration DB 160 of 859.
TARGETS='ca-craves-user-chef-prod 4 20 8
ca-craves-integration-prod 4 20 -
ca-craves-catalog-prod 4 20 8'
# Spring Boot 3.3 stops at once on SIGTERM; graceful lets a replica finish its requests before Azure removes it.
COMMON_ENV=(SERVER_SHUTDOWN=graceful SPRING_LIFECYCLE_TIMEOUTPERSHUTDOWNPHASE=20s)

die() { echo "STOP: $*" >&2; exit 1; }
need_write() { [ "${CONFIRM_AUTOSCALE_WRITE:-}" = true ] || die "plan only; set CONFIRM_AUTOSCALE_WRITE=true to change anything"; }

app_json() {
  local json
  json=$(az containerapp list --subscription "$SUB" --query "[?name=='$1'] | [0]" -o json)
  [ -n "$json" ] && [ "$json" != null ] || die "$1: no such container app"
  printf '%s' "$json"
}
rev_json() { az containerapp revision show --subscription "$SUB" -g "$1" -n "$2" --revision "$3" -o json; } # rg app revision

live_revision() { # app-json; the one revision serving traffic, pinned by name
  local app
  app=$(jq -r .name <<<"$1")
  [ "$(jq '.properties.template.containers | length' <<<"$1")" = 1 ] || die "$app: expected exactly one container"
  [ "$(jq '[.properties.configuration.ingress.traffic[]? | select(.weight > 0)] | length' <<<"$1")" = 1 ] \
    || die "$app: traffic is not on exactly one revision; finish that rollout first"
  jq -r '.properties.configuration.ingress.traffic[] | select(.weight > 0) | .revisionName // empty' <<<"$1" | grep . \
    || die "$app: traffic follows the latest revision; pin it to a revision name first"
}

wanted_env() { # pool -> NAME=value lines
  printf '%s\n' "${COMMON_ENV[@]}"
  [ "$1" = - ] || echo "SPRING_DATASOURCE_HIKARI_MAX_POOL_SIZE=$1"
}
# A secret reference wins over value (the app shows value "" next to it, a revision shows none).
env_lines() { jq -r '.properties.template.containers[0].env[]? | if (.secretRef // "") != "" then "\(.name)=@\(.secretRef)" else "\(.name)=\(.value // "")" end' | sort; }
others() { grep -v -E "^($(wanted_env "$1" | cut -d= -f1 | paste -sd'|'))=" || true; } # pool; env lines minus ours
rules() { jq -c '[.properties.template.scale.rules[]?] | sort_by(.name) | walk(if type == "object" then with_entries(select(.value != null)) else . end)'; }
bigger() { echo $(( $1 > $2 ? $1 : $2 )); }
targets() { # live-revision-json min max -> "min max", never lower than now
  echo "$(bigger "$(jq '.properties.template.scale.minReplicas // 0' <<<"$1")" "$2") $(bigger "$(jq '.properties.template.scale.maxReplicas // 0' <<<"$1")" "$3")"
}

plan_app() { # app live-revision-json min max pool; prints the change, returns 0 when one is needed
  local now want missing
  now=$(jq -r '"\(.properties.template.scale.minReplicas // 0) \(.properties.template.scale.maxReplicas // 0)"' <<<"$2")
  want=$(targets "$2" "$3" "$4")
  missing=$(comm -23 <(wanted_env "$5" | sort) <(env_lines <<<"$2") | paste -sd' ')
  if [ "$now" = "$want" ] && [ -z "$missing" ]; then echo "$1: unchanged"; return 1; fi
  echo "$1: replicas ${now/ /-} -> ${want/ /-}; set ${missing:-nothing}"
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

same_except_ours() { # old-revision-json new-revision-json "min max" pool; the new one differs only by what we set
  local a b
  [ "$(jq -r '.properties.template.containers[0].image' <<<"$1")" = "$(jq -r '.properties.template.containers[0].image' <<<"$2")" ] \
    || { echo "image changed"; return 1; }
  [ "$(rules <<<"$1")" = "$(rules <<<"$2")" ] || { echo "scale rules changed"; return 1; }
  [ "$(jq -r '"\(.properties.template.scale.minReplicas) \(.properties.template.scale.maxReplicas)"' <<<"$2")" = "$3" ] \
    || { echo "replicas are not ${3/ /-}"; return 1; }
  a=$(env_lines <<<"$1" | others "$4"); b=$(env_lines <<<"$2" | others "$4")
  [ "$a" = "$b" ] || { echo "other settings changed: $(comm -3 <(echo "$a") <(echo "$b") | cut -d= -f1 | tr -d '\t' | sort -u | paste -sd' ')"; return 1; }
  [ -z "$(comm -23 <(wanted_env "$4" | sort) <(env_lines <<<"$2"))" ] || { echo "new settings missing"; return 1; }
}

traffic() { # rg app revision=weight...
  local rg=$1 app=$2; shift 2
  az containerapp ingress traffic set --subscription "$SUB" -g "$rg" -n "$app" --revision-weight "$@" -o none
}
deactivate() { az containerapp revision deactivate --subscription "$SUB" -g "$1" -n "$2" --revision "$3" -o none; }

apply_app() { # app rg old-revision old-revision-json min max pool
  local app=$1 rg=$2 old=$3 want suffix new rev envs
  want=$(targets "$4" "$5" "$6")
  mapfile -t envs < <(wanted_env "$7")
  suffix="cap$(date -u +%m%d%H%M%S)"
  new="$app--$suffix"

  echo "$app: creating $new (traffic stays on $old)"
  az containerapp update --subscription "$SUB" -g "$rg" -n "$app" --revision-suffix "$suffix" \
    --min-replicas "${want% *}" --max-replicas "${want#* }" --set-env-vars "${envs[@]}" -o none
  if ! wait_healthy "$rg" "$app" "$new" || ! rev=$(rev_json "$rg" "$app" "$new") \
     || ! same_except_ours "$4" "$rev" "$want" "$7"; then
    deactivate "$rg" "$app" "$new" || true
    die "$app: $new is not healthy or not as expected; traffic never left $old"
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

az account set --subscription "$SUB"
mode=${1:-plan}; [ $# -gt 0 ] && shift
case "$mode" in
  plan|apply)
    if [ "$mode" = plan ]; then echo "PLAN ONLY - nothing is changed"; else need_write; fi
    while read -r app lo hi pool; do
      if [ $# -gt 0 ] && ! printf '%s\n' "$@" | grep -qx "$app"; then continue; fi
      json=$(app_json "$app")
      rg=$(jq -r .resourceGroup <<<"$json")
      old=$(live_revision "$json")
      oldrev=$(rev_json "$rg" "$app" "$old")
      if plan_app "$app" "$oldrev" "$lo" "$hi" "$pool" && [ "$mode" = apply ]; then
        apply_app "$app" "$rg" "$old" "$oldrev" "$lo" "$hi" "$pool"
      fi
    done <<<"$TARGETS"
    [ "$mode" = plan ] || echo "ALL DONE"
    ;;
  *) die "unknown command '$mode' (plan | apply [app...])" ;;
esac
