# Rider Live Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After pickup by a Craves rider, the customer's tracking map shows the rider's pin and a line along the roads to the house.

**Architecture:** integration-service publishes a same-status `DELIVERY_STATUS_CHANGED` event carrying the rider's latest position and the kitchen → drop road path (fetched once a trip from user-chef-service, which asks Ola). order-service stores the latest position and path on the order and returns them from `GET /api/v1/orders/{orderId}/delivery-status`. The app decodes the path and draws it.

**Tech Stack:** Java 21 / Spring Boot / JdbcTemplate / Flyway / Maven (three services); React Native + TypeScript + zod + MapLibre (app).

**Spec:** `docs/superpowers/specs/2026-11-14-rider-live-route-design.md`

## Global Constraints

- Backend work: worktree `C:\mroute`, branch `feat/rider-live-route` (from `origin/main`). App work: worktree `C:\madv`, branch `feat/advanced-features-app`.
- Do not change `FleetLocationService`, the rider app (`apps/mobile/src/features/rider`, rider flavor), or `FleetProperties`.
- The feed ships off: `craves.fleet.customer-position-enabled: ${CRAVES_FLEET_CUSTOMER_POSITION_ENABLED:false}`.
- New event fields are optional and null on every existing event: `courierLatitude`, `courierLongitude`, `courierLocationObservedAt`, `routePolyline`.
- API fields: `courierLocation {latitude, longitude, observedAt}` and `routePath` (string). Both null unless provider is `craves_fleet` and status is `PICKED_UP`, `IN_TRANSIT` or `AT_DROPOFF`.
- Path limit: 20 000 characters. Off-route limit in the app: 300 m. Feed tick: 20 000 ms.
- No Docker on this PC: `*DatabaseTest` classes run in CI only. Write them, run the plain unit tests locally, say which ran.
- Maven on this PC: from the service folder, `.\mvnw.cmd -q test -Dtest=<Class>` if `mvnw.cmd` exists, else `mvn -q test -Dtest=<Class>`.
- Commits end with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`. Do not push or open a PR; the owner decides.
- App version for this change: `1.36.18`, versionCode `118` (`apps/mobile/android/app/build.gradle`).

## Review Focus

- Rider position older than the stored one arrives late (two instances, retries): the stored position must not go backwards. Test in Task 4.
- Event carries a position but no path (Ola down): the stored path must stay. Test in Task 4.
- Order delivered, cancelled or handed to Borzo/Pidge: the API must return no position and no path. Test in Task 4.
- Ola answers without `overview_polyline`, or user-chef is unreachable: the event still goes out with the position and no path. Tests in Tasks 1 and 3.
- Malformed `routePath` reaching the app (truncated string, wrong type): the tracking screen must still load and show the dotted line. Tests in Task 5.

---

### Task 1: user-chef-service — road path endpoint

**Files:**
- Modify: `services/user-chef-service/src/main/java/in/craves/userchef/location/OlaMapsClient.java`
- Modify: `services/user-chef-service/src/main/java/in/craves/userchef/location/RoadDistanceService.java`
- Modify: `services/user-chef-service/src/main/java/in/craves/userchef/web/InternalRoadDistanceController.java`
- Modify: `services/user-chef-service/README.md` (one paragraph next to the road-distance one, line ~187)
- Test: `services/user-chef-service/src/test/java/in/craves/userchef/location/OlaMapsClientTest.java`, `.../web/InternalRoadDistanceHttpTest.java`

**Interfaces:**
- Produces: `POST /internal/v1/maps/road-path`, header `X-Craves-Internal-Secret`, body `{"from":{"lat":..,"lng":..},"to":{"lat":..,"lng":..}}` (the existing `RoadDistanceRequest`), answer `{"polyline": "<string>"}` or `{"polyline": null}`; always 200 when the secret is right. Wrong/missing secret: same as road-distance.

- [ ] **Step 1: Failing tests.** In `OlaMapsClientTest`: `parsePathReadsOverviewPolyline` — `OlaMapsClient.parsePath` of `{"routes":[{"overview_polyline":"_p~iF~ps|U_ulLnnqC"}]}` returns `"_p~iF~ps|U_ulLnnqC"`; `parsePathIsNullWithoutRoute` — `{}`, `{"routes":[]}`, a blank string and a non-text value all return `null`. In `InternalRoadDistanceHttpTest` (copy the style of the road-distance cases): `roadPathAnswersPolyline` (200, `$.polyline` equals the stub), `roadPathAnswersNullWhenOlaFails` (200, `$.polyline` null), `roadPathRejectsMissingSecret` (same status road-distance gives).
- [ ] **Step 2:** Run both test classes; expect compile failure on `parsePath` / 404 on the route.
- [ ] **Step 3:** `OlaMapsClient`: `public String roadPath(BigDecimal fromLat, BigDecimal fromLng, BigDecimal toLat, BigDecimal toLng)` — same call as `roadDistance` but `overview=full`; throws `ApiException` (via `unavailable(DIRECTIONS, "no route in response", null)`) when `parsePath` is null. `static String parsePath(JsonNode root)` — `routes[0].overview_polyline` when it is non-blank text, else null.
- [ ] **Step 4:** `RoadDistanceService`: `public String path(BigDecimal fromLat, BigDecimal fromLng, BigDecimal toLat, BigDecimal toLng)` — calls `maps.roadPath`, returns null on `ApiException`. No database cache.
- [ ] **Step 5:** Controller: `@PostMapping("/road-path") public RoadPath roadPath(...)` with `public record RoadPath(String polyline) {}`; authorizes like `roadDistance`. The record must serialize a null polyline as `"polyline": null` (no `NON_NULL`).
- [ ] **Step 6:** Run both test classes; expect PASS. Add the README paragraph.
- [ ] **Step 7:** Commit `user-chef: road path for the customer's tracking map`.

