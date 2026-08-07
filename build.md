# CRAVES Mobile Build / Implementation Ledger

**Purpose:** Authoritative living record for the current mobile rebuild. Read this before changing code. Do not infer completion from old APKs, old branches, screenshots, historical documents, or prior chat claims.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`

**Authoritative rebuild branch:** `mobile-ui-rebuild-from-scratch`

**Mobile workspace:** `apps/mobile`

**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`

**Implementation guide:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, 52 embedded reference images.

**Build policy:** Code-level validation during implementation. **No APK per phase.** Final Android APK/AAB only after all implementation/QA gates in `phases.md` are complete.

**Historical preservation:** The complete ledger state through P12 is preserved at `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P12.md`. P13–P22 have dedicated evidence under `docs/mobile-ui-rebuild/`.

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

P22 completion evidence:

- Started from commit: `7501e606f16f57db89c385b5bcb5c650510968de`.
- Validated implementation commit: `11934d4397b9e39141ce670b9eec3cee5be8e19c`.
- Evidence commit: `96720749ce7404e130c98f83a5fd666f68afc4f0`.
- Evidence: `docs/mobile-ui-rebuild/P22_CUSTOMER_REGISTRATION_PROFILE_COMPLETION.md`.
- CI run: `31221757744` — **SUCCESS**.

**Next phase in sequence:** **P23 — Chef Application Submission / Status**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P23 until the user explicitly authorizes the next phase.

---

## 2. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Run:

- GitHub Actions run ID: `31221757744`
- Head SHA: `11934d4397b9e39141ce670b9eec3cee5be8e19c`
- Phase: **P22 — Customer Registration/Profile Completion**
- Conclusion: **SUCCESS**

Successful checks:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node 22.13 setup,
3. `npm ci`,
4. strict TypeScript (`tsc --noEmit`),
5. ESLint with zero warnings,
6. Jest including focused P22 exact-contract/profile-completion/state tests and prior regressions,
7. production Android JavaScript bundle generation with `react-native bundle`,
8. backend/APIM/infrastructure source-change guard.

This workflow intentionally does **not** perform Java/Gradle/APK packaging. That remains the implementation-phase policy.

---

## 3. P22 Accepted Customer Profile Completion Boundary

P22 accepts this bounded post-auth customer flow:

`valid CRAVES session` → P21 `CUSTOMER / PROFILE_REQUIRED` resolution → locally validated customer profile draft → exact authenticated `PUT /api/v1/customer/profile` → server-confirmed `CustomerProfileResponse` → account resolution becomes `CUSTOMER / READY` → existing customer account-ready boundary.

The client does not mark onboarding ready before the profile mutation succeeds, and it fails closed if the authoritative account state is no longer `CUSTOMER / PROFILE_REQUIRED`.

### Exact customer profile contract

Authenticated routes:

- `GET /api/v1/customer/profile`
- `PUT /api/v1/customer/profile`

P22 mutation request — `CustomerProfileRequest`:

- `firstName` — required/non-blank string,
- `lastName` — required/non-blank string,
- `email` — optional email string.

P22 response — `CustomerProfileResponse`:

- `id`,
- `identityId`,
- `registeredPhoneNumber`,
- `firstName`,
- `lastName`,
- `email`,
- `createdAt`,
- `updatedAt`.

Authoritative static sources:

- `services/user-chef-service/src/main/java/in/craves/userchef/web/CustomerProfileController.java`
- `services/user-chef-service/src/main/java/in/craves/userchef/web/ApiDtos.java`
- `services/user-chef-service/src/main/java/in/craves/userchef/service/CustomerProfileService.java`
- `services/user-chef-service/src/main/java/in/craves/userchef/exception/AppErrorHandler.java`
- `services/user-chef-service/src/main/resources/db/migration/V1__user_chef_schema.sql`

No user-chef-service OpenAPI file exists in the current repository. Current Spring implementation/DTO/schema sources were therefore used as the static contract; no route or payload was invented.

