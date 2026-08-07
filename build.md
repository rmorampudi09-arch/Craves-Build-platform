# CRAVES Mobile Build / Implementation Ledger

**Purpose:** Authoritative living record for the current mobile rebuild. Read this before changing code. Do not infer completion from old APKs, old branches, screenshots, historical documents, or prior chat claims.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`

**Authoritative rebuild branch:** `mobile-ui-rebuild-from-scratch`

**Mobile workspace:** `apps/mobile`

**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`

**Implementation guide:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, 52 embedded reference images.

**Build policy:** Code-level validation during implementation. **No APK per phase.** Final Android APK/AAB only after all implementation/QA gates in `phases.md` are complete.

**Historical preservation:** The complete ledger state through P12 is preserved at `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P12.md`. P13–P24 have dedicated evidence under `docs/mobile-ui-rebuild/`; prior phase details remain there when this living ledger is compacted.

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

P24 completion evidence:

- Started from commit: `f3c165071f47a95c9cb0dda3a97c270d5d53c447`.
- Validated implementation commit: `4fab42f9184ffda34121adf2f8331247d946a79f`.
- Evidence commit: `8836009e0218f028713ce486d72c77a651c0b21b`.
- Evidence: `docs/mobile-ui-rebuild/P24_LOGOUT_REVOKE_ROLE_STATE_CLEANUP.md`.
- CI run: `31225688358` — **SUCCESS**.

**Next phase in sequence:** **P25 — Customer Root Shell and Bottom Tabs**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P25 until the user explicitly authorizes the next phase.

---

## 2. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Run:

- GitHub Actions run ID: `31225688358`
- Head SHA: `4fab42f9184ffda34121adf2f8331247d946a79f`
- Phase: **P24 — Logout, Revoke, and Role-State Cleanup**
- Conclusion: **SUCCESS**

Successful checks:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node 22.13 setup,
3. `npm ci`,
4. strict TypeScript (`tsc --noEmit`),
5. ESLint with zero warnings,
6. Jest including focused P24 logout/revoke/cache/role-state tests and prior regressions,
7. production Android JavaScript bundle generation with `react-native bundle`,
8. backend/APIM/infrastructure source-change guard.

This workflow intentionally does **not** perform Java/Gradle/APK packaging. That remains the implementation-phase policy.

---

## 3. P24 Accepted Logout Boundary

P24 accepts this bounded flow:

`authenticated Customer/Chef state` → best-effort `POST /api/v1/auth/logout` using the stored refresh credential → unconditional local CRAVES credential cleanup → Firebase provider sign-out → private TanStack Query cleanup → mutation-state cleanup → Redux auth/role reset → authenticated navigator subtree unmounted → fresh anonymous Auth root.

Accepted behavior:

- Remote revoke failure, timeout, or offline state cannot block local logout.
- Access/session material continues to use the P10 ownership model: access token in process memory and refresh credential in encrypted secure storage.
- Existing `authApi.logout()` remains the exact API wrapper. No endpoint or payload was invented.
- `authService.logout()` remains the provider/session cleanup boundary and always performs local cleanup after the best-effort remote call.
- `logoutCoordinator.ts` is the single app-state cleanup path used by the current Customer and Chef sign-out controls.
- Private queries are canceled and removed; removal still executes if cancellation rejects.
- Pending/retained mutation-cache state is cleared on logout.
- If targeted private-query cleanup cannot finish, logout fails closed by discarding the broader query cache rather than retaining private server state.
- Public query data can remain only when targeted private cleanup succeeds.
- `signedOut` clears identity, account resolution, error state, and resets prior Chef role intent to the anonymous Customer default.
- Existing `AppNavigator` root gating unmounts the authenticated navigator when `signedOut` is dispatched. Android Back therefore cannot return to the old authenticated stack.

No parallel navigation reset, auth service, store, token mechanism, or query architecture was introduced.

---

## 4. P24 Changed Files

Validated P24 implementation changes are limited to:

- `apps/mobile/src/app/query/queryCache.ts`
- `apps/mobile/src/features/auth/screens/CustomerAccountStatusScreen.tsx`
- `apps/mobile/src/features/auth/screens/ChefAccountStatusScreen.tsx`
- `apps/mobile/src/features/auth/state/authSlice.ts`
- `apps/mobile/src/features/auth/state/logoutCoordinator.ts`
- `apps/mobile/src/features/auth/state/logoutCoordinator.test.ts`
- `apps/mobile/src/features/auth/state/authLogout.test.ts`
- `apps/mobile/src/features/auth/state/logoutState.test.ts`

Evidence:

- `docs/mobile-ui-rebuild/P24_LOGOUT_REVOKE_ROLE_STATE_CLEANUP.md`

No backend, OpenAPI, APIM, infrastructure, Android native build configuration, Customer product shell, bottom tabs, cart/product domain, Chef operational product UI, or P25+ behavior was changed.

---

## 5. Current Architecture Ownership After P24

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
- P24 clears private query data and mutation state before completing anonymous-root transition.
- Root navigation remains conditional on `auth.bootstrapStatus`; no stale authenticated navigator is retained after `signedOut`.

### Account/onboarding authority

- P21 account resolution remains authoritative for Customer/Chef authorization.
- P22 Customer profile completion and P23 Chef application/status behavior remain unchanged.
- P24 does not alter backend role authority; it only removes local role/session/private state on logout.

### Later-phase boundaries

- **P25 onward** owns customer/chef product shells and marketplace functionality.
- Chef KYC proof upload remains outside the accepted auth/onboarding/logout phases.
- Later customer profile product-screen phases own the full Customer Profile/Edit Profile references.

---

## 6. Current Auth / Onboarding Contract Status

- `POST /api/v1/auth/firebase/exchange` — accepted by P19 at static repository contract/implementation level.
- `POST /api/v1/auth/refresh` — accepted by P20 at static repository contract/implementation level.
- `GET /api/v1/auth/me` — accepted by P21 and reused as Chef approval authority in P23.
- `GET /api/v1/customer/profile` / `PUT /api/v1/customer/profile` — accepted by P21/P22 at current static implementation level.
- `GET /api/v1/chef/application` / `POST /api/v1/chef/application` — accepted by P23 at current static implementation level.
- `POST /api/v1/auth/logout` — **accepted by P24** as best-effort remote refresh-session revocation before unconditional local cleanup.
- `POST /api/v1/chef/application/proof-files` — backend route exists but remains outside P23/P24 acceptance.

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
| P25 onward | **NOT STARTED / not accepted** | No later product phase is authorized by this record. |

---

## 8. Explicitly Not Complete After P24

Do not describe any of the following as complete:

- P25 Customer root shell/bottom tabs or later customer product phases,
- Chef KYC proof-file upload,
- Chef operational/product screens,
- authoritative cart/View Cart/cart synchronization,
- authenticated product/resource deep links and notification routing,
- checkout/payment end-to-end flow,
- live APIM/device runtime certification of P19–P24 auth/profile/onboarding/logout operations,
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
