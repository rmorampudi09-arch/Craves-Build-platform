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
- **P57 — Customer Profile/Rewards Contract: DONE.**
- **P58 — Customer Profile — Empty Cart: DONE.**
- **P59 — Customer Profile — Active Cart: DONE.**
- **P60 — Favorites — Empty Cart: PARTIAL.** Missing approved Favorites backend/APIM capability still blocks real populated favorite synchronization/mutations.
- **P61 — Favorites — Active Cart: PARTIAL.** Active-cart wrapper is implemented; inherited Favorites contract gaps remain.
- **P62 — Notifications — Empty Cart: PARTIAL.** Bounded current notification list/read behavior is implemented; true pagination/global aggregates/mark-all/current APIM provenance remain unavailable.
- **P63 — Notifications — Active Cart: PARTIAL.** Shared active-cart wrapper is implemented; inherited P62 contract gaps and physical reference certification remain.
- **P64 — Edit Customer Profile Domain/Form: PARTIAL.** Supported form/update behavior is implemented; unsupported profile capabilities remain explicitly blocked.
- **P65 — Edit Customer Profile Active/Empty Visuals: PARTIAL.** One shared edit route/form and authoritative cart overlay behavior are implemented; full reference/device certification and missing profile capabilities remain.
- **P66 — My Addresses Active/Empty Visuals: PARTIAL.** Saved-address list/default/delete, Deliver Here, available cart refresh, active View Cart, and zero-item hiding are implemented. Address-aware delivery quote/reprice remains unavailable.
- **P67 — Add/Edit Address and Location Permission: PARTIAL.** Shared manual editor, existing-address full-PUT edit, pincode validation, duplicate/default rules, unsaved-change protection, and controlled manual fallbacks are implemented and validated. New-address persistence, pincode/geocode lookup, and native current-location permission/geocode remain deferred because approved executable contracts/integration are not present.

**Current executed phase:** **P67 — Add/Edit Address and Location Permission — PARTIAL** at implementation/static-contract scope.

**P67 validated implementation head:** `fe7a263095a138d546c851908cbec166bd30b8b0`.

**P67 evidence record head:** `d5d6a7b8ebea9ff6226565c31fc70ffbbd492117`.

**Next phase in sequence:** **P68 — Customer Orders List — NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P68. Wait for explicit user direction.

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
| P64 | **PARTIAL** | Existing P64 form/domain/API/query implementation on branch | `31276696857` / `93151316827` — SUCCESS as part of P65 integrated state |
| P65 | **PARTIAL** | `docs/mobile-ui-rebuild/P65_EDIT_CUSTOMER_PROFILE_ACTIVE_EMPTY_VISUALS.md` | `31276696857` / `93151316827` — SUCCESS |
| P66 | **PARTIAL** | `docs/mobile-ui-rebuild/P66_MY_ADDRESSES_ACTIVE_EMPTY_VISUALS.md` | `31277654687` / `93153771794` — SUCCESS |
| P67 | **PARTIAL** | `docs/mobile-ui-rebuild/P67_ADD_EDIT_ADDRESS_LOCATION_PERMISSION.md`; validated implementation `fe7a263095a138d546c851908cbec166bd30b8b0` | `31279558033` / `93158570541` — SUCCESS |
| P68 onward | **NOT STARTED / not accepted** | — | — |

The P67 implementation workflow has been inspected and is successful. P67 remains PARTIAL only for its explicitly documented create-address, pincode/geocode, current-location permission/geocode, inherited address-aware quote/serviceability, and physical device/reference gaps.

---

## 3. P64/P65 Supported Profile Boundary

P64/P65 reuse the existing customer-profile contract only. Supported edit fields, validation, full-PUT save planning, query reconciliation, dirty-back confirmation, shared active/empty cart treatment, and route integration are implemented. Unsupported profile photo/rewards/security/device/account-deletion capabilities remain explicit and are not simulated.

Evidence: `docs/mobile-ui-rebuild/P65_EDIT_CUSTOMER_PROFILE_ACTIVE_EMPTY_VISUALS.md`.

---

## 4. P66 Implemented Boundary

**Guide refs:** 25 and 26.

P66 provides one shared My Addresses destination with:
- exact saved-address list parsing;
- existing full-PUT Set default;
- destructive Delete confirmation and real DELETE;
- global Deliver Here selection;
- cart-address dependency update and real cart snapshot refresh where supported;
- shared active View Cart and zero-item hiding.

### P66 delivery-quote blocker

The repository cart domain records `DELIVERY_QUOTE_CONTRACT_UNAVAILABLE`. No exact approved address-aware delivery quote/reprice endpoint exists to refresh fee, ETA, and serviceability from My Addresses. P66 therefore remains PARTIAL and does not misuse checkout creation as a quote.

Evidence: `docs/mobile-ui-rebuild/P66_MY_ADDRESSES_ACTIVE_EMPTY_VISUALS.md`.

---

## 5. P67 Implemented Boundary

**Phase:** Add/Edit Address and Location Permission.

