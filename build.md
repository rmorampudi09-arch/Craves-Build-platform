# CRAVES Mobile Build / Implementation Ledger

**Purpose:** Authoritative living record for the current mobile rebuild. Read this before changing code. Do not infer completion from old APKs, old branches, screenshots, historical documents, or prior chat claims.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Authoritative rebuild branch:** `mobile-ui-rebuild-from-scratch`  
**Mobile workspace:** `apps/mobile`  
**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`  
**Implementation guide:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`.  
**Build policy:** Code-level validation during implementation. **No APK per phase.** Final Android APK/AAB only after all implementation/QA gates in `phases.md` are complete.

Historical detail is preserved under `docs/mobile-ui-rebuild/`. `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P12.md` preserves the early ledger; P13 onward uses dedicated phase evidence documents. This living ledger is intentionally compact.

---

## 1. Current Control State

- **P00–P30: DONE** at their recorded implementation/static-contract scope. Device/reference certification remains deferred where the phase evidence says so.
- **P31–P56:** retain the exact DONE/PARTIAL status, ownership boundary, blockers, and validated CI from their dedicated evidence records. Do not reinterpret a PARTIAL phase as DONE.
- **P57 — Customer Profile/Rewards Contract: DONE.** Exact supported customer-profile fields are mapped; unsupported rewards/aggregate/chef-summary capabilities remain explicitly unavailable.
- **P58 — Customer Profile — Empty Cart: DONE.** Shared Profile hub composition and lifecycle behavior are implemented at its recorded scope.
- **P59 — Customer Profile — Active Cart: DONE.** Shared Profile route uses the authoritative View Cart overlay without duplicating Profile state.
- **P60 — Favorites — Empty Cart: PARTIAL.** Missing approved Favorites backend/APIM capability still blocks real populated favorite synchronization/mutations.
- **P61 — Favorites — Active Cart: PARTIAL.** Active-cart wrapper is implemented; inherited Favorites contract gaps remain.
- **P62 — Notifications — Empty Cart: PARTIAL.** Bounded current notification list/read behavior is implemented; true pagination/global aggregates/mark-all/current APIM provenance remain unavailable.
- **P63 — Notifications — Active Cart: PARTIAL.** Shared active-cart wrapper is implemented; inherited P62 contract gaps and physical reference certification remain.
- **P64 — Edit Customer Profile Domain/Form: PARTIAL.** Original/draft state, dirty-field detection, supported field schema/validation, server-validation mapping, unsaved-change protection, full-PUT save planning for the exact supported update contract, query reconciliation, and explicit avatar-contract blocking are implemented. It is not upgraded to DONE because guide-required photo/security/device/delete-account capabilities are not all exposed by approved contracts and no post-P64 CI evidence is recorded.
- **P65 — Edit Customer Profile Active/Empty Visuals: PARTIAL.** References 23/24 now use one registered `CustomerProfileEdit` route/form. The active variant reads the authoritative cart selectors and reuses `SharedViewCartOverlay`; the empty variant removes the overlay at zero items; successful profile save writes and invalidates the shared profile query. Full reference/device certification and several guide-visible profile capabilities remain blocked/deferred.

**Current executed phase:** **P65 — Edit Customer Profile Active/Empty Visuals — PARTIAL** at implementation/static-contract scope.

**P65 implementation/evidence head before this ledger update:** `46f34958bd8794f02c01d1f67772c60a6c5e365d`.

**Next phase in sequence:** **P66 — My Addresses Active/Empty Visuals — NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P66. Wait for explicit user direction.

---

## 2. Recent Phase Evidence Summary

| Phase | Status | Implementation / evidence | CI |
|---|---|---|---|
| P57 | **DONE** | `docs/mobile-ui-rebuild/P57_CUSTOMER_PROFILE_REWARDS_CONTRACT.md` | `31270356726` / `93135116492` — SUCCESS |
| P58 | **DONE** | `docs/mobile-ui-rebuild/P58_CUSTOMER_PROFILE_EMPTY_CART.md` | `31271539076` / `93138248796` — SUCCESS |
| P59 | **DONE** | `docs/mobile-ui-rebuild/P59_CUSTOMER_PROFILE_ACTIVE_CART.md` | `31271923654` / `93139241176` — SUCCESS |
| P60 | **PARTIAL** | `docs/mobile-ui-rebuild/P60_FAVORITES_EMPTY_CART.md` | `31272588586` / `93140939951` — SUCCESS |
| P61 | **PARTIAL** | `docs/mobile-ui-rebuild/P61_FAVORITES_ACTIVE_CART.md` | `31273123021` / `93142321916` — SUCCESS |
| P62 | **PARTIAL** | `docs/mobile-ui-rebuild/P62_NOTIFICATIONS_EMPTY_CART.md` | `31274137746` / `93144883129` — SUCCESS |
| P63 | **PARTIAL** | `docs/mobile-ui-rebuild/P63_NOTIFICATIONS_ACTIVE_CART.md` | `31274568039` / `93145968430` — SUCCESS |
| P64 | **PARTIAL** | Existing P64 form/domain/API/query implementation on branch; no dedicated accepted evidence/CI record yet | **PENDING / not recorded** |
| P65 | **PARTIAL** | `docs/mobile-ui-rebuild/P65_EDIT_CUSTOMER_PROFILE_ACTIVE_EMPTY_VISUALS.md` at `46f34958bd8794f02c01d1f67772c60a6c5e365d` | **PENDING — no workflow run found for the P65 head when checked** |
| P66 onward | **NOT STARTED / not accepted** | — | — |

