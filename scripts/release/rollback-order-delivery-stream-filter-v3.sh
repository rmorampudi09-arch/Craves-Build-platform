#!/usr/bin/env bash
set -euo pipefail
set +x

RG=${1:?resource group required}
NS=${2:?service bus namespace required}
TOPIC=${3:?topic name required}
SUB=${4:?subscription name required}
CONFIRM_TELEMETRY_FILTER_ROLLBACK=${CONFIRM_TELEMETRY_FILTER_ROLLBACK:-false}

RULE=${DELIVERY_RULE_NAME:-delivery-status-changed-only}
STATUS_ONLY_FILTER="eventType = 'DELIVERY_STATUS_CHANGED' OR event_type = 'DELIVERY_STATUS_CHANGED'"
TELEMETRY_FILTER="eventType = 'DELIVERY_STATUS_CHANGED' OR event_type = 'DELIVERY_STATUS_CHANGED' OR eventType = 'DELIVERY_TELEMETRY_UPDATED' OR event_type = 'DELIVERY_TELEMETRY_UPDATED'"

fail(){ echo "ERROR: $*" >&2; exit 1; }
command -v az >/dev/null 2>&1 || fail "Azure CLI is required"
[[ "${CONFIRM_TELEMETRY_FILTER_ROLLBACK,,}" == "true" ]] \
  || fail "Set CONFIRM_TELEMETRY_FILTER_ROLLBACK=true to stop new telemetry delivery to Order Service"

CURRENT=$(az servicebus topic subscription rule show \
  --resource-group "$RG" \
  --namespace-name "$NS" \
  --topic-name "$TOPIC" \
  --subscription-name "$SUB" \
  --name "$RULE" \
  --query 'sqlFilter.sqlExpression' \
  --output tsv \
  --only-show-errors)

if [[ "$CURRENT" == "$STATUS_ONLY_FILTER" ]]; then
  echo "Delivery stream is already status-only: PASS"
  exit 0
fi
[[ "$CURRENT" == "$TELEMETRY_FILTER" ]] \
  || fail "Current delivery filter is not the approved telemetry filter; refusing rollback rewrite"

az servicebus topic subscription rule update \
  --resource-group "$RG" \
  --namespace-name "$NS" \
  --topic-name "$TOPIC" \
  --subscription-name "$SUB" \
  --name "$RULE" \
  --filter-type SqlFilter \
  --filter-sql-expression "$STATUS_ONLY_FILTER" \
  --output none \
  --only-show-errors

echo "SUCCESS: Order delivery stream returned to DELIVERY_STATUS_CHANGED only. Durable telemetry data remains stored."
