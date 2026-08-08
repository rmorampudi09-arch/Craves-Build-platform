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
- **P68 — Payment Methods Active/Empty Visuals: PARTIAL.** Shared Payments route, active/empty cart presentation, payment capability groups, canonical active View Cart behavior, and explicit disabled eligibility boundaries are implemented. Saved token-list data, cart/provider payment eligibility, and COD eligibility are not exposed by the approved mobile contract, so stored instruments and selectable primary methods are not fabricated.

**Current executed phase:** **P68 — Payment Methods Active/Empty Visuals — PARTIAL** at implementation/static-contract scope.

**P68 validated implementation head:** `d044bf7bb545875302eb23d5ba5aa00fcbc18574`.

**P68 evidence record head:** `6030c8b1cbac29ac9d8d7d0765fd4b9d48ac2956`.

**Next phase in sequence:** **P69 — Payment Method Add/Manage Provider Flow — NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P69. Wait for explicit user direction.

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
| P68 | **PARTIAL** | `docs/mobile-ui-rebuild/P68_PAYMENT_METHODS_ACTIVE_EMPTY_VISUALS.md`; validated implementation `d044bf7bb545875302eb23d5ba5aa00fcbc18574` | `31281213495` / `93162733549` — SUCCESS |
| P69 onward | **NOT STARTED / not accepted** | — | — |

The P68 implementation workflow has been inspected and is successful. P68 remains PARTIAL only for its explicitly documented payment-method-list, provider/cart eligibility, COD eligibility, and physical reference/device gaps. P69 provider add/manage mutations are not part of P68 and remain unstarted.

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

- `CustomerAddressesScreen` exposes Add and Edit actions.
- `CustomerAddressEditorModal` is the single manual editor for Add/Edit states.
- The editor covers address label, recipient/contact, address lines, landmark, area, pincode, city, state, and default selection.
- A pure address-editor domain validates required fields and six-digit pincode format.
- Duplicate detection normalizes street/area/city/state/pincode and ignores the current address during edit.
- The first address is forced default at form-domain level.
- Editing the current default cannot unset it and leave the form in an inconsistent default state.
- Dirty dismissal requires explicit discard confirmation.
- Existing-address save uses the repository-established full `PUT /api/v1/customer/addresses/{id}` request shape.
- The address API exposes one shared full-update helper, which is reused by Set Default.
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

## 6. P68 Implemented Boundary

**Guide refs:** 27 and 28.  
**Phase:** Payment Methods Active/Empty Visuals.

P68 implements the shared Payment Methods destination and its cart-state behavior without crossing into P69 provider-management work:

- `CustomerPaymentMethods` is registered as a typed shared route in the customer stacks.
- Profile → Payments opens the real destination instead of the previous route blocker.
- Empty-cart and active-cart presentations derive from the canonical cart domain.
- Active-cart mode reuses `SharedViewCartOverlay`; zero-item mode hides it through the canonical overlay behavior.
- Cards, UPI, wallets, net banking, and COD capability groups are visible as reference-capability groups.
- Payment eligibility is not inferred from cart presence, app foreground return, or provider capability alone.
- Missing eligibility/token data is rendered as disabled, annotated UI rather than a fake selectable method.
- Cart snapshot loading/error/retry behavior is supported.
- The screen participates in the existing customer bottom-nav scroll controller.
- Existing Cashfree order creation/verification remains the only verified provider handoff boundary; success still requires backend verification.
- P68 payment-session state is cleared on logout.

### P68 deferred blockers

- `CUSTOMER_PAYMENT_METHOD_LIST_CONTRACT_UNAVAILABLE` — no authoritative saved tokenized payment-method list for masked UPI/cards/wallet instruments.
- `CUSTOMER_PAYMENT_ELIGIBILITY_CONTRACT_UNAVAILABLE` — no authoritative cart/provider eligibility contract for selectable online methods.
- `CUSTOMER_COD_ELIGIBILITY_CONTRACT_UNAVAILABLE` — no authoritative COD eligibility for current cart/address/order context.

