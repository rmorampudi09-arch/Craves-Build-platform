# P22 — Customer Registration/Profile Completion Evidence

## Status

**DONE** at implementation/static-contract level.

P22 is intentionally bounded to the required post-auth customer profile-completion flow. It does not implement the later full Customer Profile/Edit Profile product screens, customer product shell, address flows, Chef onboarding, logout cleanup, or any P23+ behavior.

## Source / Authority Review

Reviewed before implementation:

- `plan.md`
- `phases.md`
- `agent.md`
- `build.md`
- full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`
- current `mobile-ui-rebuild-from-scratch` branch
- current user-chef-service customer-profile controller, DTO, service, validation/error handler, and database schema

The repository/backend contract remains authoritative where the visual/engineering guide is broader. The guide's customer-profile rules requiring typed validation, server-authoritative data, field reconciliation, resilient state-changing actions, and no invented backend contract were applied. Full Edit Customer Profile reference-state implementation remains a later product-screen phase and was not pulled into P22.

## Phase Boundary

Phase: **P22 — Customer Registration/Profile Completion**

Acceptance from `phases.md`:

- exact profile request/response model,
- field-level validation/server mapping.

Started from branch commit:

- `7501e606f16f57db89c385b5bcb5c650510968de` — `docs(mobile): mark P21 complete`

Validated implementation commit:

- `11934d4397b9e39141ce670b9eec3cee5be8e19c` — `feat(mobile): complete P22 customer profile onboarding`

## Exact Customer Profile Contract Used

Authenticated routes:

- `GET /api/v1/customer/profile`
- `PUT /api/v1/customer/profile`

P22 mutation route:

- method/path: `PUT /api/v1/customer/profile`
- request: `CustomerProfileRequest`
  - `firstName: string` — required / non-blank
  - `lastName: string` — required / non-blank
  - `email?: string` — optional, validated as email when supplied
- response: `CustomerProfileResponse`
  - `id`
  - `identityId`
  - `registeredPhoneNumber`
  - `firstName`
  - `lastName`
  - `email`
  - `createdAt`
  - `updatedAt`

Authoritative static sources:

- `services/user-chef-service/src/main/java/in/craves/userchef/web/CustomerProfileController.java`
- `services/user-chef-service/src/main/java/in/craves/userchef/web/ApiDtos.java`
- `services/user-chef-service/src/main/java/in/craves/userchef/service/CustomerProfileService.java`
- `services/user-chef-service/src/main/java/in/craves/userchef/exception/AppErrorHandler.java`
- `services/user-chef-service/src/main/resources/db/migration/V1__user_chef_schema.sql`

No user-chef-service OpenAPI file exists in the current repository. P22 therefore used the current Spring controller/DTO/service/schema implementation as the static contract source and did not invent an OpenAPI route or payload.

## Accepted Behavior

- Customer profile completion remains available only while the authoritative P21 account resolution is `CUSTOMER / PROFILE_REQUIRED`.
- The client fails closed if the account-resolution state is no longer the expected customer profile-completion state.
- Submitted names are trimmed.
- Optional email is trimmed/lowercased and omitted when blank rather than fabricating a value.
- Client customer-profile limits align with the current database contract: first/last name up to 100 characters and email up to 255 characters.
- The existing typed profile API uses exactly `PUT /api/v1/customer/profile` with only the approved request fields.
- On successful server response, the auth account resolution transitions from `PROFILE_REQUIRED` to `READY`; the client does not mark the profile ready before the mutation succeeds.
- Backend `VALIDATION_FAILED` details are preserved only as bounded, user-safe strings by the shared HTTP error layer.
- Known server validation details are reconciled onto `firstName`, `lastName`, and `email`; unknown fields are not guessed into the form.
- Non-field failures remain normalized form-level errors.
- Raw stack traces are still rejected by the public error layer.
- No backend/APIM/infrastructure source was modified.

## Changed Files

Validated implementation changes are limited to:

- `apps/mobile/src/core/http/apiError.ts`
- `apps/mobile/src/core/http/httpFoundation.test.ts`
- `apps/mobile/src/features/auth/api/profileApi.test.ts`
- `apps/mobile/src/features/auth/domain/customerProfileCompletion.ts`
- `apps/mobile/src/features/auth/domain/customerProfileCompletion.test.ts`
- `apps/mobile/src/features/auth/screens/CustomerRegistrationScreen.tsx`
- `apps/mobile/src/features/auth/state/authSlice.ts`
- `apps/mobile/src/features/auth/state/authSlice.test.ts`
- `apps/mobile/src/utils/validation.ts`

## Validation Evidence

Workflow:

- `.github/workflows/mobile-phase1-ci.yml`
- GitHub Actions run ID: `31221757744`
- Head SHA: `11934d4397b9e39141ce670b9eec3cee5be8e19c`
- Conclusion: **SUCCESS**

Successful gates:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node 22.13 setup,
3. `npm ci`,
4. strict TypeScript (`tsc --noEmit`),
5. ESLint with zero warnings,
6. Jest including focused P22 contract/profile-completion/state tests and prior regression suites,
7. production Android JavaScript bundle generation with `react-native bundle`,
8. backend/APIM/infrastructure source-change guard.

Per the rebuild policy, no Java/Gradle/APK packaging was performed for this phase.

## Visual QA

P22 did not authorize or introduce the later full Customer Profile/Edit Profile visual reference screens. Existing onboarding composition was retained; physical-device pixel certification remains in later visual QA gates.

## Blockers

None for P22 acceptance.

Fresh live APIM/device runtime certification is not claimed by this static-contract/code-validation phase.

## Explicitly Not Implemented

- P23 Chef application submission/resubmission/status completion,
- P24 complete logout/revoke/private-cache cleanup,
- customer bottom-tab/product shell,
- full Customer Profile/Edit Profile reference screens,
- address/payment/cart/order/product phases,
- final APK/AAB or release certification.

## Next Phase

**P23 — Chef Application Submission / Status — NONE AUTHORIZED.**

Stop after P22 and wait for explicit user authorization before implementing P23.