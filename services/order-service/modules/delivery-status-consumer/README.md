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
src/main/resources/db/migration/V21__delivery_commercial_status_projection.sql
```

## Configuration

The consumer is disabled by default in source and enabled explicitly in production:

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

## Database objects

Flyway V9 adds the provider-neutral delivery projection, idempotent inbox and append-only delivery-status history.

Flyway V21 repairs only unambiguous already-processed fulfillment states from the durable delivery projection:

- `READY_FOR_PICKUP` + `PICKED_UP`/`IN_TRANSIT`/`AT_DROPOFF` -> `OUT_FOR_DELIVERY`;
- `READY_FOR_PICKUP` or `OUT_FOR_DELIVERY` + `DELIVERED` -> `DELIVERED`.

V21 also writes `order_status_history` audit entries. It does not touch cancelled, rejected or refund states.

### Production Flyway V20 reservation

Production already contains an applied Order Service Flyway migration at version `20` with checksum `182093619`.

The first delivery-status visibility deployment accidentally introduced a different local V20 with checksum `292549667`. Flyway correctly rejected that deployment with a checksum mismatch and the runtime-preserving deploy script rolled the Order Service back to the previous healthy image.

Therefore this module must **not** add or modify `V20__delivery_commercial_status_projection.sql`, and it must **not** run Flyway repair merely to force the new checksum into production history. The commercial delivery-status backfill is versioned as V21 instead.

`DeliveryStatusMigrationTest` explicitly guards this reservation by requiring the conflicting V20 filename to be absent and V21 to be present.

## Customer API

```http
GET /api/v1/orders/{orderId}/delivery-status
```

The endpoint requires the authenticated customer to own the order and exposes only normalized delivery information. Raw provider callback payloads and provider secrets are not exposed.

## Idempotency and ordering

The event ID is the inbox primary key. Repeated broker deliveries complete successfully without applying the event twice.

An event is not applied when:

- its `observedAt` is older than or equal to the accepted projection timestamp;
- the accepted projection is terminal and the incoming status differs;
- its normalized status and tracking URL do not change the projection.

The corresponding inbox result is `STALE`, `TERMINAL_PROTECTED` or `NO_CHANGE`.

Commercial-status synchronization occurs inside the same database transaction as the accepted delivery projection. The SQL update is conditional on the locked current commercial status, and the associated `order_status_history` row is written in that same transaction.

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

Regression coverage includes:

- `DeliveryCommercialOrderStatusProjectionTest` for fulfillment mapping;
- `DeliveryStatusMigrationTest` for the production V20 reservation and V21 backfill resource.

## Deployment

Use the normal Order Service pipeline after merge:

```text
azure-pipelines-order-service.yml
```

Deployment must preserve the existing runtime configuration. No new Azure resource, secret, payment configuration, provider credential or DNS change is required.

Expected production validation after deployment:

1. Flyway validates existing production V20 without a checksum conflict.
2. Flyway applies V21 successfully.
3. `CRAVES_DELIVERY_STATUS_CONSUMER_ENABLED=true` remains preserved.
4. The proven delivered Borzo order shows `status=DELIVERED` and `delivery_status=DELIVERED`.
5. No new delivery-status Service Bus DLQ growth is introduced.
6. A future live order visibly progresses `READY_FOR_PICKUP -> OUT_FOR_DELIVERY -> DELIVERED`.

## Rollback

The routine deployment script preserves the previous immutable image and automatically restores it if the new revision becomes explicitly failed or unhealthy.

The failed pipeline run `36479` demonstrated this protection: revision `ca-craves-order-service-prodlow--0000075` failed Flyway validation and the previous image `craves/order-service:36468` was restored in healthy revision `ca-craves-order-service-prodlow--0000076`.

Do not use `flyway repair` as a shortcut for the V20 collision. The safe remediation is the new V21 migration.

## Manual steps

- Azure DevOps: run the normal Order Service pipeline after the corrective branch is merged.
- No new Azure resource or paid SKU is required.
- No secret, Key Vault, DNS, Firebase, Razorpay or Borzo credential change is required.
- Inspect the existing single Service Bus DLQ message separately; it did not block the proven Borzo delivery lifecycle.
- Do not paste secret values into chat, pipeline YAML or Azure DevOps plain-text variables.