P67 extends the existing My Addresses architecture rather than creating a parallel address store:

- `CustomerAddressesScreen` now exposes Add and Edit actions.
- `CustomerAddressEditorModal` is the single manual editor for Add/Edit states.
- The editor covers address label, recipient/contact, address lines, landmark, area, pincode, city, state, and default selection.
- A pure address-editor domain validates required fields and six-digit pincode format.
- Duplicate detection normalizes street/area/city/state/pincode and ignores the current address during edit.
- The first address is forced default at form-domain level.
- Editing the current default cannot unset it and leave the form in an inconsistent default state.
- Dirty dismissal requires explicit discard confirmation.
- Existing-address save uses the repository-established full `PUT /api/v1/customer/addresses/{id}` request shape.
- The address API now exposes one shared full-update helper, which is reused by Set Default.
- Successful edit invalidates both address-management and saved-location query families.
- Current-location interaction never dead-ends the form: absent native permission/geocode integration is reported as a controlled fallback while manual entry stays active.
- Pincode lookup absence never fabricates city/state; both remain manually editable.
- Add performs validation/duplicate/default planning but refuses to fake persistence when the approved create contract is missing.

### P67 deferred blockers

- `CUSTOMER_ADDRESS_CREATE_CONTRACT_UNAVAILABLE` — new-address persistence.
- `CUSTOMER_ADDRESS_PINCODE_LOOKUP_UNAVAILABLE` — pincode → city/state/geocode lookup.
- `CUSTOMER_ADDRESS_CURRENT_LOCATION_UNAVAILABLE` — native current-location permission + geocode integration.
- P66's `DELIVERY_QUOTE_CONTRACT_UNAVAILABLE` remains inherited for fee/ETA/serviceability refresh.

**P67 status: PARTIAL.** Existing-address edit and the client-side form/rule architecture are validated. Full manual Add persistence and live location/pincode behavior are intentionally deferred until the backend/platform contracts are implemented.

Evidence: `docs/mobile-ui-rebuild/P67_ADD_EDIT_ADDRESS_LOCATION_PERMISSION.md`.

---

## 6. P67 Changed/Accepted Files

P67 implementation ownership includes:

- `apps/mobile/src/features/customerAddresses/domain/customerAddressEditor.ts`
- `apps/mobile/src/features/customerAddresses/api/customerAddressesApi.ts`
- `apps/mobile/src/features/customerAddresses/query/customerAddressQueries.ts`
- `apps/mobile/src/features/customerAddresses/screens/CustomerAddressEditorModal.tsx`
- `apps/mobile/src/features/customerAddresses/screens/CustomerAddressesScreen.tsx`
- `apps/mobile/src/features/customerAddresses/customerAddressEditor.test.ts`
- `docs/mobile-ui-rebuild/P67_ADD_EDIT_ADDRESS_LOCATION_PERMISSION.md`
- `build.md`

No backend, APIM, OpenAPI, database, infrastructure, package dependency, Android native source, Gradle/APK, or AAB configuration was intentionally changed for P67.

---

## 7. Validation State

Implementation workflow: `.github/workflows/mobile-phase1-ci.yml`.

- GitHub Actions run ID: `31279558033`.
- Job ID: `93158570541`.
- Validated P67 implementation head: `fe7a263095a138d546c851908cbec166bd30b8b0`.
- Job conclusion: **SUCCESS**.
- Dependency install: **SUCCESS**.
- TypeScript strict check: **SUCCESS**.
- ESLint zero-warning gate: **SUCCESS**.
- Jest: **SUCCESS**.
- Production Android JavaScript bundle: **SUCCESS**.
- Backend/APIM/infrastructure source guard: **SUCCESS**.
- No Gradle/APK packaging was performed, consistent with the implementation-phase policy.

Focused P67 tests cover invalid pincode, semantic duplicates, edit-self exclusion, first/default consistency, full-PUT edit planning, deferred Add persistence, and duplicate-before-create blocking.

---

## 8. Handoff

```text
Current branch: mobile-ui-rebuild-from-scratch
Current executed phase: P67 — Add/Edit Address and Location Permission — PARTIAL
P67 validated implementation head: fe7a263095a138d546c851908cbec166bd30b8b0
P67 CI: 31279558033 / 93158570541 — SUCCESS
P67 evidence: docs/mobile-ui-rebuild/P67_ADD_EDIT_ADDRESS_LOCATION_PERMISSION.md
P67 implemented: shared Add/Edit manual editor; controlled pincode validation; duplicate/default rules; dirty-dismiss protection; existing-address full-PUT persistence; address/saved-location cache refresh; current-location and pincode lookup manual fallbacks
P67 remains PARTIAL: no approved executable create-address persistence contract; no approved pincode/geocode lookup; no native current-location permission/geocode integration; inherited P66 delivery-quote/serviceability gap remains
Inherited blockers: retain all earlier phase blockers not explicitly superseded
Next phase: P68 — Customer Orders List — NOT STARTED
Next phase authorization: NONE AUTHORIZED — waiting for user
```
