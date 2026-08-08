# CRAVES Mobile Build / Implementation Ledger

**Purpose:** Authoritative living record for the current mobile rebuild. Read this before changing code. Do not infer completion from old APKs, old branches, screenshots, historical documents, or prior chat claims.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`

**Authoritative rebuild branch:** `mobile-ui-rebuild-from-scratch`

**Mobile workspace:** `apps/mobile`

**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`

**Implementation guide:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, 52 embedded reference images.

**Build policy:** Code-level validation during implementation. **No APK per phase.** Final Android APK/AAB only after all implementation/QA gates in `phases.md` are complete.

**Historical preservation:** The complete ledger state through P12 is preserved at `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P12.md`. P13–P28 have dedicated evidence under `docs/mobile-ui-rebuild/`; prior phase details remain there when this living ledger is compacted.

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

P28 completion evidence:

- Started from accepted P27 ledger head: `81ccdab73768c7be97871689298a8a7fb3599570`.
- Initial implementation commit: `a88a6a29f3939ceb636189f9a68554dbdd90cd7b`.
- Validated implementation head: `6cda59ac43184d2427c012c6a30ec2b099e51016`.
- Evidence commit: `03b572cc7a537f818eed717ad06147087e128bd5`.
- Evidence: `docs/mobile-ui-rebuild/P28_AUTHORITATIVE_CART_DOMAIN_SKELETON.md`.
- CI run: `31229985407` — **SUCCESS**.
- Initial run `31229916591` exposed one strict-TypeScript Redux Toolkit/Immer draft incompatibility caused by a `readonly` cart-line array; the P28 type boundary was corrected before final validation.

**Next phase in sequence:** **P29 — Shared View Cart Overlay**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P29 until the user explicitly authorizes the next phase.

---

## 2. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Run:

- GitHub Actions run ID: `31229985407`
- Head SHA: `6cda59ac43184d2427c012c6a30ec2b099e51016`
- Phase: **P28 — Authoritative Cart Domain Skeleton**
- Conclusion: **SUCCESS**

Successful checks:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node 22.13 setup,
3. `npm ci`,
4. strict TypeScript (`tsc --noEmit`),
5. ESLint,
6. Jest including P28 cart-domain tests and prior regressions,
7. production Android JavaScript bundle generation with `react-native bundle`,
8. backend/APIM/infrastructure source-change guard.

The implementation-phase workflow intentionally does **not** perform Java/Gradle/APK packaging.

---

## 3. P28 Accepted Authoritative Cart Domain Behavior

P28 establishes the shared cart domain only. It does not implement the P29 View Cart overlay, P30 cart mutation UX/reconciliation flows, cart product screen, or checkout.

Accepted behavior:

- Redux owns one canonical `cart` domain for Customer cart state; screens must not create independent authoritative cart copies.
- `GET /api/v1/cart` is parsed through a typed runtime boundary before a snapshot is accepted.
- The mobile snapshot uses semantic `cartId` and `lineId` fields while preserving the exact backend identifiers needed by later phases.
- The mobile snapshot intentionally drops backend `customerIdentityId` instead of storing identity data redundantly in the cart domain.
- Server-owned item `unitPrice`, `lineTotal`, currency, and `foodSubtotal` are retained as authoritative values; the client does not recalculate prices or totals.
- Shared selectors derive item count and per-menu-item quantity from the accepted snapshot rather than storing duplicate summary values.
- Invalid UUIDs, invalid timestamps, invalid quantity, invalid monetary values, or inconsistent currencies reject the snapshot rather than masquerading as an empty cart.
- The current backend cart response exposes no cart-version/revision field. P28 therefore does not fabricate one.
- `clientRevision` is only a mobile-owned monotonic acceptance revision. It is not a server concurrency token and is never sent to the backend.
- Coupon, address, and delivery-quote dependencies have explicit typed status state without invented coupon/quote endpoint payloads or fake pricing fields.
- Mutation metadata is keyed and request-id aware so a stale completion cannot remove a newer logical mutation entry.
- Logout clears the full cart domain in addition to the existing private query/mutation cache and Customer-shell cleanup.
- Cart state is not persisted to AsyncStorage/general-purpose local storage.

### Exact P28 contract boundary

P28 consumes only:

- `GET /api/v1/cart`

The accepted response fields are limited to the existing Order Service cart contract:

- cart `id`, `currency`, `items`, `totals`,
- item `id`, `menuItemId`, `kitchenId`, `itemName`, `kitchenName`, `unitPrice`, `currency`, `quantity`, `lineTotal`, `createdAt`, `updatedAt`,
- totals `foodSubtotal`, `currency`.

Existing POST/PUT/DELETE cart operations were reviewed only to preserve future contract boundaries. Their mobile mutation and reconciliation behavior remains owned by P30.

No tax, fee, discount, delivery-fee, grand-total, coupon-result, address-result, or delivery-quote value is invented in P28 when it is not present in the exact cart-read response.

---

## 4. P28 Changed Files

Validated P28 mobile implementation changes from the accepted P27 ledger head are limited to:

- `apps/mobile/src/app/store/store.ts`
- `apps/mobile/src/features/auth/state/logoutCoordinator.ts`
- `apps/mobile/src/features/cart/api/cartApi.ts`
- `apps/mobile/src/features/cart/cartDomain.test.ts`
- `apps/mobile/src/features/cart/domain/cartTypes.ts`
- `apps/mobile/src/features/cart/state/cartSelectors.ts`
- `apps/mobile/src/features/cart/state/cartSlice.ts`

Evidence:

- `docs/mobile-ui-rebuild/P28_AUTHORITATIVE_CART_DOMAIN_SKELETON.md`

No backend, OpenAPI, APIM, infrastructure, database, Android native build configuration, View Cart UI, cart-screen UI, cart mutation transport, checkout, payment, or P29+ behavior was changed.

---

## 5. Current Architecture Ownership After P28

### Authentication/session

- Firebase phone/email provider wrapper: `features/auth/firebase/firebaseAuth.ts`.
- Firebase → CRAVES exchange and provider/session cleanup: `features/auth/state/authService.ts`.
- Exact Auth Service wrapper including logout: `features/auth/api/authApi.ts`.
- Access token: process memory through `core/security/tokenMemory.ts`.
- Refresh credential: platform-secure storage through `core/security/refreshTokenStore.ts`.
- Restore/rotation/single-flight/invalidation: `features/auth/api/sessionManager.ts`.
- Startup restore: `features/auth/hooks/useBootstrap.ts`.
- Proactive/foreground refresh: `features/auth/hooks/useSessionLifecycle.ts`.
- Complete app-level logout cleanup: `features/auth/state/logoutCoordinator.ts`, including P28 cart-domain reset.

### State/cache/navigation

- Redux auth state owns requested role, authenticated identity, and onboarding/account resolution.
- Redux Customer shell state owns the current explicitly selected saved browsing location.
- Redux cart state owns the authoritative accepted Customer cart snapshot, dependency metadata, mutation metadata, and client acceptance revision.
- TanStack Query owns server state outside the explicit Redux app-state domains, including P27 saved-location options and notification list/badge data.
- Private query cleanup remains centralized through `app/query/queryCache.ts`.
- Root navigation remains conditional on `auth.bootstrapStatus`; logout unmounts the authenticated navigator subtree.
- P25 remains owner of the one Customer bottom-tab navigator and four independent typed tab stacks.
- P26 remains owner of bottom-navigation scroll hide/reveal behavior.
- P27 owns `CustomerHeader`, `CustomerLocationSelector`, shared Customer location selection, and notification badge derivation.
- P28 owns the canonical cart domain/read boundary/selectors only.
- Product routes and Customer product-screen compositions remain owned by later phases and must consume shared P26–P28 primitives/state rather than duplicate them.

### Account/onboarding authority

- P21 account resolution remains authoritative for Customer/Chef authorization.
- P22 Customer profile completion and P23 Chef application/status behavior remain unchanged.
- `CUSTOMER + READY` enters the Customer shell; `CUSTOMER + PROFILE_REQUIRED` remains in registration.
- Chef routing remains unchanged by P28.

### Later-phase boundaries

- **P29** owns the Shared View Cart Overlay.
- **P30** owns Cart Add/Remove/Quantity Reconciliation and the cart mutation transport/reconciliation lifecycle.
- Later phases own Customer Home/discovery, Chefs, Orders, Profile, notification center/target routing, cart screen, checkout and payment according to `phases.md`.
- Chef KYC proof upload and Chef operational/product screens remain outside P28.

