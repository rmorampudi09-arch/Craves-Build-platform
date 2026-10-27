# Chef referral programme — live activation (12 Oct 2026)

> **Pipelines changed 27 Oct 2026.** Azure DevOps pipeline #20 `Craves-Referral-Chef` named below is turned off on purpose: do not run, re-enable or recreate it. Use #24 `Craves-Referral-Chef-Release` instead (built from GitHub `main`). Current list: `docs/runbooks/production-environment.md`.

Owner decision (Raviteja, 12 Oct 2026): switch on the **chef** referral programme now, backend only; the frontend follows later. Policy approval references record the owner's decision; no external legal or CA review yet. The owner approves alone: the release automation drafts the policy and the owner's admin identity approves it, so the database's maker≠approver rule still holds.

## What was already live (inspection, pipeline 20 run 371)
- `ca-craves-referral-prodlow` (private, dormant, all flags off) and `ca-craves-referral-member-read` (read-only member API) in `rg-craves-prodlow-centralindia`, database `craves_referral_db` on `pg-craves-prodlow-kmqgfy`.
- Auth, Order and Integration images already contain the referral source code; their referral migrations are applied. Sources were off (`CRAVES_REFERRAL_SOURCE_ENABLED` false or absent).
- Live Auth and Order images are **not** plain main builds (Auth adds MSG91/central OTP + test bypasses, V18–V19; Order adds delivery handoff, V34–V35). This release changes only their settings and never rebuilds them.

## Engine change in this release (referral-service only)
- Chef commission needs only an enrolled **seller**. Before, the Order lookup required every participant (buyer too) to be enrolled, so ordinary customers would have blocked all chef rewards.
  - `SourceLookupController`: under the chef policy a checkout is bound when any participant is enrolled; the legacy wallet policy keeps the all-participants rule.
  - `OrderBindingService`: an order whose seller is not a member is recorded once in the immutable `order_exclusion` table (V12). If an Auth registration for that seller is still unapplied, it retries instead.
  - `OrderLifecycleService` / first-checkout: delivery, refund and finance events for excluded orders are no-ops, not dead letters.
- V12 is additive: new table, insert guard (seller must not be a member, chef policy only, no snapshot), a trigger that stops a snapshot for an excluded order, and update/delete/truncate blocks.
- Tests: `ChefActivationIT` (6 cases).

## What activation switches on
| App | Change |
|---|---|
| referral engine | `CRAVES_REFERRALS_ENABLED`, `_WORKERS_`, `_CHEF_EARNINGS_`, `_PUBLIC_ACCESS_` = true. **Stay false:** awards, settlement, withdrawals, spending. |
| Auth | source on; `referral-source-hmac` (= engine's auth key), new Key Vault keys `craves-referral-contact-hmac` and `craves-referral-attribution-hmac`; terms `craves-chef-referral-terms-v1-2026-10-12`; 30-day attribution approved. |
| Integration | source on with the finance key. Referral payouts and checkout benefits stay off. |
| Order | source on with the order key. Checkout benefits stay off. |

Policy row: `CHEF_COMMISSION_20260916` (2% / 1.2% / 0.8%, ≥ ₹250, 24 h hold, 9 AM IST, ₹1,500 monthly cap), maker `c4e5f00d-0000-4000-8000-000000000001` (release automation), approver = the owner's admin identity (`raviteja.m@craves.in`).

## How to run (Azure DevOps pipeline 20 `Craves-Referral-Chef`)
1. `test` — referral-service tests on a disposable agent Postgres.
2. `release` with `confirm=RELEASE_REFERRAL_ENGINE`, `sourceSha=<GitHub main commit>` — builds `craves/referral-service:<sha>`, runs the migrator (owner role), grants the runtime role `SELECT,INSERT` on `order_exclusion`, rolls the image. Flags unchanged. A failed rollout restores the previous image; migrations are additive and stay.
3. `activate` with `confirm=ACTIVATE_CHEF_REFERRALS` — policy, then engine flags, then Auth, Integration, Order, one at a time. Each step waits for a healthy revision and restores the previous settings if it fails.
4. `verify` — flags, key equality (by hash), health, and Finance → engine outbox traffic.

## Turning it off
- Fastest: set `CRAVES_REFERRAL_SOURCE_ENABLED=false` on **Order first** (checkout then stops calling the engine), then Integration and Auth; then `CRAVES_REFERRALS_ENABLED=false` on the engine.
- Ledger rows, the policy and its activation are immutable by design and stay as history.

## Known limits
- With the Order source on, every checkout makes one private lookup call to the engine (10 s timeout, fail-closed). If the engine is down, checkout fails. Customers are locked out today; revisit before the customer launch (fail-open would risk silently unbound orders).
- If Auth→engine delivery stalls for a long time while an enrolled chef's first orders arrive, those orders can be excluded permanently. The engine only retries when it has already received the registration.
- Frontend still to build: referral link capture (`/r/CODE` → signed first-touch cookie in the format `ReferralAttribution` verifies, signed with `craves-referral-attribution-hmac`), the terms checkbox, sending `referral` on `/auth/firebase/exchange`, `/api/v1/auth/referrals/enroll` for existing chefs, and chef screens on `/api/v1/referrals/me` (`/code`, `/chef-earnings`). APIM `craves-referral-members-v1` currently points at `https://craves-referral-members…`, not the engine; fix the route when the frontend is built.
- No external legal/CA review: 3-level commissions and TDS on referral income should be reviewed before promotion.
