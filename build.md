# CRAVES Mobile Build / Implementation Ledger

**Purpose:** Authoritative living record for the current mobile rebuild. Read this before changing code. Do not infer completion from old APKs, old branches, screenshots, historical documents, or prior chat claims.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`

**Authoritative rebuild branch:** `mobile-ui-rebuild-from-scratch`

**Mobile workspace:** `apps/mobile`

**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`

**Implementation guide:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, 52 embedded reference images.

**Build policy:** Code-level validation during implementation. **No APK per phase.** Final Android APK/AAB only after all implementation/QA gates in `phases.md` are complete.

**Historical preservation:** The complete ledger state through P12 is preserved at `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P12.md`. P13–P21 have dedicated evidence under `docs/mobile-ui-rebuild/`.

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

P21 completion evidence:

- Started from commit: `70dd5a9b85739cc2026be058907d07b432255d6b`.
- Validated implementation commit: `e4fd28ed9f9d79eca509bee79f566f648c50e161`.
- Evidence commit: `bfa15c4cfa0bdc61f8f2b072db570de89e3c833b`.
- Evidence: `docs/mobile-ui-rebuild/P21_IDENTITY_ROLE_AND_ONBOARDING_RESOLUTION.md`.
- CI run: `31220843488` — **SUCCESS**.

**Next phase in sequence:** **P22 — Customer Registration/Profile Completion**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P22 until the user explicitly authorizes the next phase.

---

## 2. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Run:

- GitHub Actions run ID: `31220843488`
- Head SHA: `e4fd28ed9f9d79eca509bee79f566f648c50e161`
- Phase: **P21 — Identity, Role, and Onboarding Resolution**
- Conclusion: **SUCCESS**

Successful checks:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node 22.13 setup,
3. `npm ci`,
4. strict TypeScript (`tsc --noEmit`),
5. ESLint with zero warnings,
6. Jest including focused P21 authority/resolution tests and prior regressions,
7. production Android JavaScript bundle generation with `react-native bundle`,
8. backend/APIM/infrastructure source-change guard.

This workflow intentionally does **not** perform Java/Gradle/APK packaging. That remains the implementation-phase policy.

---

## 3. P21 Accepted Identity / Role / Onboarding Boundary

P21 accepts this authenticated resolution sequence:

`valid CRAVES session` → account-resolution gate → `GET /api/v1/auth/me` → backend identity/role authority → bounded customer-profile or Chef-application status read → typed `AccountResolution` → appropriate existing Customer/Chef onboarding/account navigator.

The role selected before authentication is **requested intent only**. It is no longer sufficient to authorize an authenticated product/account root.

### Exact Auth Service identity contract

Method/path:

- `GET /api/v1/auth/me`

Response:

- `MeResponse.identity`
- authoritative fields used here: `status`, `roles`
- current identity statuses: `ACTIVE`, `SUSPENDED`
- current backend role values: `CUSTOMER`, `CHEF`, `ADMIN`

Authoritative static sources:

- `openapi/auth-service-v1.yaml`
- `services/auth-service/src/main/java/in/craves/auth/web/AuthController.java`
- `services/auth-service/src/main/java/in/craves/auth/service/AuthService.java`

The Spring service loads the current identity, enforces active status, reads persisted role mappings, and returns those roles. P21 therefore accepts `/me` as **VERIFIED at current static repository contract/implementation level**. No fresh live APIM/device call is claimed.

### Customer onboarding resolution

Existing read:

- `GET /api/v1/customer/profile`

Resolution:

- backend `CUSTOMER` role + existing profile → `CUSTOMER / READY`,
- backend `CUSTOMER` role + exact HTTP 404 code `CUSTOMER_PROFILE_NOT_FOUND` → `CUSTOMER / PROFILE_REQUIRED`,
- other errors remain errors and are not silently treated as incomplete onboarding.

P21 does not submit customer profile data. P22 owns profile completion.

### Chef authorization and onboarding resolution

Existing read:

- `GET /api/v1/chef/application`
- current statuses: `NOT_SUBMITTED`, `PENDING`, `APPROVED`, `REJECTED`

Resolution:

- Customer-only backend identity + `NOT_SUBMITTED`/`PENDING`/`REJECTED` → Chef onboarding boundary only; Chef operational role remains locked,
- backend `CHEF` role + application `APPROVED` → authorized Chef account flow,
- application `APPROVED` without backend `CHEF`, or backend `CHEF` while application is not approved → fail closed with `CHEF_AUTHORIZATION_STATUS_MISMATCH`.

The current backend Chef approval path grants `CHEF` through the Auth Service. The mobile client does not grant, synthesize, or persist a fake Chef authority.

P21 does not submit/resubmit Chef applications or accept the complete Chef status experience. P23 owns those behaviors.

### Navigation/root behavior

