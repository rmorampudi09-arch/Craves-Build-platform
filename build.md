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
- **P64 — Edit Customer Profile Domain/Form: PARTIAL.** Original/draft state, dirty-field detection, supported field schema/validation, server-validation mapping, unsaved-change protection, full-PUT save planning for the exact supported update contract, query reconciliation, and explicit avatar-contract blocking are implemented. The later P65 integration CI validates this code in the accepted branch state, but guide-required photo/security/device/delete-account capabilities are not all exposed by approved contracts.
- **P65 — Edit Customer Profile Active/Empty Visuals: PARTIAL.** References 23/24 use one registered `CustomerProfileEdit` route/form. The active variant reads the authoritative cart selectors and reuses `SharedViewCartOverlay`; the empty variant removes the overlay at zero items; successful profile save writes and invalidates the shared profile query. P65 implementation CI is successful. Full reference/device certification and several guide-visible profile capabilities remain blocked/deferred.
- **P66 — My Addresses Active/Empty Visuals: PARTIAL.** References 25/26 now use one registered `CustomerAddresses` route. Supported address list/default/delete behavior, delete confirmation, global `Deliver Here` selection, cart-address dependency updates, real cart snapshot refresh, active shared View Cart, and zero-item hiding are implemented and validated. Full P66 acceptance remains blocked because no approved address-aware delivery quote/reprice contract exists to refresh delivery fee, ETA, and serviceability; Add/Edit/location-permission behavior remains P67-owned and is not started.

**Current executed phase:** **P66 — My Addresses Active/Empty Visuals — PARTIAL** at implementation/static-contract scope.

**P66 validated implementation head:** `5904af74d25a8070a3834c33fbfb8f7e0c60deea`.

**P66 evidence update head:** `c01526f03c2317e3d568c3a146bc7b5563eb194f`.

**Next phase in sequence:** **P67 — Add/Edit Address and Location Permission — NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P67. Wait for explicit user direction.

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
| P64 | **PARTIAL** | Existing P64 form/domain/API/query implementation on branch; no separate accepted evidence document | `31276696857` / `93151316827` — SUCCESS as part of the P65 integrated branch state |
| P65 | **PARTIAL** | `docs/mobile-ui-rebuild/P65_EDIT_CUSTOMER_PROFILE_ACTIVE_EMPTY_VISUALS.md`; validated implementation `edf8674e31b0867eded2f4618667482994cb9ec2` | `31276696857` / `93151316827` — SUCCESS |
| P66 | **PARTIAL** | `docs/mobile-ui-rebuild/P66_MY_ADDRESSES_ACTIVE_EMPTY_VISUALS.md`; validated implementation `5904af74d25a8070a3834c33fbfb8f7e0c60deea` | `31277654687` / `93153771794` — SUCCESS |
| P67 onward | **NOT STARTED / not accepted** | — | — |

The P66 implementation workflow has been inspected and is successful. P66 remains PARTIAL only for the explicitly documented missing delivery-quote capability and deferred physical visual certification; P67-owned Add/Edit/location-permission behavior remains intentionally untouched.

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

**P65 status: PARTIAL.** The phase’s shared-route/cart-preservation/cache-refresh acceptance and implementation CI are complete at client scope, but physical Android/reference-image certification is deferred and the missing photo/rewards/security/device/delete-account contracts prevent claiming the full 183-page reference composition as end-to-end complete.

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

## 6. P66 Implemented Boundary

**Guide refs:** 25 and 26.

P66 adds one shared My Addresses management destination and keeps active/empty cart state outside address ownership:

- `CustomerAddresses` is registered once in the existing Profile stack;
- the existing customer location selector exposes the real My Addresses destination;
- address list state comes from the exact `/api/v1/customer/addresses` contract through a private React Query cache;
- address response parsing validates supported identity IDs, HOME/WORK/OTHER label, address/contact fields, coordinates, default/active state, and timestamps;
- Set default uses the existing full PUT update shape with the original supported fields plus `isDefault=true`;
- default/delete success invalidates both the address-management cache and the existing saved-location cache used by customer shell surfaces;
- Delete requires destructive confirmation before the real DELETE request;
- deleting a selected browsing or cart address clears the corresponding global dependency so a deleted identifier is not retained;
- Deliver Here writes the selected saved address into the shared customer-shell location state and invalidates location-sensitive home queries when changed;
- Deliver Here also uses the existing cart-address transition, which marks the address dependency current and invalidates a previously usable delivery quote when the address changes;
- when the cart is active, Deliver Here performs a real cart snapshot refresh through the existing cart API;
- active cart count/subtotal come from authoritative cart selectors and `SharedViewCartOverlay` opens the real `CustomerCart` route;
- zero-item state automatically hides View Cart and removes the extra content clearance;
- address management never creates/replaces/clears the actual cart snapshot.