### Request and validation behavior

- Names are trimmed before submit.
- Optional email is trimmed/lowercased and omitted when blank.
- Customer profile names are bounded to the database's current 100-character columns.
- Email is bounded to the database's current 255-character column.
- Shared HTTP normalization preserves only bounded, user-safe backend validation details.
- `VALIDATION_FAILED` details are reconciled only to known `firstName`, `lastName`, and `email` fields.
- Unknown validation fields are not guessed into the customer form.
- Non-field failures remain normalized form-level errors.
- Raw backend stack traces remain blocked from user-visible errors.

### Success state

- The exact profile write must resolve successfully before the local onboarding state changes.
- `customerProfileCompleted` transitions only `CUSTOMER / PROFILE_REQUIRED` to `CUSTOMER / READY`.
- It cannot mutate Chef authority or Chef onboarding state.
- P22 does not grant roles, synthesize identity authority, or bypass P21 account resolution.

---

## 4. P22 Changed Files

Validated implementation changes from P22 start `7501e606f16f57db89c385b5bcb5c650510968de` through validated head `11934d4397b9e39141ce670b9eec3cee5be8e19c` are limited to:

- `apps/mobile/src/core/http/apiError.ts`
- `apps/mobile/src/core/http/httpFoundation.test.ts`
- `apps/mobile/src/features/auth/api/profileApi.test.ts`
- `apps/mobile/src/features/auth/domain/customerProfileCompletion.ts`
- `apps/mobile/src/features/auth/domain/customerProfileCompletion.test.ts`
- `apps/mobile/src/features/auth/screens/CustomerRegistrationScreen.tsx`
- `apps/mobile/src/features/auth/state/authSlice.ts`
- `apps/mobile/src/features/auth/state/authSlice.test.ts`
- `apps/mobile/src/utils/validation.ts`

Evidence:

- `docs/mobile-ui-rebuild/P22_CUSTOMER_REGISTRATION_PROFILE_COMPLETION.md`

No backend, OpenAPI, APIM, infrastructure, Android native build configuration, customer product shell, full Edit Customer Profile product screen, Chef submission/status implementation, or P23+ product behavior was changed.

---

## 5. Current Architecture Ownership After P22

### Authentication/session

- Firebase phone/email identity provider wrapper: `features/auth/firebase/firebaseAuth.ts`.
- Firebase → CRAVES exchange orchestration: `features/auth/state/authService.ts`.
- Exact Auth Service wrapper: `features/auth/api/authApi.ts`.
- Access token: process memory through `core/security/tokenMemory.ts`.
- Refresh credential: platform-secure storage through `core/security/refreshTokenStore.ts`.
- Restore/rotation/single-flight/invalidation: `features/auth/api/sessionManager.ts`.
- Startup restore: `features/auth/hooks/useBootstrap.ts`.
- Proactive/foreground refresh: `features/auth/hooks/useSessionLifecycle.ts`.

### Account/onboarding authority

- P21 account resolution remains authoritative for Customer/Chef role/onboarding routing.
- `selectedRole` remains requested pre-auth intent only.
- P22 owns only the customer profile-completion mutation and the server-confirmed `PROFILE_REQUIRED` → `READY` transition.
- P22 field reconciliation lives in `features/auth/domain/customerProfileCompletion.ts` and shared safe validation-detail transport remains in `core/http/apiError.ts`.

### Later-phase boundaries

- **P23** owns Chef application submission/resubmission and complete backend-authoritative pending/rejected/approved UX.
- **P24** owns complete logout/revoke/private-query/private-store/role cleanup orchestration.
- **P25 onward** owns customer/chef product shells and marketplace functionality.
- Later customer profile product-screen phases own the full Customer Profile/Edit Profile references; P22 does not claim them.

---

## 6. Current Auth / Onboarding Contract Status