- `AppNavigator` no longer branches authenticated Customer/Chef account routing directly from `auth.selectedRole`.
- A valid session without `accountResolution` enters the dedicated account-resolution navigator first.
- The resolver refreshes identity authority through `/me`, determines the bounded onboarding state, and publishes a typed `AccountResolution`.
- Only then is the existing Customer or Chef account/onboarding navigator rendered.
- A pre-login Chef selection cannot grant Chef authorization without the backend `CHEF` role.

### Failure/retry behavior

- One resolution request in flight at a time.
- Public normalized error copy.
- Explicit retry.
- Explicit sign-out escape.
- No fake fallback role.
- No simulated Chef approval.
- Account resolution is cleared on new authentication, bootstrap reset/failure, role-intent change, and sign-out so stale role authority is not reused.

---

## 4. P21 Changed Files

Validated implementation changes from P21 start `70dd5a9b85739cc2026be058907d07b432255d6b` through validated head `e4fd28ed9f9d79eca509bee79f566f648c50e161` are limited to:

- `apps/mobile/src/app/navigation/AppNavigator.tsx`
- `apps/mobile/src/features/auth/api/authApi.test.ts`
- `apps/mobile/src/features/auth/domain/types.ts`
- `apps/mobile/src/features/auth/screens/AccountRouterScreen.tsx`
- `apps/mobile/src/features/auth/state/accountResolutionService.ts`
- `apps/mobile/src/features/auth/state/accountResolutionService.test.ts`
- `apps/mobile/src/features/auth/state/authSlice.ts`
- `apps/mobile/src/features/auth/state/authSlice.test.ts`

Evidence:

- `docs/mobile-ui-rebuild/P21_IDENTITY_ROLE_AND_ONBOARDING_RESOLUTION.md`

No backend, OpenAPI, APIM, infrastructure, Android native build configuration, Customer marketplace screen, Chef operational screen, P22 implementation, or P23 submission implementation was changed.

---

## 5. Current Architecture Ownership After P21

### Authentication/session

- Firebase phone/email identity provider wrapper: `features/auth/firebase/firebaseAuth.ts`.
- Firebase → CRAVES exchange orchestration: `features/auth/state/authService.ts`.
- Exact Auth Service wrapper: `features/auth/api/authApi.ts`.
- Access token: process memory through `core/security/tokenMemory.ts`.
- Refresh credential: platform-secure storage through `core/security/refreshTokenStore.ts`.
- Restore/rotation/single-flight/invalidation: `features/auth/api/sessionManager.ts`.
- Startup restore: `features/auth/hooks/useBootstrap.ts`.
- Proactive/foreground refresh: `features/auth/hooks/useSessionLifecycle.ts`.

### P21 account authority

- Auth store keeps `selectedRole` as requested role intent and `accountResolution` as separate authoritative resolved state.
- `features/auth/state/accountResolutionService.ts` owns `/me` role authority plus bounded onboarding resolution.
- `features/auth/screens/AccountRouterScreen.tsx` owns loading/retry/sign-out UX for account resolution.
- `app/navigation/AppNavigator.tsx` renders authenticated account roots only after `accountResolution` exists.

### Later-phase boundaries

- **P22** owns customer registration/profile-completion request, validation, and success transition.
- **P23** owns Chef application submission/resubmission and full backend-authoritative pending/rejected/approved UX.
- **P24** owns complete logout/revoke/private-query/private-store/role cleanup orchestration.
- **P25 onward** owns customer/chef product shells and marketplace functionality.

---

## 6. Current Auth / Onboarding Contract Status

- `POST /api/v1/auth/firebase/exchange` — **VERIFIED at static repository contract/implementation level by P19; live APIM runtime not claimed**.
- `POST /api/v1/auth/refresh` — **VERIFIED at static repository contract/implementation level by P20; live APIM/runtime refresh not claimed**.
- `GET /api/v1/auth/me` — **VERIFIED at static repository contract/implementation level by P21; live APIM/runtime identity call not claimed**.
- `GET /api/v1/customer/profile` — **USED by P21 only for profile-existence resolution; P22 owns profile completion acceptance**.
- `GET /api/v1/chef/application` — **USED by P21 only for bounded authorization/onboarding resolution; P23 owns full Chef application/status acceptance**.
- `POST /api/v1/auth/logout` — existing best-effort auth-screen escape exists, but complete logout/revoke/private-state cleanup remains P24.

Historical P02 evidence remains preserved and should not be rewritten as though its earlier repository snapshot contained later/current Auth Service evidence.

---

## 7. Mini-Phase Status Mapping

