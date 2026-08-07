# CRAVES Mobile Build / Implementation Ledger

**Purpose:** Authoritative living record for the current mobile rebuild. Read this before changing code. Do not infer completion from old APKs, old branches, screenshots, historical documents, or prior chat claims.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`

**Authoritative rebuild branch:** `mobile-ui-rebuild-from-scratch`

**Mobile workspace:** `apps/mobile`

**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`

**Implementation guide:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, 52 embedded reference images.

**Build policy:** Code-level validation during implementation. **No APK per phase.** Final Android APK/AAB only after all implementation/QA gates in `phases.md` are complete.

**Historical preservation:** The complete ledger state through P12 is preserved at `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P12.md`. P13–P23 have dedicated evidence under `docs/mobile-ui-rebuild/`.

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

P23 completion evidence:

- Started from commit: `aa2d6d008f27fafde422c39bee097582013cf4bf`.
- Initial implementation commit: `225c20307872290c7a43a5a4673aef5fc4be334e`.
- Validated implementation commit: `06747a45ac28431ecb70ea308954f98d527ea700`.
- Evidence commit: `da03130362f3906926eb2cfff46cc1368cee99b5`.
- Evidence: `docs/mobile-ui-rebuild/P23_CHEF_APPLICATION_SUBMISSION_STATUS.md`.
- CI run: `31222819644` — **SUCCESS**.

**Next phase in sequence:** **P24 — Logout Cleanup**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P24 until the user explicitly authorizes the next phase.

---

## 2. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Run:

- GitHub Actions run ID: `31222819644`
- Head SHA: `06747a45ac28431ecb70ea308954f98d527ea700`
- Phase: **P23 — Chef Application Submission / Status**
- Conclusion: **SUCCESS**

Successful checks:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node 22.13 setup,
3. `npm ci`,
4. strict TypeScript (`tsc --noEmit`),
5. ESLint with zero warnings,
6. Jest including focused P23 exact-contract/onboarding/state tests and prior regressions,
7. production Android JavaScript bundle generation with `react-native bundle`,
8. backend/APIM/infrastructure source-change guard.

The first P23 implementation run `31222666956` passed TypeScript and stopped on four ESLint `no-void` warnings in new async UI handlers. Commit `06747a45ac28431ecb70ea308954f98d527ea700` corrected only that lint-policy issue; the complete workflow then passed.

This workflow intentionally does **not** perform Java/Gradle/APK packaging. That remains the implementation-phase policy.

---

## 3. P23 Accepted Chef Application / Status Boundary

P23 accepts this bounded post-auth Chef onboarding flow:

`valid CRAVES session` → P21 Chef account resolution → `GET /api/v1/chef/application` → backend status drives `NOT_SUBMITTED` / `PENDING` / `REJECTED` / `APPROVED` UX → initial submit or rejected resubmit through exact `POST /api/v1/chef/application` → local `PENDING` only after server confirmation → approved application must still pass P21 `/me` CHEF-role authority before approved Chef flow is stored.

The client does not simulate Chef approval. Application status comes from the backend, and approved access still requires the backend identity role authority introduced in P21.

### Exact Chef application contract

Authenticated routes owned by P23:

- `GET /api/v1/chef/application`
- `POST /api/v1/chef/application`

`GET /api/v1/chef/application` returns a synthetic `NOT_SUBMITTED` response when no application row exists. The client does not infer that state from a 404.

P23 mutation request — `ChefApplicationRequest`:

- `email` — required and email-valid,
- `firstName` — required/non-blank,
- `lastName` — required/non-blank,
- `addressLine1` — required/non-blank,
- `addressLine2` — optional,
- `landmark` — optional,
- `city` — required/non-blank,
- `state` — required/non-blank,
- `postalCode` — optional,
- `latitude` — optional,
- `longitude` — optional.

The current UI submits only user-entered values and does not fabricate optional latitude/longitude.

Chef application status values:

- `NOT_SUBMITTED`
- `PENDING`
- `APPROVED`
- `REJECTED`

