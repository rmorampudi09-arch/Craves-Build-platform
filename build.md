# CRAVES Mobile Build / Implementation Ledger

**Purpose:** Authoritative living control record for the current mobile rebuild. Detailed historical evidence remains under `docs/mobile-ui-rebuild/`; this compact ledger does not reclassify earlier phase evidence.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Authoritative branch:** `mobile-ui-rebuild-from-scratch`  
**Mobile workspace:** `apps/mobile`  
**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`  
**Implementation guide:** full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`  
**Build policy:** code-level validation during phases; no APK per phase.

---

## 1. Current Control State

- **P00–P56:** retain the exact DONE/PARTIAL/BLOCKED state recorded in their dedicated evidence. Do not reinterpret historical partial phases as DONE.
- **P57–P59:** DONE.
- **P60–P73:** retain their recorded PARTIAL/BLOCKED exact-contract boundaries in dedicated evidence.
- **P74:** DONE at authorized code/CI scope.
- **P75–P79:** retain recorded PARTIAL states and blockers.
- **P80 — Chef Root Shell and Role Isolation:** DONE at authorized code/CI scope.
- **P81 — Chef Shared Header/Badge/Operational Counters:** DONE at authorized code/CI scope.
- **P82 — Chef Dashboard Contract Model:** DONE at authorized code/CI scope.
- **P83 — Chef Dashboard UI:** DONE at authorized code/CI scope.
- **P84 — Chef Order Detail Contract:** DONE at authorized code/CI scope. Evidence: `docs/mobile-ui-rebuild/P84_CHEF_ORDER_DETAIL_CONTRACT.md`.
- **P85 — Chef New Order Detail UI/Actions:** DONE at authorized code scope. Evidence: `docs/mobile-ui-rebuild/P85_CHEF_NEW_ORDER_DETAIL_UI_ACTIONS.md`. CI remains externally blocked before runner startup by the recorded GitHub runner/account condition.
- **P86 — Chef Order Tab Query Architecture:** PARTIAL at full product-contract scope; mobile architecture is implemented at the exact currently available backend boundary. Evidence: `docs/mobile-ui-rebuild/P86_CHEF_ORDER_TAB_QUERY_ARCHITECTURE.md`. The backend exposes only a newest-100 Chef-order list with no status/date/page/cursor parameters, so true server-side history pagination remains blocked.
- **P87 — Chef Preparing Orders:** PARTIAL at full Guide completion scope; implemented and correctness-hardened to the exact currently authorized mobile/backend boundary. Evidence: `docs/mobile-ui-rebuild/P87_CHEF_PREPARING_ORDERS.md`.

**Current executed phase:** **P87 — Chef Preparing Orders**.

**P87 phase start commit:** `ba1d5b5217b553975c307b8428992ac5aefaf84b`  
**Original P87 implementation/evidence end:** `7c393e9d712e5b9cfd6307a62221527394f280d8`  
**P87 correctness-audit start:** `4cdf8f9caf570b525a6a03259795df4627e97cd6`  
**P87 correctness-audit code end:** `9454c5455336c15e126fca5ad613b666f2602fac`

### P87 implemented boundary

- Chef Orders placeholder replaced by the Preparing Orders surface while preserving the Chef bottom navigation.
- Exact Guide logical route `ChefOrdersPreparing` is registered in a typed nested Chef Orders stack; no P88+ sibling screen was implemented.
- P86 `selectedStatus`, per-tab pages, counts, server-derived timers, and independent scroll state are reused rather than copied into screen-local business state.
- Existing Chef list parsing exposes only safe card-summary data: kitchen name, valid item name/quantity summaries, and valid area/city. Direct phone/street/recipient/financial detail remains out of the shared operational cache.
- Exact ready mutation wired: `POST /api/v1/chef/orders/{orderId}/ready-for-pickup`.
- Mark Ready uses confirmation, protected order-detail revalidation, duplicate-action guard, exact mutation, immediate shared order-status reconciliation, conflict re-read, and background refresh.
- Already-Ready revalidation is treated as reconciled success without issuing a duplicate ready mutation.
- Call Customer fetches protected Chef order detail on demand, revalidates that the order is still in Preparing, and only then opens the device phone handler; the phone number is not persisted in shared Chef operational state.
- Preparing UI includes status/count strip, full-projection prep summary, server-derived timers, card item/address summaries, order-detail navigation, pull refresh, bounded page controls, loading skeleton, empty/error/retry states, action progress, feedback, and an interactive preparation tip.
- Scroll offset is tracked locally while scrolling and persisted at stable lifecycle points rather than causing provider-wide state updates on every scroll frame.
- `ChefOperationalProvider.reconcileOrderStatus(...)` makes Dashboard/order-tab counts and projections update immediately from the same shared snapshot after status changes.
- No customer cart UI/state was introduced into the Chef role.

### P87 exact contracts

- `GET /api/v1/chef/orders`
- `GET /api/v1/chef/orders/{orderId}`
- `POST /api/v1/chef/orders/{orderId}/ready-for-pickup`
- `GET /api/v1/notifications/in-app?limit=100`

The current ready controller has no idempotency-key parameter. Mobile does not fabricate one; duplicate taps are blocked client-side and the server performs lifecycle revalidation.

### P87 changed files

