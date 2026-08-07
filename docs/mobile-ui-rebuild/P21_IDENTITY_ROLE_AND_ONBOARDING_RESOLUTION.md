# P21 — Identity, Role, and Onboarding Resolution

## Status

**DONE at mobile implementation/static-contract level.**

P21 was explicitly authorized after P20. This phase is limited to authoritative authenticated identity resolution, backend role authorization, and routing to the correct existing Customer/Chef onboarding/account-status boundary. P22 Customer profile completion and P23 Chef application submission/status UX are not implemented here.

## Starting point

- Branch: `mobile-ui-rebuild-from-scratch`
- Started from commit: `70dd5a9b85739cc2026be058907d07b432255d6b`
- Validated P21 implementation commit: `e4fd28ed9f9d79eca509bee79f566f648c50e161`

## Governing sources audited

P21 was implemented against the current branch copies of:

- `agent.md`
- `build.md`
- `phases.md`
- `plan.md`
- full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`
- `openapi/auth-service-v1.yaml`
- `services/auth-service/src/main/java/in/craves/auth/web/AuthController.java`
- `services/auth-service/src/main/java/in/craves/auth/service/AuthService.java`
- `services/user-chef-service/src/main/java/in/craves/userchef/web/CustomerProfileController.java`
- `services/user-chef-service/src/main/java/in/craves/userchef/service/CustomerProfileService.java`
- `services/user-chef-service/src/main/java/in/craves/userchef/web/ChefApplicationController.java`
- `services/user-chef-service/src/main/java/in/craves/userchef/service/ChefApplicationService.java`

## Exact identity contract

P21 uses the existing approved Auth Service contract:

- Method/path: `GET /api/v1/auth/me`
- Authentication: Craves bearer access token through the established authenticated HTTP client
- Success envelope: `MeResponse`
- Authoritative identity fields used by P21:
  - `status`
  - `roles`
- Current role values: `CUSTOMER`, `CHEF`, `ADMIN`
- Current identity status values: `ACTIVE`, `SUSPENDED`

The current OpenAPI and Spring implementation agree that `/me` loads the current server identity, enforces active identity status, reads role mappings from the backend, and returns those roles. P21 therefore treats `/me` as the authority for Customer/Chef authorization rather than trusting the role selected before sign-in.

## Existing onboarding/status contracts used for resolution

P21 reuses the current user/chef service reads only to decide which already-registered onboarding boundary should render:

### Customer profile existence

- Method/path: `GET /api/v1/customer/profile`
- Existing profile -> Customer onboarding state `READY`
- Exact absent-profile outcome: HTTP 404 with code `CUSTOMER_PROFILE_NOT_FOUND` -> `PROFILE_REQUIRED`

P21 does not submit or edit the customer profile. That remains P22.

### Chef application status

- Method/path: `GET /api/v1/chef/application`
- Existing status values: `NOT_SUBMITTED`, `PENDING`, `APPROVED`, `REJECTED`
- No application -> service returns `NOT_SUBMITTED`

P21 does not submit/resubmit the Chef application or implement the complete status experience. That remains P23.

## Authoritative resolution behavior

### Selected role is intent, not authority

`selectedRole` is preserved only as the user's requested authentication mode. After CRAVES authentication succeeds, the application does not use `selectedRole` by itself to authorize the Customer or Chef authenticated root.

The authenticated flow first enters the account-resolution boundary and performs `GET /api/v1/auth/me`. The returned server identity replaces the provisional token-response identity in auth state together with the resolved account flow.

### Customer resolution

A requested Customer flow is accepted only when `/me` contains the backend `CUSTOMER` role. Customer profile existence is then checked:

- profile exists -> Customer `READY`,
- exact `CUSTOMER_PROFILE_NOT_FOUND` -> Customer `PROFILE_REQUIRED`,
- all other failures remain recoverable errors rather than being misclassified as onboarding.

### Chef resolution

A requested Chef flow first requires the backend Customer baseline role and reads the Chef application state.

- `NOT_SUBMITTED`, `PENDING`, or `REJECTED` with no backend `CHEF` role -> Chef onboarding boundary; Chef operational authorization remains locked.
- `APPROVED` plus backend `CHEF` role -> authorized Chef flow.
- `APPROVED` without backend `CHEF`, or backend `CHEF` while application is not approved -> fail closed with `CHEF_AUTHORIZATION_STATUS_MISMATCH`.

This matches the current backend approval implementation, where Chef approval grants the `CHEF` role through the Auth Service. The client never grants or synthesizes that role.

### Navigation/root behavior

`AppNavigator` no longer selects an authenticated Customer/Chef branch directly from `auth.selectedRole`.

The authenticated sequence is now:

`authenticated session` -> `AccountResolutionNavigator` -> authoritative `/me` + onboarding read -> store `AccountResolution` -> replace with the corresponding Customer or Chef account/onboarding navigator.

This prevents a user from selecting Chef before sign-in and obtaining Chef authorization without the backend `CHEF` role.

### Failure and retry behavior

The account-resolution screen includes:

- one in-flight resolution guard,
- loading state,
- normalized public error copy,
- explicit retry,
- explicit sign-out escape,
- no fake fallback role or simulated approval.

## Auth state model

P21 adds one typed discriminated `AccountResolution` state. It separates:

- `requestedRole` — user intent,
- `authorizedRole` — server-authorized role,
- `onboardingStatus` — bounded state required for the next registered account/onboarding screen.

`accountResolution` is cleared when authentication is newly accepted, bootstrap restarts/fails, the requested role changes, or the user signs out. This prevents a stale resolved role from surviving a new authentication attempt.

## Changed implementation files

Validated P21 implementation changes from start `70dd5a9b85739cc2026be058907d07b432255d6b` through validated head `e4fd28ed9f9d79eca509bee79f566f648c50e161` are limited to:

- `apps/mobile/src/app/navigation/AppNavigator.tsx`
- `apps/mobile/src/features/auth/api/authApi.test.ts`
- `apps/mobile/src/features/auth/domain/types.ts`
- `apps/mobile/src/features/auth/screens/AccountRouterScreen.tsx`
- `apps/mobile/src/features/auth/state/accountResolutionService.ts`
- `apps/mobile/src/features/auth/state/accountResolutionService.test.ts`
- `apps/mobile/src/features/auth/state/authSlice.ts`
- `apps/mobile/src/features/auth/state/authSlice.test.ts`

No backend, OpenAPI, APIM, infrastructure, Android native build configuration, Customer marketplace screen, Chef operational screen, P22 implementation, or P23 submission implementation was changed.

## Focused test coverage

P21 adds/extends coverage for:

- exact `GET /api/v1/auth/me` envelope mapping,
- ready Customer authorization through backend `CUSTOMER` membership,
- exact missing-customer-profile mapping to `PROFILE_REQUIRED`,
- Customer-only identity requesting Chef -> onboarding only, never Chef authorization,
- approved application plus backend `CHEF` role -> authorized Chef resolution,
- Chef application/role mismatch -> fail closed,
- requested Customer role without backend Customer authorization -> rejected,
- auth reducer separation of requested role from resolved authority,
- stale account resolution clearing on new authentication, role change, and sign-out.

## Validation

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Validated head:

- `e4fd28ed9f9d79eca509bee79f566f648c50e161`
- GitHub Actions run: `31220843488`
- Conclusion: **SUCCESS**

Successful gates:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node 22.13 setup,
3. `npm ci`,
4. strict TypeScript (`tsc --noEmit`),
5. ESLint with zero warnings,
6. Jest including focused P21 authority/resolution tests and prior regressions,
7. production Android JavaScript bundle generation,
8. backend/APIM/infrastructure source-change guard.

## Contract/runtime qualification

P21 is accepted at **current repository implementation/static-contract level**. The exact current backend source and OpenAPI were inspected, and the mobile CI passed. This phase does not claim a fresh live APIM/device `/me`, customer-profile, or Chef-application runtime certification.

## Deferred / not claimed

P21 does not claim or implement:

- P22 Customer registration/profile-completion form submission and validation,
- P23 Chef application submission/resubmission and complete pending/rejected/approved UX,
- P24 full logout/revoke/private-cache and role-store cleanup,
- Customer Home or Chef Dashboard product shells,
- role-switch product UI after authentication,
- live APIM/device identity-resolution certification,
- APK/AAB packaging,
- physical-device visual certification.

## Next phase

The sequence names **P22 — Customer Registration/Profile Completion** next.

**Next phase authorization: NONE AUTHORIZED. Stop after P21.**
