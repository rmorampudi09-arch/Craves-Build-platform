# Craves Catalog Discovery Query v2 — Engineering Handover

Date: 2026-08-19
Scope: Backend only
Target: Craves-Build-platform production repository, controlled promotion through Azure DevOps

## Objective

Make Hyderabad customer discovery production-grade enough for future 10/10 customer UX while preserving the approved Craves home-chef model and retaining the current web/mobile contract.

## Implemented capability

The existing nearby-kitchen and nearby-menu-item APIs are extended with optional free-text search, category, food type, price range, maximum preparation time, spice level, and deterministic sorting. Existing callers that send only coordinates/radius/page/size continue to behave as before.

## Why this is backend-first

Customer and chef front ends are explicitly out of scope for this implementation phase. The new parameters create stable backend capability that web/mobile can consume later without another catalog-domain rewrite.

## Architecture alignment

- Spring Boot 3 / Java 21 remains unchanged.
- Catalog Service remains owner of dishes, menu metadata, availability, price metadata, and search metadata.
- PostgreSQL/PostGIS remains authoritative for geographic discovery.
- No business-critical value is computed in the browser.
- No direct third-party provider call is added to discovery.
- No product rules are invented.
- Pagination and indexed database-side filtering are retained for scale.

## Production promotion caution

Current production already has Catalog V4 and V5 pickup-location migrations. Therefore this module uses V6. The changes were reconciled against the current `Craves-Build-platform/main` Catalog files before commit. Run Catalog CI, verify Flyway V1-V6, then deploy through the existing Azure DevOps pipeline.

## Testing required before production

1. Java 21 Maven unit tests.
2. Flyway migration validation with V1 through current production V6 sequence.
3. PostgreSQL/PostGIS integration test.
4. Query-plan inspection for representative broad-radius searches.
5. Backward compatibility smoke test with no new filters.
6. Combined-filter smoke tests.
7. APIM/BFF contract smoke test after promotion.
8. Container App health/readiness validation after deployment.

## Azure impact

No resource provisioning is required. This migration adds indexes to the existing PostgreSQL catalog schema and therefore requires normal production migration monitoring. Index creation can consume database CPU/IO while it runs; schedule production promotion through the normal controlled deployment process.

## Product decisions intentionally untouched

Ratings/reviews, FSSAI/KYC, service radius, commissions, delivery fees, minimum order, cancellation/refund, provider priority, tax/GST, and commercial ranking remain outside this module.
