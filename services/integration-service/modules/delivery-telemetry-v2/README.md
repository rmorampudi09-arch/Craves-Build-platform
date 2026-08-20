# Integration Service — Multi-Provider Delivery Capability & Telemetry

## Purpose

This module makes every Craves delivery provider a peer behind the provider-neutral Integration Service boundary. Borzo is not the architecture template and no provider-specific feature is silently discarded merely because another provider does not expose it.

The existing `DeliveryProviderAdapter` remains the common transaction contract for quote/create/cancel/track. This module adds a separate capability model plus provider-specific telemetry extractors so Craves can use the strongest verified feature set of the provider that actually fulfils an order.

It does **not** encode provider priority, commercial fallback, delivery fees or commission rules.

## Providers represented

The capability registry represents:

```text
borzo
shiprocket
shadowfax
porter
delhivery
```

Source:

```text
services/integration-service/src/main/java/in/craves/integration/delivery/provider/DeliveryProviderCapability.java
services/integration-service/src/main/java/in/craves/integration/delivery/provider/DeliveryProviderCapabilityRegistry.java
```

The admin-only operational read model is:

```http
GET /api/v1/admin/operations/delivery-provider-contracts/capabilities
```

The response distinguishes:

```text
AVAILABLE_NOW
SUPPORTED_NOT_WIRED
PRIVATE_CONTRACT_REQUIRED
NOT_VERIFIED
NOT_SUPPORTED
```

That distinction is deliberate. A public provider feature is not considered executable in Craves until the exact partner API/auth/webhook contract used by Craves is verified.

## Capability vocabulary

The current provider-neutral vocabulary includes:

```text
SERVICEABILITY
QUOTE
QUOTE_ETA
CREATE_DELIVERY
CANCEL_DELIVERY
TRACK
TRACKING_LINK
WEBHOOK_STATUS
LIVE_COURIER_LOCATION
PROVIDER_ETA
DELIVERY_VERIFICATION
PROOF_OF_DELIVERY
NDR_ACTION
RETURN_TRACKING
CREATE_RECONCILIATION
MULTI_STOP
```

This list can grow without changing Order Service or leaking provider response schemas outside Integration Service.

## Telemetry data model

Flyway migrations:

```text
V112__delivery_telemetry_projection.sql
V113__delivery_provider_exact_eta.sql
```

Integration stores only the latest useful snapshot on `delivery_schema.delivery_job`:

```text
courier_latitude
courier_longitude
courier_location_observed_at
estimated_pickup_at
estimated_pickup_start_at
estimated_pickup_end_at
estimated_dropoff_at
estimated_dropoff_start_at
estimated_dropoff_end_at
telemetry_observed_at
telemetry_source
```

Exact provider ETA and ETA windows are intentionally separate. Craves does not convert a single exact ETA into a fake zero-width window.

There is deliberately no raw courier GPS history table.

## Borzo

`BorzoDeliveryTelemetryExtractor` supports both tracking snapshots and authenticated/normalized webhook payloads.

It can retain:

```text
courier latitude/longitude
provider exact pickup/drop-off ETA
provider arrival start/end windows
```

Coordinates are validated and `(0,0)` is discarded.

Provider proof/check-in/multi-stop data is represented by the capability matrix but is not exposed as a Craves customer action until the product/privacy contract for that capability is approved.

## Shiprocket

`ShiprocketDeliveryTelemetryExtractor` is a first-class provider-specific extractor.

It can retain:

```text
latest valid courier GPS point from provider tracking scans
scan observation timestamp
provider ETD as exact drop-off ETA
tracking or webhook source
```

The extractor intentionally does **not** treat arbitrary top-level latitude/longitude values as courier position. Only GPS coordinates found in trusted tracking `scans` are eligible. This prevents a destination coordinate from being misclassified as the rider's location.

Shiprocket NDR/reattempt/RTO and return tracking are represented as supported provider capabilities but are not automatically triggered. Choosing a reattempt versus return changes Craves order/customer policy and therefore remains an explicit product/operations decision.

## Shadowfax

The public feature surface includes API-based intake, live tracking/customer updates and OTP/POD-style delivery completion. The exact Craves partner transaction/auth/webhook contract is not present in the authoritative repository documentation, so executable calls remain `PRIVATE_CONTRACT_REQUIRED` rather than guessed.

## Porter

The public feature surface includes quote/serviceability, tracking API, webhooks, provider tracking link/live driver map and optional delivery-code proof. The API also publicly states one pickup + one drop for API orders. Exact Craves credentials and partner contract remain gated, so Craves keeps these operations fail-closed until verified.

## Delhivery Direct Intracity

The product is represented in the provider catalogue and Hyderabad intracity availability is tracked as an operational prerequisite. Public product documentation exposes booking/tracking concepts and multi-stop semantics, but the exact executable Direct Intracity API contract used by Craves is not in the repository. Runtime calls therefore remain fail-closed until the partner contract is verified.

## Webhook telemetry semantics

Provider telemetry is independent of normalized status changes.

Example:

```text
IN_TRANSIT at 10:01 with rider GPS A
IN_TRANSIT at 10:02 with rider GPS B
```

The second callback does not need another `DELIVERY_STATUS_CHANGED` event, but it may legitimately produce `DELIVERY_TELEMETRY_UPDATED`.

Safety rule:

```text
new status transition -> status event + eligible telemetry
newer same normalized state -> eligible telemetry only
stale/equal callback -> no telemetry
unknown callback -> no telemetry
terminal-protected regression -> no telemetry
```

This prevents a late callback from resurrecting live location after delivery has already become terminal.

## Event contract

```text
contracts/events/delivery-telemetry-updated-v1.schema.json
```

Producer version:

```text
DELIVERY_TELEMETRY_UPDATED 1.1
```

Order Service accepts historical `1.0` and current `1.1` events.

The provider-neutral event can include exact ETA fields plus ETA windows, but never includes raw provider payloads, courier phone/name/photo, chef/customer addresses or credentials.

## Scale/noise controls

Telemetry is not published when:

```text
delivery is terminal
provider supplies no useful telemetry
telemetry is stale
data did not materially change
```

This keeps the domain-event stream proportional to useful state changes instead of becoming a raw GPS firehose.

## Metrics

```text
craves.integration.delivery.telemetry.capture
```

Low-cardinality tags only:

```text
provider
outcome
```

## Tests

```text
services/integration-service/src/test/java/in/craves/integration/delivery/provider/DeliveryProviderCapabilityRegistryTest.java
services/integration-service/src/test/java/in/craves/integration/delivery/borzo/BorzoDeliveryTelemetryExtractorTest.java
services/integration-service/src/test/java/in/craves/integration/delivery/shiprocket/ShiprocketDeliveryTelemetryExtractorTest.java
services/integration-service/src/test/java/in/craves/integration/delivery/telemetry/DeliveryTelemetryPublisherServiceTest.java
services/integration-service/src/test/java/in/craves/integration/delivery/status/DeliveryStatusUpdateServiceTest.java
services/integration-service/src/test/java/in/craves/integration/delivery/status/DeliveryTrackingReconciliationWorkerTest.java
```

Local validation:

```bash
cd services/integration-service
mvn -B -ntp clean verify
```

## Deployment status

Source implementation only. Azure deployment, Service Bus filter activation, provider activation and exact live-location exposure are intentionally deferred until the complete backend module set is finished.

No new Azure paid resource is required by this module.