**P68 status: PARTIAL.** Active/empty visuals, capability grouping, route integration, canonical View Cart behavior, and safe blocker states are implemented and validated. Real stored instruments and primary method selection cannot be truthfully enabled until the missing contracts above exist.

Evidence: `docs/mobile-ui-rebuild/P68_PAYMENT_METHODS_ACTIVE_EMPTY_VISUALS.md`.

---

## 7. P68 Changed/Accepted Files

P68 implementation ownership includes:

- `apps/mobile/src/features/payment/domain/paymentMethodTypes.ts`
- `apps/mobile/src/features/payment/state/paymentMethodSlice.ts`
- `apps/mobile/src/features/payment/screens/CustomerPaymentMethodsScreen.tsx`
- `apps/mobile/src/features/payment/screens/CustomerPaymentMethodsRouteScreen.tsx`
- `apps/mobile/src/features/payment/paymentMethods.test.ts`
- `apps/mobile/src/app/store/store.ts`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/features/customerProfile/presentation/customerProfileUiModel.ts`
- `apps/mobile/src/features/customerProfile/screens/CustomerProfileScreen.tsx`
- `apps/mobile/src/features/customerProfile/customerProfileUiModel.test.ts`
- `apps/mobile/src/features/auth/state/logoutCoordinator.ts`
- `docs/mobile-ui-rebuild/P68_PAYMENT_METHODS_ACTIVE_EMPTY_VISUALS.md`
- `build.md`

No backend, APIM, OpenAPI, database, infrastructure, Android native source, Gradle/APK, or AAB configuration was intentionally changed for P68.

---

## 8. Validation State

Implementation workflow: `.github/workflows/mobile-phase1-ci.yml`.

- GitHub Actions run ID: `31281213495`.
- Job ID: `93162733549`.
- Validated P68 implementation head: `d044bf7bb545875302eb23d5ba5aa00fcbc18574`.
- Job conclusion: **SUCCESS**.
- Dependency install: **SUCCESS**.
- TypeScript strict check: **SUCCESS**.
- ESLint zero-warning gate: **SUCCESS**.
- Jest: **SUCCESS**.
- Production Android JavaScript bundle: **SUCCESS**.
- Backend/APIM/infrastructure source guard: **SUCCESS**.
- No Gradle/APK packaging was performed, consistent with the implementation-phase policy.

Focused P68 tests cover empty-cart no-selection behavior, active-cart non-inference of online eligibility, and COD blocking without an authoritative contract. The existing Profile UI-model test was updated to reflect that Payments is now a registered P68 route.

---

## 9. Handoff

```text
Current branch: mobile-ui-rebuild-from-scratch
Current executed phase: P68 — Payment Methods Active/Empty Visuals — PARTIAL
P68 validated implementation head: d044bf7bb545875302eb23d5ba5aa00fcbc18574
P68 CI: 31281213495 / 93162733549 — SUCCESS
P68 evidence: docs/mobile-ui-rebuild/P68_PAYMENT_METHODS_ACTIVE_EMPTY_VISUALS.md
P68 implemented: shared Payments route; Profile entry; empty/active cart visual states; Cards/UPI/Wallets/Net banking/COD capability groups; canonical active View Cart; zero-item hiding; bottom-nav scroll behavior; cart state retry; explicit eligibility/token blockers; logout cleanup; focused tests
P68 remains PARTIAL: no approved customer payment-method list; no cart/provider payment eligibility contract; no COD eligibility contract; therefore no fabricated stored instrument or enabled primary selection
P69 provider add/manage/tokenize/delete/set-primary work: NOT STARTED
Inherited blockers: retain all earlier phase blockers not explicitly superseded
Next phase: P69 — Payment Method Add/Manage Provider Flow — NOT STARTED
Next phase authorization: NONE AUTHORIZED — waiting for user
```