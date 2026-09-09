# Order Service — Delivery Status Consumer

## Purpose

This module consumes `DELIVERY_STATUS_CHANGED` v1 events from the Craves domain-event topic and creates an Order-owned delivery projection for each chef-specific sub-order.

It does not call a delivery provider, create a booking, calculate pricing, change commission or decide serviceability. It owns the provider-neutral delivery projection and, for the two unambiguous fulfillment milestones already represented by the commercial order model, synchronizes `customer_order.status` so existing Customer/Chef APIs show the real fulfillment state.

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
  -> safe commercial fulfillment projection
       PICKED_UP/IN_TRANSIT/AT_DROPOFF -> OUT_FOR_DELIVERY
       DELIVERED                       -> DELIVERED
  -> append-only order_status_history when commercial status changes
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
src/main/resources/db/migration/V20__delivery_commercial_status_projection.sql
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

Flyway V20 repairs only unambiguous already-processed fulfillment states from the durable delivery projection:

- `READY_FOR_PICKUP` + `PICKED_UP`/`IN_TRANSIT`/`AT_DROPOFF` -> `OUT_FOR_DELIVERY`;
- `READY_FOR_PICKUP` or `OUT_FOR_DELIVERY` + `DELIVERED` -> `DELIVERED`.

V20 also writes `order_status_history` audit entries. It does not touch cancelled, rejected or refund states.

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

Commercial-status synchronization occurs inside the same database transaction as the accepted delivery projection. The SQL update is conditional on the locked current commercial status, and the associated `order_status_history` row is written in that same transaction.

## Out-of-order protection

An event is not applied when:

- its `observedAt` is older than or equal to the accepted projection timestamp;
- the accepted projection is terminal and the incoming status differs;
- its normalized status and tracking URL do not change the projection.

The corresponding inbox result is `STALE`, `TERMINAL_PROTECTED` or `NO_CHANGE`.

## Order lifecycle boundary

The provider-neutral `delivery_*` columns remain the source of truth for courier lifecycle detail.

The commercial order status is synchronized only for fulfillment milestones that are already explicit in the existing `OrderStatus` model and are unambiguous from delivery evidence:

```text
READY_FOR_PICKUP + PICKED_UP/IN_TRANSIT/AT_DROPOFF -> OUT_FOR_DELIVERY
READY_FOR_PICKUP/OUT_FOR_DELIVERY + DELIVERED       -> DELIVERED
```

No provider callback is allowed to infer payment, cancellation, rejection, refund or refund-completion decisions. Those remain owned by their existing Order/payment/refund flows.

## Local tests

```bash
cd services/order-service
mvn -B clean verify
```

Regression coverage includes `DeliveryCommercialOrderStatusProjectionTest` for the fulfillment mapping above.

## CI

Run:

```text
azure-pipelines-delivery-status-downstream-ci.yml
```

The pipeline verifies:

- Order Service Java 21 build/tests;
- Notification Service compatibility build/tests;
- all event JSON schemas;
- fail-closed source defaults;
- runtime-preserving routine deployment controls.

## Service Bus subscription activation safety

`azure-pipelines-order-delivery-status-consumer-enable.yml` owns the one-time Order delivery-status subscription preparation and consumer activation.

For a missing subscription it performs this order:

```text
verify Order + Integration safety state
  -> verify active Order secretRefs are Key Vault-backed
  -> create order-service-delivery-status-changed as Disabled
  -> create delivery-status-changed-only SQL filter
  -> verify exact filter expression
  -> remove $Default rule
  -> verify Azure Service Bus Data Receiver, including inherited RBAC
  -> activate subscription
  -> enable only the four Order delivery-status consumer settings
  -> verify new revision health
  -> verify unrelated env/config/identity/secret metadata are unchanged
```

The filter expression is:

```text
eventType = 'DELIVERY_STATUS_CHANGED' OR event_type = 'DELIVERY_STATUS_CHANGED'
```

The pipeline deliberately does **not** enable:

```text
CRAVES_DELIVERY_STATUS_PUBLISHER_ENABLED
CRAVES_DELIVERY_COMMAND_ENABLED
CRAVES_DELIVERY_WEBHOOK_PROCESSING_ENABLED
CRAVES_DELIVERY_TRACKING_RECONCILIATION_ENABLED
BORZO_API_ENABLED
```

It requires those Integration/provider controls to remain false or absent before enabling the downstream Order consumer.

The subscription is created Disabled first. If Order lacks `Azure Service Bus Data Receiver`, the pipeline stops before enabling the consumer and leaves the newly created subscription Disabled. The output prints the managed-identity principal ID and exact subscription scope required for the one-time RBAC assignment.

## Deployment and activation order

1. Merge only after branch CI succeeds.
2. Deploy Order code from merged `main` and confirm Flyway V20 applies successfully.
3. Confirm `CRAVES_DELIVERY_STATUS_CONSUMER_ENABLED=true` remains preserved on the new revision.
4. Verify the known delivered production order now shows commercial `DELIVERED` while its delivery projection remains `DELIVERED`.
5. Confirm the delivery-status subscription has no new DLQ growth attributable to this change.
6. Validate a future real order transitions `READY_FOR_PICKUP -> OUT_FOR_DELIVERY -> DELIVERED` from provider-neutral delivery events.

## Rollback

Application rollback can return to the previous Order image if required. Flyway V20 is intentionally narrow and only advances orders whose durable delivery projection already proves the corresponding fulfillment milestone; it does not delete event, inbox, history, notification or provider-audit evidence.

The existing `azure-pipelines-delivery-status-rollback.yml` remains the emergency switch for disabling Order delivery-status consumption and upstream delivery status publication if the broader delivery-status path must be stopped.

## Manual steps

- Azure DevOps: run the normal Order CI/deployment pipeline after merge.
- No new Azure resource or paid SKU is required.
- No secret, Key Vault, DNS, Firebase, payment or provider credential change is required.
- Inspect the existing single Service Bus DLQ message separately; the successful Borzo delivery proved it did not block this order.
- Do not paste secret values into chat, pipeline YAML or Azure DevOps plain-text variables.
