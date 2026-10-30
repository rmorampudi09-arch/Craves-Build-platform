# Advanced features — build ledger

Source of truth for the recurring build cycle (scheduled task **"Craves advanced features build cycle"**, every 2 h).
Live copy: Craves-Dev project doc `claude/advanced-features-ledger.md` (update that one first; the repo copy follows with each PR).
How to build, ship and verify: `docs/advanced-features/PLAYBOOK.md` (project doc `claude/advanced-features-playbook.md`).

## Lease (only one session builds at a time)

```
LEASE: free
```

A run takes the lease by writing `LEASE: <session or run id> until <UTC time = now + 110 min>`. If the lease is held and not expired, the run stops without changes. Release it (`LEASE: free`) at the end of every run, success or not.

## Audit — 31 Oct 2026 (handbook of 31 Oct vs GitHub main 8a37e65)

Already on main, so **not rebuilt** (frontend can wire them now): favorites, favorite chefs/kitchens, favorite watches, Cooking Today feed (029-037), repeat candidates / reorder (038-040), kitchen schedule and overrides (025-027), discovery v2 filters (017-023), cart/checkout/orders (041-054), payments/refunds (055-063), delivery providers, Borzo→Pidge timed handoff, delivery-code verification (064-078, E24 partly, E26 partly), notification inbox (079-081), support cases (083-086), meal plans (087, E12), chef onboarding/admin (089-098), ratings and reviews with moderation (E18), scheduled orders (E11), Chef Academy (E32, kept switched off on purpose), chef referral (E33), chef ledger/settlements (E34), PDF documents/invoices (E35), own rider fleet (E27), support chat (E28).

Policy-gated by the handbook (built here as admin-configurable policy, never with invented values): serviceability rule (015), refund/cancellation rules (062), provider assignment ranking (072), notification frequency (088).

Frontend-only (no backend work): E37 premium motion, E38 mascot.

## Modules to build — new isolated service `services/advanced-features-service`

Each module has its own package, Postgres schema (`adv_<module>`), Flyway history, feature flag, APIM API, OpenAPI contract (`contracts/openapi/advanced/`), README and tests.

| ID | Module | Handbook | API prefix (via https://api.craves.in; one gateway API `craves-adv-v1` for all) | Status |
|---|---|---|---|---|
| M00 | Platform foundation (security, errors, correlation, module isolation, idempotency, audit) | 099-100, 104, 106 | `/api/v1/advanced/features`, `/modules` | BUILDING — PR bundle/advanced-features-foundation |
| M01 | Food lists — private + shareable | E04, E40 | `/api/v1/advanced/food-lists`, `/api/v1/advanced/shared-food-lists` | BUILDING — same PR |
| M02 | Group ordering + shared carts | E13 | `/api/v1/advanced/group-orders` | BUILDING — same PR |
| M03 | Ingredients, allergens, nutrition | E19 | `/api/v1/advanced/food-facts` | BUILDING — same PR |
| M04 | Regional cuisine + dietary taxonomy | E10 | `/api/v1/advanced/taxonomy` | TODO |
| M05 | Menu modifiers + meal-period menus | E16 | `/api/v1/advanced/menu-options` | TODO |
| M06 | Remembered spice/oil/portion choices | E03 | `/api/v1/advanced/taste-memory` | TODO |
| M07 | Kitchen capacity, dynamic prep time, small-batch reservations | E20, E05 | `/api/v1/advanced/kitchen-capacity` | TODO |
| M08 | Promotions, offers, coupons | E23 | `/api/v1/advanced/promotions` | TODO |
| M09 | Party + bulk orders | E14 | `/api/v1/advanced/bulk-orders` | TODO |
| M10 | Corporate + team meals | E15 | `/api/v1/advanced/corporate-meals` | TODO |
| M11 | Order amendments + substitutions | E17 | `/api/v1/advanced/order-amendments` | TODO |
| M12 | Fraud risk, disputes, moderation | E29 | `/api/v1/advanced/trust` | TODO |
| M13 | Experiments + product analytics | E30 | `/api/v1/advanced/experiments` | TODO |
| M14 | Post-order partner offers | E36 | `/api/v1/advanced/partner-offers` | TODO |
| M15 | Chef business analytics | E21 | `/api/v1/advanced/chef-insights` | TODO |
| M16 | Demand forecasting | E22 | `/api/v1/advanced/demand-forecast` | TODO |
| M17 | Enriched Saved feed, unavailable-favorite recovery, familiarity | E01, E02, E06 | `/api/v1/advanced/saved-feed` | TODO |
| M18 | Personalized ranking | E07 | `/api/v1/advanced/personalized` | TODO |
| M19 | Semantic search | E09 | `/api/v1/advanced/semantic-search` | TODO |
| M20 | Conversational AI search | E08 | `/api/v1/advanced/ai-search` | TODO |
| M21 | Live order activity (Dynamic Island) | E39 | `/api/v1/advanced/live-activities` | TODO |
| M22 | Private taste data (export, delete, consent) | E40 | `/api/v1/advanced/my-taste-data` | BUILDING — same PR (later modules must implement PersonalDataContributor) |
| M23 | Policy engines: serviceability, cancellation/refund, provider ranking, notification frequency | 015, 062, 072, 088 | `/api/v1/advanced/policies` | TODO |
| M24 | Checkout hooks in order-service (options pricing, coupons, capacity) — additive, flag default off, canary | E05, E16, E20, E23 | order-service | TODO |
| M25 | Delivery exceptions + reassignment console | E25 | integration-service | TODO |

Statuses: TODO → BUILDING → MERGED (on main) → LIVE (deployed, APIM routes published, smoke-tested through api.craves.in) or BLOCKED (reason).

## Deployment status

**Waiting for the one-time Azure setup.** On 31 Oct the automation's safety check refused to create production Azure resources from the owner's browser, so the owner runs this once in Azure Cloud Shell (Bash, ravitejamm6@gmail.com):

```
curl -fsSL https://raw.githubusercontent.com/rmorampudi09-arch/Craves-Build-platform/main/infra/advanced-features/setup-once.sh | bash
```

It creates everything below and the release pipeline; afterwards every merge deploys itself and the "Advanced features live smoke" workflow checks api.craves.in. Build runs must not try to change Azure from the browser; they ship code to main, then read the smoke workflow result. Rows go MERGED → LIVE when the smoke workflow passes after the setup.

## Infrastructure (fill in as created)

| Item | Value |
|---|---|
| Resource group | rg-craves-advanced-prod |
| Container app | ca-craves-advanced-prod |
| Key Vault | kv-crv-advanced-34eefd |
| Database | craves_advanced_db on pg-craves-business-prod |
| NAT egress IP | – |
| Maven cache for the sandbox | branch `ci/advanced-features-m2` (workflow "Advanced features dependency cache") |
| Scheduled task | "Craves advanced features build cycle", trig_01LSqbY1o5cwxWKNqJfGRGSV, every 2 h at :39 UTC |
| DevOps pipeline | release-advanced |
| APIM API | `craves-adv-v1`, path `api/v1/advanced`, wildcard operations, policy `infra/apim/advanced-features/api-policy.xml` |

## Run log

- 2026-10-31 — ledger created from the audit.
- 2026-10-31 — interactive session: built M00, M01, M02, M03, M22 (33 tests green on PostgreSQL 16, contracts + APIM routes generated); workflows bundle-import, dependency cache and service CI on branch bundle/advanced-features-foundation.
