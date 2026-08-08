# CRAVES Mobile Build / Implementation Ledger

**Purpose:** Authoritative living record for the current mobile rebuild. Read this before changing code. Do not infer completion from old APKs, old branches, screenshots, historical documents, or prior chat claims.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`

**Authoritative rebuild branch:** `mobile-ui-rebuild-from-scratch`

**Mobile workspace:** `apps/mobile`

**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`

**Implementation guide:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, 52 embedded reference images.

**Build policy:** Code-level validation during implementation. **No APK per phase.** Final Android APK/AAB only after all implementation/QA gates in `phases.md` are complete.

**Historical preservation:** The complete ledger through P12 is preserved at `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P12.md`. P13–P29 use dedicated evidence under `docs/mobile-ui-rebuild/`; this living ledger may remain compact while those records preserve phase detail.

---

## 1. Current Control State

- **P00 — Execution Documents and Source Lock: DONE**.
- **P01 — Repository Architecture Inventory: DONE**.
- **P02 — APIM/OpenAPI Contract Inventory: DONE**.
- **P03 — Runtime Configuration and Environment Boundary: DONE**.
- **P04 — Design Token Baseline: DONE**.
- **P05 — Shared Motion and Reduced-Motion Baseline: DONE**.
- **P06 — Shared Interaction Primitives: DONE**.
- **P07 — Shared Screen/Lifecycle Primitives: DONE**.
- **P08 — Query/Store Provider and Cache Rules: DONE**.
- **P09 — Typed HTTP Client Foundation: DONE**.
- **P10 — Session Token Security Foundation: DONE**.
- **P11 — Root Navigation and Typed Route Policy: DONE**.
- **P12 — Role Selection UI and State: DONE**.
- **P13 — Customer Phone Sign-In Visual + Interaction: DONE** at implementation level; device pixel-certification remains later visual QA.
- **P14 — Chef Phone Sign-In Visual + Interaction: DONE** at implementation level; device pixel-certification remains later visual QA.
- **P15 — Customer Email/Password Sign-In: DONE** at implementation level; device pixel-certification remains later visual QA.
- **P16 — Chef Email/Password Sign-In: DONE** at implementation level; device pixel-certification remains later visual QA.
- **P17 — OTP Verification, Resend, Expiry, Rate Limit: DONE** at implementation level.
- **P18 — Password Recovery Flow: DONE** at implementation level.
- **P19 — Firebase → CRAVES Session Exchange: DONE** at implementation/static-contract level.
- **P20 — Session Restore and Silent Refresh: DONE** at implementation/static-contract level.
- **P21 — Identity, Role, and Onboarding Resolution: DONE** at implementation/static-contract level.
- **P22 — Customer Registration/Profile Completion: DONE** at implementation/static-contract level.
- **P23 — Chef Application Submission / Status: DONE** at implementation/static-contract level.
- **P24 — Logout, Revoke, and Role-State Cleanup: DONE** at implementation/static-contract level.
- **P25 — Customer Root Shell and Bottom Tabs: DONE** at implementation/static-navigation level.
- **P26 — Customer Bottom-Nav Scroll Hide/Reveal: DONE** at implementation/static-navigation level; final device/reference certification remains later visual QA.
- **P27 — Shared Customer Header/Location/Notification Badge: DONE** at implementation/static-contract level; final device/reference certification remains later visual QA.
- **P28 — Authoritative Cart Domain Skeleton: DONE** at implementation/static-contract level.
- **P29 — Shared View Cart Overlay: DONE** at implementation/static-contract level; final device/reference certification remains later visual QA.

P29 completion evidence:

- Started from accepted P28 ledger head: `2c90cead1350728e0e56a21c20512f94a6d19732`.
- Validated implementation commit: `3413d329aee34acdc8c6057cfd22ed5a227d15dd`.
- Evidence commit: `ae8bdda40c377010ff4dc595204bb2d6f131eaf0`.
- Evidence: `docs/mobile-ui-rebuild/P29_SHARED_VIEW_CART_OVERLAY.md`.
- CI run: `31230836784` — **SUCCESS**.

