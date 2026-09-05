# Craves Delivery Telemetry v2 — Engineering Handover

**Date:** 2026-08-20  
**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Branch:** `chatgpt/backend-customer-chef-journey-20260819`  
**Production execution:** deferred. No Azure deployment, Service Bus filter change, APIM change or live-location activation was executed while building this module.

## 1. Why this module was built

The repository audit showed that Craves already had a production-oriented provider-neutral delivery status pipeline:

```text
provider webhook / tracking poll
  -> durable Integration webhook or tracking worker
  -> normalized delivery state
  -> duplicate / stale / terminal protection
  -> Integration delivery outbox
  -> Azure Service Bus
  -> Order Service idempotent projection
  -> customer-owned delivery-status API
```

The missing production capability was richer telemetry. The existing adapter contract can carry courier information and provider tracking metadata, but the status projection previously retained only normalized status and tracking URL. This module extends that existing path rather than creating a second delivery state machine.

## 2. What Delivery Telemetry v2 adds

The module can carry the latest trusted provider-neutral telemetry:

```text
courier latitude / longitude
courier location observation time
provider-supplied pickup arrival window
provider-supplied drop-off arrival window
telemetry observation time
```

The implementation deliberately does not:

```text
store an unbounded GPS trail
calculate a proprietary Craves ETA
expose raw provider payloads
expose courier phone/name/photo
expose customer address
expose chef home/pickup address
expose proof-image URLs
change provider assignment logic
change delivery pricing
change payment/refund policy
change commercial order lifecycle
```

## 3. Integration Service architecture

Tracking telemetry is captured from the already-existing read-only provider tracking call.

```text
DeliveryTrackingReconciliationWorker
  -> DeliveryProviderAdapter.track()
  -> existing DeliveryStatusUpdateService.processTracking()
  -> DeliveryTelemetryExtractionService
  -> provider-specific/generic extractor
  -> DeliveryTelemetryPublisherService
  -> latest delivery_job telemetry projection
  -> existing DeliveryOutboxRepository
  -> DELIVERY_TELEMETRY_UPDATED v1.0
```

The status event remains authoritative for normalized delivery state transitions.

### Files

```text
services/integration-service/src/main/java/in/craves/integration/delivery/telemetry/DeliveryTelemetryModels.java
services/integration-service/src/main/java/in/craves/integration/delivery/telemetry/DeliveryTelemetryExtractor.java
services/integration-service/src/main/java/in/craves/integration/delivery/telemetry/DeliveryTelemetryExtractionService.java
services/integration-service/src/main/java/in/craves/integration/delivery/telemetry/DeliveryTelemetryRepository.java
services/integration-service/src/main/java/in/craves/integration/delivery/telemetry/DeliveryTelemetryPublisherService.java
services/integration-service/src/main/java/in/craves/integration/delivery/borzo/BorzoDeliveryTelemetryExtractor.java
services/integration-service/src/main/java/in/craves/integration/delivery/status/DeliveryTrackingReconciliationWorker.java
```

### Integration Flyway

```text
services/integration-service/src/main/resources/db/migration/V112__delivery_telemetry_projection.sql
```

V112 is intentional. During CI the branch already contained other delivery-provider migrations at V110 and V111. The telemetry migration was moved forward rather than altering or renumbering those existing modules.

V112 adds latest-snapshot fields to `delivery_schema.delivery_job` and validates coordinate pairing/ranges and ETA-window ordering.

## 4. Provider extraction

### Borzo

`BorzoDeliveryTelemetryExtractor` reads canonical courier coordinates from the existing `TrackingSnapshot.courier` and provider order-point arrival timestamps already present in the current Borzo tracking response model.

Malformed/missing timestamp values are ignored. They do not break status tracking.

### Shiprocket / future providers

No location or ETA is invented. The generic extractor can use canonical `TrackingSnapshot.courier` coordinates if an adapter supplies them. Provider-specific ETA fields require a provider-specific `DeliveryTelemetryExtractor` backed by that provider's documented response contract.

The current module is therefore accurately described as **tracking-based provider telemetry**, not universal webhook GPS telemetry.

## 5. Event contract and event-volume controls

Contract:

```text
contracts/events/delivery-telemetry-updated-v1.schema.json
```

Event:

```text
DELIVERY_TELEMETRY_UPDATED
version 1.0
```

Integration does not publish a telemetry event when:

```text
delivery state is terminal
provider supplies no useful telemetry
observation is stale
coordinates / arrival windows did not materially change
```

This is an important scale control. The domain-event topic and Order database are not turned into a raw courier GPS stream.

## 6. Order Service projection

Flyway:

```text
services/order-service/src/main/resources/db/migration/V17__delivery_telemetry_projection.sql
```

The latest telemetry is stored on the existing chef-specific `order_schema.customer_order` projection. No separate GPS history table is created.

### Files