### P66 delivery-quote blocker

The repository’s existing cart domain explicitly records `DELIVERY_QUOTE_CONTRACT_UNAVAILABLE`. No exact approved address-aware delivery quote/reprice endpoint exists that can refresh delivery fee, ETA, and serviceability from My Addresses.

P66 therefore does not invent a backend/API call and does not misuse checkout creation as a quote. The client performs the supported address/global/cart transitions and real cart snapshot refresh, keeps delivery quote state stale when appropriate, and fails closed on the missing fee/ETA/serviceability capability.

**P66 status: PARTIAL.** Saved-address list/default/delete, confirmation, global selection, available cart refresh, and active/empty visual behavior are implemented and validated. The fee/ETA/serviceability acceptance remains blocked by the missing approved delivery-quote contract. P67-owned Add/Edit/location-permission/geocode behavior is not started. Physical Android/reference-image certification is deferred.

Evidence: `docs/mobile-ui-rebuild/P66_MY_ADDRESSES_ACTIVE_EMPTY_VISUALS.md`.

---

## 7. P66 Changed/Accepted Files

P66 implementation ownership on the current branch includes:

- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/features/customerAddresses/api/customerAddressesApi.ts`
- `apps/mobile/src/features/customerAddresses/domain/customerAddressContract.ts`
- `apps/mobile/src/features/customerAddresses/query/customerAddressQueries.ts`
- `apps/mobile/src/features/customerAddresses/customerAddressesActiveCart.ts`
- `apps/mobile/src/features/customerAddresses/screens/CustomerAddressesScreen.tsx`
- `apps/mobile/src/features/customerAddresses/screens/CustomerAddressesRouteScreen.tsx`
- `apps/mobile/src/features/customerAddresses/customerAddresses.test.ts`
- `apps/mobile/src/features/customerShell/components/CustomerLocationSelector.tsx`
- `docs/mobile-ui-rebuild/P66_MY_ADDRESSES_ACTIVE_EMPTY_VISUALS.md`
- `build.md`

No backend, APIM, OpenAPI, database, infrastructure, package dependency, Android native source, Gradle/APK, or AAB configuration was intentionally changed for P66.

---

## 8. Validation State

Implementation workflow: `.github/workflows/mobile-phase1-ci.yml`.

- GitHub Actions run ID: `31277654687`.
- Job ID: `93153771794`.
- Validated P66 implementation head: `5904af74d25a8070a3834c33fbfb8f7e0c60deea`.
- Job conclusion: **SUCCESS**.
- Dependency install: **SUCCESS**.
- TypeScript strict check: **SUCCESS**.
- ESLint zero-warning gate: **SUCCESS**.
- Jest: **SUCCESS**.
- Production Android JavaScript bundle: **SUCCESS**.
- Backend/APIM/infrastructure source guard: **SUCCESS**.
- No Gradle/APK packaging was performed, consistent with the implementation-phase policy.

---

## 9. Handoff

```text
Current branch: mobile-ui-rebuild-from-scratch
Current executed phase: P66 — My Addresses Active/Empty Visuals — PARTIAL
P66 validated implementation head: 5904af74d25a8070a3834c33fbfb8f7e0c60deea
P66 CI: 31277654687 / 93153771794 — SUCCESS
P66 evidence: docs/mobile-ui-rebuild/P66_MY_ADDRESSES_ACTIVE_EMPTY_VISUALS.md
P66 implemented: one shared CustomerAddresses route; exact saved-address list; full-PUT Set default; destructive Delete confirmation and real delete; global Deliver Here selection; cart-address dependency update; real active-cart snapshot refresh; shared View Cart when active; zero-item hiding; cart snapshot preserved
P66 remains PARTIAL: no approved address-aware delivery quote/reprice contract exists to refresh delivery fee/ETA/serviceability; P67-owned Add/Edit/location-permission behavior not started; device/reference certification deferred
Inherited blockers: retain all earlier phase blockers not explicitly superseded
Next phase: P67 — Add/Edit Address and Location Permission — NOT STARTED
Next phase authorization: NONE AUTHORIZED — waiting for user
```
