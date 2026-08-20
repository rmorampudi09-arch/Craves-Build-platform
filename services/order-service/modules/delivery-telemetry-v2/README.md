# Order Service — Multi-Provider Delivery Tracking Projection

## Purpose

Order Service owns the customer/chef-facing projection of provider-neutral delivery state. It does not know Borzo/Shiprocket/Shadowfax/Porter/Delhivery response schemas and it never chooses the delivery provider.

Integration Service translates whichever provider actually fulfils the order into one stable Craves delivery contract. Order Service then exposes the **best safe tracking experience available for that order**, without provider-specific branching in customer/chef APIs.

## Storage

Flyway migrations:

```text
V17__delivery_telemetry_projection.sql
V18__delivery_provider_exact_eta.sql
```

The latest trusted snapshot is stored on the chef-specific `order_schema.customer_order` row:

```text
delivery_courier_latitude
delivery_courier_longitude
delivery_courier_location_observed_at
delivery_estimated_pickup_at
delivery_estimated_pickup_start_at
delivery_estimated_pickup_end_at
delivery_estimated_dropoff_at
delivery_estimated_dropoff_start_at
delivery_estimated_dropoff_end_at
delivery_telemetry_observed_at
delivery_telemetry_event_id
```

There is deliberately no courier GPS history table.

## Event compatibility

Order accepts:

```text
DELIVERY_TELEMETRY_UPDATED 1.0
DELIVERY_TELEMETRY_UPDATED 1.1
```

Version 1.1 adds provider-native exact ETA fields while retaining ETA windows. This is additive and historical 1.0 broker deliveries remain valid.

## Service Bus design

The module reuses the existing subscription:

```text
order-service-delivery-status-changed
```

The guarded SQL filter accepts:

```text
DELIVERY_STATUS_CHANGED
DELIVERY_TELEMETRY_UPDATED
```

No second subscription is introduced.

Telemetry processing does not assume serial message order. A trusted telemetry event can arrive before the corresponding status event; later events must match the established delivery-job/provider/provider-delivery identity.

## Customer/chef APIs

Customer:

```http
GET /api/v1/orders/{orderId}/delivery-status
```

Chef:

```http
GET /api/v1/chef/orders/{orderId}/delivery-status
```

Both are ownership-scoped.

The response now includes:

```text
trackingExperience
telemetry.estimatedPickupAt
telemetry.estimatedPickupStartAt
telemetry.estimatedPickupEndAt
telemetry.estimatedDropoffAt
telemetry.estimatedDropoffStartAt
telemetry.estimatedDropoffEndAt
```

## Best available tracking experience

Order Service derives the user experience from the data available for the actual order:

```text
fresh privacy-approved courier coordinates -> LIVE_MAP
otherwise provider tracking URL -> PROVIDER_TRACKING_LINK
otherwise -> STATUS_TIMELINE
```

This is a presentation capability, not provider ranking. It never changes which provider is selected.

A provider can therefore give Craves richer tracking without forcing all other providers to implement the exact same mechanism.

## Exact ETA versus ETA windows

Craves keeps provider semantics intact:

```text
estimatedDropoffAt          = provider supplied one exact ETA
estimatedDropoffStartAt/EndAt = provider supplied a window
```

An exact ETA is not converted into a fabricated zero-width window.

No proprietary Craves ETA model is introduced by this module.

## Ownership/privacy

Exact courier coordinates remain fail-closed:

```text
CRAVES_DELIVERY_LIVE_LOCATION_EXPOSURE_ENABLED=false
CRAVES_DELIVERY_LIVE_LOCATION_MAX_AGE_SECONDS=300
```

Coordinates are returned only when:

1. live-location exposure is explicitly enabled;
2. delivery is non-terminal;
3. latitude and longitude are both present;
4. location observation is fresh;
5. provider timestamp is not materially in the future.

Otherwise:

```text
liveLocationAvailable=false
courierLatitude=null
courierLongitude=null
locationObservedAt=null
```

Terminal deliveries suppress exact ETA and ETA windows in the live public response as well.

## Never exposed

The customer/chef API does not expose:

```text
provider delivery identifier
raw provider callback payload
courier phone/name/photo
chef private pickup/home address
customer delivery address
raw proof-image provider URL
provider credentials
arbitrary provider metadata
```

## Contracts

```text
contracts/openapi/order-delivery-status-v1.openapi.json
contracts/openapi/chef-delivery-status-v1.openapi.json
contracts/events/delivery-telemetry-updated-v1.schema.json
```

## APIM

The customer operation keeps its existing path. Chef delivery-status is an additive operation in the existing Chef Orders API.

Configuration:

```text
scripts/apim/configure-chef-order-read-apim.sh
```

Narrow rollback:

```text
scripts/apim/rollback-chef-delivery-status-apim.sh
```

Authenticated stateful reads remain `no-store`.

## Rollout source

Service Bus filter upgrade:

```text
azure-pipelines-delivery-telemetry-v2-stream-filter.yml
```

Filter rollback:

```text
azure-pipelines-delivery-telemetry-v2-stream-filter-rollback.yml
```

Live-location activation:

```text
azure-pipelines-delivery-live-location-activation.yml
```

Live-location rollback:

```text
azure-pipelines-delivery-live-location-rollback.yml
```

Exact live-location activation remains a separate post-sandbox privacy/accuracy decision.

## CI

```text
azure-pipelines-delivery-status-downstream-ci.yml
```

The source gate verifies:

```text
Order Maven clean verify
Integration Maven clean verify
Notification compatibility
V17/V18 and V112/V113 migration presence
provider capability registry
Borzo telemetry extractor
Shiprocket telemetry extractor
event JSON/OpenAPI JSON
telemetry v1.1 compatibility
best-tracking contract fields
fail-closed live-location default
provider-neutral/no-ranking guard
runtime-preserving deployment scripts
```

## Deployment status

Source-ready only. No Azure pipeline, migration, APIM operation, broker filter or live-location activation from this module has been executed yet.