The response also includes application/profile fields, `rejectionReason`, submission/review metadata, and KYC document metadata.

Authoritative static sources:

- `services/user-chef-service/src/main/java/in/craves/userchef/web/ChefApplicationController.java`
- `services/user-chef-service/src/main/java/in/craves/userchef/web/ApiDtos.java`
- `services/user-chef-service/src/main/java/in/craves/userchef/service/ChefApplicationService.java`
- `services/user-chef-service/src/main/java/in/craves/userchef/exception/AppErrorHandler.java`
- `services/user-chef-service/src/main/resources/db/migration/V1__user_chef_schema.sql`

No user-chef-service OpenAPI file exists in the current repository. Current Spring implementation/DTO/schema sources were therefore used as the static contract; no route or payload was invented.

### Submission and resubmission behavior

- `NOT_SUBMITTED` routes to the Chef application form.
- Submission is allowed only while account resolution remains `CHEF_ONBOARDING / NOT_SUBMITTED` or `CHEF_ONBOARDING / REJECTED`.
- Required text fields are trimmed; email is trimmed/lowercased.
- Blank optional strings are omitted instead of fabricated.
- Chef application validation bounds align to the current database columns rather than enforcing unsupported client-only pincode/name/address restrictions.
- The local onboarding state changes to `PENDING` only when the exact POST returns `PENDING`.
- A rejected application is re-read before editing, existing values are prefilled, and `rejectionReason` is surfaced when present.
- If backend status changes while a rejected form is loading, stale rejection state is not allowed to continue.
- Backend `VALIDATION_FAILED` details are reconciled only to known Chef application fields; unknown fields are not guessed into the form.

### Status authority and approval gate

- The status screen refreshes the exact GET route on entry and provides an explicit manual refresh.
- `PENDING` remains locked from Chef mode.
- `REJECTED` surfaces the backend reason and exposes a real update/resubmit route.
- `NOT_SUBMITTED`, if observed from a stale status route, returns to the application form.
- `APPROVED` alone cannot grant Chef authority. P23 re-runs P21 account resolution, requiring `/api/v1/auth/me` to contain `CHEF` as well as application `APPROVED` before storing the `CHEF` flow.
- Application/role mismatch continues to fail closed through `CHEF_AUTHORIZATION_STATUS_MISMATCH`.
- `chefApplicationStatusObserved` accepts only the non-approved Chef onboarding status type and cannot mutate an already authorized Chef resolution.

---

## 4. P23 Changed Files

Validated implementation changes from P23 start `aa2d6d008f27fafde422c39bee097582013cf4bf` through validated head `06747a45ac28431ecb70ea308954f98d527ea700` are limited to:

- `apps/mobile/src/features/auth/api/profileApi.test.ts`
- `apps/mobile/src/features/auth/domain/chefApplicationOnboarding.ts`
- `apps/mobile/src/features/auth/domain/chefApplicationOnboarding.test.ts`
- `apps/mobile/src/features/auth/screens/ChefAccountStatusScreen.tsx`
- `apps/mobile/src/features/auth/screens/ChefRegistrationScreen.tsx`
- `apps/mobile/src/features/auth/state/authSlice.ts`
- `apps/mobile/src/features/auth/state/authSlice.test.ts`
- `apps/mobile/src/utils/validation.ts`

Evidence:

- `docs/mobile-ui-rebuild/P23_CHEF_APPLICATION_SUBMISSION_STATUS.md`

No backend, OpenAPI, APIM, infrastructure, Android native build configuration, KYC proof-file upload, Chef kitchen/menu/product shell, complete logout cleanup, or P24+ behavior was changed.

---

## 5. Current Architecture Ownership After P23

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

- P21 account resolution remains authoritative for Customer/Chef role and authorization routing.
- `selectedRole` remains requested pre-auth intent only.
- P22 owns the exact Customer profile-completion mutation and server-confirmed `PROFILE_REQUIRED` → `READY` transition.
- P23 owns exact Chef application submit/resubmit and complete non-product Chef application status UX.
- P23 Chef form normalization/validation-detail reconciliation lives in `features/auth/domain/chefApplicationOnboarding.ts`.
- Approved Chef access is still stored only through `accountResolved` after P21's combined application-status + `/me` role authority succeeds.

