# P32 — Customer Home — Empty Cart

**Project:** CRAVES Mobile Rebuild  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Phase:** P32 only  
**Status:** **PARTIAL — supported empty-cart Home path implemented and validated; reference actions that require missing contracts/routes remain blocked**  
**Started from branch head:** `3635fe443dd263393e2899a4f0ebb5f555b108ef`  
**Validated implementation commit:** `9227a56fb8caf3213d3900bed9e3b4eb7514f543`  
**Guide reference:** 5 — Customer Home — Empty Cart

---

## 1. Authority Reviewed

P32 was executed after reviewing:

- `plan.md`
- `phases.md`
- `agent.md`
- `build.md`
- the full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`

The user explicitly authorized the next phase after P31. P31 remains correctly recorded as PARTIAL because its category/cuisine/full-home contract gaps still exist; P32 does not invent those contracts.

---

## 2. P32 Scope and Acceptance

`phases.md` defines P32 as **Customer Home — Empty Cart** with:

- reference-faithful Home composition for the empty-cart state,
- real plus/favorite/search/category/chef/dish actions,
- View Cart absent,
- connected loading/empty/error/offline states.

The master guide additionally expects shared location/header behavior, discovery content, search, categories/cuisines, nearby dishes, recommendation sections, pull-to-refresh/pagination, and shared bottom-navigation behavior.

---

## 3. Implemented Behavior

### Real Home root

The Customer Home tab no longer points at the temporary account-status surface. `CustomerHomeRoot` now renders `CustomerHomeScreen` while the Chefs, Orders, and Profile product roots remain untouched for their owning phases.

### Shared customer shell integration

The screen reuses the accepted P27/P26 infrastructure:

- shared customer location header,
- notification badge state,
- saved-location selector,
- selected saved-address coordinates,
- scroll-aware bottom-navigation hide/reveal.

Location selection continues to invalidate the P31 Home discovery query prefix rather than introducing another cache or location store.

### Exact supported discovery feed

P32 consumes only the P31 adapter for:

- `GET /api/v1/discovery/menu-items`
- `latitude`
- `longitude`
- `radiusMeters`
- `page`
- `size`

The screen displays only backend-returned active/available nearby dishes. It does not ship hardcoded production dish, cuisine, chef, banner, or recommendation entities.

### Empty-cart Home composition

The implemented Home surface includes:

- location + notification header,
- personalized greeting from authenticated identity display name when present,
- customer discovery heading,
- debounced search over the already-loaded authoritative nearby result set,
- category chips derived only from categories present in those loaded backend results,
- paginated nearby-dish list,
- remote primary image when supplied by the discovery response with neutral category fallback when absent,
- backend price/currency, kitchen, distance, location, and food-type presentation,
- real Add action through the existing P30 `addCartItem` command,
- pull-to-refresh,
- next-page fetch when no local search/category filter is active,
- no P33 active-cart Home composition and no P32-owned View Cart control.

Local search/category filtering is deliberately scoped to already-loaded nearby results. It is not represented as server-side catalog search/category filtering and does not bypass P31's fail-closed contract boundary.

### Lifecycle states

The Home screen connects:

- initial loading skeleton,
- no-location state with real saved-location action,
- empty nearby result state,
- filtered-empty state,
- recoverable query error state,
- network/offline query state,
- background refresh while existing content stays visible,
- next-page loading,
- add-to-cart mutation error state.

---

## 4. Changed Files

Implementation:

- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/features/home/screens/CustomerHomeScreen.tsx`
- `apps/mobile/src/features/home/homePresentation.ts`

Tests:

- `apps/mobile/src/features/home/homePresentation.test.ts`

No backend, OpenAPI, APIM, infrastructure, database, native Android build configuration, P33 active-cart Home behavior, checkout, payment, Chef product screen, Orders screen, or Profile screen was changed.

---

## 5. Validation Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Successful run:

- run ID: `31245957014`
- job ID: `93074471641`
- head SHA: `9227a56fb8caf3213d3900bed9e3b4eb7514f543`
- conclusion: **SUCCESS**

Passed gates:

1. checkout + Node `22.13.0`,
2. `npm ci`,
3. strict TypeScript `tsc --noEmit`,
4. ESLint with zero warnings,
5. Jest including new P32 presentation tests and prior regressions,
6. production Android JavaScript bundle,
7. backend/APIM/infrastructure source guard.

The implementation workflow does not build an APK/AAB by policy.

---

## 6. Acceptance Assessment

| P32 requirement | Result |
|---|---|
| Real Customer Home root | **IMPLEMENTED / VALIDATED** |
| Shared location/header/bottom-nav behavior | **IMPLEMENTED / VALIDATED** |
| Real nearby feed + pagination | **IMPLEMENTED / VALIDATED** |
| Real plus/Add action | **IMPLEMENTED / VALIDATED** through P30 cart mutation boundary |
| Search action | **PARTIAL** — real debounced filtering over loaded nearby results; full catalog-search route/contract is not owned/available here |
| Category action | **PARTIAL** — real filtering over loaded returned categories; no authoritative server category query contract exists |
| Favorite action | **BLOCKED** — no authoritative favorite API/domain contract exists in the current branch |
| Chef card navigation | **BLOCKED** — owning Chef discovery/detail product routes are later phases and are not registered yet |
| Dish card navigation | **BLOCKED** — owning Dish Detail route is a later phase and is not registered yet |
| Notification inbox navigation | **BLOCKED** — P27 provides badge/read data but the Notifications Center product route is not yet registered |
| Full cuisine taxonomy section | **BLOCKED** — no authoritative cuisine taxonomy/response contract |
| Promotional/recommendation aggregation | **BLOCKED** — no authoritative current-branch Home aggregation/recommendation contract |
| View Cart absent for P32 surface | **PASS** |
| Loading/empty/error/offline states | **IMPLEMENTED / VALIDATED** |

Because several explicit acceptance actions cannot be implemented without inventing later routes or missing backend contracts, P32 is recorded as **PARTIAL**, not DONE.

---

## 7. Visual / Runtime QA

Code-level styling follows the accepted CRAVES token system and Reference 05 structure, but no emulator/physical-device reference overlay comparison was performed in this phase. Pixel-perfect certification is therefore **not claimed**.

Live APIM traffic is also not claimed by this CI-only validation record.

---

## 8. Stop State

P33 — Customer Home — Active Cart was **not started**.

**Next phase authorization:** **NONE — stop after P32 and wait for explicit user direction.**
