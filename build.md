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
- **P86 — Chef Order Tab Query Architecture:** PARTIAL at full product-contract scope; mobile architecture is implemented at the exact currently available backend boundary. Evidence: `docs/mobile-ui-rebuild/P86_CHEF_ORDER_TAB_QUERY_ARCHITECTURE.md`.
- **P87 — Chef Preparing Orders:** PARTIAL at full Guide completion scope; implemented and correctness-hardened to the exact currently authorized mobile/backend boundary. Evidence: `docs/mobile-ui-rebuild/P87_CHEF_PREPARING_ORDERS.md`.
- **P88 — Chef Orders — New:** PARTIAL at full Guide completion scope; implemented to the exact currently available mobile/backend contract boundary. Evidence: `docs/mobile-ui-rebuild/P88_CHEF_ORDERS_NEW.md`.

**Current executed phase:** **P88 — Chef Orders — New**.

**P88 phase start commit:** `a44a654b33e539369ac141616969594b2014e3eb`  
**P88 implementation/code end:** `a4876a592cc8269166b7c4290d65f161eb812904`

### P88 implemented boundary

- Registered typed logical route `ChefOrdersNew` in the existing nested Chef Orders navigator and made New the initial Orders status route.
- New and Preparing are now real switchable status tabs. Ready and Completed remain disabled until their separately authorized phases.
- Reused P86/P87 shared state: New projection, tab counts, bounded client pages, independent scroll offsets, shared refresh, Chef badge/counter state, and immediate authoritative order reconciliation.
- Added virtualized New Orders UI with New summary, safe order cards, received-age urgency, detail navigation, pull refresh, bounded paging, loading skeleton, empty/error/retry states, action progress, feedback, and response-time tip.
- Individual Accept requires an order-specific positive preparation time and reuses the existing Chef decision coordinator for protected detail revalidation, stable idempotency key, duplicate/race guard, authoritative mutation, conflict handling, shared counter reconciliation, and background refresh.
- Individual Reject requires a non-empty reason plus explicit confirmation and uses the same revalidation/idempotency/reconciliation path.
- Received age is derived from the server `createdAt`; no acceptance deadline is guessed from local time.
- `Accept All` is visible and has a real explanatory handler, but no bulk mutation is fabricated because the current backend exposes no accept-all/bulk-eligibility contract and single accept requires a per-order preparation time.
- Chef bottom navigation/header are preserved; no customer cart UI/state was introduced.

### P88 exact contracts

- `GET /api/v1/chef/orders`
- `GET /api/v1/chef/orders/{orderId}`
- `POST /api/v1/chef/orders/{orderId}/accept`
  - `{ prepTimeMinutes, note }`
  - `Idempotency-Key` supported
- `POST /api/v1/chef/orders/{orderId}/reject`
  - `{ reason }`
  - `Idempotency-Key` supported

The current Chef Orders controller/route inventory contains list, detail, accept, reject, and ready-for-pickup only. It has no accept-all/bulk eligibility/result endpoint. The server acceptance service owns `chef_acceptance_expires_at` and validates the 30-minute window, but `OrderResponse` does not expose that expiry to mobile.

### P88 changed code files

- `apps/mobile/src/app/navigation/ChefRootNavigator.tsx`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/features/chefOrders/domain/chefNewOrders.ts`
- `apps/mobile/src/features/chefOrders/domain/chefNewOrders.test.ts`
- `apps/mobile/src/features/chefOrders/screens/ChefNewOrdersScreen.tsx`
- `apps/mobile/src/features/chefOrders/screens/ChefPreparingOrdersScreen.tsx`
- `apps/mobile/src/features/chefOrders/state/useChefNewOrderActions.ts`

Evidence/ledger:

- `docs/mobile-ui-rebuild/P88_CHEF_ORDERS_NEW.md`
- `build.md`

### P88 validation / guard state

- Phase-start → P88 code compare contains only the seven `apps/mobile` paths above. No `services/`, `openapi/`, `infra/`, or `apps/api/` source was changed.
- GitHub Actions push run `31310893541` for `a4876a592cc8269166b7c4290d65f161eb812904` completed with failure before runner startup. Job `validate-mobile-code` (`93238449790`) reports no executed steps, runner id `0`, and an empty runner name.
- Therefore no repository `npm ci`, TypeScript, ESLint, Jest, Android bundle, or backend-guard command actually executed in that run. The run is not recorded as a code-test failure and is not recorded as a pass.
- The new pure received-age helper was independently strict-compiled and smoke-asserted for normal, long, malformed/missing, and future-skew timestamps; that isolated check passed. It is not a substitute for project CI.
- The full private mobile workspace is not executable through the current connector, so project-wide local pass status is not claimed.

### P88 full-Guide blockers retained instead of fabricated

1. **Accept All / bulk partial-result handling:** no bulk eligibility or accept-all endpoint exists. Sequential client calls are not represented as compliant bulk behavior.
2. **Exact acceptance countdown:** server expiry exists internally but is omitted from `OrderResponse`; P88 shows received age only.
3. **P86 pagination blocker:** Chef order list has no status/page/cursor contract, so history remains bounded by the current list response and client projection.
4. **Real-time arrival/highlight behavior:** no new event architecture was added in P88; later event/reconciliation work remains outside this one-phase authorization.
5. **Reference Image 41 visual certification:** the 183-page Guide is readable, but the embedded image is not independently renderable through the current file tooling; pixel-level certification cannot be claimed.
6. **Android/device certification:** no emulator/device run occurred here.
7. **Project CI execution:** the runner did not start any validation step.

**Next phase in sequence:** **P89 — Chef Orders — Ready for Pickup — NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop after P88. Do not pre-implement P89 without explicit user direction.

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
| P86 | PARTIAL at full product-contract scope; exact mobile boundary implemented | `docs/mobile-ui-rebuild/P86_CHEF_ORDER_TAB_QUERY_ARCHITECTURE.md` |
| P87 | PARTIAL at full Guide scope; exact authorized boundary implemented/hardened | `docs/mobile-ui-rebuild/P87_CHEF_PREPARING_ORDERS.md` |
| P88 | PARTIAL at full Guide scope; exact current contract boundary implemented | `docs/mobile-ui-rebuild/P88_CHEF_ORDERS_NEW.md` |
| P89 onward | NOT STARTED / not accepted | — |

---

## 3. Handoff

Before any P89 work, read `plan.md`, `phases.md`, `agent.md`, this ledger, the full 183-page implementation guide, and P86–P88 evidence. Preserve the shared Chef order query/tab/reconciliation ownership. Do not add backend/APIM changes or pre-implement later Chef status screens without separate authorization.