| Phase | Status | Evidence/Reason |
|---|---|---|
| P00–P09 | **DONE** | Preserved in historical ledgers and dedicated evidence. |
| P10 Session Token Security | **DONE** | Secure token boundary accepted; CI `31208468433`. |
| P11 Root Navigation | **DONE** | Typed route/chrome/deep-link policy accepted; CI `31209520350`. |
| P12 Role Selection | **DONE** | Shared requested-role state and auth-route synchronization accepted; CI `31210359665`. |
| P13 Customer Phone Sign-In | **DONE** | Customer phone interaction accepted; CI `31211607174`. |
| P14 Chef Phone Sign-In | **DONE** | Chef phone role/copy behavior accepted; CI `31212292710`. |
| P15 Customer Email Sign-In | **DONE** | Customer email credential behavior accepted; CI `31213256378`. |
| P16 Chef Email Sign-In | **DONE** | Chef role-preserving email flow accepted; CI `31214293358`. |
| P17 OTP | **DONE** | Verification/resend/expiry/rate-limit behavior accepted; CI `31215342272`. |
| P18 Password Recovery | **DONE** | Neutral recovery behavior accepted; CI `31217157970`. |
| P19 Firebase → CRAVES Exchange | **DONE** | Exact exchange and secure token acceptance; CI `31218027179`. |
| P20 Session Restore/Refresh | **DONE** | Restore/rotation/proactive refresh accepted; CI `31219378437`. |
| P21 Identity/Role/Onboarding Resolution | **DONE** | `/me` backend authority, bounded onboarding resolution, fail-closed Chef authorization, authenticated root gate; CI `31220843488`. |
| P22 Customer Registration | PARTIAL / existing baseline | P22 acceptance not authorized. |
| P23 Chef Application Status | PARTIAL / existing baseline | P23 acceptance not authorized. |
| P24 Logout Cleanup | PARTIAL / foundation exists | Full cleanup acceptance remains later. |
| P25 onward | NOT STARTED / not accepted | Product/customer/chef phases have not been accepted under this rebuild protocol unless a later record explicitly says otherwise. |

---

## 8. Explicitly Not Complete After P21

Do not describe any of the following as complete:

- P22 Customer registration/profile completion,
- P23 Chef application submission/resubmission and complete status flow,
- P24 complete logout/revoke/private-cache cleanup,
- live APIM/device runtime certification of P19/P20/P21 auth operations,
- physical-device pixel-perfect certification of accepted auth references or remaining references,
- Customer product refs beyond accepted auth phases,
- Chef product refs beyond accepted auth phases,
- customer/chef bottom-tab product shells,
- authoritative View Cart/cart synchronization,
- authenticated product/resource deep links and notification routing,
- checkout/payment end-to-end flow,
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
Completed at commit: <sha>
Guide references: <screen refs/pages>
Changed files: <exact paths>
APIM/contracts used: <exact route/method/model source>
Behavior completed: <bounded summary>
Tests/checks: <results/run id>
Visual QA: <deferred or evidence>
Blockers: <none or exact missing dependency>
Next phase: NONE AUTHORIZED — waiting for user
```

Preserve useful prior history under `docs/mobile-ui-rebuild/` before compacting this living ledger.

---

## 10. Recent Phase History

### P19 — Firebase → CRAVES Session Exchange

- Status: **DONE** at implementation/static-contract level.
- Validated implementation commit: `0005a7751998ec8626f55bfcd4240aacb4c5e4be`.
- Evidence: `docs/mobile-ui-rebuild/P19_FIREBASE_CRAVES_SESSION_EXCHANGE.md`.
- Contract: `POST /api/v1/auth/firebase/exchange`.
- CI: `31218027179` — **SUCCESS**.

### P20 — Session Restore and Silent Refresh

- Status: **DONE** at implementation/static-contract level.
- Started from: `6e54098622367e7b4a35173ef3946f62007d16c7`.
- Validated implementation commit: `fbaee4352d119140ee8a859583478860ee7b6267`.
- Evidence: `docs/mobile-ui-rebuild/P20_SESSION_RESTORE_AND_SILENT_REFRESH.md`.
- Contract: `POST /api/v1/auth/refresh`.
- CI: `31219378437` — **SUCCESS**.

### P21 — Identity, Role, and Onboarding Resolution

- Status: **DONE** at implementation/static-contract level.
- Started from: `70dd5a9b85739cc2026be058907d07b432255d6b`.
- Validated implementation commit: `e4fd28ed9f9d79eca509bee79f566f648c50e161`.
- Evidence commit: `bfa15c4cfa0bdc61f8f2b072db570de89e3c833b`.
- Evidence: `docs/mobile-ui-rebuild/P21_IDENTITY_ROLE_AND_ONBOARDING_RESOLUTION.md`.
- Contracts used: `GET /api/v1/auth/me`, `GET /api/v1/customer/profile` for existence resolution, and `GET /api/v1/chef/application` for bounded status resolution.
- Behavior completed: backend-authoritative Customer/Chef authorization, selected-role-as-intent separation, typed onboarding resolution, fail-closed Chef role/application mismatch, authenticated root gate, retry/sign-out recovery.
- CI: `31220843488` — **SUCCESS**.
- Runtime note: current repository implementation/static contracts accepted; fresh live APIM/device certification not claimed.
- Next phase: **P22 — Customer Registration/Profile Completion — NONE AUTHORIZED**.
