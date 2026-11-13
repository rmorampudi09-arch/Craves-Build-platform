# Rider on the customer's map, with the road route — design

Date: 14 Nov 2026. Approved by the owner in chat on 14 Nov 2026.

## Why

After a Craves rider picks up an order, the customer's tracking map shows only the delivery house. The customer cannot
see where the rider is or which way the food is coming. The owner wants the rider and the road route on that map.

## What exists today

- The rider app posts GPS fixes to `POST /api/v1/rider/locations`. `FleetLocationService` keeps the newest one per rider
  in `fleet_schema.rider_position_latest` (with the trip it belongs to), behind `CRAVES_FLEET_LOCATION_INGEST_ENABLED`.
- `FleetStatusBridge` turns trip steps into `DELIVERY_STATUS_CHANGED` events for order-service. The event carries the
  rider's name, phone and pickup ETA, but no position. integration-service drops a report whose status did not change
  (`NO_STATE_CHANGE`), so nothing is sent between steps.
- order-service already accepts a same-status event that is newer than the stored one and refreshes the courier details
  from it (`storeCourier`). Its `customer_order` table already has `delivery_courier_latitude`, `_longitude` and
  `_location_observed_at` (V17); nothing reads or writes them.
- `GET /api/v1/orders/{orderId}/delivery-status` returns no position.
- user-chef-service calls Ola Directions for road distance only (`overview=false`), at
  `POST /internal/v1/maps/road-distance`. integration-service already calls it (`RoadDistanceClient`).
- The Craves app already parses `courierLocation` from the delivery-status answer and draws a moped pin and a dotted
  straight line to the house (`OrderMap.tsx`). It refreshes every 30 seconds.

## Goals

- After pickup, the customer sees the rider's pin, the house pin and a line that follows the roads from the rider to the house.
- The pin moves about every 30 seconds.
- Ships switched off; the owner switches it on.

## Non-goals

- Re-routing when the rider takes another road. The line shows the planned road.
- Showing the rider before pickup (the map stays blurred, as today).
- Borzo and Pidge couriers. They can be added later through the same event fields.
- Any change to the rider app or to the location upload path (`FleetLocationService`).
- The customer website. The new fields are additive; the web team can use them later.

## Anti-goals

- A rider's position must never be shown to a customer whose order the rider is not carrying, or once the order is delivered.
- The location upload must not get slower: it has a documented budget of five statements a call.
- A fault in this feature must never hide the delivery status or stop a delivery event.

## Approaches

1. **Position and path ride on the delivery event (picked).** integration-service publishes a same-status
   `DELIVERY_STATUS_CHANGED` event with the rider's position and the road path while the order is on the way;
   order-service stores the latest and returns it. Uses the pipe, the order-side refresh rule and the columns that
   already exist. No new link between services, no gateway route, no new secret.
2. **order-service asks integration-service on every customer refresh.** No storage, but a new live call between two
   services on a customer-facing read, plus a new base URL and secret in order-service's production settings.
3. **The app asks for the route itself.** Needs a new public route through the gateway and lets any client spend Ola calls.

Picked 1: least new infrastructure, and a failure only means the pin does not move.

## Design

### 1. user-chef-service: road path

New `POST /internal/v1/maps/road-path`, same secret header and request points as `road-distance`. Calls Ola Directions
with `overview=full` and answers `{"polyline": "<Ola overview_polyline>"}`; `{"polyline": null}` when Ola has no key,
times out or returns no route (always 200, like road-distance). Not cached in the database: integration-service asks once a trip.

### 2. integration-service: customer position feed

New class `FleetCustomerPositionFeed` in `fleet/trip`, on only with `craves.fleet.enabled` and the new
`craves.fleet.customer-position-enabled` (`CRAVES_FLEET_CUSTOMER_POSITION_ENABLED`, default `false`).

- A scheduled job every 20 seconds reads, in one statement, the trips in `PICKED_UP` or `AT_DROP` whose latest stage is
  the fleet's, that have a `craves_fleet` delivery job, and whose rider has a real (not mock) position for that trip
  received after pickup.
- For each trip whose position is newer than the one it last published (kept in memory), it enqueues a
  `DELIVERY_STATUS_CHANGED` event through the existing outbox: the job's current status, `observedAt` = the position's
  `received_at`, the rider card as today, plus the new fields below. It does not touch `delivery_job` or call
  `processTracking`, so the status pipeline is unchanged.
- The road path kitchen → drop is fetched once a trip from user-chef (`RoadDistanceClient.path`) and kept in a small
  in-memory map; it is sent on every position event so a lost first event cannot lose it. A missing path is sent as null.
- Two instances may publish the same position twice; order-service stores the same values twice. Harmless.

New optional fields on `DeliveryStatusChangedData` (both services): `courierLatitude`, `courierLongitude`,
`courierLocationObservedAt`, `routePolyline`. Status events leave them null.

### 3. order-service: store and return

- Migration: `customer_order.delivery_route_polyline TEXT` (nullable).
- `storeCourier` also writes the position columns when the event carries a position newer than the stored one, and the
  path when the event carries one. A handoff to another provider clears position and path with the rest of the courier.
- The event validator rejects a latitude or longitude out of range, half a pair, or a path over 20 000 characters.
- `DeliveryStatusResponse` gains `courierLocation {latitude, longitude, observedAt}` and `routePath` (string). Both are
  null unless the provider is `craves_fleet` and the status is `PICKED_UP`, `IN_TRANSIT` or `AT_DROPOFF`.

### 4. Craves app

- Parse `routePath` (optional string; a bad value reads as null).
- Decode it (Google polyline, precision 5) and draw a solid line from the point on the path nearest the rider to the house.
- No path, or the rider more than 300 m from it: today's dotted straight line.
- New app version on `feat/advanced-features-app`.

## Rollout

1. Merge the backend PR (deploys to production with the switch off). order-service ignores unknown event fields today
   or is made to; checked in the plan before the event grows.
2. Set `CRAVES_FLEET_CUSTOMER_POSITION_ENABLED=true` on integration-service (needs `CRAVES_FLEET_LOCATION_INGEST_ENABLED=true`).
3. Install the new app build.

## Left to the builder

Exact SQL, test names, the nearest-point maths, and where the in-memory maps are bounded.

## Not verifiable before go-live

No rider is on a trip in production, so the end-to-end path cannot be watched on a phone. Each part is covered by its
own tests; the Ola `overview_polyline` format is taken from Ola's documentation, not from a live call.
