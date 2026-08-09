# P89 — Chef Ready for Pickup

Status: **PARTIAL at full Guide completion scope; the mobile Ready surface is implemented to the exact currently authorized backend boundary.**

## Phase boundary

- Phase start: `39616ddd754af45082952fcc5c39bcbdaa4fefd7`.
- P89 code end: `9c0a169fdee5399a3f9b21ed7419cf4ccfdb5418`.
- P90 / Completed Orders was not implemented or started.

## Scope implemented

- Added the typed logical route `ChefOrdersReady` to the existing nested Chef Orders stack.
- Added a dedicated Ready-for-Pickup screen using the existing P86 Chef order projection, Ready count, bounded client page, independent Ready scroll offset, shared refresh state, Chef header, bottom navigation, and order-detail navigation.
- Added Ready summary, virtualized ready-order cards, server-timestamp status age, item summaries, delivery-area summary, loading skeleton, empty/error/retry states, pull refresh, bounded paging, action progress, feedback, and pickup-handoff tip interaction.
- Added truthful delivery-partner fallback UI rather than fabricating assignment, ETA, phone, or driver identity when those Chef-facing contracts are absent.
- `Order Picked Up` performs protected authoritative order revalidation and shared-state reconciliation. If the server already reports `OUT_FOR_DELIVERY` or `DELIVERED`, the UI reconciles that real state. If the order is still `READY_FOR_PICKUP`, no pickup mutation is invented and no status is changed.
- `Not Picked Up Yet` also revalidates the authoritative order first. If the order already progressed, shared state is reconciled. If it remains Ready, no support/escalation mutation is invented because no Chef pickup-escalation contract is exposed.
- Both actions use a per-order duplicate-action guard and preserve the existing shared Chef operational snapshot/reconciliation ownership.
- Ready status age is derived only from the exposed server `updatedAt` timestamp. It is deliberately labeled as the latest server update age, not as a fabricated pickup ETA or dedicated `readyAt` timestamp.
- Completed remains outside P89 and is not registered as a completed-order screen.

## Exact contracts available to P89

Chef order contracts:

- `GET /api/v1/chef/orders`
- `GET /api/v1/chef/orders/{orderId}`
- `POST /api/v1/chef/orders/{orderId}/ready-for-pickup` exists for the preceding Preparing → Ready transition.

The Chef controller does **not** expose a Ready → picked-up mutation, delivery-partner assignment/status endpoint, partner contact endpoint, pickup ETA endpoint, or pickup escalation/support mutation.

A separate customer-facing read route exists:

- `GET /api/v1/orders/{orderId}/delivery-status`

However, `DeliveryStatusController` calls `DeliveryStatusQueryService.getForCustomer(...)`. P89 does not reuse a customer-only authorization boundary for the Chef role and does not weaken backend ownership rules.

## Safety / reconciliation behavior

`useChefReadyOrderActions` always fetches the protected Chef order detail before interpreting either pickup action. The returned status is cached through the existing Chef detail query key and immediately reconciled into `ChefOperationalProvider`, keeping dashboard counters and Ready projections aligned with the same authoritative snapshot.

No client-side action can falsely mark an order picked up. No fake delivery-partner data is persisted. No customer-only delivery-status endpoint is called from the Chef screen.

## Changed code files

- `apps/mobile/src/app/navigation/ChefRootNavigator.tsx`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/features/chefOrders/domain/chefReadyOrders.ts`
- `apps/mobile/src/features/chefOrders/domain/chefReadyOrders.test.ts`
- `apps/mobile/src/features/chefOrders/screens/ChefReadyOrdersScreen.tsx`
- `apps/mobile/src/features/chefOrders/state/useChefReadyOrderActions.ts`

Evidence / ledger:

- `docs/mobile-ui-rebuild/P89_CHEF_READY_FOR_PICKUP.md`
- `build.md`

## Validation / guard state

- Phase-start → code-end compare contains only the six `apps/mobile` files listed above. No `services/`, `openapi/`, `infra/`, or `apps/api/` source was modified.
- GitHub Actions run `31311462022` for code-end commit `9c0a169fdee5399a3f9b21ed7419cf4ccfdb5418` concluded failure before any validation step started.
- Job `validate-mobile-code` (`93239812581`) reports `steps=[]`, `runner_id=0`, and an empty runner name.
- Therefore repository `npm ci`, strict TypeScript, ESLint, Jest, Android bundle, and backend-guard commands did not execute. This is not recorded as a code-test failure and is not recorded as a pass.
- A focused unit test source was added for Ready status-age derivation, including malformed/missing timestamps and future clock skew. It is not claimed as executed by repository CI.
- The current connector environment does not provide an executable checkout of the private mobile workspace, so project-wide local validation is not claimed.

## Full-Guide blockers retained instead of fabricated

1. **Pickup confirmation:** there is no Chef-facing Ready → picked-up mutation or idempotency contract. `Order Picked Up` can safely revalidate/reconcile but cannot truthfully send the requested transition.
2. **Delivery partner assignment/status/contact/ETA:** no Chef-facing read contract is exposed. The customer delivery-status route is customer-authorized and is not reused by Chef.
3. **Pickup escalation:** no exact Chef support/escalation mutation is available for `Not Picked Up Yet`; the UI revalidates and reports the missing integration rather than acting as a no-op or inventing a request.
4. **Exact ready timestamp / pickup elapsed timer:** the current Chef order response exposes `updatedAt`, not a dedicated `readyAt`; P89 labels it as server update age only.
5. **Item thumbnails/customer note:** the shared Chef order list does not expose authoritative item media or a safe card-level customer-note projection. P89 uses the established item glyph/safe summary boundary instead of inventing data.
6. **True server pagination/status query:** inherited P86 blocker; `GET /api/v1/chef/orders` remains a bounded list without status/page/cursor parameters.
7. **Reference Image 42 certification:** the 183-page Guide text is readable, but the embedded image is not independently renderable in the current repository/file tooling, so pixel-level certification is not claimed.
8. **Android/device certification and repository CI:** no emulator/device run occurred and the GitHub runner never started a validation step.
9. **Cross-tab entry wiring:** `ChefOrdersReady` is registered and the Ready screen can navigate back to New/Preparing, but the older P87/P88 local status-strip implementations still need their Ready button enablement consolidated into the shared status-tab component. That pre-existing duplicated-tab architecture is not falsely marked complete.

## Completion classification

P89 is therefore **PARTIAL**, not DONE. The Ready UI/read/revalidation/reconciliation boundary is implemented, but the Guide's pickup handoff, partner details/ETA/contact, escalation workflow, full cross-tab entry behavior, device verification, and CI completion gates cannot all be satisfied from the current contracts/execution environment.

## Stop boundary

P90 — Chef Completed Orders remains unimplemented and unauthorized after this phase.
