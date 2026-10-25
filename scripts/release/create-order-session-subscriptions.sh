#!/usr/bin/env bash
# CH-06: create session-enabled copies of order-service's delivery-status and refund-status subscriptions.
# Sessions cannot be switched on for an existing subscription, so the *-v3 ones are created beside the old ones.
#
# Cut-over (safe to repeat; the order-service inboxes de-duplicate by event id):
#   1. Deploy the CH-06 code, so every publisher sets SessionId (= chef order id).
#   2. Run this script. The v3 subscriptions start collecting copies of new events.
#   3. Set CRAVES_DELIVERY_STATUS_SESSION_ENABLED=true and CRAVES_REFUND_STATUS_SESSION_ENABLED=true on order-service.
#   4. When the old subscriptions are drained, delete them (or keep them until the next release).
set -euo pipefail

: "${RESOURCE_GROUP:?Set RESOURCE_GROUP}"
: "${SERVICE_BUS_NAMESPACE:?Set SERVICE_BUS_NAMESPACE}"
TOPIC="${CRAVES_DOMAIN_EVENTS_TOPIC_NAME:-craves-domain-events}"

create_session_subscription() {
  local name="$1" filter="$2"
  if az servicebus topic subscription show -g "$RESOURCE_GROUP" --namespace-name "$SERVICE_BUS_NAMESPACE" \
      --topic-name "$TOPIC" -n "$name" -o none 2>/dev/null; then
    echo "Subscription $name already exists"
  else
    az servicebus topic subscription create -g "$RESOURCE_GROUP" --namespace-name "$SERVICE_BUS_NAMESPACE" \
      --topic-name "$TOPIC" -n "$name" --enable-session true --max-delivery-count 10 --lock-duration PT1M -o none
    echo "Created session subscription $name"
  fi
  az servicebus topic subscription rule create -g "$RESOURCE_GROUP" --namespace-name "$SERVICE_BUS_NAMESPACE" \
    --topic-name "$TOPIC" --subscription-name "$name" -n event-type --filter-sql-expression "$filter" -o none 2>/dev/null \
    || echo "Rule event-type already present on $name"
  # Without this, the default TrueFilter would deliver every event type to the subscription (audit F3-05).
  az servicebus topic subscription rule delete -g "$RESOURCE_GROUP" --namespace-name "$SERVICE_BUS_NAMESPACE" \
    --topic-name "$TOPIC" --subscription-name "$name" -n '$Default' -o none 2>/dev/null || true
}

create_session_subscription order-service-delivery-status-changed-v3 \
  "eventType = 'DELIVERY_STATUS_CHANGED' OR event_type = 'DELIVERY_STATUS_CHANGED'"
create_session_subscription order-service-refund-status-changed-v3 \
  "eventType = 'REFUND_STATUS_CHANGED'"
