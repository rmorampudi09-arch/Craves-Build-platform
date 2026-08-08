# P35 — Discover Home Chefs — Empty Cart

**Project:** CRAVES Mobile Rebuild  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Phase:** P35 only  
**Status:** **PARTIAL — supported empty-cart chef-discovery surface implemented and CI-validated; full reference acceptance remains blocked by missing public kitchen-detail, cuisine/filter, favorite, rating/ETA, verification/media, and server-search contracts**  
**Started from branch head:** `154f3334f0cefcb8a4841d6023b1b97f231c293b`  
**Validated implementation commit:** `5fd2dfa0b36de13f38db16f45fed374d7f295724`  
**Guide ref:** 7 / `image7.jpeg` — Discover Home Chefs — Empty Cart

---

## 1. Authority Reviewed

P35 was executed after reviewing the current branch authority and the full 183-page implementation guide:

- `agent.md`
- `build.md`
- `phases.md`
- `plan.md`
- `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`

The guide requires the empty-cart Discover Home Chefs experience, while repository/APIM reality remains authoritative for concrete data and navigation. Missing contracts are therefore surfaced as blockers rather than simulated.

---

## 2. P35 Scope From `phases.md`

P35 owns:

- Discover Home Chefs empty-cart presentation,
- search/filter/card interaction behavior to the extent exact product contracts exist,
- connection to the existing Customer Chefs tab,
- lifecycle states and nearby-kitchen pagination,
- absence of the active-cart View Cart state when the authoritative cart is empty.

P36 owns the active-cart variant and was not started.

---

## 3. Implemented Supported Surface

### Customer Chefs navigation root

- Replaced the temporary P25 account-status surface at `CustomerChefsRoot` with the real P35 Discover Home Chefs screen.
- Preserved the existing typed Customer tab/stack architecture; no second navigator was introduced.
- Preserved shared bottom-navigation state and the P26 scroll hide/reveal controller.

### Nearby chef/kitchen data

The screen uses the P34 exact contract/query boundary:

```http
GET /api/v1/discovery/kitchens
```

Supported query parameters only:

- `latitude`
- `longitude`
- `radiusMeters`
- `page`
- `size`

Supported kitchen fields only:

- `id`
- `kitchenName`
- `displayName`
- `description`
- `areaName`
- `city`
- `state`
- `latitude`
- `longitude`
- `distanceMeters`
- `activeMenuItemCount`

No guide-only field was added to the accepted model.

### Screen behavior

- Uses the shared Customer header and saved browsing location.
- Opens the existing saved-location selector from the header and missing-location state.
- Uses paginated nearby kitchens and authoritative `hasNext` behavior from P34.
- Supports pull-to-refresh and incremental load-more.
- Provides loading skeleton, missing-location, populated, empty, filtered-empty, offline, recoverable-error, refresh, and pagination-loading states.
- Preserves already loaded valid data during recoverable query errors.
- Implements a bounded **loaded-result search** across only returned kitchen name/description/location fields. It does not pretend to be server search.
- Deduplicates paged kitchen summaries by stable kitchen ID.
- Formats backend distance and location metadata without deriving ETA or serviceability.
- Uses backend `activeMenuItemCount` as the only dish/menu availability summary.
- Uses initials as a neutral no-media fallback because the current nearby-kitchen contract has no avatar/kitchen-image field.
- Uses the existing Flame Red / Espresso Brown design tokens, Android touch targets, safe-area shell, responsive list layout, and accessibility roles/labels.
- Does not introduce a screen-local View Cart implementation. The shared P29 cart visibility policy remains authoritative; the requested P35 empty-cart state has no View Cart.

---

## 4. Search, Filter, and Card Boundaries

### Search

The current API exposes no search parameter. P35 therefore searches only the currently loaded nearby page set. Pagination is paused while a local search is active so the UI does not imply a complete server-side filtered result set.

### Filter

Reference 07 includes filter/cuisine behavior, but the current branch does not provide authoritative cuisine taxonomy, rating, availability/sort, or chef-filter parameters. The visible filter action therefore explains the unavailable contract instead of generating fake filtered results or an invented request.

