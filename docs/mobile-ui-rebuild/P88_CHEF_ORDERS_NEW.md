# P88 — Chef Orders — New

**Phase:** P88  
**Guide reference:** Screen 41 — Chef Orders — New (`ChefOrdersNew`)  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Phase start:** `a44a654b33e539369ac141616969594b2014e3eb`  
**P88 code commit:** `a4876a592cc8269166b7c4290d65f161eb812904`  
**Status:** **PARTIAL at full Master Guide completion scope; implemented to the exact currently available mobile/backend contract boundary.**

## Authority reviewed

Before implementation, P88 was checked against `plan.md`, `phases.md`, `agent.md`, `build.md`, the full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, P86 query/tab evidence, P87 Preparing evidence, the current mobile order API/domain code, and the current order-service Chef controller/DTO/service contracts.

The Guide requires Screen 41 to provide the New tab, counts, New Orders summary, detailed cards, Accept/Reject, Accept All, response-time urgency, detail navigation, refresh/load-more behavior, bottom navigation, synchronized dependent counters, idempotent decisions, controlled status reconciliation, bulk partial-result handling, and the logical route `ChefOrdersNew`.

## Implemented P88 boundary

- Registered typed logical route `ChefOrdersNew` inside the existing nested Chef Orders stack. No P89/P90 status route was registered.
- Made New the initial Chef Orders route, matching the P86 order-tab state default.
- Enabled real New ↔ Preparing tab switching while keeping Ready and Completed disabled until their separately authorized phases.
- Reused the P86 shared order projection, tab counts, bounded pages, independent scroll offsets, refresh state, and the P87 shared reconciliation path instead of introducing parallel order state.
- Added a virtualized New Orders list with loading skeleton, empty state, recoverable error/retry, pull-to-refresh, bounded page controls, stable keys, preserved scroll state, safe item/address summaries, order reference, NEW badge, received-age indicator, and order-detail navigation.
- Received age is derived from the authoritative server `createdAt` timestamp. The UI samples the current clock only to recompute display age; it does not create or drift a local acceptance deadline.
- Added individual Accept Order flow requiring a positive preparation time before mutation.
- Added individual Reject flow requiring a non-empty reason and an explicit confirmation action.
- Reused the P85 `createChefOrderDecisionCoordinator` for both decisions: protected detail revalidation, mutual-exclusion guard, stable idempotency key derived from order revision, duplicate-tap protection, and stale-status conflict handling remain centralized.
- Successful decisions immediately call `ChefOperationalProvider.reconcileOrderStatus(...)`, so the New card, New/Preparing counts, Chef Orders badge, Dashboard projection, and later consumers of the shared snapshot reconcile from the same authoritative order state before background refresh.
- Conflict responses re-read/reconcile the latest order instead of representing stale cards as accepted/rejected.
- Preserved the Chef bottom navigation and reused `ChefHeader`; no customer cart UI/state was introduced into the Chef role.
- Added an interactive response-time tip. It explicitly avoids presenting a fabricated acceptance countdown because the expiry timestamp is not exposed to mobile.
- Added an `Accept All` control with a real explanatory handler, but intentionally no bulk mutation. The currently deployed/repository Chef Orders contract has no accept-all/bulk-eligibility route and each single accept requires an order-specific preparation time. P88 therefore does not simulate bulk success with sequential client calls or invent a route.

## Exact contracts used

- `GET /api/v1/chef/orders`
- `GET /api/v1/chef/orders/{orderId}`
- `POST /api/v1/chef/orders/{orderId}/accept`
  - request: `{ prepTimeMinutes, note }`
  - `Idempotency-Key` supported
- `POST /api/v1/chef/orders/{orderId}/reject`
  - request: `{ reason }`
  - `Idempotency-Key` supported
- existing Chef shared notification/header contracts remain reused through the P81/P86 shell.

No `accept-all`, bulk-eligibility, bulk-result, or bulk-partial-failure endpoint exists in the current Chef Orders controller or the project route inventory. No such endpoint was invented.

The server acceptance service internally owns `chef_acceptance_expires_at` and validates the 30-minute acceptance window, including `CHEF_ACCEPTANCE_EXPIRED`, but the current `OrderResponse` does not expose that deadline. Mobile therefore cannot truthfully render the Guide's exact `acceptanceDeadlines` state/countdown yet.

## Guide acceptance map