**Next phase in sequence:** **P30 — Cart Add/Remove/Quantity Reconciliation**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P30 until the user explicitly authorizes the next phase.

---

## 2. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Run:

- GitHub Actions run ID: `31230836784`
- Head SHA: `3413d329aee34acdc8c6057cfd22ed5a227d15dd`
- Phase: **P29 — Shared View Cart Overlay**
- Conclusion: **SUCCESS**

Successful checks:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node setup and `npm ci`,
3. strict TypeScript (`tsc --noEmit`),
4. ESLint,
5. Jest including P29 focused coverage and prior regressions,
6. production Android JavaScript bundle generation with `react-native bundle`,
7. backend/APIM/infrastructure source-change guard.

The implementation-phase workflow intentionally does **not** perform Java/Gradle/APK packaging.

---

## 3. P29 Accepted Shared View Cart Behavior

P29 extends the accepted P28 cart domain with one shared customer-facing View Cart overlay contract. It does not implement P30 cart mutations, a Cart product screen, checkout, or payment.

Accepted behavior:

- `SharedViewCartOverlay` reads the canonical P28 `selectCartItemCount` and `selectCartFoodSubtotal` selectors; it does not maintain a second cart copy.
- The server-provided food subtotal is displayed rather than locally recalculating pricing.
- Zero items remove the overlay immediately.
- A non-empty cart with an authoritative subtotal is eligible for the overlay only when `RouteChromePolicy.viewCartEligible` is true.
- Customer-domain routes are eligible by policy; Auth, Chef, Transactional, and Modal domains are suppressed.
- The surface uses the shared Espresso Brown token and existing spacing/radius/type/touch-target/elevation tokens.
- Entrance motion uses the shared `viewCart` motion intent and respects Android reduced-motion preference.
- The visible control has button accessibility semantics, scalable text, press feedback, and a required `onOpenCart` callback.
- P29 does not register an inert or placeholder Cart route. The real Cart navigation destination remains owned by the Cart UI phase; consumers must supply a real navigation action when mounting this reusable component.
- No backend/APIM contract was added or changed by P29.

### Guide alignment

The master guide requires the View Cart control to:

- stay hidden at zero,
- appear automatically for an active cart,
- use Espresso Brown `#261A15`,
- show synchronized quantity and authoritative price when present,
- disappear immediately when the cart empties,
- remain hidden on authentication, checkout, payment, and other immersive contexts,
- reuse centralized cart state and respect reduced-motion/accessibility rules.

P29 implements this shared contract without pulling P30/P45/P46 work forward.

---

## 4. P29 Changed Files

Implementation:

- `apps/mobile/src/features/cart/viewCartOverlayModel.ts`
- `apps/mobile/src/features/cart/components/SharedViewCartOverlay.tsx`
- `apps/mobile/src/features/cart/viewCartOverlayModel.test.ts`

Evidence:

- `docs/mobile-ui-rebuild/P29_SHARED_VIEW_CART_OVERLAY.md`

No backend, OpenAPI, APIM, infrastructure, database, Android native build configuration, cart mutation transport, Cart product screen, checkout, payment, or P30+ product behavior was changed.

---

## 5. Current Architecture Ownership After P29

### Authentication/session

- P19–P24 remain authoritative for Firebase exchange, secure session storage/refresh, identity/onboarding resolution, logout/revoke, and private-state cleanup.

### Customer shell/shared state

- P25 owns the Customer root shell and four typed bottom tabs.
- P26 owns bottom-navigation scroll hide/reveal behavior.
- P27 owns the shared customer header, saved browsing location, and notification badge derivation.
- P28 owns the one canonical cart read domain, server-total snapshot, cart selectors, dependency metadata, and mutation metadata skeleton.
- P29 owns the reusable shared View Cart presentation/visibility contract and consumes P28 selectors plus navigation route policy.