The last confirmed successful implementation CI remains P63. Do not claim P64/P65 CI success until a matching workflow run exists and is inspected.

---

## 3. P64 Supported Contract Boundary

P64/P65 reuse the existing customer-profile contract only. The mobile client does not invent a PATCH endpoint or unsupported profile fields.

Implemented supported behavior:

- shared customer-profile query/cache;
- draft/original profile state;
- dirty-field detection;
- first-name, last-name, and email client validation;
- registered mobile number presented read-only on this screen;
- save planning through the existing full PUT-style customer-profile update request because that is the accepted update shape currently implemented;
- server validation mapped back to fields where details identify `firstName`, `lastName`, or `email`;
- successful update reconciles the shared profile query and invalidates it for authoritative refresh;
- dirty back navigation requires explicit discard confirmation;
- avatar action fails closed with an explicit unsupported message rather than simulating an upload.

Still missing/not approved for this profile surface:

- customer profile photo upload/remove contract;
- rewards balance/history required by the full reference composition;
- dedicated password-management flow/contract from this route;
- login-device list/revoke capability;
- protected account-deletion initiation/verification flow.

Account deletion must remain a separate protected destructive flow; it must not be implemented as an unverified generic profile mutation.

---

## 4. P65 Implemented Boundary

**Guide refs:** 23 and 24.

P65 accepts the existing branch implementation and records it rather than duplicating the screen:

- `CustomerProfileEditScreen` owns one shared form/lifecycle implementation;
- `CustomerProfileEditRouteScreen` owns active/empty cart chrome only;
- `CustomerProfileEdit` is registered once in the existing Profile stack;
- Profile `Edit Profile` navigates to the real shared route;
- active/empty references do not create separate stores or screens;
- active cart count/subtotal come from the authoritative cart selectors;
- `SharedViewCartOverlay` is reused and opens the real `CustomerCart` route;
- route-policy visibility hides View Cart immediately at zero items;
- bottom content clearance is applied only while the overlay is visible;
- profile editing never clears or replaces cart state;
- successful save writes and invalidates the shared profile query so the Profile hub/header identity can revalidate.

Focused P65 coverage:

- `apps/mobile/src/features/customerProfile/customerProfileEditVisuals.test.ts` verifies active View Cart visibility, zero-item hiding, dynamic clearance, and one shared route policy.

**P65 status: PARTIAL.** The phase’s shared-route/cart-preservation/cache-refresh acceptance is implemented at client scope, but physical Android/reference-image certification is deferred and the missing photo/rewards/security/device/delete-account contracts prevent claiming the full 183-page reference composition as end-to-end complete.

Evidence: `docs/mobile-ui-rebuild/P65_EDIT_CUSTOMER_PROFILE_ACTIVE_EMPTY_VISUALS.md`.

---

## 5. P65 Changed/Accepted Files

P65 route/visual ownership on the current branch includes:

- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/features/customerProfile/screens/CustomerProfileScreen.tsx`
- `apps/mobile/src/features/customerProfile/screens/CustomerProfileEditScreen.tsx`
- `apps/mobile/src/features/customerProfile/screens/CustomerProfileEditRouteScreen.tsx`
- `apps/mobile/src/features/customerProfile/query/customerProfileQueries.ts`
- `apps/mobile/src/features/customerProfile/customerProfileEditVisuals.test.ts`
- `docs/mobile-ui-rebuild/P65_EDIT_CUSTOMER_PROFILE_ACTIVE_EMPTY_VISUALS.md`
- `build.md`

P64-owned prerequisites already present on the branch include the profile-edit domain/form, API wrapper updates, query behavior, and focused P64 tests. P65 does not reclassify those as a second implementation.

No backend, APIM, OpenAPI, database, infrastructure, package dependency, Android native source, Gradle/APK, or AAB configuration was intentionally changed for P65.

---

## 6. Validation State

Implementation workflow: `.github/workflows/mobile-phase1-ci.yml`.

- Last confirmed successful run: P63 — `31274568039` / `93145968430`.
- P65 head checked: `46f34958bd8794f02c01d1f67772c60a6c5e365d`.
- Matching P65 workflow run at check time: **none returned**.
- Therefore dependency install, strict TypeScript, ESLint, Jest, production Android JS bundle, and backend/APIM guard are **not claimed as newly validated for P65**.
- No Gradle/APK packaging was performed, consistent with the implementation-phase policy.

---

## 7. Handoff

```text
Current branch: mobile-ui-rebuild-from-scratch
Current executed phase: P65 — Edit Customer Profile Active/Empty Visuals — PARTIAL
P65 implementation/evidence head before ledger update: 46f34958bd8794f02c01d1f67772c60a6c5e365d
P65 evidence: docs/mobile-ui-rebuild/P65_EDIT_CUSTOMER_PROFILE_ACTIVE_EMPTY_VISUALS.md
P65 implemented: one shared CustomerProfileEdit route/form; active authoritative View Cart; zero-item empty variant; real CustomerCart navigation; cart preserved; successful save reconciles/invalidates shared profile cache
P65 remains PARTIAL: missing approved profile photo/rewards/security/device/delete-account capabilities; device/reference certification deferred; no matching post-P65 CI run found at check time
Inherited blockers: retain all earlier phase blockers not explicitly superseded
Next phase: P66 — My Addresses Active/Empty Visuals — NOT STARTED
Next phase authorization: NONE AUTHORIZED — waiting for user
```
