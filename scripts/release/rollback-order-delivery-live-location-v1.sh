#!/usr/bin/env bash
set -euo pipefail
set +x

RG=${1:?resource group required}
APP=${2:?order container app required}
CONFIRM_LIVE_LOCATION_ROLLBACK=${CONFIRM_LIVE_LOCATION_ROLLBACK:-false}

fail(){ echo "ERROR: $*" >&2; exit 1; }
command -v az >/dev/null 2>&1 || fail "Azure CLI is required"
[[ "${CONFIRM_LIVE_LOCATION_ROLLBACK,,}" == "true" ]] \
  || fail "Set CONFIRM_LIVE_LOCATION_ROLLBACK=true to disable exact courier coordinate exposure"

az containerapp update \
  -g "$RG" -n "$APP" \
  --set-env-vars CRAVES_DELIVERY_LIVE_LOCATION_EXPOSURE_ENABLED=false \
  --output none --only-show-errors

echo "SUCCESS: exact courier coordinate exposure is disabled. Stored telemetry and ETA projection are preserved."