- `POST /api/v1/auth/firebase/exchange` — **VERIFIED at static repository contract/implementation level by P19; live APIM runtime not claimed**.
- `POST /api/v1/auth/refresh` — **VERIFIED at static repository contract/implementation level by P20; live APIM/runtime refresh not claimed**.
- `GET /api/v1/auth/me` — **VERIFIED at static repository contract/implementation level by P21; live APIM/runtime identity call not claimed**.
- `GET /api/v1/customer/profile` — **VERIFIED/USED at current static implementation level for P21 profile-existence resolution and P22 exact customer profile response modeling; live APIM/runtime call not claimed**.
- `PUT /api/v1/customer/profile` — **VERIFIED/ACCEPTED at current static implementation level by P22; live APIM/runtime mutation not claimed**.
- `GET /api/v1/chef/application` — **USED by P21 only for bounded authorization/onboarding resolution; P23 owns full Chef application/status acceptance**.
- `POST /api/v1/auth/logout` — existing best-effort auth-screen escape exists, but complete logout/revoke/private-state cleanup remains P24.

Historical P02 evidence remains preserved and should not be rewritten as though its earlier repository snapshot contained later/current service evidence.

---

## 7. Mini-Phase Status Mapping

| Phase | Status | Evidence/Reason |
|---|---|---|
| P00–P18 | **DONE** | Preserved in historical ledger/dedicated evidence. |
| P19 Firebase → CRAVES Exchange | **DONE** | Exact exchange and secure token acceptance; CI `31218027179`. |
| P20 Session Restore/Refresh | **DONE** | Restore/rotation/proactive refresh accepted; CI `31219378437`. |
| P21 Identity/Role/Onboarding Resolution | **DONE** | `/me` backend authority, bounded onboarding resolution, fail-closed Chef authorization, authenticated root gate; CI `31220843488`. |
| P22 Customer Registration/Profile Completion | **DONE** | Exact customer profile request/response, field-level server validation mapping, server-confirmed ready transition; CI `31221757744`. |
| P23 Chef Application Submission / Status | PARTIAL / existing baseline | P23 acceptance not authorized. |
| P24 Logout Cleanup | PARTIAL / foundation exists | Full cleanup acceptance remains later. |
| P25 onward | NOT STARTED / not accepted | Product/customer/chef phases have not been accepted under this rebuild protocol unless a later record explicitly says otherwise. |

---

## 8. Explicitly Not Complete After P22

Do not describe any of the following as complete:

- P23 Chef application submission/resubmission and complete status flow,
- P24 complete logout/revoke/private-cache cleanup,
- live APIM/device runtime certification of P19–P22 auth/profile operations,
- physical-device pixel-perfect certification of accepted auth references or remaining references,
- full Customer Profile/Edit Profile reference-screen implementation,
- Customer product refs beyond accepted auth/onboarding phases,
- Chef product refs beyond accepted auth/onboarding phases,
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

---

## 10. Recent Phase History

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
- CI: `31220843488` — **SUCCESS**.

### P22 — Customer Registration/Profile Completion

- Status: **DONE** at implementation/static-contract level.
- Started from: `7501e606f16f57db89c385b5bcb5c650510968de`.
- Validated implementation commit: `11934d4397b9e39141ce670b9eec3cee5be8e19c`.
- Evidence commit: `96720749ce7404e130c98f83a5fd666f68afc4f0`.
- Evidence: `docs/mobile-ui-rebuild/P22_CUSTOMER_REGISTRATION_PROFILE_COMPLETION.md`.
- Contract: `PUT /api/v1/customer/profile` with exact `CustomerProfileRequest` / `CustomerProfileResponse` static backend sources.
- Behavior completed: exact request normalization, DB-aligned validation bounds, safe field-level server validation reconciliation, server-confirmed `PROFILE_REQUIRED` → `READY` transition, fail-closed account-state guard.
- CI: `31221757744` — **SUCCESS**.
- Runtime note: current repository implementation/static contract accepted; fresh live APIM/device certification not claimed.
- Next phase: **P23 — Chef Application Submission / Status — NONE AUTHORIZED**.
