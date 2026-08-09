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
- **P93 — Chef Menu:** PARTIAL at full Guide scope; the real Chef Menu screen, client-side loaded-list search/filtering, availability mutation with rollback, Dashboard cache synchronization, and read-only item navigation are implemented at the exact P92 contract boundary. Evidence: `docs/mobile-ui-rebuild/P93_CHEF_MENU_UI.md`.
- **P94 — Chef Add New Menu Item:** PARTIAL at full Guide scope; the focused create form, exact server-backed Save Draft/Add Item mutations, client validation, duplicate-tap guard, and Chef Menu/Dashboard cache synchronization are implemented at the current P92 contract boundary. Media/category metadata/incomplete-draft gaps remain explicit. Evidence: `docs/mobile-ui-rebuild/P94_CHEF_ADD_NEW_MENU_ITEM.md`.
- **P95 — Chef Menu Edit/Mutation Hardening:** PARTIAL at full Guide scope; exact current-contract full replacement editing, server-returned cache reconciliation, duplicate-submit guarding, and unsaved-change protection are implemented. Image replacement and structured field-level server binding remain blocked by missing exact contracts/dependencies. Evidence: `docs/mobile-ui-rebuild/P95_CHEF_MENU_EDIT_MUTATION_HARDENING.md`.

**Current executed phase:** **P95 — Chef Menu Edit/Mutation Hardening**.

**P95 phase start commit:** `7d1d61c9d4e453547e446651f91bfc5c9b25206c`  
**P95 implementation/code end:** `1a1508a8193ff05c2e4cfcf11d46f4a1f12e12d3`

### P95 implemented boundary

- Added a typed focused `ChefEditMenuItem` route launched from the existing Chef menu-item detail screen without modifying P93 Menu list/search/filter logic.
- The editor is prefilled only from the canonical Chef menu list response. If the target item is absent, it fails closed because no chef-owned detail GET exists.
- Implemented the exact backend `PUT /api/v1/kitchens/me/menu-items/{menuItemId}` as a **full `MenuItemRequest` replacement**, not a guessed partial update.
- All writable request fields are rebuilt from validated form values. Existing `currency` and backend `status` are explicitly preserved so editing cannot silently change currency or publication state.
- Availability remains editable because it is an approved `MenuItemRequest` field; customer-live semantics remain `status=ACTIVE && available=true`.
- Added an in-flight edit submission guard plus disabled save UI so rapid repeated taps cannot issue parallel replacement requests from this route.
- On a parsed successful server response, both the canonical Chef Menu cache and the Chef Dashboard menu cache replace the matching item with that returned object, then revalidate from the server.
- Added unsaved-change protection with React Navigation removal prevention; dirty forms require explicit discard confirmation. Native swipe-back is disabled on the edit route to keep the guard deterministic.
- Safe `AppApiError.message` and sanitized `details[]` are surfaced. The client does not guess which field a detail belongs to because the current error contract has no structured field key/path format.
- Existing media is shown read-only. P95 does not expose a fake replace/delete/reorder action when the exact backend only exposes upload and the app has no approved picker.
- Added focused edit-domain test source covering canonical prefill and exact full-replacement mapping while preserving all P94 create-form tests.
- P96 Analytics work was not started.

### P95 changed code files

- `apps/mobile/src/app/navigation/ChefRootNavigator.tsx`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/features/chefMenu/domain/chefMenuForm.ts`
- `apps/mobile/src/features/chefMenu/domain/chefMenuForm.test.ts`
- `apps/mobile/src/features/chefMenu/state/useChefEditMenuItemModel.ts`
- `apps/mobile/src/features/chefMenu/screens/ChefEditMenuItemScreen.tsx`
- `apps/mobile/src/features/chefMenu/screens/ChefMenuItemDetailScreen.tsx`

Evidence/ledger:

- `docs/mobile-ui-rebuild/P95_CHEF_MENU_EDIT_MUTATION_HARDENING.md`
- `build.md`

### P95 focused test source

`chefMenuForm.test.ts` now additionally covers:

- prefill of every writable edit field from an exact `ChefMenuItem` response;
- exact complete replacement mapping;
- preservation of existing `currency`;
- preservation of existing backend `status` while allowing the approved `available` field to change.

### P95 validation / guard state

- P95 implementation is one fast-forward code/evidence commit from the latest P94 ledger HEAD and changes exactly seven mobile code/test files plus one P95 evidence file before this ledger update.
- `GitHub.compare_commits` confirms the P95 implementation commit is exactly one commit ahead of P94 and contains only those eight files.
- No `services/`, `openapi/`, `infra/`, backend/APIM, deployment, pipeline, or package/dependency source changed.
- Focused Jest source exists, but repository Jest execution is not claimed from the connector environment.
- GitHub Actions are intentionally not used as a P95 pass/fail signal because the user reported the account Actions limit is exhausted and explicitly authorized continuing without it.
- Full workspace TypeScript, ESLint, Jest execution, Android bundle/build, emulator/device behavior, unsaved-navigation/device gesture behavior, keyboard/safe-area behavior, and pixel-perfect comparison are **not recorded as passing or failing for P95**.

### P95 retained blockers instead of fabricated behavior

1. Image replacement remains blocked: the exact backend exposes image upload but no replace/delete/reorder/set-primary-after-upload management contract, and the app still has no approved native image picker.
2. Structured field-level server binding remains blocked: `AppApiError.details` is only a sanitized string array with no defined field key/path contract. P95 displays those details but does not guess field ownership.
3. Backend idempotency remains unavailable: no exact idempotency key/header semantics exist for Chef Menu mutations. P95 uses only a client in-flight guard and does not claim a server idempotency guarantee.
4. No chef-owned menu-item detail GET exists; editing therefore depends on the canonical list response already used by P93.
5. Delete/duplicate item routes remain unavailable.
6. Category taxonomy, incomplete-draft rules, duplicate-name checks, runtime media limits/image-count policy, cooking/packing/shelf-life fields, and catalog publication acknowledgement remain unavailable at the approved contract boundary.
7. GitHub Actions/full workspace/device/reference-image validation remain unavailable under the reported/tooling constraints.

**Next phase in sequence:** **P96 — Chef Analytics Contract Model — NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop after P95. Do not pre-implement P96 without explicit user direction.

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
| P94 | PARTIAL at full Guide scope; exact create-form/server mutation boundary implemented | `docs/mobile-ui-rebuild/P94_CHEF_ADD_NEW_MENU_ITEM.md` |
| P95 | PARTIAL at full Guide scope; exact full-replacement edit/mutation hardening boundary implemented | `docs/mobile-ui-rebuild/P95_CHEF_MENU_EDIT_MUTATION_HARDENING.md` |
| P96 onward | NOT STARTED / not accepted | — |

---

## 3. Handoff

Before any P96 work, read `plan.md`, `phases.md`, `agent.md`, this ledger, the full 183-page implementation guide, P92 contract evidence, P93 Menu UI evidence, P94 add-item evidence, P95 edit/mutation evidence, and the canonical `features/chefMenu` implementation. Preserve the exact five-route P92 backend contract and do not convert P95's explicit media/error/idempotency blockers into fabricated behavior. Do not add backend/APIM changes or pre-implement later Chef phases without separate authorization.
