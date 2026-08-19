#!/usr/bin/env bash
set -euo pipefail
set +x

RG=${1:?resource group required}
NS=${2:?service bus namespace required}
TOPIC=${3:?topic name required}
SUB=${4:?subscription name required}

RULE=${DELIVERY_RULE_NAME:-delivery-status-changed-only}
OLD_FILTER="eventType = 'DELIVERY_STATUS_CHANGED' OR event_type = 'DELIVERY_STATUS_CHANGED'"
NEW_FILTER="eventType = 'DELIVERY_STATUS_CHANGED' OR event_type = 'DELIVERY_STATUS_CHANGED' OR eventType = 'DELIVERY_TELEMETRY_UPDATED' OR event_type = 'DELIVERY_TELEMETRY_UPDATED'"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

for tool in az jq; do
  command -v "$tool" >/dev/null 2>&1 || fail "$tool is required"
done

az servicebus topic subscription show \
  --resource-group "$RG" \
  --namespace-name "$NS" \
  --topic-name "$TOPIC" \
  --name "$SUB" \
  --output none \
  --only-show-errors \
  || fail "Delivery subscription $SUB does not exist"

RULE_JSON=$(az servicebus topic subscription rule show \
  --resource-group "$RG" \
  --namespace-name "$NS" \
  --topic-name "$TOPIC" \
  --subscription-name "$SUB" \
  --name "$RULE" \
  --output json \
  --only-show-errors) \
  || fail "Expected delivery rule $RULE does not exist"

[[ "$(jq -r '.filterType // ""' <<<"$RULE_JSON")" == "SqlFilter" ]] \
  || fail "Delivery rule $RULE is not a SqlFilter"

CURRENT_FILTER=$(jq -r '.sqlFilter.sqlExpression // ""' <<<"$RULE_JSON")
if [[ "$CURRENT_FILTER" == "$NEW_FILTER" ]]; then
  echo "Delivery stream filter already accepts status + telemetry: PASS"
  exit 0
fi

[[ "$CURRENT_FILTER" == "$OLD_FILTER" ]] \
  || fail "Existing delivery SQL filter is not an approved status-only filter; refusing automatic rewrite"

RULE_COUNT=$(az servicebus topic subscription rule list \
  --resource-group "$RG" \
  --namespace-name "$NS" \
  --topic-name "$TOPIC" \
  --subscription-name "$SUB" \
  --query 'length(@)' \
  --output tsv \
  --only-show-errors)
[[ "$RULE_COUNT" == "1" ]] \
  || fail "Expected exactly one delivery filter rule before upgrade, found $RULE_COUNT"

az servicebus topic subscription rule update \
  --resource-group "$RG" \
  --namespace-name "$NS" \
  --topic-name "$TOPIC" \
  --subscription-name "$SUB" \
  --name "$RULE" \
  --filter-type SqlFilter \
  --filter-sql-expression "$NEW_FILTER" \
  --output none \
  --only-show-errors

UPDATED=$(az servicebus topic subscription rule show \
  --resource-group "$RG" \
  --namespace-name "$NS" \
  --topic-name "$TOPIC" \
  --subscription-name "$SUB" \
  --name "$RULE" \
  --query 'sqlFilter.sqlExpression' \
  --output tsv \
  --only-show-errors)
[[ "$UPDATED" == "$NEW_FILTER" ]] || fail "Delivery stream filter verification failed after update"

echo "SUCCESS: delivery subscription now accepts DELIVERY_STATUS_CHANGED and DELIVERY_TELEMETRY_UPDATED."
