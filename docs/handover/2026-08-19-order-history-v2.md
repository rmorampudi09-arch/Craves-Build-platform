# Craves Order History v2 — Engineering Handover

Date: 2026-08-19
Scope: Backend only
Target: Craves-Build-platform production repository

## Objective

Provide scalable, deterministic order-history retrieval for the complete customer and home-chef journeys while preserving all existing order APIs and business rules.

## Current production issue addressed

The existing customer endpoint returns a fixed latest-50 list. The existing chef endpoint is more severe: it reads the latest 100 marketplace orders, then calls Catalog for each row and filters by chef in Java. At sufficient marketplace volume, a chef can receive an incomplete/empty result even when that chef has valid older orders, and the route creates N+1 cross-service calls.

## Implemented

- Added opaque `(created_at, id)` cursor model and codec.
- Added customer paged order history endpoint.
- Added chef paged order history endpoint.
- Added optional existing-status filtering.
- Added role and cursor validation before DB access.
- Added customer/kitchen cursor indexes and status cursor indexes via Flyway V16.
- Added a single read-only chef ownership join against Catalog's kitchen profile inside the shared Business DB.
- Added one batch query for all order items in a returned page, removing item N+1 behavior from the new endpoints.
- Preserved existing customer/chef list and order-detail endpoints.
- Added cursor and access-validation unit tests.

## Architecture note

The chef history query is intentionally a read-only projection across `order_schema.customer_order` and `catalog_schema.kitchen_profile`, both hosted in the approved Business PostgreSQL database. Order Service does not write Catalog data, and Catalog does not write Order data. This projection removes the runtime HTTP N+1 and avoids inventing or duplicating chef ownership state in Order Service.

If the platform later separates these schemas into different physical databases, replace this join with an event-maintained Order read model containing the chef identity snapshot; the public cursor contract can remain unchanged.

## Deployment requirements

1. Run `mvn -B -ntp clean verify` in `services/order-service`.
2. Verify Flyway through V16.
3. Inspect PostgreSQL query plans for customer and chef page queries.
4. Deploy through `azure-pipelines-order-service.yml` using `AZURE_SERVICE_CONNECTION=Craves-Dev-Service-Connection`.
5. Verify Container App health/readiness.
6. Smoke-test customer and chef JWT isolation.
7. Smoke-test page 1/page 2 while inserting a new order between requests.
8. Expose new routes through the existing APIM order API before frontend adoption.

## Azure impact

No new paid resource and no new secret are required. The only persistence change is the V16 index migration; monitor database CPU/IO during index creation.

## Product decisions untouched

Pricing, commissions, delivery fees/radius, cancellation/refund behavior, ratings/reviews, FSSAI/KYC, tax/GST, provider selection and order transition policy remain unchanged.
