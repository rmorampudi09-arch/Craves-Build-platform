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
- Added `chef_identity_id` as an Order-owned chef ownership snapshot via Flyway V16.
- Backfilled existing order ownership once from authoritative Catalog kitchen ownership.
- Added an insert/update snapshot hook while Catalog and Order share the approved Business PostgreSQL database.
- Added customer/chef cursor indexes and status cursor indexes via Flyway V16.
- Added one batch query for all order items in a returned page, removing item N+1 behavior from the new endpoints.
- Preserved existing customer/chef list and order-detail endpoints.
- Added cursor and access-validation unit tests.

## Architecture note

The final history read path does not perform a runtime Catalog-schema join and does not call Catalog once per order. `OrderHistoryService` reads only `order_schema.customer_order`, including the Order-owned `chef_identity_id` snapshot.

Because Catalog and Order currently share the approved Business PostgreSQL database, V16 uses Catalog kitchen ownership only for the one-time historical backfill and the database snapshot hook for new order inserts. If those services later move to separate physical databases, replace that same-database hook with an event-maintained ownership projection; the public history API and indexes can retain the same logical contract.

## Deployment requirements

1. Run `mvn -B -ntp clean verify` in `services/order-service`.
2. Verify Flyway through V16, including historical `chef_identity_id` backfill.
3. Confirm a new order insert receives a non-null chef ownership snapshot.
4. Inspect PostgreSQL query plans for customer and chef page queries.
5. Deploy through `azure-pipelines-order-service.yml` using `AZURE_SERVICE_CONNECTION=Craves-Dev-Service-Connection`.
6. Verify Container App health/readiness.
7. Smoke-test customer and chef JWT isolation.
8. Smoke-test page 1/page 2 while inserting a new order between requests.
9. Run `scripts/apim/configure-order-history-v2-apim.sh` after the Order revision is healthy.

## Azure impact

No new paid Azure resource and no new secret are required. V16 changes the existing Business DB schema and creates indexes; monitor database CPU/IO during migration and backfill.

## Product decisions untouched

Pricing, commissions, delivery fees/radius, cancellation/refund behavior, ratings/reviews, FSSAI/KYC, tax/GST, provider selection and order transition policy remain unchanged.