### Task 2: Event contract — four optional fields

**Files:**
- Modify: `contracts/events/delivery-status-changed-v1.schema.json`
- Modify: `services/integration-service/src/main/java/in/craves/integration/delivery/command/DeliveryCommandModels.java`
- Modify: `services/order-service/src/main/java/in/craves/order/delivery/DeliveryStatusModels.java`
- Modify: `services/integration-service/src/main/java/in/craves/integration/fleet/client/RoadDistanceClient.java`
- Test: `services/integration-service/src/test/java/in/craves/integration/fleet/client/FleetClientsTest.java`

**Interfaces:**
- Produces: both `DeliveryStatusChangedData` records end with `BigDecimal courierLatitude, BigDecimal courierLongitude, Instant courierLocationObservedAt, String routePolyline` (19 components). Each keeps a 15-argument constructor (today's canonical order) that passes null for the four, so no existing caller changes.
- Produces: `public String RoadDistanceClient.path(double fromLat, double fromLng, double toLat, double toLng)` — POSTs `/internal/v1/maps/road-path` with the same header and body shape as `meters`; returns the `polyline` text, or null when the client is not configured, the call fails, or the value is missing/blank. Logs `FLEET_ROAD_PATH_UNAVAILABLE reason=<class>` on failure. Never throws.

- [ ] **Step 1:** Schema: under `data.properties` add `courierLatitude` (`["number","null"]`, -90..90), `courierLongitude` (`["number","null"]`, -180..180), `courierLocationObservedAt` (`["string","null"]`, `date-time`), `routePolyline` (`["string","null"]`, `maxLength` 20000). Not in `required`.
- [ ] **Step 2: Failing test** in `FleetClientsTest` (style of the road-distance cases there): `roadPathReturnsPolyline`, `roadPathIsNullWhenServerFails`, `roadPathIsNullWhenNotConfigured`.
- [ ] **Step 3:** Run `FleetClientsTest`; expect compile failure.
- [ ] **Step 4:** Add the record components + 15-arg constructors in both services, and `RoadDistanceClient.path`.
- [ ] **Step 5:** Run `FleetClientsTest`, integration `DeliveryStatusUpdateServiceTest`, order `DeliveryStatusChangedServiceBusProcessorTest`; expect PASS (proves existing callers compile and old payloads still parse).
- [ ] **Step 6:** Commit `Delivery status event: optional courier position and route path`.

### Task 3: integration-service — customer position feed

**Files:**
- Create: `services/integration-service/src/main/java/in/craves/integration/fleet/trip/FleetCustomerPositionFeed.java`
- Modify: `services/integration-service/src/main/resources/application.yml` (under `craves.fleet`, after `location-ingest-enabled`)
- Modify: `docs/riders/BACKEND.md` (short section "Customer position feed")
- Test: `services/integration-service/src/test/java/in/craves/integration/fleet/trip/FleetCustomerPositionFeedDatabaseTest.java` (fixtures and container setup copied from `FleetStatusBridgeDatabaseTest`)

**Interfaces:**
- Consumes: `RoadDistanceClient.path(...)` and the 19-component `DeliveryStatusChangedData` (Task 2); `DeliveryOutboxRepository.enqueue(String eventType, UUID aggregateId, UUID correlationId, JsonNode payload)`; `FleetStatusBridge.PROVIDER_ID`; `FleetConfiguration.FLEET_SCHEDULER`.
- Produces: outbox rows of type `DeliveryCommandModels.DELIVERY_STATUS_CHANGED` whose `data` has the job's ids, `providerId` `craves_fleet`, `providerDeliveryId` = trip id, `status` = the delivery job's current status, `trackingUrl` null, `observedAt` = `courierLocationObservedAt` = the position's `received_at`, `courierLatitude`/`courierLongitude`, `routePolyline` (omitted when unknown), and null courier name/phone/photo/ETA and handoff fields. Envelope exactly as `FleetStatusBridge.assigned` builds it.

- [ ] **Step 1: Failing test class** with a stub `RoadDistanceClient` returning `"abc"` and counting calls. Cases:
  - `publishesPositionForPickedUpTrip`: trip `PICKED_UP`, `craves_fleet` job with status `PICKED_UP`, real position for that trip received after `picked_up_at` → after `tick()` one new outbox row with the fields above.
  - `samePositionIsPublishedOnce`: second `tick()` adds no row.
  - `newerPositionIsPublishedAgain`: move `received_at` forward and change lat/lng → one more row with the new values; path client called once in total.
  - `noPathStillPublishes`: stub returns null → row has position, no `routePolyline`; path client not called again on later ticks for that trip.
  - `skipsMockPosition`, `skipsPositionFromBeforePickup`, `skipsPositionOfAnotherTrip` (`rider_position_latest.trip_id` differs), `skipsAssignedTrip`, `skipsDeliveredTrip`, `skipsJobOfAnotherProvider` (job `provider_id` `borzo`): no row.
  - `oneFailingTripDoesNotStopTheOthers`: outbox throws for the first trip → the second trip's row is still written and `tick()` does not throw.
- [ ] **Step 2:** It cannot run locally (no Docker); confirm it compiles-fails for the missing class with `mvn -q test-compile`.
- [ ] **Step 3:** Implement `FleetCustomerPositionFeed`:
  - `@Component`, `@ConditionalOnProperty(name = {"craves.fleet.enabled", "craves.fleet.customer-position-enabled"}, havingValue = "true")`.
  - Constructor `(JdbcTemplate jdbc, DeliveryOutboxRepository outbox, RoadDistanceClient roads, ObjectMapper json)`.
  - `@Scheduled(scheduler = FleetConfiguration.FLEET_SCHEDULER, fixedDelayString = "${craves.fleet.customer-position-tick-ms:20000}") public void tick()`.
  - One SELECT: `fleet_schema.trip t` in (`PICKED_UP`, `AT_DROP`) JOIN `delivery_schema.delivery_job j` on `j.chef_sub_order_id = t.chef_sub_order_id AND j.provider_id = 'craves_fleet' AND j.provider_delivery_id = t.id::text AND j.status IN ('PICKED_UP','IN_TRANSIT','AT_DROPOFF')` JOIN `fleet_schema.rider_position_latest p` on `p.rider_id = t.rider_id AND p.trip_id = t.id AND NOT p.mock AND p.received_at > t.picked_up_at`.
  - Two in-memory maps keyed by trip id: last published `received_at`, and the path as `Optional<String>` (so a null answer is not asked again). After each tick, drop keys not in that tick's result. Comment: `// shortcut: per-instance memory, so two instances publish each position twice (order-service stores the same values); move to a column if instances grow`.
  - Per trip in its own try/catch; on failure log `FLEET_CUSTOMER_POSITION_FAILED trip={} reason={}` and continue. Record the position as published only after `enqueue` returns.
  - Does not update `delivery_job` and does not call `DeliveryStatusUpdateService`.
- [ ] **Step 4:** `application.yml`: `customer-position-enabled: ${CRAVES_FLEET_CUSTOMER_POSITION_ENABLED:false}` with a two-line comment: publishes the rider's position to the customer's order while on the way; needs `location-ingest-enabled` and an order-service from the same release.
- [ ] **Step 5:** `mvn -q test-compile` passes; run `FleetClientsTest` and `DeliveryStatusUpdateServiceTest` again; expect PASS. Add the BACKEND.md section (what it sends, the switch, the 20 s tick, that it stays off the location upload path).
- [ ] **Step 6:** Commit `Fleet: customer position feed (off by default)`.

### Task 4: order-service — store and return position and path

**Files:**
- Create: `services/order-service/src/main/resources/db/migration/V45__delivery_route_polyline.sql` (check `origin/main` again before the PR; take the next free number)
- Modify: `services/order-service/src/main/java/in/craves/order/delivery/DeliveryStatusEventValidator.java`
- Modify: `services/order-service/src/main/java/in/craves/order/delivery/DeliveryStatusUpdateService.java` (`applyValidated` handoff clear ~line 173, `storeCourier` ~line 257)
- Modify: `services/order-service/src/main/java/in/craves/order/delivery/DeliveryStatusQueryService.java`
- Modify: `services/order-service/src/main/java/in/craves/order/web/DeliveryStatusDtos.java`
- Test: `.../delivery/DeliveryStatusEventValidatorTest.java`, `.../web/DeliveryStatusResponsePrivacyTest.java`, new `.../delivery/DeliveryCourierPositionDatabaseTest.java` (setup copied from `DeliveryCodeDatabaseTest`)

**Interfaces:**
- Consumes: the 19-component order-side `DeliveryStatusChangedData` (Task 2).
- Produces: `DeliveryStatusResponse(orderId, deliveryJobId, providerId, status, trackingUrl, observedAt, history, deliveryCode, CourierLocationResponse courierLocation, String routePath)` and `record CourierLocationResponse(double latitude, double longitude, Instant observedAt)`. JSON: `"courierLocation": {"latitude": 17.4, "longitude": 78.4, "observedAt": "..."}` or null; `"routePath": "..."` or null.

- [ ] **Step 1: Failing tests.**
  - Validator: `acceptsCourierPosition` (17.4, 78.4, timestamp, path of 20 000 chars); rejects with `DeliveryStatusValidationException`: latitude 90.1, longitude -180.1, latitude without longitude, position without `courierLocationObservedAt`, path of 20 001 chars. `acceptsEventWithoutPosition` (all four null) stays green.
  - Privacy test: `DeliveryStatusResponse` components also contain `courierLocation`, `routePath`.
  - `DeliveryCourierPositionDatabaseTest` (order with provider `craves_fleet`, status `PICKED_UP`, observed at T0): 
    - `sameStatusEventStoresPositionAndPath`: event `PICKED_UP` at T0+30s with position P1 and path `"abc"` → result `NO_CHANGE`; `getForCustomer` returns `courierLocation` P1 with that timestamp and `routePath` `"abc"`; status history has no new row.
    - `olderPositionDoesNotReplaceNewer`: after P2 at T0+60s, an event at T0+45s with P1 → response still P2.
    - `eventWithoutPathKeepsStoredPath`: position event with null `routePolyline` → `routePath` still `"abc"`.
    - `statusEventWithoutPositionKeepsPosition`: `IN_TRANSIT` event with no position → response status `IN_TRANSIT`, `courierLocation` still set.
    - `hiddenBeforePickupAndAfterDelivery`: stored position, status `COURIER_ASSIGNED` → both null; status `DELIVERED` → both null.
    - `hiddenForOtherProviders`: provider `borzo`, status `IN_TRANSIT` → both null.
    - `handoffClearsPositionAndPath`: an initial handoff event to another provider nulls the three position columns and `delivery_route_polyline`.
    - `anotherCustomerGets404`: unchanged behaviour, asserted once here.
- [ ] **Step 2:** Run the validator and privacy tests; expect FAIL.
- [ ] **Step 3:** Migration: `ALTER TABLE order_schema.customer_order ADD COLUMN IF NOT EXISTS delivery_route_polyline TEXT;` with a one-line comment (road path kitchen → drop for the customer's map; latest only).
- [ ] **Step 4:** Validator: the five rules above, checked after the existing ones.
- [ ] **Step 5:** `DeliveryStatusUpdateService`: 
  - handoff clear also nulls `delivery_courier_latitude`, `delivery_courier_longitude`, `delivery_courier_location_observed_at`, `delivery_route_polyline`;
  - `storeCourier`: keep today's update for name/phone/photo/ETA (its early return must not skip the new part); add one UPDATE when the event has a position: set the three position columns and `delivery_route_polyline = COALESCE(?, delivery_route_polyline)` `WHERE id = ? AND (delivery_courier_location_observed_at IS NULL OR delivery_courier_location_observed_at < ?)`.
- [ ] **Step 6:** `DeliveryStatusQueryService`: select the four columns; build `courierLocation` and `routePath` only when `DeliveryCodeService.CRAVES_FLEET_PROVIDER_ID.equalsIgnoreCase(providerId)`, status is `PICKED_UP`, `IN_TRANSIT` or `AT_DROPOFF`, and latitude is non-null.
- [ ] **Step 7:** Run validator, privacy, `DeliveryStatusTransitionPolicyTest`, `DeliveryStatusChangedServiceBusProcessorTest`; expect PASS. `mvn -q test-compile` for the database test.
- [ ] **Step 8:** Commit `order-service: rider position and road path on delivery status`.

### Task 5: Craves app — draw the road path (worktree `C:\madv`)

**Files:**
- Create: `apps/mobile/src/features/customerOrders/presentation/orderRoute.ts`, `apps/mobile/src/features/customerOrders/presentation/orderRoute.test.ts`
- Modify: `apps/mobile/src/features/customerOrders/domain/customerOrderTrackingTypes.ts`
- Modify: `apps/mobile/src/features/customerOrders/api/customerOrderTrackingApi.ts`, `apps/mobile/src/features/customerOrders/customerOrderTrackingApi.test.ts`
- Modify: `apps/mobile/src/features/customerOrders/components/OrderMap.tsx`
- Modify: `apps/mobile/src/features/customerOrders/screens/CustomerOrderTrackingScreen.tsx` (and `CustomerOrderDetailScreen.tsx` if it passes `courier` to `OrderMap`)
- Modify: `apps/mobile/android/app/build.gradle` (versionCode 118, versionName "1.36.18")

**Interfaces:**
- Consumes: `routePath` string from the API (Task 4); `MapPoint` from `features/maps/OlaMapPicker`.
- Produces: `decodePolyline(encoded: string): MapPoint[]` (Google polyline, precision 5; `[]` for a malformed or empty string); `remainingRoute(path: MapPoint[], courier: MapPoint, maxOffRouteMeters = 300): MapPoint[] | null` — null when the path has fewer than 2 points or its nearest vertex is farther than the limit from the courier; else `[courier, ...path after the nearest vertex]`, always ending at the path's last point. `CustomerOrderTracking.routePath: string | null`. `OrderMap` prop `routePath?: MapPoint[] | null`.

- [ ] **Step 1: Failing tests.** `orderRoute.test.ts`: `decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')` equals `[{latitude: 38.5, longitude: -120.2}, {latitude: 40.7, longitude: -120.95}, {latitude: 43.252, longitude: -126.453}]` (to 5 decimals); `decodePolyline('')` and `decodePolyline('_p~iF~ps|U_')` (cut mid-pair) return `[]`; `remainingRoute` on a 4-point straight path with the courier 20 m from point 2 returns `[courier, point3, point4]`; courier at the last point returns `[courier, last]`; courier 400 m away returns null; 1-point path returns null. `customerOrderTrackingApi.test.ts`: a response with `routePath: 'abc'` parses to `'abc'`; missing, null, a number, and a 20 001-character string parse to `null` without failing the whole response.
- [ ] **Step 2:** `npx jest src/features/customerOrders` from `apps/mobile`; expect the new cases to FAIL.
- [ ] **Step 3:** Implement `orderRoute.ts`, the type, and the zod field (`z.string().max(20000).nullish().catch(null).transform(v => v ?? null)`); in the `status === null` branch a non-null `routePath` is invalid like the other fields.
- [ ] **Step 4:** `OrderMap`: when `routePath` is given and `remainingRoute(routePath, courier)` is non-null, the line's coordinates are that route followed by `home`, painted solid (same colour and width, no `line-dasharray`); otherwise today's dotted courier → home line. Screen: `useMemo(() => (projection.routePath ? decodePolyline(projection.routePath) : null), [projection.routePath])` passed as `routePath`.
- [ ] **Step 5:** `npx jest src/features/customerOrders` and `npx tsc --noEmit`; expect PASS / no new errors.
- [ ] **Step 6:** Bump the version; commit `App 1.36.18: rider's road route on the tracking map`.

### Task 6: Verify and hand over

- [ ] **Step 1:** Backend: in each of the three services run the full unit suite (`mvn -q test`); list which classes were skipped for lack of Docker.
- [ ] **Step 2:** App: full `npx jest` and `npx tsc --noEmit`.
- [ ] **Step 3:** Build the release APK from `C:\madv` (existing 1.36.x build steps; sign with `debug.keystore` via apksigner), install on phone `GURKT4DYYPUW7DX8`, open a past order's tracking screen and a live order before pickup: the screen loads, the map is unchanged. Look at the screen before every tap.
- [ ] **Step 4:** Report: what ran, what could not (database tests, a live rider trip), the switch to flip, and that the Ola `overview_polyline` format is from documentation. Ask the owner about pushing and PRs.
