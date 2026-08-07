# P23 — Chef Application Submission / Status Evidence

## Status

**DONE** at implementation/static-contract level.

P23 is intentionally bounded to Chef application retrieval, initial submission/resubmission, and backend-authoritative `NOT_SUBMITTED` / `PENDING` / `REJECTED` / `APPROVED` status UX. It does not implement KYC proof-file upload, Chef kitchen/menu/product screens, full logout cleanup, or any P24+ behavior.

## Source / Authority Review

Reviewed before implementation:

- `plan.md`
- `phases.md`
- `agent.md`
- `build.md`
- full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`
- current `mobile-ui-rebuild-from-scratch` branch
- current user-chef-service Chef application controller, DTOs, service behavior, validation/error handler, and database schema

The repository/backend contract remains authoritative where guide material is broader. The master guide requires role-aware authentication destinations and backend-owned Chef eligibility/status; it explicitly does not redefine the separate Chef application. P23 therefore used the current backend implementation as the exact static contract and did not invent onboarding routes, approval behavior, or additional required fields.

## Phase Boundary

Phase: **P23 — Chef Application Submission / Status**

Acceptance from `phases.md`:

- existing Chef application retrieval,
- application submission if required,
- pending/rejected/approved status routing,
- backend status remains authoritative,
- no simulated approval.

Started from branch commit:

- `aa2d6d008f27fafde422c39bee097582013cf4bf` — `docs(mobile): mark P22 complete`

Implementation commits:

- `225c20307872290c7a43a5a4673aef5fc4be334e` — `feat(mobile): complete P23 chef application status flow`
- `06747a45ac28431ecb70ea308954f98d527ea700` — `fix(mobile): satisfy P23 async handler lint policy`

Validated implementation commit:

- `06747a45ac28431ecb70ea308954f98d527ea700`

## Exact Chef Application Contract Used

Authenticated routes owned by P23:

- `GET /api/v1/chef/application`
- `POST /api/v1/chef/application`

`GET /api/v1/chef/application` returns the signed-in user's current application. When no database row exists, the backend service returns a synthetic `NOT_SUBMITTED` response rather than requiring the client to invent that state.

P23 mutation request — `ChefApplicationRequest`:

- `email` — required, valid email,
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

The current P23 UI submits only user-entered fields. Optional latitude/longitude are not fabricated.

Chef application response status values:

- `NOT_SUBMITTED`
- `PENDING`
- `APPROVED`
- `REJECTED`

The response also carries the application/profile fields plus `rejectionReason`, submission/review metadata, and KYC document metadata.

Authoritative static sources:

- `services/user-chef-service/src/main/java/in/craves/userchef/web/ChefApplicationController.java`
- `services/user-chef-service/src/main/java/in/craves/userchef/web/ApiDtos.java`
- `services/user-chef-service/src/main/java/in/craves/userchef/service/ChefApplicationService.java`
- `services/user-chef-service/src/main/java/in/craves/userchef/exception/AppErrorHandler.java`
- `services/user-chef-service/src/main/resources/db/migration/V1__user_chef_schema.sql`

No user-chef-service OpenAPI file exists in the current repository. Current Spring controller/DTO/service/schema sources were therefore used as the static contract; no endpoint or payload was invented.

## Accepted Behavior

### Initial application

- P21 remains the authority that routes a Customer-only identity requesting Chef access into `CHEF_ONBOARDING`.
- `NOT_SUBMITTED` routes to the Chef application form.
- The form is submit-capable only while account resolution remains `CHEF_ONBOARDING / NOT_SUBMITTED` or `CHEF_ONBOARDING / REJECTED`.
- Required text is trimmed; email is trimmed/lowercased.
- Blank optional strings are omitted instead of fabricated.
- Validation bounds now match the current Chef application database columns rather than imposing unsupported client-only pincode/name/address limits.
- The client changes local status to `PENDING` only after `POST /api/v1/chef/application` returns a server-confirmed `PENDING` response.
- Duplicate/redundant client submission is blocked when the authoritative local onboarding state is already pending or approved.

### Rejected application / resubmission

- A rejected application is re-read from the backend before editing.
- Existing application values are prefilled without inventing missing values.
- `rejectionReason` is surfaced as a review note when present.
- Resubmission uses the same exact backend POST contract; the backend service is responsible for clearing rejection/review metadata and returning the new status.
- If the status changes while the rejected form is loading, the client follows the newly observed backend state instead of continuing with stale rejection state.

### Pending / rejected / approved status

- The status screen refreshes `GET /api/v1/chef/application` on entry and provides an explicit refresh action; it does not poll aggressively.
- `PENDING` remains locked from Chef mode.
- `REJECTED` exposes the backend rejection reason and a real update/resubmit route.
- `NOT_SUBMITTED`, if observed from a stale status route, returns to the application form.
- `APPROVED` is not trusted by itself to grant Chef access. The client re-runs the P21 account-resolution authority, which requires both the approved application and `/api/v1/auth/me` to contain the `CHEF` role before storing the approved Chef flow.
- A backend application/role mismatch continues to fail closed through `CHEF_AUTHORIZATION_STATUS_MISMATCH`.
- No client action can place `APPROVED` into `CHEF_ONBOARDING` state; the P23 reducer accepts only non-approved onboarding statuses.

### Validation / errors

- Backend `VALIDATION_FAILED` details are reconciled only onto known Chef application form fields.
- Unknown server validation fields are not guessed into the form.
- Non-field failures remain normalized form-level errors.
- Raw backend stack traces remain protected by the shared HTTP error layer.

## Changed Files

Validated P23 implementation changes from `aa2d6d008f27fafde422c39bee097582013cf4bf` through `06747a45ac28431ecb70ea308954f98d527ea700` are limited to:

- `apps/mobile/src/features/auth/api/profileApi.test.ts`
- `apps/mobile/src/features/auth/domain/chefApplicationOnboarding.ts`
- `apps/mobile/src/features/auth/domain/chefApplicationOnboarding.test.ts`
- `apps/mobile/src/features/auth/screens/ChefAccountStatusScreen.tsx`
- `apps/mobile/src/features/auth/screens/ChefRegistrationScreen.tsx`
- `apps/mobile/src/features/auth/state/authSlice.ts`
- `apps/mobile/src/features/auth/state/authSlice.test.ts`
- `apps/mobile/src/utils/validation.ts`

No backend, OpenAPI, APIM, infrastructure, Android native build configuration, KYC upload implementation, Chef product shell, or P24+ product behavior was changed.

## Validation Evidence

Workflow:

- `.github/workflows/mobile-phase1-ci.yml`
- final GitHub Actions run ID: `31222819644`
- validated head SHA: `06747a45ac28431ecb70ea308954f98d527ea700`
- conclusion: **SUCCESS**

Successful gates:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node 22.13 setup,
3. `npm ci`,
4. strict TypeScript (`tsc --noEmit`),
5. ESLint with zero warnings,
6. Jest including focused P23 exact-contract/onboarding/state tests and prior regression suites,
7. production Android JavaScript bundle generation with `react-native bundle`,
8. backend/APIM/infrastructure source-change guard.

The first implementation run `31222666956` passed TypeScript and then stopped on four ESLint `no-void` warnings in new async UI handlers. Commit `06747a45ac28431ecb70ea308954f98d527ea700` corrected only that lint policy issue; the full workflow then passed.

Per rebuild policy, no Java/Gradle/APK packaging was performed for this phase.

## Visual QA

The 183-page master guide does not define the separate Chef application as a dedicated pixel-reference implementation; it defines role-aware authentication destinations and backend-authoritative Chef eligibility/status. P23 therefore retains the established auth/onboarding component language and records code/static-contract acceptance. Physical-device visual certification remains a later visual QA gate.

## Blockers

None for P23 implementation/static-contract acceptance.

Fresh live APIM/device runtime certification is not claimed by this phase.

## Explicitly Not Implemented

- Chef KYC proof-file upload,
- Chef kitchen/menu/dashboard/product shell,
- P24 complete logout/revoke/private-cache/private-store cleanup,
- customer/chef bottom-tab product shells,
- checkout/payment/product phases,
- 52-reference visual certification,
- final APK/AAB or release certification.

## Next Phase

**P24 — Logout Cleanup — NONE AUTHORIZED.**

Stop after P23 and wait for explicit user authorization before implementing P24.
