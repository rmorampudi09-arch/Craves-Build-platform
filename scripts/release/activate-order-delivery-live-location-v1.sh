#!/usr/bin/env bash
set -euo pipefail
set +x

RG=${1:?resource group required}
APP=${2:?order container app required}
MAX_AGE_SECONDS=${3:-300}
CONFIRM_LIVE_LOCATION_ACTIVATION=${CONFIRM_LIVE_LOCATION_ACTIVATION:-false}

fail(){ echo "ERROR: $*" >&2; exit 1; }
for tool in az jq curl; do command -v "$tool" >/dev/null 2>&1 || fail "$tool is required"; done
[[ "${CONFIRM_LIVE_LOCATION_ACTIVATION,,}" == "true" ]] \
  || fail "Set CONFIRM_LIVE_LOCATION_ACTIVATION=true after sandbox privacy/accuracy smoke tests"
[[ "$MAX_AGE_SECONDS" =~ ^[0-9]+$ ]] || fail "MAX_AGE_SECONDS must be numeric"
(( MAX_AGE_SECONDS >= 30 && MAX_AGE_SECONDS <= 3600 )) \
  || fail "MAX_AGE_SECONDS must be between 30 and 3600"

app_json(){ az containerapp show -g "$RG" -n "$APP" -o json --only-show-errors; }
value_of(){
  local json=$1 name=$2
  jq -r --arg name "$name" '[.properties.template.containers[0].env[]? | select(.name == $name)][0].value // ""' <<<"$json"
}

BEFORE=$(app_json)
FQDN=$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$BEFORE")
LATEST=$(jq -r '.properties.latestRevisionName // ""' <<<"$BEFORE")
READY=$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$BEFORE")
RUNNING=$(jq -r '.properties.runningStatus // ""' <<<"$BEFORE")
[[ -n "$FQDN" && "$LATEST" == "$READY" && "$RUNNING" == "Running" ]] \
  || fail "Order Service must be Running with its latest revision Ready"
curl -sS --fail --max-time 30 "https://$FQDN/actuator/health" >/dev/null

CURRENT=$(value_of "$BEFORE" CRAVES_DELIVERY_LIVE_LOCATION_EXPOSURE_ENABLED)
CURRENT_MAX_AGE=$(value_of "$BEFORE" CRAVES_DELIVERY_LIVE_LOCATION_MAX_AGE_SECONDS)
if [[ "${CURRENT,,}" == "true" && "${CURRENT_MAX_AGE:-300}" == "$MAX_AGE_SECONDS" ]]; then
  echo "Live delivery location is already active with the requested max age: PASS"
  exit 0
fi
[[ -z "$CURRENT" || "${CURRENT,,}" == "false" ]] \
  || fail "Unexpected current CRAVES_DELIVERY_LIVE_LOCATION_EXPOSURE_ENABLED=$CURRENT"

az containerapp update \
  -g "$RG" -n "$APP" \
  --set-env-vars \
    CRAVES_DELIVERY_LIVE_LOCATION_EXPOSURE_ENABLED=true \
    CRAVES_DELIVERY_LIVE_LOCATION_MAX_AGE_SECONDS="$MAX_AGE_SECONDS" \
  --no-wait -o none --only-show-errors

for ATTEMPT in $(seq 1 60); do
  AFTER=$(app_json)
  LATEST=$(jq -r '.properties.latestRevisionName // ""' <<<"$AFTER")
  READY=$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$AFTER")
  RUNNING=$(jq -r '.properties.runningStatus // ""' <<<"$AFTER")
  ENABLED=$(value_of "$AFTER" CRAVES_DELIVERY_LIVE_LOCATION_EXPOSURE_ENABLED)
  AGE=$(value_of "$AFTER" CRAVES_DELIVERY_LIVE_LOCATION_MAX_AGE_SECONDS)
  if [[ -n "$LATEST" && "$LATEST" == "$READY" && "$RUNNING" == "Running" \
        && "${ENABLED,,}" == "true" && "$AGE" == "$MAX_AGE_SECONDS" ]]; then
    curl -sS --fail --max-time 30 "https://$FQDN/actuator/health" >/dev/null
    echo "SUCCESS: live delivery location exposure activated; maxAgeSeconds=$MAX_AGE_SECONDS"
    exit 0
  fi
  sleep 10
done

fail "Order Service did not become Ready after live-location activation; run the rollback script"
