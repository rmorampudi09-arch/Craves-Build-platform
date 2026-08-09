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

**Current executed phase:** **P94 — Chef Add New Menu Item**.

**P94 phase start commit:** `5675a3501a9cfab9368b9c139c21fc39ff7cca5f`  
**P94 implementation/code end:** `d95c2156cd1aa6ce3bfe96f6d2f7e67370759fc1`

### P94 implemented boundary

- Added the typed focused `ChefAddMenuItem` product-stack route. The form is outside the Chef bottom tabs, matching the Guide's focused-form route behavior.
- Added a functional `+ Add new item` Menu entry action while leaving the P93 Menu screen implementation itself untouched; returning from the form preserves the mounted P93 tab/search/filter state.
- Added React Hook Form + Zod validation for the exact current create contract: required item/category/food type/price/package weight/thermobox plus optional description/serves/preparation time/spice and exact availability/status values.
- `Save as Draft` uses the real create route with `status=DRAFT`; because the backend has no incomplete-draft contract, it still requires all server-required create fields.
- `Add Item` uses the same real create route with `status=ACTIVE`. No separate publication route/acknowledgement is fabricated.
- Both submit actions wait for a valid parsed backend response before returning to Menu. Failures remain on the form with safe recoverable error copy.
- Added in-flight submission protection and disabled submit UI during the mutation so rapid duplicate taps cannot issue parallel creates from this route.
- On success, the canonical Chef Menu query cache and the existing Chef Dashboard menu cache receive the server-returned item and are then invalidated for authoritative revalidation.
- Added explicit availability and thermobox controls plus food-type/spice choices mapped only to approved enums.
- Added a media boundary that shows the exact JPEG/PNG/WebP types but does not expose a fake picker/upload: the app has no approved native picker dependency and the server's runtime max-size/image-count policy is not client-readable.
- No category/subcategory taxonomy, cooking/packing/shelf-life fields, duplicate-name endpoint, catalog publication acknowledgement, or incomplete draft capability was invented.
- P95 edit/image-replacement/unsaved-change/mutation-hardening work was not started.

### P94 changed code files

- `apps/mobile/src/app/navigation/ChefRootNavigator.tsx`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/features/chefMenu/domain/chefMenuForm.ts`
- `apps/mobile/src/features/chefMenu/domain/chefMenuForm.test.ts`
- `apps/mobile/src/features/chefMenu/state/useChefAddMenuItemModel.ts`
- `apps/mobile/src/features/chefMenu/screens/ChefAddMenuItemScreen.tsx`

Evidence/ledger:

- `docs/mobile-ui-rebuild/P94_CHEF_ADD_NEW_MENU_ITEM.md`
- `build.md`

### P94 focused test source

`chefMenuForm.test.ts` covers:

- fail-closed validation when server-required create fields are missing;
- exact `SAVE_DRAFT -> DRAFT` request mapping;
- exact `ADD_ITEM -> ACTIVE` request mapping without invented publication fields;
- null mapping for optional description/serves/preparation/spice fields;
- price minimum `0.01`;
- positive whole-number package/preparation validation.

### P94 validation / guard state

- P94 implementation is one fast-forward code commit from the latest P93 ledger HEAD and changes exactly six mobile files before this evidence/ledger update.
- No `services/`, `openapi/`, `infra/`, backend/APIM, deployment, pipeline, or package/dependency source changed.
- The authored P94 TypeScript/TSX source was checked in an isolated scratch parse using `tsc --noResolve`; zero TypeScript parser/syntax diagnostics were emitted. The expected unresolved dependency/Jest ambient diagnostics from that isolated environment are not a project type-check result.
- Focused Jest source exists, but repository Jest execution is not claimed.
- GitHub Actions are intentionally not used as a P94 pass/fail signal because the user reported the account Actions limit is exhausted and explicitly authorized continuing without it.
- Full workspace TypeScript, ESLint, Jest execution, Android bundle/build, emulator/device behavior, keyboard/safe-area behavior, and pixel-perfect comparison are **not recorded as passing or failing for P94**.
- The embedded Guide Screen 45 image could not be extracted as a separately available image asset through the current file connector, so device/pixel certification is not claimed.

### P94 retained blockers instead of fabricated behavior

1. No approved mobile image-picker integration is currently present; P94 does not add an unvalidated native dependency while build/device verification is unavailable.
2. The server media maximum is runtime-configured and there is no client-readable max-size/image-count policy, so the client cannot truthfully enforce the Guide's complete media policy without hard-coding an unstable server value.
3. No category/subcategory metadata route exists; the exact backend field is free-text `category`.
4. No separate incomplete-draft request exists; `DRAFT` still requires the core `MenuItemRequest` fields.
5. No duplicate/name-check route exists.
6. No Guide cooking-time/packing-time/shelf-life request fields exist in the approved backend contract.
7. No separate catalog publication acknowledgement exists; customer visibility remains the authoritative backend condition `status=ACTIVE && available=true`.
8. Edit existing item, image replacement/reorder/delete, unsaved-change protection, and broader mutation hardening belong to P95 and were not pre-implemented.
9. GitHub Actions/full workspace/device/reference-image validation remain unavailable under the reported/tooling constraints.

**Next phase in sequence:** **P95 — Chef Menu Edit/Mutation Hardening — NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop after P94. Do not pre-implement P95 without explicit user direction.

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
| P95 onward | NOT STARTED / not accepted | — |

---

## 3. Handoff

Before any P95 work, read `plan.md`, `phases.md`, `agent.md`, this ledger, the full 183-page implementation guide, P92 contract evidence, P93 UI evidence, P94 add-item evidence, and the canonical `features/chefMenu` API/state/UI implementation. Preserve P93 Menu list/search/filter/scroll state and the exact five-route P92 backend contract. Do not add backend/APIM changes, invent category/media policies, or pre-implement later Chef phases without separate authorization.
