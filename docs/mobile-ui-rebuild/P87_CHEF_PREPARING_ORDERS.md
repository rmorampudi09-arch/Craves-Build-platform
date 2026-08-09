# P87 — Chef Preparing Orders

Status: **PARTIAL at full Guide completion scope; implemented and correctness-hardened to the exact currently authorized mobile/backend boundary.**

## Scope implemented

- Replaced the Chef Orders placeholder with the Preparing Orders production surface.
- Reused the P86 root-mounted Chef operational provider for selected tab, page, counts, server-derived prep timers, and scroll state.
- Registered the Guide logical route `ChefOrdersPreparing` inside a nested Chef Orders stack without implementing P88+ sibling screens.
- Added bounded order-card summaries from the existing `GET /api/v1/chef/orders` response while deliberately excluding direct customer contact details from the shared operational cache.
- Added exact `POST /api/v1/chef/orders/{orderId}/ready-for-pickup` client integration.
- Mark Ready performs confirmation, authoritative `GET /api/v1/chef/orders/{orderId}` revalidation, duplicate-tap protection, mutation, immediate shared status reconciliation, and background refresh.
- Call Customer resolves the protected order detail on demand, revalidates that the order is still in Preparing, obtains the server-authorized delivery contact only for the action, and opens the device phone handler without persisting the phone number in shared operational state.
- Added loading, refresh, error/retry, empty, mutation-progress, success/error feedback, pagination controls over the P86 bounded snapshot, preparation summary, server-derived timer labels, order-detail navigation, and preparation tip interaction.
- Chef bottom navigation remains present on the core Orders surface; customer cart state is not rendered.

## Exact contracts used

- `GET /api/v1/chef/orders`
- `GET /api/v1/chef/orders/{orderId}`
- `POST /api/v1/chef/orders/{orderId}/ready-for-pickup`
- `GET /api/v1/notifications/in-app?limit=100`

The current ready-for-pickup controller does not expose an idempotency-key parameter. P87 therefore does **not** fabricate one. The client blocks duplicate actions and the server revalidates the lifecycle state before moving the order to `READY_FOR_PICKUP`.

## Shared-state reconciliation

`ChefOperationalProvider.reconcileOrderStatus(...)` updates the authoritative mobile order snapshot immediately after a successful status mutation and after stale/conflict revalidation. Dashboard counters and P86 tab counts/pages therefore reconcile from the same snapshot before the background refresh completes.

## Deliberate privacy boundary

The shared list cache keeps only kitchen name, valid item name/quantity summaries, and valid area/city delivery summary. Recipient name, phone number, street address, financial fields, and other detail-only data remain outside that shared operational cache. Customer phone access is fetched through the protected Chef order-detail route only when Call Customer is invoked, and the contact action is abandoned if revalidation shows that the card is stale and the order is no longer in the Preparing lifecycle.

## Correctness hardening audit

A follow-up P87-only correctness review was performed after GitHub CI was found to be failing before runner allocation. The review did **not** advance to P88 and did not modify backend/APIM/infrastructure source.

Corrections made during the audit:

1. **Optional summary parsing is fail-soft.** Malformed display-only item/address summaries no longer invalidate the entire authoritative Chef orders list. Core identity/status/timer fields still fail closed.
2. **Preparing summary uses the full projection.** Overdue count is derived from all P86 preparation timers rather than only the currently visible client page.
3. **Concurrent Mark Ready is reconciled safely.** If authoritative revalidation already returns `READY_FOR_PICKUP`, no duplicate mutation is sent. If a ready mutation returns HTTP 409 and the follow-up authoritative read shows Ready, the action resolves as reconciled success rather than a false failure.
4. **Call Customer revalidates actionability.** A stale Preparing card cannot open customer contact after the authoritative order has moved out of the Preparing lifecycle.
5. **Exact Guide logical route is registered.** `ChefOrdersPreparing` is now a typed nested Orders route while the Chef bottom tab remains stable.
6. **Scroll preservation no longer rerenders shared state on every scroll frame.** The screen tracks the live offset locally and persists it at scroll completion, unmount/detail navigation, and resets it correctly when changing bounded client pages.
7. **Provider callbacks are stable.** Tab selection/page/scroll callbacks are memoized so screen effects do not churn when shared UI state changes.
8. **Focused tests were strengthened.** Parser tests cover fail-soft display summaries, and order-tab tests verify that overdue counts use the full Preparing projection. Existing API tests still verify the exact ready-for-pickup route and body/header shape.

## Validation state

- The mobile CI workflow is configured to run `npm ci`, strict TypeScript, ESLint with zero warnings, Jest, an Android production JavaScript bundle, and a backend-source guard whenever a runner starts.
- Latest P87 code-triggered workflow run after the correctness audit: `31310336314` for commit `9454c5455336c15e126fca5ad613b666f2602fac`.
- That run again concluded failure **before any workflow step ran**: job `93237079571` returned `steps=null` and no logs URL. Therefore this is still an external runner-start blockage, not a TypeScript/Jest/bundle result.
- Because the runner did not start and the current execution environment cannot clone/install the private workspace, TypeScript/ESLint/Jest/bundle pass status is **not claimed**.
- Contract correctness was reviewed directly against the branch backend controller/service/DTOs. Navigation nesting/type shape was also checked against the current React Navigation TypeScript/nesting guidance before the route correction.

## Full-Guide blockers retained instead of fabricated

1. The current order response has no item media/image URL, so Reference 40's real item thumbnails cannot be implemented from an authoritative contract. P87 uses the existing order glyph instead of inventing image URLs.
2. P88–P90 sibling order-status screens are not authorized in this phase. Their status tabs remain visibly present but disabled; P87 does not pre-implement New, Ready, or Completed. Consequently the Reference 40 post-ready transition to the dedicated Ready screen remains pending P89.
3. The backend still exposes only the newest bounded Chef-order list with no status/page/cursor contract, so true server pagination remains the P86 blocker.
4. The embedded Reference Image 40 is not available as an independently inspectable repository asset in the current tooling, so pixel-level visual certification and Android device/emulator certification cannot be truthfully claimed in this phase.
5. The Guide mentions support-event logging for contact actions where required, but no exact authorized mobile logging contract was found. No endpoint was invented.

## Phase boundary

P88 was not implemented or started by P87 or by this correctness audit.