---

## 6. Current Contract Status

Authentication/profile/onboarding contracts accepted before P28 remain unchanged:

- `POST /api/v1/auth/firebase/exchange` — P19.
- `POST /api/v1/auth/refresh` — P20.
- `GET /api/v1/auth/me` — P21/P23 authority.
- `GET /api/v1/customer/profile` / `PUT /api/v1/customer/profile` — P21/P22.
- `GET /api/v1/chef/application` / `POST /api/v1/chef/application` — P23.
- `POST /api/v1/auth/logout` — P24.
- `POST /api/v1/chef/application/proof-files` — backend route exists but remains outside accepted P23–P28 behavior.

P27 Customer shell reads remain accepted:

- `GET /api/v1/customer/addresses`
- `GET /api/v1/notifications/in-app`

P28 additionally accepts only this cart read:

- `GET /api/v1/cart`

No new backend/APIM contract was invented or modified by P28.

Live APIM/device runtime certification is not claimed by these static implementation phases unless a later evidence record explicitly says so.

---

## 7. Mini-Phase Status Mapping

| Phase | Status | Evidence/Reason |
|---|---|---|
| P00–P18 | **DONE** | Preserved in historical ledger/dedicated evidence. |
| P19 Firebase → CRAVES Exchange | **DONE** | Exact exchange and secure token acceptance; CI `31218027179`. |
| P20 Session Restore/Refresh | **DONE** | Restore/rotation/proactive refresh accepted; CI `31219378437`. |
| P21 Identity/Role/Onboarding Resolution | **DONE** | Backend authority, onboarding resolution, authenticated root gate; CI `31220843488`. |
| P22 Customer Registration/Profile Completion | **DONE** | Exact profile completion and server-confirmed state transition; CI `31221757744`. |
| P23 Chef Application Submission / Status | **DONE** | Backend-driven application/status flow and approved-role recheck; CI `31222819644`. |
| P24 Logout/Revoke/Role-State Cleanup | **DONE** | Best-effort revoke, unconditional local credential cleanup, private cache/mutation cleanup, role reset, fresh Auth root; CI `31225688358`. |
| P25 Customer Root Shell/Bottom Tabs | **DONE** | Typed four-tab Customer shell, nested stack preservation, Flame Red active state, safe-area-compatible bottom tabs; CI `31226669633`. |
| P26 Customer Bottom-Nav Scroll Hide/Reveal | **DONE** | Shared scroll-direction controller, reduced-motion animation, hidden interaction/accessibility guard, tab/root reveal behavior; CI `31228012689`. |
| P27 Shared Customer Header/Location/Notification Badge | **DONE** | Shared header variants, saved-location selector/global state, private notification badge derivation, logout cleanup; CI `31229329651`. |
| P28 Authoritative Cart Domain Skeleton | **DONE** | One Redux cart domain, validated exact cart-read mapping, derived selectors, dependency/mutation metadata, logout reset; CI `31229985407`. |
| P29 onward | **NOT STARTED / not accepted** | No later phase is authorized by this record. |

---

## 8. Explicitly Not Complete After P28

Do not describe any of the following as complete:

- P29 Shared View Cart Overlay,
- P30 add/remove/update/clear cart mutation transport and reconciliation UX,
- Customer cart product screen merely because the P28 domain exists,
- Customer Home/Discovery/Chefs/Orders/Profile product screens merely because shell/header/cart foundations exist,
- native GPS/location permission behavior,
- geocoding/maps/serviceability logic,
- Notifications Center list/mark-read/target routing merely because the shared badge query exists,
- coupon application, delivery quote, cart address integration, checkout eligibility, or server-computed checkout totals merely because dependency status types exist,
- Chef KYC proof-file upload,
- Chef operational/product screens,
- authenticated product/resource deep links and notification routing,
- checkout/payment end-to-end flow,
- live APIM/device runtime certification of P19–P28 flows,
- physical-device pixel-perfect certification of accepted auth/header references or remaining references,
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

Preserve useful prior history under `docs/mobile-ui-rebuild/` before compacting this living ledger.