### Later-phase boundaries

- **P24** owns complete logout/revoke/private-query/private-store/role cleanup orchestration.
- **P25 onward** owns customer/chef product shells and marketplace functionality.
- Chef KYC proof upload and operational Chef product screens are not claimed by P23.
- Later customer profile product-screen phases own the full Customer Profile/Edit Profile references; P22/P23 do not claim them.

---

## 6. Current Auth / Onboarding Contract Status

- `POST /api/v1/auth/firebase/exchange` — **VERIFIED at static repository contract/implementation level by P19; live APIM runtime not claimed**.
- `POST /api/v1/auth/refresh` — **VERIFIED at static repository contract/implementation level by P20; live APIM/runtime refresh not claimed**.
- `GET /api/v1/auth/me` — **VERIFIED at static repository contract/implementation level by P21 and reused as the Chef approval authority gate in P23; live APIM/runtime call not claimed**.
- `GET /api/v1/customer/profile` — **VERIFIED/USED at current static implementation level for P21 profile-existence resolution and P22 exact customer profile response modeling; live APIM/runtime call not claimed**.
- `PUT /api/v1/customer/profile` — **VERIFIED/ACCEPTED at current static implementation level by P22; live APIM/runtime mutation not claimed**.
- `GET /api/v1/chef/application` — **VERIFIED/ACCEPTED at current static implementation level by P23 for current application/status retrieval; live APIM/runtime call not claimed**.
- `POST /api/v1/chef/application` — **VERIFIED/ACCEPTED at current static implementation level by P23 for initial submission/resubmission; live APIM/runtime mutation not claimed**.
- `POST /api/v1/chef/application/proof-files` — backend route exists but **NOT ACCEPTED BY P23**; proof-file/KYC upload remains outside this phase.
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
| P23 Chef Application Submission / Status | **DONE** | Exact GET/POST application contract, rejected resubmit, backend-driven status UX, fail-closed approved-role recheck; CI `31222819644`. |
| P24 Logout Cleanup | PARTIAL / foundation exists | Full revoke/private cleanup acceptance remains later. |
| P25 onward | NOT STARTED / not accepted | Product/customer/chef phases have not been accepted under this rebuild protocol unless a later record explicitly says otherwise. |

---

## 8. Explicitly Not Complete After P23

Do not describe any of the following as complete:

- P24 complete logout/revoke/private-cache/private-store cleanup,
- Chef KYC proof-file upload,
- live APIM/device runtime certification of P19–P23 auth/profile/onboarding operations,
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

### P23 — Chef Application Submission / Status

- Status: **DONE** at implementation/static-contract level.
- Started from: `aa2d6d008f27fafde422c39bee097582013cf4bf`.
- Initial implementation commit: `225c20307872290c7a43a5a4673aef5fc4be334e`.
- Validated implementation commit: `06747a45ac28431ecb70ea308954f98d527ea700`.
- Evidence commit: `da03130362f3906926eb2cfff46cc1368cee99b5`.
- Evidence: `docs/mobile-ui-rebuild/P23_CHEF_APPLICATION_SUBMISSION_STATUS.md`.
- Contracts: `GET /api/v1/chef/application` and `POST /api/v1/chef/application`, with P21 `GET /api/v1/auth/me` re-used as the approved-role authority gate.
- Behavior completed: exact application request normalization, DB-aligned form bounds, backend validation mapping, rejected application prefill/reason/resubmit, backend-driven status refresh, and fail-closed approved-role verification.
- CI: `31222819644` — **SUCCESS**.
- Runtime note: current repository implementation/static contract accepted; fresh live APIM/device certification not claimed.
- Next phase: **P24 — Logout Cleanup — NONE AUTHORIZED**.
