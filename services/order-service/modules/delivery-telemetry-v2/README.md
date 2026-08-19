# Order Service — Delivery Telemetry v2

## Purpose

Order Service owns the customer/chef-facing projection of provider-neutral delivery telemetry. It does not call delivery providers and does not own raw courier-provider payloads.

## Storage

Flyway:

```text
services/order-service/src/main/resources/db/migration/V17__delivery_telemetry_projection.sql
```

The latest trusted telemetry is stored on the existing chef-specific `order_schema.customer_order` row:

```text
delivery_courier_latitude
delivery_courier_longitude
delivery_courier_location_observed_at
delivery_estimated_pickup_start_at
delivery_estimated_pickup_end_at
delivery_estimated_dropoff_start_at
delivery_estimated_dropoff_end_at
delivery_telemetry_observed_at
delivery_telemetry_event_id
```

There is deliberately no courier GPS history table.

## Service Bus design

The module reuses the existing subscription:

```text
order-service-delivery-status-changed
```

The approved SQL filter is broadened from status-only to:

```text
eventType = 'DELIVERY_STATUS_CHANGED'
OR event_type = 'DELIVERY_STATUS_CHANGED'
OR eventType = 'DELIVERY_TELEMETRY_UPDATED'
OR event_type = 'DELIVERY_TELEMETRY_UPDATED'
```

The existing Order Service processor routes the two event contracts to separate projection services.

No assumption is made that the broker processes the two messages serially. Telemetry can arrive before the matching status event. If the status projection is not present yet, telemetry is still stored after the chef-sub-order/checkout relationship is validated. Once the delivery status identity exists, later telemetry must match the delivery-job, provider and provider-delivery identifiers.

## Ownership and privacy

Customer route:

```http
GET /api/v1/orders/{orderId}/delivery-status
```

Requires CUSTOMER ownership.

Chef route:

```http
GET /api/v1/chef/orders/{orderId}/delivery-status
```

Requires CHEF ownership through the Order-owned `chef_identity_id` snapshot.

Both responses use the same additive `telemetry` object.

Exact courier coordinates are fail-closed by default:

```text
CRAVES_DELIVERY_LIVE_LOCATION_EXPOSURE_ENABLED=false
CRAVES_DELIVERY_LIVE_LOCATION_MAX_AGE_SECONDS=300
```

Coordinates are returned only when all conditions are true:

1. live-location exposure has been explicitly activated;
2. the delivery is non-terminal;
3. both latitude and longitude exist;
4. the location timestamp is fresh under the configured maximum age;
5. the timestamp is not more than the small provider clock-skew allowance in the future.

When those conditions are not met:

```text
liveLocationAvailable=false
courierLatitude=null
courierLongitude=null
locationObservedAt=null
```

Terminal deliveries also suppress ETA windows from the public read response. Stored telemetry remains available for operational evidence.

## Excluded public data

The response does not expose:

- provider delivery identifier;
- raw provider payload;
- courier phone number;
- courier name/photo;
- chef pickup/home address;
- customer delivery address;
- proof image URL;
- arbitrary provider metadata.

## Contracts

Customer OpenAPI:

```text
contracts/openapi/order-delivery-status-v1.openapi.json
```

Chef OpenAPI:

```text
contracts/openapi/chef-delivery-status-v1.openapi.json
```

The customer contract remains the existing API with an additive nested telemetry object.

## APIM

The existing customer delivery-status APIM operation remains unchanged in path and receives the additive response.

Chef delivery status is added to the existing Chef Orders API by:

```text
scripts/apim/configure-chef-order-read-apim.sh
```

Narrow operation-only rollback:

```text
scripts/apim/rollback-chef-delivery-status-apim.sh
```

The existing Chef Orders policy enforces Bearer syntax and `Cache-Control: no-store, no-cache, must-revalidate`.

## Service Bus filter rollout

Guarded upgrade:

```text
scripts/release/upgrade-order-delivery-stream-filter-v3.sh
azure-pipelines-delivery-telemetry-v2-stream-filter.yml
```

The script accepts only the known previous status-only filter or the already-upgraded filter. Any unknown rule expression stops the pipeline instead of overwriting it.

Rollback:

```text
scripts/release/rollback-order-delivery-stream-filter-v3.sh
azure-pipelines-delivery-telemetry-v2-stream-filter-rollback.yml
```

Rollback returns the subscription to status-only filtering without deleting durable telemetry data.

## Live-location activation

Exact coordinates must remain disabled during initial deployment and sandbox telemetry validation.

Activation:

```text
scripts/release/activate-order-delivery-live-location-v1.sh
azure-pipelines-delivery-live-location-activation.yml
```

Rollback:

```text
scripts/release/rollback-order-delivery-live-location-v1.sh
azure-pipelines-delivery-live-location-rollback.yml
```

The activation pipeline requires explicit confirmation and validates Order Service health before/after the runtime change.

## Local validation

```bash
cd services/order-service
mvn -B -ntp clean verify
```

Contract/downstream validation:

```text
azure-pipelines-delivery-status-downstream-ci.yml
```

That CI now validates Order, Integration and Notification compatibility, event/OpenAPI JSON, release-script shell syntax, fail-closed live-location defaults and runtime-preserving deployment contracts.
