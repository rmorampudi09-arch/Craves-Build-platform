# Craves Kitchen Schedule & Live Availability v1 — Engineering Handover

Date: 2026-08-19
Scope: Backend + APIM only
Frontend: unchanged

## Architecture ownership

CRV architecture assigns schedule and availability to Catalog Service. The implementation stays inside Catalog and exposes an authenticated chef management API plus a public read-only live-availability projection.

## Implemented

- Weekly non-overlapping local service windows.
- Explicit `acceptingOrders` control.
- Temporary `pausedUntil` with optional reason.
- Closed-date overrides.
- Special-hours date overrides with multiple windows.
- Hyderabad `Asia/Kolkata` schedule evaluation.
- ACTIVE kitchen status included in availability decision.
- Audit snapshots for schedule mutations.
- Backward compatibility for kitchens with no configured schedule.
- APIM chef operations under the existing Chef Kitchen API.
- Public no-cache availability alias under the existing Discovery API.
- Operation-only APIM rollback script.

## Availability decision

`availableNow` requires:

1. Kitchen is ACTIVE.
2. Chef is accepting orders.
3. Temporary pause is not active.
4. Effective weekly/date schedule is open at the evaluated local time.

This value does not claim final delivery serviceability and does not calculate fees or provider capacity.

## Production deployment sequence

1. Run Catalog Maven `clean verify` on Java 21.
2. Validate Flyway V1-V7 ordering.
3. Deploy Catalog through the existing Azure DevOps Catalog pipeline.
4. Confirm latest Container App revision is Ready/Healthy.
5. Confirm existing discovery calls still work for kitchens with no schedule.
6. Configure APIM with `scripts/apim/configure-kitchen-schedule-v1-apim.sh`.
7. Verify chef schedule routes reject missing Bearer authentication.
8. Verify public availability route returns `Cache-Control: no-store`.
9. Exercise weekly windows, pause, closure and special-hours override.
10. Use `scripts/apim/rollback-kitchen-schedule-v1-apim.sh` if gateway exposure must be reverted; database schema can remain additive.

## Manual intervention

No new paid Azure resource, Key Vault secret, Firebase setting, Cashfree setting, DNS record or mobile-store action is required. The only manual external action is the normal Azure DevOps pipeline execution / APIM script execution because this ChatGPT session has no Azure DevOps execution connector.

## Product decisions not invented

Capacity-per-slot, ratings/reviews, pricing, commission, delivery radius, final serviceability, provider selection, cancellation/refund, FSSAI and tax rules remain unchanged/unresolved where applicable.