```text
services/order-service/src/main/java/in/craves/order/delivery/DeliveryTelemetryModels.java
services/order-service/src/main/java/in/craves/order/delivery/DeliveryTelemetryEventValidator.java
services/order-service/src/main/java/in/craves/order/delivery/DeliveryTelemetryUpdateService.java
services/order-service/src/main/java/in/craves/order/delivery/DeliveryStatusChangedServiceBusProcessor.java
services/order-service/src/main/java/in/craves/order/delivery/DeliveryStatusQueryService.java
services/order-service/src/main/java/in/craves/order/config/DeliveryTelemetryViewProperties.java
services/order-service/src/main/java/in/craves/order/web/DeliveryStatusDtos.java
services/order-service/src/main/java/in/craves/order/web/ChefDeliveryStatusController.java
```

## 7. Concurrency / ordering safety

The module reuses the existing Service Bus subscription:

```text
order-service-delivery-status-changed
```

It does not create a second subscription.

The existing processor can handle messages concurrently, so the implementation does not assume that the status message always finishes before telemetry.

Order telemetry processing therefore follows this rule:

```text
always validate chef-sub-order + checkout relationship
require chef acceptance metadata
if no delivery status identity exists yet:
    accept latest telemetry safely
if a complete delivery identity exists:
    require deliveryJobId + providerId + providerDeliveryId to match
if the delivery identity is only partially populated:
    classify as retryable
```

This avoids a hidden serial-ordering assumption and prevents normal parallel consumption from immediately exhausting retry attempts.

## 8. Idempotency and stale-event rules

Order Service rejects or no-ops:

```text
same telemetry event ID again -> DUPLICATE_EVENT
older/equal observedAt -> STALE_TELEMETRY
refund-requested/ineligible commercial order -> ORDER_NOT_ELIGIBLE
terminal delivery -> TERMINAL_DELIVERY
mismatched established delivery identity -> non-retryable validation failure
```

The event validator also enforces:

```text
event type/version/source
trace identifiers
subject/delivery-job consistency
provider identifiers
known normalized status
paired coordinates
latitude/longitude ranges
location observation timestamp
pickup/drop-off window ordering
```

## 9. Customer and chef APIs

Customer existing path remains:

```http
GET /api/v1/orders/{orderId}/delivery-status
```

Chef additive path:

```http
GET /api/v1/chef/orders/{orderId}/delivery-status
```

Customer ownership is checked by `customer_identity_id`.

Chef ownership is checked by the Order-owned `chef_identity_id` snapshot. There is no marketplace-wide chef tracking query.

Contracts:

```text
contracts/openapi/order-delivery-status-v1.openapi.json
contracts/openapi/chef-delivery-status-v1.openapi.json
```

The existing customer contract is additive: a nested `telemetry` object was added.

## 10. Privacy model

Exact live courier location is fail-closed:

```text
CRAVES_DELIVERY_LIVE_LOCATION_EXPOSURE_ENABLED=false
CRAVES_DELIVERY_LIVE_LOCATION_MAX_AGE_SECONDS=300
```

Exact coordinates are returned only when:

```text
feature is explicitly enabled
status is not terminal
both coordinates are present
location timestamp is fresh
location timestamp is not more than 120 seconds in the future
```

Otherwise:

```text
liveLocationAvailable=false
courierLatitude=null
courierLongitude=null
locationObservedAt=null
```

Terminal deliveries suppress public ETA windows as well. The stored telemetry can remain as operational evidence without being returned as live public state.

## 11. APIM

Customer APIM path is unchanged because the existing response is only extended additively.

Chef delivery-status is added to the existing Chef Orders API through:

```text
scripts/apim/configure-chef-order-read-apim.sh
```

Operation-only rollback:

```text
scripts/apim/rollback-chef-delivery-status-apim.sh
```

The existing Chef Orders APIM policy enforces Bearer syntax and no-store response caching.

No APIM change has been executed yet.

## 12. Service Bus filter rollout

The current status-only SQL filter is broadened in-place by:

```text
scripts/release/upgrade-order-delivery-stream-filter-v3.sh
azure-pipelines-delivery-telemetry-v2-stream-filter.yml
```

Approved old filter:

```text
eventType = 'DELIVERY_STATUS_CHANGED' OR event_type = 'DELIVERY_STATUS_CHANGED'
```

Approved new filter:

```text
eventType = 'DELIVERY_STATUS_CHANGED'
OR event_type = 'DELIVERY_STATUS_CHANGED'
OR eventType = 'DELIVERY_TELEMETRY_UPDATED'
OR event_type = 'DELIVERY_TELEMETRY_UPDATED'
```

The script refuses to rewrite an unknown expression and expects exactly one rule. It preserves the existing subscription instead of creating a new billable/messaging object or RBAC surface.

Rollback:

```text
scripts/release/rollback-order-delivery-stream-filter-v3.sh
azure-pipelines-delivery-telemetry-v2-stream-filter-rollback.yml
```

Rollback returns broker routing to status-only. It does not delete stored telemetry.

## 13. Live-location activation and rollback

Activation is intentionally separate from code deployment:

```text
scripts/release/activate-order-delivery-live-location-v1.sh
azure-pipelines-delivery-live-location-activation.yml
```

The activation pipeline defaults confirmation to false and should only be run after controlled sandbox privacy/accuracy evidence.

Rollback:

```text
scripts/release/rollback-order-delivery-live-location-v1.sh
azure-pipelines-delivery-live-location-rollback.yml
```

Rollback disables exact coordinates while keeping the telemetry projection and ETA data.

## 14. CI

Module/downstream gate:

```text
azure-pipelines-delivery-status-downstream-ci.yml
```

It now verifies:

```text
Order Service Maven clean verify
Integration Service Maven clean verify
Notification Service compatibility
all event JSON schemas
customer + chef OpenAPI JSON
release/APIM shell syntax
fail-closed live-location default
Order V17 + Integration V112 existence
status+telemetry filter artifacts
runtime-preserving normal service deployments
```

GitHub `Backend completion CI` remains the branch-wide seven-service gate. During implementation it correctly caught migration collisions with V110 and then V111; those existing migrations were preserved and telemetry moved to V112.

## 15. Metrics

Integration:

```text
craves.integration.delivery.telemetry.capture
```

Order:

```text
craves.order.delivery.telemetry
```

Tags remain low-cardinality (`provider`, `outcome`).

Useful operational alerts after rollout should focus on rates/age rather than one alert per order:

```text
telemetry validation failures
telemetry projection retry/dead-letter rate
tracking reconciliation errors
stale/no-telemetry rate by provider
live-location API 5xx/p95
existing delivery-status subscription DLQ
```

Alert thresholds should be established from sandbox/load-test evidence rather than invented in source.

## 16. Tests added/updated

```text
services/integration-service/src/test/java/in/craves/integration/delivery/borzo/BorzoDeliveryTelemetryExtractorTest.java
services/integration-service/src/test/java/in/craves/integration/delivery/telemetry/DeliveryTelemetryPublisherServiceTest.java
services/integration-service/src/test/java/in/craves/integration/delivery/status/DeliveryTrackingReconciliationWorkerTest.java
services/order-service/src/test/java/in/craves/order/delivery/DeliveryTelemetryEventValidatorTest.java
```

## 17. Manual steps — later, not now

The project owner explicitly plans to run all Azure pipelines only after the module set is finished. Therefore the following are prepared but not executed.

When the full backend release reaches deployment:

1. Run the unified backend validation pipeline and `azure-pipelines-delivery-status-downstream-ci.yml`.
2. Deploy Order Service and verify Flyway V17.
3. Ensure the existing `order-service-delivery-status-changed` subscription and Order consumer are healthy. If the original status subscription was never activated, use its existing controlled activation pipeline first.
4. Deploy Integration Service and verify Flyway V112.
5. Keep exact courier location OFF.
6. Run `azure-pipelines-delivery-telemetry-v2-stream-filter.yml` to allow telemetry through the existing Order subscription.
7. Validate the existing Integration tracking/status-publisher activation state according to its existing delivery runbooks. Do not enable unrelated provider controls just for telemetry.
8. Generate controlled Borzo sandbox tracking changes and verify Integration latest telemetry, outbox event, Order projection and customer/chef API.
9. Configure the chef delivery-status APIM operation.
10. Verify `liveLocationAvailable=false` while ETA/telemetry timestamps behave as expected.
11. Review privacy/accuracy evidence.
12. Only then, if approved, run `azure-pipelines-delivery-live-location-activation.yml`.

## 18. Rollback order

Use the narrowest rollback first:

```text
1. Exact coordinate exposure problem:
   azure-pipelines-delivery-live-location-rollback.yml

2. Telemetry event consumer/broker problem:
   azure-pipelines-delivery-telemetry-v2-stream-filter-rollback.yml

3. Chef gateway-only problem:
   scripts/apim/rollback-chef-delivery-status-apim.sh

4. Service revision problem:
   use the existing Order/Integration revision rollback process
```

Database migrations are additive. Do not destructively drop telemetry columns during an incident rollback.

## 19. Required smoke evidence after eventual rollout

Customer:

```text
owned order returns status + telemetry object
unowned order returns 404
ETA windows show only when provider supplied them
location stays hidden while feature flag=false
when activated: fresh active location is visible
stale location is hidden
future-skewed location is hidden
terminal delivery hides coordinates and ETA windows
```

Chef:

```text
owned chef sub-order returns status + telemetry
another chef's order returns 404
response does not reveal customer/chef private address fields
```

Event safety:

```text
duplicate telemetry event is not reapplied
stale event is not reapplied
telemetry can safely arrive before status projection
once status identity exists, mismatched provider/job identity is rejected
terminal delivery blocks later live telemetry
```

Scale:

```text
tracking polling does not create a telemetry event when nothing changed
Service Bus backlog remains controlled
Order projection query remains indexed by direct order ownership
p95/p99 for delivery status remains acceptable
no unbounded GPS-history growth exists
```

## 20. Current handover state

Source implementation, contracts, tests, guarded rollout scripts, rollback scripts, Azure DevOps YAML and documentation are prepared on PR #258.

This handover does **not** claim that V17/V112 have run against Azure PostgreSQL, that the Service Bus SQL rule is upgraded, that the chef APIM route exists in live APIM, that tracking telemetry is flowing in production, or that exact courier location is active. Those are later release actions.
