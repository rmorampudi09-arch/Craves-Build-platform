# Integration Service — Delivery Telemetry v2

## Purpose

Delivery Telemetry v2 enriches the existing provider-neutral delivery lifecycle with the latest useful operational telemetry without creating a second delivery state machine.

The pre-existing Craves delivery path already provides:

- durable provider webhook inbox processing;
- normalized delivery statuses;
- duplicate/out-of-order/terminal-state protection;
- tracking reconciliation;
- transactional delivery status outbox publication;
- Order-owned customer delivery projection.

This module preserves those controls and adds only telemetry that the current status path was discarding.

## Scope

The module can project:

- latest courier latitude/longitude when a provider supplies trusted coordinates;
- provider-supplied pickup arrival window;
- provider-supplied drop-off arrival window;
- telemetry observation timestamp;
- telemetry source.

It does not calculate a proprietary Craves ETA, store a courier GPS trail, expose courier phone/name/photo, persist proof-image URLs, change delivery-provider selection, call a provider create operation, change pricing, or change the commercial order lifecycle.

## Provider support

### Borzo

`BorzoDeliveryTelemetryExtractor` consumes only fields already returned through the existing Borzo tracking response:

- courier latitude/longitude from `TrackingSnapshot.courier`;
- pickup/drop-off point arrival timestamps from the provider order payload.

Malformed or missing arrival timestamps are ignored instead of breaking delivery tracking.

### Shiprocket and other adapters

The generic extractor can consume a provider adapter's canonical `TrackingSnapshot.courier` coordinates if that adapter supplies them. The current Shiprocket adapter does not populate a courier object, so no location is invented for Shiprocket.

Adding a future provider requires either:

- populating canonical `TrackingSnapshot.courier`; or
- implementing `DeliveryTelemetryExtractor` for provider-specific documented ETA fields.

## Storage model

Flyway:

```text
services/integration-service/src/main/resources/db/migration/V112__delivery_telemetry_projection.sql
```

`delivery_schema.delivery_job` stores only the latest telemetry snapshot:

```text
courier_latitude
courier_longitude
courier_location_observed_at
estimated_pickup_start_at
estimated_pickup_end_at
estimated_dropoff_start_at
estimated_dropoff_end_at
telemetry_observed_at
telemetry_source
```

This is deliberately not a GPS-history table. Raw provider status evidence remains in the existing webhook/event audit path.

## Runtime flow

```text
existing tracking reconciliation worker
  -> provider track()
  -> existing normalized status processing
  -> DeliveryTelemetryExtractionService
  -> provider-specific/generic telemetry extractor
  -> changed/stale/terminal checks
  -> latest telemetry projection on delivery_job
  -> existing delivery outbox
  -> DELIVERY_TELEMETRY_UPDATED v1.0
```

The existing normalized status event remains authoritative for status transitions.

## Event contract

Schema:

```text
contracts/events/delivery-telemetry-updated-v1.schema.json
```

Event type:

```text
DELIVERY_TELEMETRY_UPDATED
```

The event contains only provider-neutral telemetry fields needed by Order Service. It does not include raw provider payloads, courier phone/name/photo, customer address, chef home address, or provider credentials.

## Noise and scale controls

A telemetry event is not published when:

- the delivery is terminal;
- the provider supplies no useful telemetry;
- the observation is stale;
- the latest coordinates/arrival windows did not materially change.

This prevents the domain-event topic and Order database from becoming an unbounded raw GPS feed.

## Metrics

Integration emits:

```text
craves.integration.delivery.telemetry.capture
```

Low-cardinality tags:

```text
provider
outcome
```

Expected outcomes include:

```text
published
terminal_state
no_provider_telemetry
stale_telemetry
no_telemetry_change
```

## Tests

Relevant tests include:

```text
services/integration-service/src/test/java/in/craves/integration/delivery/borzo/BorzoDeliveryTelemetryExtractorTest.java
services/integration-service/src/test/java/in/craves/integration/delivery/telemetry/DeliveryTelemetryPublisherServiceTest.java
services/integration-service/src/test/java/in/craves/integration/delivery/status/DeliveryTrackingReconciliationWorkerTest.java
```

Local verification:

```bash
cd services/integration-service
mvn -B -ntp clean verify
```

## Activation

No new Integration feature flag is required beyond the existing controlled tracking reconciliation path. Telemetry is generated only when the existing tracking worker actually obtains a tracking snapshot.

Do not enable tracking reconciliation merely to enable telemetry. Existing delivery/provider activation gates remain authoritative.

## Deployment safety

This module does not create a new Service Bus topic/subscription and does not require a new Azure role assignment. Order Service reuses its existing delivery-status subscription after the guarded SQL filter is expanded to include `DELIVERY_TELEMETRY_UPDATED`.

No new Azure paid resource is required.
