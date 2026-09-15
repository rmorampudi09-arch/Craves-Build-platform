# Craves Backend Catalog Discovery v2 — Convergence Handover

Date: 2026-09-11  
Service: Catalog Service  
Runtime posture: source only; no Azure, APIM or production database change in this package

## Purpose

Converge the already-tested Catalog discovery, schedule, batch-availability and optional Redis-cache implementation from the long-diverged backend branch onto current `main` without importing unrelated payment, delivery, support or frontend history.

## Backend capabilities restored

### Nearby discovery

- PostGIS `ST_DWithin` eligibility using the customer-selected point and a bounded radius.
- Active-kitchen and active/available-menu predicates remain mandatory.
- Text search covers current kitchen and menu text using PostgreSQL `simple` full-text configuration, allowing English and local-language tokens without client-side marketplace scans.
- Structured server-side filters for current category, food type, minimum/maximum current Catalog price, maximum preparation time and spice level.
- Deterministic sort options for distance, name, price and preparation time.
- Bounded page/offset inputs and stable UUID tie-breakers.

Discovery remains Catalog truth only. It does not claim that a currently unavailable hyperlocal provider will accept a delivery.

### Kitchen schedules and availability

- Owned chef schedule management over the existing V7 schedule schema.
- Public current availability projection derived from schedule/menu state.
- Atomic bulk menu availability changes with ownership validation and row locking.
- Public bounded menu batch resolution for downstream/cart/discovery clients.

No meal time, holiday, capacity, stock quantity, health claim or preorder policy is invented. The APIs persist and expose only explicitly supplied/authoritative values.

### Optional Redis discovery cache

- Disabled by default: `CRAVES_DISCOVERY_CACHE_ENABLED=false`.
- Cache read/write failures fail open to PostgreSQL rather than taking discovery down.
- Bounded configurable TTL and temporary failure backoff.
- Namespace-version invalidation after owned kitchen, menu, image and availability writes.
- Cached data remains the same privacy-reduced response contract returned by the database path.

## Existing migrations

Current `main` already contains:

- V6 search/filter indexes;
- V7 kitchen schedule/availability schema.

This convergence does not edit, renumber, repair or duplicate either migration.

## Primary code paths

```text
services/catalog-service/src/main/java/in/craves/catalog/config/DiscoveryCacheProperties.java
services/catalog-service/src/main/java/in/craves/catalog/service/DiscoveryCriteria.java
services/catalog-service/src/main/java/in/craves/catalog/service/NearbyDiscoveryService.java
services/catalog-service/src/main/java/in/craves/catalog/service/DiscoveryCacheService.java
services/catalog-service/src/main/java/in/craves/catalog/service/KitchenScheduleService.java
services/catalog-service/src/main/java/in/craves/catalog/service/BulkMenuAvailabilityService.java
services/catalog-service/src/main/java/in/craves/catalog/service/PublicMenuBatchResolveService.java
services/catalog-service/src/main/java/in/craves/catalog/web/NearbyDiscoveryController.java
services/catalog-service/src/main/java/in/craves/catalog/web/KitchenScheduleController.java
services/catalog-service/src/main/java/in/craves/catalog/web/PublicKitchenAvailabilityController.java
services/catalog-service/src/main/java/in/craves/catalog/web/KitchenController.java
```

## Product-rule boundary

This package deliberately does not add:

- rating-based ordering before the review projection contract is approved;
- sponsored/commercial boosts;
- most-ordered or popularity rules;
- free-delivery/offer interpretation;
- nutritional, allergy, diabetic-friendly, gluten-free or medical claims;
- a proprietary delivery ETA;
- provider-aware serviceability when no verified hyperlocal provider contract exists;
- hidden personalization weights.

The technical filter/sort contract is extensible, but unsupported facts fail closed rather than being guessed.

## Scale and reliability

- PostGIS geography index remains the first-stage radius constraint.
- existing V6 full-text and filter indexes are reused;
- count/result queries share the same eligibility predicates;
- bulk availability is transactionally ownership-checked;
- public batch resolution is bounded;
- cache is optional and never authoritative;
- every mutable Catalog action invalidates the shared discovery namespace.

## Validation

Dedicated CI runs Java 21 Maven `clean verify`, focused criteria/cache/schedule/batch/privacy tests and static checks for geospatial filtering, full-text search, bounds, cache invalidation and absence of invented ranking/commercial/health logic.

## Deployment later

1. Confirm the Catalog target Flyway history already contains the exact current V6/V7 checksums.
2. Deploy the reviewed Catalog image through the existing guarded service pipeline.
3. Keep Redis discovery caching disabled for the first smoke.
4. Verify nearby kitchen/menu search, each supported filter/sort, schedule/current availability and bulk availability ownership.
5. Enable the existing Redis connection only after the uncached runtime path is accepted; then set `CRAVES_DISCOVERY_CACHE_ENABLED=true` and verify invalidation.
6. Publish any newly required APIM operations through the guarded Catalog APIM source.

No new Azure resource, key or provider credential is required. The existing Redis/PostgreSQL bindings are reused.