### Kitchen/profile card interaction

P35 can identify a nearby kitchen by its real backend ID, but the current Customer route registry does not yet contain the public kitchen profile destination and P42/P43 own that contract/UI later in the phase plan. The card interaction therefore reports this exact boundary instead of navigating to an unreachable route or creating a placeholder profile.

This means the `phases.md` acceptance item requiring **real kitchen/profile navigation** is not yet satisfiable, so P35 cannot be marked DONE.

---

## 5. Explicit Contract / Product Blockers

Current branch authority does not provide the P35 reference with exact supported contracts/routes for:

- public kitchen/chef profile detail navigation,
- cuisine taxonomy and cuisine filtering,
- chef/kitchen favorite read/mutation,
- rating/review summary,
- delivery ETA,
- delivery serviceability decision,
- public verification badge/status,
- avatar/kitchen/sample-dish media in nearby discovery,
- server-side chef search,
- rating/distance/availability/sort filter parameters.

These are not fabricated in P35.

Physical-device/reference-image pixel certification also remains deferred to the later visual QA phases; this phase validates source behavior and CI gates only.

---

## 6. Changed Files

Implementation:

- `apps/mobile/src/features/chefDiscovery/chefDiscoveryPresentation.ts`
- `apps/mobile/src/features/chefDiscovery/screens/DiscoverHomeChefsScreen.tsx`
- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`

Tests:

- `apps/mobile/src/features/chefDiscovery/chefDiscoveryPresentation.test.ts`

Evidence:

- `docs/mobile-ui-rebuild/P35_DISCOVER_HOME_CHEFS_EMPTY_CART.md`

No backend, OpenAPI, APIM, infrastructure, database, Android native build configuration, P36 active-cart chef-discovery behavior, Cart/Checkout, public kitchen-profile implementation, or Chef-owner operational feature was changed.

---

## 7. Validation Evidence

Workflow:

- `.github/workflows/mobile-phase1-ci.yml`

Successful implementation run:

- run ID: `31249264023`
- job ID: `93082900325`
- head SHA: `5fd2dfa0b36de13f38db16f45fed374d7f295724`
- conclusion: **SUCCESS**

Passed gates:

1. checkout of `mobile-ui-rebuild-from-scratch`,
2. Node setup and dependency installation,
3. strict TypeScript: **PASS**,
4. ESLint zero-warning gate: **PASS**,
5. Jest: **PASS**,
6. production Android JavaScript bundle generation: **PASS**,
7. backend/APIM/infrastructure source guard: **PASS**.

No Gradle/APK packaging was performed, consistent with the rebuild phase policy.

---

## 8. Acceptance Assessment

| P35 requirement | Result |
|---|---|
| Real Customer Chefs discovery root | **IMPLEMENTED / VALIDATED** |
| Empty-cart discovery surface | **IMPLEMENTED within supported contract** |
| Saved-location dependency | **IMPLEMENTED / VALIDATED** |
| Nearby kitchen pagination | **IMPLEMENTED / VALIDATED** |
| Loading/empty/offline/error/refresh states | **IMPLEMENTED / VALIDATED** |
| Loaded-result search interaction | **IMPLEMENTED / VALIDATED as bounded local search** |
| View Cart absent for empty cart | **PASS — no P35-local overlay; shared P29 policy remains authoritative** |
| Cuisine/filter behavior | **BLOCKED — no authoritative taxonomy/filter contract** |
| Favorite behavior | **BLOCKED — no authoritative favorite contract** |
| Rating/ETA/verification/media reference content | **BLOCKED — fields/contracts absent** |
| Real kitchen/profile navigation | **BLOCKED — public kitchen profile route/contract belongs to later P42/P43 work and is not registered** |
| Physical-device pixel/reference certification | **QA PENDING — deferred to visual QA phases** |

Therefore P35 is **PARTIAL**, not DONE.

---

## 9. Stop State

**P36 — Discover Home Chefs — Active Cart was not started.**

**Next phase authorization:** **NONE — stop after P35 and wait for explicit user direction.**