- `apps/mobile/src/app/navigation/ChefRootNavigator.tsx`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/features/chefOrders/api/chefOrderDetailApi.ts`
- `apps/mobile/src/features/chefOrders/api/chefOrderDetailApi.test.ts`
- `apps/mobile/src/features/chefOrders/domain/chefOrderTabs.ts`
- `apps/mobile/src/features/chefOrders/domain/chefOrderTabs.test.ts`
- `apps/mobile/src/features/chefOrders/screens/ChefPreparingOrdersScreen.tsx`
- `apps/mobile/src/features/chefOrders/state/useChefPreparingOrderActions.ts`
- `apps/mobile/src/features/chefShell/api/chefOperationalApi.ts`
- `apps/mobile/src/features/chefShell/api/chefOperationalApi.test.ts`
- `apps/mobile/src/features/chefShell/state/ChefOperationalProvider.tsx`
- `docs/mobile-ui-rebuild/P87_CHEF_PREPARING_ORDERS.md`
- `build.md`

### P87 correctness audit

The post-implementation audit found and corrected concrete P87 issues before any move to P88:

- display-only malformed list summaries could previously invalidate the whole Chef orders snapshot; they now degrade safely while authoritative status/timer fields still fail closed;
- the prep summary previously counted overdue orders only on the visible client page; it now counts the full Preparing projection;
- stale/concurrent Mark Ready can now reconcile an authoritative Ready state as success rather than issuing/representing a duplicate action;
- Call Customer now refuses a stale card after authoritative status has moved out of Preparing;
- the Guide route `ChefOrdersPreparing` is now actually registered and typed;
- shared tab callbacks are stable and scroll persistence no longer writes global provider state every scroll frame;
- changing a bounded client page resets that page's scroll offset correctly.

Focused tests were updated for exact ready mutation shape, fail-soft summary parsing, tab/count/page behavior, server-derived timer behavior, and full-projection overdue counting. These tests exist in source but are not recorded as passed until an execution environment actually runs them.

### P87 validation / guard state

- The P87 correctness-audit compare from `4cdf8f9...9454c54` contains mobile-only code changes; no `services/`, `openapi/`, `infra/`, or `apps/api/` source was changed during the audit.
- Backend contract review confirmed that Chef acceptance persists `prep_time_minutes`, `accepted_at`, `ready_at`, and `updated_at`, while the currently exposed `OrderResponse` gives mobile `prepTimeMinutes` plus timestamps but not a dedicated ready/accepted timestamp field. P87 therefore continues using the exact exposed server timestamp boundary and does not invent timer fields.
- React Navigation's current official TypeScript/nesting guidance supports `NavigatorScreenParams`, nested navigator registration, `CompositeNavigationProp`, and bubbling unhandled navigation actions to parent navigators; the P87 route correction follows that model.
- Latest code-triggered GitHub Actions run: `31310336314` for `9454c5455336c15e126fca5ad613b666f2602fac`.
- Its `validate-mobile-code` job `93237079571` again concluded failure **before any validation step ran**: `steps=null` and no logs URL. Therefore no `npm ci`, TypeScript, ESLint, Jest, Android bundle, or backend-guard command actually executed in that run.
- This zero-step runner-start failure is **not** recorded as either a code-test failure or a pass.
- The current connector environment cannot clone/install the private mobile workspace, so local TypeScript/ESLint/Jest/bundle pass status is not claimed.

### P87 full-Guide blockers retained instead of fabricated

1. Current `OrderResponse` has no item image/media URL, so authoritative dish thumbnails cannot be rendered. The screen uses the existing order glyph rather than fake image URLs.
2. P88–P90 status screens are outside this one-phase authorization. New/Ready/Completed tabs are displayed but disabled; the dedicated post-ready Ready-screen transition remains pending P89.
3. P86's backend pagination blocker remains: no status/page/cursor list contract exists.
4. Reference Image 40 is not independently inspectable through the current repository tooling, so pixel-level visual certification and Android device/emulator certification cannot be claimed.
5. No exact authorized support-event logging endpoint for Call Customer was found; no endpoint was invented.

**Next phase in sequence:** **P88 — Chef Orders — New — NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop after P87. Do not pre-implement P88 without explicit user direction.

---

## 2. Recent Evidence Index

| Phase | Status | Evidence |
|---|---|---|
| P80 | DONE at code/CI scope | `docs/mobile-ui-rebuild/P80_CHEF_ROOT_SHELL_ROLE_ISOLATION.md` |
| P81 | DONE at code/CI scope | `docs/mobile-ui-rebuild/P81_CHEF_SHARED_HEADER_BADGE_OPERATIONAL_COUNTERS.md` |
| P82 | DONE at code/CI scope | `docs/mobile-ui-rebuild/P82_CHEF_DASHBOARD_CONTRACT_MODEL.md` |
| P83 | DONE at code/CI scope | `docs/mobile-ui-rebuild/P83_CHEF_DASHBOARD_UI.md` |
| P84 | DONE at code/CI scope | `docs/mobile-ui-rebuild/P84_CHEF_ORDER_DETAIL_CONTRACT.md` |
| P85 | DONE at authorized code scope; CI runner blocked | `docs/mobile-ui-rebuild/P85_CHEF_NEW_ORDER_DETAIL_UI_ACTIONS.md` |
| P86 | PARTIAL at full product-contract scope; mobile architecture implemented | `docs/mobile-ui-rebuild/P86_CHEF_ORDER_TAB_QUERY_ARCHITECTURE.md` |
| P87 | PARTIAL at full Guide scope; exact authorized boundary implemented and correctness-hardened; CI execution blocked | `docs/mobile-ui-rebuild/P87_CHEF_PREPARING_ORDERS.md` |
| P88 onward | NOT STARTED / not accepted | — |

---

## 3. Handoff

Before any P88 work, read `plan.md`, `phases.md`, `agent.md`, this ledger, the full 183-page implementation guide, and P86/P87 evidence. Preserve the P86 shared query/tab/timer ownership and the P87 safe summary/reconciliation boundary. Do not add backend/APIM changes or pre-implement later Chef order-status screens without separate authorization.
