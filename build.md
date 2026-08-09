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
- **P89 — Chef Ready for Pickup:** PARTIAL at full Guide completion scope; Ready UI/read/revalidation/reconciliation and cross-tab Ready entry are implemented to the exact current Chef/backend boundary. Evidence: `docs/mobile-ui-rebuild/P89_CHEF_READY_FOR_PICKUP.md`.
- **P90 — Chef Completed Orders:** PARTIAL at full Guide completion scope; bounded read-only Completed history/detail and all-tab Completed entry are implemented to the exact current Chef/backend boundary. Evidence: `docs/mobile-ui-rebuild/P90_CHEF_COMPLETED_ORDERS.md`.
- **P91 — Chef Realtime/Near-Realtime Order Event Reconciliation:** DONE at authorized code scope; near-real-time refetch/reconciliation is implemented through the existing exact Chef orders contract without inventing a push transport. Evidence: `docs/mobile-ui-rebuild/P91_CHEF_REALTIME_ORDER_RECONCILIATION.md`. GitHub Actions validation is not claimed because the account's monthly Actions capacity is exhausted.
- **P92 — Chef Menu Contract Model:** PARTIAL at full Guide/product-contract scope; the complete currently approved five-route Chef Menu contract is typed, fail-closed parsed, source-tested, and centralized for mobile without inventing missing Guide capabilities. Evidence: `docs/mobile-ui-rebuild/P92_CHEF_MENU_CONTRACT_MODEL.md`. GitHub Actions validation is not claimed because the account's monthly Actions capacity is exhausted.
- **P93 — Chef Menu:** PARTIAL at full Guide scope; the real Chef Menu screen, client-side loaded-list search/filtering, availability mutation with rollback, Dashboard cache synchronization, and read-only item navigation are implemented at the exact P92 contract boundary. Evidence: `docs/mobile-ui-rebuild/P93_CHEF_MENU_UI.md`. GitHub Actions/device validation is not claimed because of the reported account limit and connector execution boundary.

**Current executed phase:** **P93 — Chef Menu**.

**P93 phase start commit:** `1cb4dc046c587e73e92d8357b91ddf090150b169`  
**P93 implementation/code end:** `b9b36f36a36984f97e782fd746432347940a7cc3`

### P93 implemented boundary

- Replaced the Chef Menu tab placeholder with the real P93 Chef Menu screen while preserving the existing Chef root shell, shared header, notification ownership, and bottom-tab architecture.
- Added menu summary metrics derived only from the exact P92 response: total, customer-live available, active-but-unavailable, and draft/inactive counts.
- Added a 250 ms debounced **client-side** search over the already-loaded exact list response. No server query parameter was invented.
- Added category chips derived from `item.category` values already returned in the list. No category metadata endpoint or synthetic taxonomy was introduced.
- Added a functional local status filter over exact backend-backed states only: Available (`ACTIVE && available`), Unavailable (`ACTIVE && !available`), Draft, and Inactive. P93 does not fabricate a separate Hidden or Out-of-Stock enum.
- Added skeleton/loading, first-load error/retry, empty, filtered-empty, pull-to-refresh, mutation-busy, success, and rollback/error states.
- Added virtualized list rendering with bounded initial/batch/window settings instead of fabricating server pagination controls.
- Wired the exact `PATCH /api/v1/kitchens/me/menu-items/{menuItemId}/availability` mutation with per-item duplicate-submit protection, optimistic cache update, server-authoritative replacement, and rollback on failure.
- Synchronized the existing P82/P83 Dashboard menu cache during availability mutations so Dashboard sellability metrics do not lag the Chef Menu screen.
- Preserved customer-facing correctness through the authoritative backend rule already established in P92: an item is customer-live only when `status=ACTIVE` and `available=true`. No separate catalog publication acknowledgement was invented.
- Added typed `ChefMenuItemDetail` navigation. The detail screen resolves the item from the canonical Chef list query (and re-lists on a cold cache) because the backend exposes no Chef-owned item-detail GET route.
- Item detail shows only fields actually returned by P92: image, name, description, category, food type, price/currency, serving/prep/spice, package weight, thermobox, status, and availability.
- P94 Add/Edit item UI was not started. Create/replace/media contracts remain available in P92 for the separately authorized next phase.

### P93 changed code files

