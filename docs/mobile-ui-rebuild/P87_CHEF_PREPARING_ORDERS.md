# P87 — Chef Preparing Orders

Status: **PARTIAL at full Guide completion scope; implemented to the exact currently authorized mobile/backend boundary.**

## Scope implemented

- Replaced the Chef Orders placeholder with the Preparing Orders production surface.
- Reused the P86 root-mounted Chef operational provider for selected tab, page, counts, server-derived prep timers, and scroll state.
- Added bounded order-card summaries from the existing `GET /api/v1/chef/orders` response while deliberately excluding direct customer contact details from the shared operational cache.
- Added exact `POST /api/v1/chef/orders/{orderId}/ready-for-pickup` client integration.
- Mark Ready performs confirmation, authoritative `GET /api/v1/chef/orders/{orderId}` revalidation, duplicate-tap protection, mutation, immediate shared status reconciliation, and background refresh.
- Call Customer resolves the protected order detail on demand, obtains the server-authorized delivery contact only for the action, and opens the device phone handler without persisting the phone number in shared operational state.
- Added loading, refresh, error/retry, empty, mutation-progress, success/error feedback, pagination controls over the P86 bounded snapshot, preparation summary, server-derived timer labels, order-detail navigation, and preparation tip interaction.
- Chef bottom navigation remains present on the core Orders surface; customer cart state is not rendered.

## Exact contracts used

- `GET /api/v1/chef/orders`
- `GET /api/v1/chef/orders/{orderId}`
- `POST /api/v1/chef/orders/{orderId}/ready-for-pickup`
- `GET /api/v1/notifications/in-app?limit=100`

The current ready-for-pickup controller does not expose an idempotency-key parameter. P87 therefore does **not** fabricate one. The client blocks duplicate actions and the server revalidates the lifecycle state before moving the order to `READY_FOR_PICKUP`.

## Shared-state reconciliation

`ChefOperationalProvider.reconcileOrderStatus(...)` updates the authoritative mobile order snapshot immediately after a successful status mutation (and after conflict revalidation). Dashboard counters and P86 tab counts/pages therefore reconcile from the same snapshot before the background refresh completes.

## Deliberate privacy boundary

The shared list cache keeps only kitchen name, item name/quantity summaries, and area/city delivery summary. Recipient name, phone number, street address, financial fields, and other detail-only data remain outside that shared operational cache. Customer phone access is fetched through the protected Chef order-detail route only when Call Customer is invoked.

## Full-Guide blockers retained instead of fabricated

1. The current order response has no item media/image URL, so Reference 40's real item thumbnails cannot be implemented from an authoritative contract. P87 uses the existing order glyph instead of inventing image URLs.
2. P88–P90 sibling order-status screens are not authorized in this phase. Their status tabs remain visibly present but disabled; P87 does not pre-implement New, Ready, or Completed. Consequently the Reference 40 post-ready transition to the dedicated Ready screen remains pending P89.
3. The backend still exposes only the newest bounded Chef-order list with no status/page/cursor contract, so true server pagination remains the P86 blocker.
4. The embedded Reference Image 40 was not available through the current repository/file tooling, so pixel-level visual certification and Android device/emulator certification cannot be truthfully claimed in this phase.
5. The Guide mentions support-event logging for contact actions where required, but no exact authorized mobile logging contract was found. No endpoint was invented.

## Phase boundary

P88 was not implemented or started by P87.
