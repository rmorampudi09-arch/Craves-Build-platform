# Customer audit gateway repair — 15 September 2026

Scope: existing customer review/support GET contracts and the public, bounded Saved dish batch-read resolver. No service image, database, secret, provider, order/payment, review submission or support-message change is included. Email verification requires a separate coordinated backend release and is deliberately excluded.

## Files

- `../../azure-pipelines-customer-audit-status.yml`: read-only image, health and route inventory.
- `customer-audit-read-routes.py`: complete preflight before any write; image pins, healthy service check, exact public path ownership, protected backend reads, inherited policy checks, idempotent route ownership, authenticated/no-store policies and readback.
- `test_customer_audit_read_routes.py`: nine deterministic safety tests, including UTF-8 BOM responses, explicit JSON media negotiation and failed-write propagation.
- `../../azure-pipelines-customer-audit-read-routes.yml`: tests, plan, explicit apply and anonymous-denial/empty-batch validation. Uses existing `Craves-Dev-Service-Connection`.
- Existing `configure-favorites-p1b-catalog-apim.sh` and `../../infra/apim/favorites-p1b/catalog-saved-resolver-policy.xml` are reused unchanged.

## Local tests and live execution

Run `python scripts/apim/test_customer_audit_read_routes.py`. It needs Python standard library only and performs no network calls. In Azure DevOps choose the exact reviewed diagnostic branch/commit. Leave `applyRoutes=false` for preflight. After reviewing that result, run the same commit with `applyRoutes=true`. No credentials should be pasted into chat or source. A changed live image or conflicting route stops publication for review; do not disable these guards.

## Contracts

- Order `CustomerReviewController`: GET `/api/v1/reviews/mine` and `/tags`.
- Order `OrderReviewController`: GET `/api/v1/orders/{orderId}/review`.
- User-Chef `SupportCaseController`: GET `/api/v1/support/cases` and `/{caseId}`. Requester projection redacts internal support fields; service enforces case ownership.
- Catalog `SavedMenuItemController`: POST `/api/v1/discovery/saved/menu-items/resolve`, a read-only bounded batch with `menuItemIds`.

Auth/Order observed image source is `151c36cb2afaaf7b8482ee784704d983f7d87324`. User-Chef is pinned to observed digest `fa546c94af8eb329593d158589e0bffee96e19d6f84a55f937032de1f74fa93d`; existing deployment history identifies owner baseline `3a4dfa69a547a64223ec09373bfcefbd5d487131`. Services are not rebuilt from this gateway branch.

## Manual acceptance and rollback

Retest using the owner's normal signed-in app: My Reviews, an already-owned order review, Support history and an existing Saved dish. A 401 anonymous probe is only gateway/security smoke evidence, not signed-in functional certification. No real submissions or payments are required. Do not fabricate reviews or support cases if none exist; confirm the empty state instead.

Deployment is additive. New IDs: `get-own-order-review`, `get-own-reviews`, `get-review-tags`, `get-own-support-cases`, `get-own-support-case`; new API IDs only if absent are `craves-customer-reviews-v1` and `craves-customer-support-v1`. Preserve other API operations and inherited policies. If rollback is needed, review the exact operations and disable only these newly introduced reads through the existing release process; do not delete an API containing unrelated operations. No automatic delete/rollback is performed. Saved resolver has its existing separately guarded rollback script.

Partial failure is not success: inspect pipeline steps and read back the gateway before continuing. Record applied operations and the final run URL in the mobile audit ledger. Current mobile/Catalog changes, email rollout, signed-in device acceptance and production release holds remain separate pending work.

Run39040 stopped after the first operation/policy PUT because Azure returned a BOM-prefixed policy response. The operation was not blindly rolled back: its anonymous denial was independently verified. The correction requests the JSON envelope for reads, tolerates a leading UTF-8 BOM and suppresses write response parsing; explicit GET readbacks remain mandatory. See [Microsoft's policy media types](https://learn.microsoft.com/en-us/rest/api/apimanagement/api-policy/get?view=rest-apimanagement-2024-05-01). No authentication checks were relaxed to address this deployment-script failure.