- `apps/mobile/src/app/navigation/ChefRootNavigator.tsx`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/features/chefMenu/domain/chefMenuPresentation.ts`
- `apps/mobile/src/features/chefMenu/domain/chefMenuPresentation.test.ts`
- `apps/mobile/src/features/chefMenu/state/chefMenuQuery.ts`
- `apps/mobile/src/features/chefMenu/state/useChefMenuModel.ts`
- `apps/mobile/src/features/chefMenu/screens/ChefMenuScreen.tsx`
- `apps/mobile/src/features/chefMenu/screens/ChefMenuItemDetailScreen.tsx`

Evidence/ledger:

- `docs/mobile-ui-rebuild/P93_CHEF_MENU_UI.md`
- `build.md`

### P93 focused test source

`chefMenuPresentation.test.ts` covers:

- exact Available/Unavailable/Draft/Inactive presentation derivation without a fabricated Hidden state;
- summary aggregation from canonical `ChefMenuItem` values;
- local search/category/status filtering over the loaded list;
- deterministic category derivation;
- primary-image selection;
- explicit INR/non-INR price presentation behavior.

### P93 validation / guard state

- The implementation commit is a single fast-forward child of the latest P92 ledger HEAD and changes exactly the eight mobile files listed above.
- No `services/`, `openapi/`, `infra/`, `apps/api/`, backend/APIM, controller, deployment, or server-pipeline source changed during P93.
- No package/dependency was added.
- The authored TypeScript/TSX source was syntax-parsed in an isolated scratch check with `tsc --noResolve`; that check does **not** prove repository module/type compatibility and is not reported as a project TypeScript pass.
- Focused Jest test source was added, but repository Jest execution is not claimed.
- The user explicitly reported that the account's monthly GitHub Actions limit is exhausted and authorized continuing without Actions. Actions are therefore not treated as a P93 pass/fail signal.
- Repository `npm ci`, full TypeScript, ESLint, Jest execution, Android JavaScript bundle generation, and device/emulator validation are **not recorded as passing or failing for P93**.
- The source reference image embedded for Guide Screen 44 was not available as a separately inspectable repository asset in this connector flow, so pixel-perfect/device visual certification is not claimed.

### P93 retained blockers instead of fabricated behavior

1. No server search/filter/category/summary/pagination parameters exist on `GET /api/v1/kitchens/me/menu-items`; P93 therefore does not implement fake server pagination or server filtering.
2. No Chef-owned menu-item detail GET exists; read-only detail resolves through the canonical list contract.
3. No category/subcategory metadata endpoint exists; chips are derived only from categories already present in the loaded response.
4. No separate visibility mutation or authoritative `Hidden` mapping exists beyond status + availability.
5. The Chef Menu response exposes no rating or order-count metrics required by the Guide reference; P93 does not invent those values.
6. Delete/duplicate actions remain unavailable because no approved mutations exist.
7. Add/Edit item UI belongs to P94 and was not pre-implemented under this authorization.
8. Media management beyond the existing upload contract remains blocked exactly as recorded in P92.
9. No explicit catalog synchronization acknowledgement contract exists; catalog visibility derives from persisted server state.
10. GitHub Actions, full workspace validation, reference-image pixel comparison, and Android device certification remain unavailable for this phase under the reported/tooling constraints.

**Next phase in sequence:** **P94 — Chef Add New Menu Item — NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop after P93. Do not pre-implement P94 without explicit user direction.

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
| P89 | PARTIAL at full Guide scope; Ready UI/revalidation/cross-tab entry boundary implemented | `docs/mobile-ui-rebuild/P89_CHEF_READY_FOR_PICKUP.md` |
| P90 | PARTIAL at full Guide scope; bounded read-only Completed history/detail boundary implemented | `docs/mobile-ui-rebuild/P90_CHEF_COMPLETED_ORDERS.md` |
| P91 | DONE at authorized code scope; near-real-time refetch/reconciliation implemented; Actions not claimed | `docs/mobile-ui-rebuild/P91_CHEF_REALTIME_ORDER_RECONCILIATION.md` |
| P92 | PARTIAL at full Guide/product-contract scope; exact current five-route menu contract centralized/hardened | `docs/mobile-ui-rebuild/P92_CHEF_MENU_CONTRACT_MODEL.md` |
| P93 | PARTIAL at full Guide scope; exact current Menu UI/availability/detail boundary implemented | `docs/mobile-ui-rebuild/P93_CHEF_MENU_UI.md` |
| P94 onward | NOT STARTED / not accepted | — |

---

## 3. Handoff

Before any P94 work, read `plan.md`, `phases.md`, `agent.md`, this ledger, the full 183-page implementation guide, P92 contract evidence, P93 UI evidence, and the canonical `features/chefMenu` API/state/UI implementation. Preserve P93 search/filter/scroll behavior and the exact five-route P92 contract. Do not add backend/APIM changes, fake pagination, Hidden/delete/duplicate capabilities, or pre-implement later Chef phases without separate authorization.