| Requirement | P88 result |
|---|---|
| `ChefOrdersNew` registered | Implemented |
| New selected tab + tab counts | Implemented from shared P86 projection |
| New Orders summary/cards | Implemented at currently exposed safe list-summary boundary |
| Single Accept | Implemented with required prep time, revalidation, idempotency, progress and reconciliation |
| Single Reject | Implemented with required reason, explicit confirmation, revalidation, idempotency, progress and reconciliation |
| Open detail | Implemented via existing immersive `ChefOrderDetail` |
| Refresh/load more | Pull refresh + bounded client page controls implemented; true server pagination remains blocked by P86 backend contract |
| Independent scroll preservation | Implemented |
| Dependent counters update | Immediate shared reconciliation implemented |
| Response-time urgency | Safe received-age indicator implemented; exact deadline/countdown blocked because response omits expiry |
| Accept All / bulk eligibility | **Blocked by missing backend contract; no fake bulk mutation** |
| Bulk progress + partial results | **Blocked with the same missing bulk contract** |
| Real-time new-order controlled insertion / arrival highlight | Not fabricated; dedicated real-time/event phase remains later in sequence |
| Reference-image pixel certification | **Blocked in current tooling; embedded image41.jpeg is not independently renderable here** |
| Android device/emulator certification | **Not executed in this environment** |

## Changed code paths

- `apps/mobile/src/app/navigation/ChefRootNavigator.tsx`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/features/chefOrders/domain/chefNewOrders.ts`
- `apps/mobile/src/features/chefOrders/domain/chefNewOrders.test.ts`
- `apps/mobile/src/features/chefOrders/screens/ChefNewOrdersScreen.tsx`
- `apps/mobile/src/features/chefOrders/screens/ChefPreparingOrdersScreen.tsx`
- `apps/mobile/src/features/chefOrders/state/useChefNewOrderActions.ts`

Documentation/ledger paths:

- `docs/mobile-ui-rebuild/P88_CHEF_ORDERS_NEW.md`
- `build.md`

No `services/`, `openapi/`, `infra/`, or `apps/api/` source was modified for P88.

## Validation evidence

- Phase-start → P88 code compare is one commit ahead and contains only the seven `apps/mobile` paths listed above.
- GitHub Actions push run `31310893541` for code commit `a4876a592cc8269166b7c4290d65f161eb812904` ran workflow `CRAVES Mobile Implementation CI` but job `validate-mobile-code` (`93238449790`) failed before runner startup: no validation steps executed, runner id is `0`, and runner name is empty.
- Therefore the workflow result is recorded as the existing runner-start/account/environment blocker, **not** as a TypeScript/Jest/ESLint/bundle failure and **not** as a pass.
- The pure P88 `deriveChefNewOrderReceivedAge` helper was separately strict-compiled with TypeScript and smoke-asserted for minute age, hour/minute age, malformed/missing timestamp fallback, and future-clock skew. That isolated helper check passed; it does not substitute for the repository CI gates.
- Full project `npm ci`, TypeScript, ESLint, Jest, Android bundle, emulator/device, and visual-regression passes are not claimed because the available CI runner did not start and the private workspace is not executable in the current connector environment.

## Retained blockers / non-fabrication decisions

1. **Accept All:** no bulk-eligibility/accept-all contract exists. A client-side loop would not satisfy Guide requirements for server eligibility, progress semantics, atomic/reconciled partial outcomes, and false-success prevention, so it was not fabricated.
2. **Exact acceptance countdown:** `chef_acceptance_expires_at` is server-internal and missing from `OrderResponse`; P88 uses received age only and does not infer a 30-minute deadline from a different timestamp.
3. **Server pagination:** P86 blocker remains; `GET /api/v1/chef/orders` exposes a bounded current list without status/page/cursor parameters.
4. **Real-time arrival behavior:** no new live-event architecture was added in P88; later event/reconciliation work is outside this one-phase authorization.
5. **Visual certification:** the full Guide is accessible, but its embedded reference image is unavailable through the current file rendering path, so pixel-level verification cannot be honestly recorded.
6. **CI/device certification:** the GitHub job did not start any step, and no Android emulator/device validation ran here.

## Scope stop

P88 is the only newly implemented phase in this authorization. **P89 — Chef Orders — Ready for Pickup is NOT STARTED and was not pre-implemented.**

**Next-phase authorization:** none. Stop after P88 until the user explicitly authorizes P89.
