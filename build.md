# CRAVES Mobile Build / Implementation Ledger

**Purpose:** Authoritative living record for the current mobile rebuild. Read this before changing code. Do not infer completion from old APKs, old branches, screenshots, historical documents, or prior chat claims.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`

**Authoritative rebuild branch:** `mobile-ui-rebuild-from-scratch`

**Mobile workspace:** `apps/mobile`

**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`

**Implementation guide:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, 52 embedded reference images.

**Build policy:** Code-level validation during implementation. **No APK per phase.** Final Android APK/AAB only after all implementation/QA gates in `phases.md` are complete.

**Historical preservation:** The complete ledger state through P12 is preserved at `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P12.md`. P13–P26 have dedicated evidence under `docs/mobile-ui-rebuild/`; prior phase details remain there when this living ledger is compacted.

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

P26 completion evidence:

- Started from commit: `bcbbcac31ebe8857bfc7f7e5af0c80a9ddf98443`.
- Initial implementation commit: `3aa720d9d9543a6a45bc6ef13085bcf087e01648`.
- Validated implementation commit: `613a91be62722ae032ef9d4f9b9124702c8902bd`.
- Evidence commit: `2a372cdceb4bf4db2ecfe6faa112010e4fd551d3`.
- Evidence: `docs/mobile-ui-rebuild/P26_CUSTOMER_BOTTOM_NAV_SCROLL_HIDE_REVEAL.md`.
- CI run: `31228012689` — **SUCCESS**.

**Next phase in sequence:** **P27 — Shared Customer Header/Location/Notification Badge**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P27 until the user explicitly authorizes the next phase.

---

## 2. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Run:

- GitHub Actions run ID: `31228012689`
- Head SHA: `613a91be62722ae032ef9d4f9b9124702c8902bd`
- Phase: **P26 — Customer Bottom-Nav Scroll Hide/Reveal**
- Conclusion: **SUCCESS**

Successful checks:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node 22.13 setup,
3. `npm ci`,
4. strict TypeScript (`tsc --noEmit`),
5. ESLint with zero warnings,
6. Jest including focused P26 scroll direction/threshold tests and prior regressions,
7. production Android JavaScript bundle generation with `react-native bundle`,
8. backend/APIM/infrastructure source-change guard.

The implementation-phase workflow intentionally does **not** perform Java/Gradle/APK packaging.

---

## 3. P26 Accepted Bottom-Navigation Behavior

P26 extends the existing P25 Customer shell only. It does not introduce any Customer product/reference screen.

Accepted behavior:

- Customer bottom navigation is visible when a tab-root vertical list is at/near the top.
- Deliberate downward scrolling hides the bar after a small accumulated-direction threshold.
- Deliberate upward scrolling reveals the bar after the same threshold.
- Minor scroll jitter does not repeatedly toggle the bar.
- Negative Android overscroll is normalized safely and keeps navigation visible.
- Changing Customer tabs reveals the bar.
- Returning/focusing a Customer tab root reveals the bar without resetting the preserved list offset.
- While hidden, the tab bar does not intercept touches.
- While hidden, the tab bar is removed from accessibility traversal.
- The shared P05 bottom-navigation motion definition is reused; only opacity/transform are animated with the native driver.
- Android reduced-motion preference is respected; visibility changes become immediate when reduced motion is enabled.
- The actual React Navigation `BottomTabBar` remains authoritative; no second tab UI or navigation system was created.
- Existing P25 `lazy: true` / `popToTopOnBlur: false` stack-preservation behavior remains unchanged.
- The tab bar continues to own its normal safe-area geometry; P26 does not impose a fixed bottom offset or fixed tab height that would bypass Android gesture/navigation insets.

### Later product-list integration boundary

`useCustomerBottomNavScroll()` is now the single shared vertical-scroll binding for the real Customer tab-root `ScrollView`, `FlatList`, or `FlashList` implementations added by their later owning phases. It provides shared `onScroll` handling and `scrollEventThrottle: 16` while revealing navigation on root focus without resetting list position.

P26 intentionally did **not** create fake scrollable Home, Chefs, Orders, or Profile content just to demonstrate the behavior. Those screens remain unaccepted until their owning phases.

---

## 4. P26 Changed Files

Validated P26 implementation changes from the accepted P25 ledger head are limited to:

- `apps/mobile/src/app/navigation/CustomerBottomNavController.tsx`
- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/app/navigation/customerBottomNavScroll.ts`
- `apps/mobile/src/app/navigation/customerBottomNavScroll.test.ts`
- `apps/mobile/src/app/navigation/customerTabs.ts`

Evidence:

- `docs/mobile-ui-rebuild/P26_CUSTOMER_BOTTOM_NAV_SCROLL_HIDE_REVEAL.md`

No backend, OpenAPI, APIM, infrastructure, database, Android native build configuration, cart/View Cart behavior, P27 shared-header behavior, or later Customer product screen was changed.

---

## 5. Current Architecture Ownership After P26

### Authentication/session

- Firebase phone/email provider wrapper: `features/auth/firebase/firebaseAuth.ts`.
- Firebase → CRAVES exchange and provider/session cleanup: `features/auth/state/authService.ts`.
- Exact Auth Service wrapper including logout: `features/auth/api/authApi.ts`.
- Access token: process memory through `core/security/tokenMemory.ts`.
- Refresh credential: platform-secure storage through `core/security/refreshTokenStore.ts`.
- Restore/rotation/single-flight/invalidation: `features/auth/api/sessionManager.ts`.
- Startup restore: `features/auth/hooks/useBootstrap.ts`.
- Proactive/foreground refresh: `features/auth/hooks/useSessionLifecycle.ts`.
- Complete app-level logout cleanup: `features/auth/state/logoutCoordinator.ts`.

### State/cache/navigation

- Redux auth state owns requested role, authenticated identity, and onboarding/account resolution.
- TanStack Query owns server state; private cache cleanup remains centralized through `app/query/queryCache.ts`.
- Root navigation remains conditional on `auth.bootstrapStatus`; logout unmounts the authenticated navigator subtree.
- P25 remains the owner of the one Customer bottom-tab navigator and four independent typed tab stacks.
- P26 adds one shell-level Customer bottom-nav visibility provider/controller rather than per-screen duplicate logic.
- `customerBottomNavScroll.ts` owns the pure direction/threshold state machine.
- `CustomerBottomNavController.tsx` owns visibility animation, reduced-motion behavior, hidden interaction/accessibility policy, and the reusable root-list scroll binding.
- Product routes and real root lists remain owned by later phases and must reuse this P26 binding when applicable.

### Account/onboarding authority

- P21 account resolution remains authoritative for Customer/Chef authorization.
- P22 Customer profile completion and P23 Chef application/status behavior remain unchanged.
- `CUSTOMER + READY` enters the Customer shell; `CUSTOMER + PROFILE_REQUIRED` remains in registration.
- Chef routing remains unchanged by P26.

### Later-phase boundaries

- **P27** owns shared Customer header/location/notification badge behavior.
- **P28 onward** owns cart/domain/product behavior according to `phases.md`.
- Later Customer screen phases own Home, Chefs discovery, Orders, Profile and their real API-backed compositions.
- Chef KYC proof upload and Chef operational/product screens remain outside P26.

---

## 6. Current Contract Status

Authentication/profile/onboarding contracts accepted before P26 remain unchanged:

- `POST /api/v1/auth/firebase/exchange` — P19.
- `POST /api/v1/auth/refresh` — P20.
- `GET /api/v1/auth/me` — P21/P23 authority.
- `GET /api/v1/customer/profile` / `PUT /api/v1/customer/profile` — P21/P22.
- `GET /api/v1/chef/application` / `POST /api/v1/chef/application` — P23.
- `POST /api/v1/auth/logout` — P24.
- `POST /api/v1/chef/application/proof-files` — backend route exists but remains outside accepted P23–P26 behavior.

**P25 and P26 use no new APIM/backend contract.** They are navigation-shell phases only.

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
| P27 onward | **NOT STARTED / not accepted** | No later phase is authorized by this record. |

---

## 8. Explicitly Not Complete After P26

Do not describe any of the following as complete:

- P27 shared Customer header/location/notification badge,
- P28 authoritative cart domain or P29 View Cart overlay,
- Customer Home/Discovery/Chefs/Orders/Profile product screens merely because the shell and scroll behavior exist,
- Chef KYC proof-file upload,
- Chef operational/product screens,
- authenticated product/resource deep links and notification routing,
- checkout/payment end-to-end flow,
- live APIM/device runtime certification of P19–P26 flows,
- physical-device pixel-perfect certification of accepted auth references or remaining references,
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
