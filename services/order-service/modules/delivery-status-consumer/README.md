# Order Service — Delivery Status Consumer

## Purpose

This module consumes `DELIVERY_STATUS_CHANGED` v1 events from the Craves domain-event topic and creates an Order-owned delivery projection for each chef-specific sub-order.

It does not call a delivery provider, create a booking, calculate pricing, change commission, decide serviceability or replace the commercial order lifecycle.

## Runtime flow

```text
Integration Service delivery outbox
  -> Azure Service Bus topic: craves-domain-events
  -> filtered subscription: order-service-delivery-status-changed
  -> Order Service manual-lock consumer
  -> idempotent delivery_status_inbox
  -> chef-sub-order row lock
  -> stale and terminal protection
  -> customer_order delivery projection
  -> append-only order_delivery_status_history
  -> existing Order notification_outbox
  -> existing Notification Service internal API
```

## Why Notification Service does not consume the v1 event directly

`DELIVERY_STATUS_CHANGED` v1 contains delivery, checkout and chef-sub-order identifiers, but it does not contain customer or chef recipient identity IDs.

Order Service already owns the customer-order relationship. It therefore resolves the customer identity from its own database and writes the existing notification outbox transactionally.

This prevents Notification Service from reading Order tables directly or inventing an undocumented cross-service lookup.

## Files

```text
src/main/java/in/craves/order/config/DeliveryStatusConsumerProperties.java
src/main/java/in/craves/order/delivery/DeliveryStatusModels.java
src/main/java/in/craves/order/delivery/DeliveryStatusEventValidator.java
src/main/java/in/craves/order/delivery/DeliveryStatusTransitionPolicy.java
src/main/java/in/craves/order/delivery/DeliveryStatusCustomerNotificationService.java
src/main/java/in/craves/order/delivery/DeliveryStatusUpdateService.java
src/main/java/in/craves/order/delivery/DeliveryStatusChangedServiceBusProcessor.java
src/main/java/in/craves/order/delivery/DeliveryStatusQueryService.java
src/main/java/in/craves/order/web/DeliveryStatusController.java
src/main/java/in/craves/order/web/DeliveryStatusDtos.java
src/main/resources/db/migration/V9__delivery_status_consumer.sql
```

## Configuration

The consumer is disabled by default:

```text
CRAVES_DELIVERY_STATUS_CONSUMER_ENABLED=false
```

When activated, it uses:

```text
CRAVES_SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE
CRAVES_DOMAIN_EVENTS_TOPIC_NAME
CRAVES_DELIVERY_STATUS_SUBSCRIPTION
CRAVES_DELIVERY_STATUS_MAX_CONCURRENT_MESSAGES
CRAVES_DELIVERY_STATUS_PREFETCH_COUNT
CRAVES_DELIVERY_STATUS_MAX_DELIVERY_ATTEMPTS
```

A connection string remains supported for local/emergency compatibility, but Azure runtime should use the Container App managed identity.

## Database objects

Flyway V9 adds:

- delivery projection columns to `order_schema.customer_order`;
- `order_schema.delivery_status_inbox` for idempotency and processing outcomes;
- `order_schema.order_delivery_status_history` for append-only applied history;
- unique and dispatch-supporting indexes;
- canonical normalized-status constraints.

V9 is additive and does not backfill or activate delivery processing.

## Customer API

```http
GET /api/v1/orders/{orderId}/delivery-status
```

The endpoint requires the authenticated customer to own the order.

It exposes only:

- normalized delivery status;
- provider name;
- tracking URL;
- observation timestamp;
- normalized status history.

It does not expose the raw provider callback or provider delivery identifier.

## Idempotency

The event ID is the inbox primary key. Repeated broker deliveries complete successfully without applying the event twice.

The customer notification key is:

```text
delivery-status-{eventId}
```

This prevents duplicate in-app notices.

## Out-of-order protection

An event is not applied when:

- its `observedAt` is older than or equal to the accepted projection timestamp;
- the accepted projection is terminal and the incoming status differs;
- its normalized status and tracking URL do not change the projection.

The corresponding inbox result is `STALE`, `TERMINAL_PROTECTED` or `NO_CHANGE`.

## Order lifecycle boundary

Provider callbacks update dedicated `delivery_*` columns only.

They do not update `customer_order.status`. This is deliberate: commercial order transitions, refund consequences and support actions require approved product rules and must not be inferred from a provider callback.

## Local tests

```bash
cd services/order-service
mvn -B clean verify
```

## CI

Run:

```text
azure-pipelines-delivery-status-downstream-ci.yml
```

The pipeline verifies:

- Order Service Java 21 build/tests;
- Notification Service compatibility build/tests;
- all event JSON schemas;
- fail-closed application and deployment defaults.

## Deployment and activation order

1. Merge only after branch CI succeeds.
2. Run `azure-pipelines-order-service.yml` from merged `main`.
3. Confirm Flyway V9 and `CRAVES_DELIVERY_STATUS_CONSUMER_ENABLED=false`.
4. Run `azure-pipelines-order-delivery-status-consumer-enable.yml`.
5. Resolve any one-time Service Bus Receiver role requirement and rerun.
6. Run `azure-pipelines-integration-delivery-status-publisher-enable.yml` only after the Order consumer is healthy and its DLQ is empty.
7. Validate one synthetic event before enabling webhook/tracking/provider execution.
8. Add the APIM route for the customer delivery-status endpoint.

## Rollback

Run:

```text
azure-pipelines-delivery-status-rollback.yml
```

Rollback disables:

- Order delivery-status consumption;
- Integration delivery-status publication;
- Integration webhook/tracking execution;
- Borzo.

It never deletes durable event, inbox, history, notification or provider-audit data.

## Manual steps

- Azure DevOps: register the new YAML pipelines if they are not automatically visible.
- Azure RBAC: grant `Azure Service Bus Data Receiver` to the Order Container App managed identity when the activation pipeline reports the exact scope.
- APIM: add the new GET operation only after the merged Order revision is deployed.
- No secret value should be pasted into chat or pipeline YAML.
- No new paid Azure SKU is required; the activation pipeline creates one subscription inside the existing Service Bus namespace.