### Later-phase boundaries

- **P30** owns exact add/remove/quantity mutation transport, reconciliation, rollback/stale-response behavior, and cross-surface mutation synchronization.
- P31+ owns customer discovery/product screens according to `phases.md`.
- **P45** owns Cart screen data/pricing model extensions.
- **P46** owns Cart and Bill Summary UI and its real navigation destination.
- Checkout/payment remain P47+ according to `phases.md`.

---

## 6. Current Contract Status

Previously accepted authentication/profile/onboarding and P27 customer-shell reads remain unchanged.

P28/P29 cart contract boundary remains:

- `GET /api/v1/cart`

P29 adds **no transport**. Existing cart mutation endpoints are not claimed as implemented until P30.

Live APIM/device runtime certification is not claimed by these static implementation phases unless a later evidence record explicitly says so.

---

## 7. Mini-Phase Status Mapping

| Phase | Status | Evidence/Reason |
|---|---|---|
| P00–P18 | **DONE** | Preserved in historical ledger/dedicated evidence. |
| P19 Firebase → CRAVES Exchange | **DONE** | CI `31218027179`. |
| P20 Session Restore/Refresh | **DONE** | CI `31219378437`. |
| P21 Identity/Role/Onboarding Resolution | **DONE** | CI `31220843488`. |
| P22 Customer Registration/Profile Completion | **DONE** | CI `31221757744`. |
| P23 Chef Application Submission / Status | **DONE** | CI `31222819644`. |
| P24 Logout/Revoke/Role-State Cleanup | **DONE** | CI `31225688358`. |
| P25 Customer Root Shell/Bottom Tabs | **DONE** | CI `31226669633`. |
| P26 Customer Bottom-Nav Scroll Hide/Reveal | **DONE** | CI `31228012689`. |
| P27 Shared Customer Header/Location/Notification Badge | **DONE** | CI `31229329651`. |
| P28 Authoritative Cart Domain Skeleton | **DONE** | CI `31229985407`. |
| P29 Shared View Cart Overlay | **DONE** | Shared authoritative-count/subtotal overlay, route-policy suppression, reduced-motion entrance; CI `31230836784`. |
| P30 onward | **NOT STARTED / not accepted** | No later phase is authorized by this record. |

---

## 8. Explicitly Not Complete After P29

Do not describe any of the following as complete:

- P30 cart add/remove/quantity mutation transport and reconciliation UX,
- Customer cart product screen merely because the shared overlay exists,
- Customer Home/Discovery/Chefs/Orders/Profile product screens merely because shell/header/cart foundations exist,
- native GPS/location permission behavior or full serviceability/geocoding flows,
- Notifications Center product route/actions merely because the P27 badge exists,
- coupon application, delivery quote, cart address integration, checkout eligibility, tax/fee/grand-total computation,
- Cart/Bill Summary UI,
- checkout/payment end-to-end flow,
- Chef operational/product screens,
- live APIM/device runtime certification of static-contract phases,
- physical-device pixel-perfect certification,
- full lifecycle/accessibility/performance/security audits,
- 52-reference visual certification,
- production APK/AAB/signing/release readiness.

---

## 9. Phase Completion Recording Protocol

After every authorized phase, record:

```text
Phase: Pxx — Title
Status: DONE | PARTIAL | BLOCKED
Started from commit: <sha>
Validated implementation commit: <sha>
Evidence commit: <sha>
Guide references: <screen refs/pages or global rules used>
Changed files: <exact paths>
APIM/contracts used: <exact route/method/model source>
Behavior completed: <bounded summary>
Tests/checks: <results/run id>
Visual QA: <deferred or evidence>
Blockers: <none or exact missing dependency>
Next phase: NONE AUTHORIZED — waiting for user
```
