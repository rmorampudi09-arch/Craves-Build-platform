# P12 — Role Selection UI and State

## Scope

P12 accepts the Customer/Chef role-selection UI and the selected-role state boundary required by `phases.md`, `plan.md`, `agent.md`, and the full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`.

The full master guide's first four authentication references require a Customer/Chef role selector, role-aware copy/art, `selectedRole` state, role preservation while moving between phone login, email login, OTP, forgot-password, and post-authentication routing, and no bottom navigation or Customer View Cart on authentication screens. The specific Customer/Chef phone and email form visuals remain owned by P13–P16; OTP and password-recovery behavior remain owned by P17–P18.

P12 does not change authentication APIs, Firebase behavior, OTP request/verification logic, email credential behavior, backend role authorization, session restoration, customer/chef product shells, or any P13+ visual acceptance.

## Starting point

- Branch: `mobile-ui-rebuild-from-scratch`
- P12 started from branch HEAD: `58d3bc43cd510acb0ef37d7d0ee4d940d62bfe11`
- P11 validated implementation commit: `b7ac5dfd5cfc86d9f17ffdfe7b217430c5b40b58`
- P11 completion-record HEAD: `58d3bc43cd510acb0ef37d7d0ee4d940d62bfe11`

## Existing implementation reviewed

The repository already contained:

- `RoleSelector`, backed by the shared accessible `SegmentedControl`, with Customer/Chef options and selected styling;
- `AuthHero`, with Customer/Chef-specific copy, icons, and illustration assets;
- `auth.selectedRole` in the existing Redux auth slice;
- typed role parameters on phone, email, OTP, forgot-password, and password-reset routes;
- P11's immersive route policy, which explicitly hides bottom navigation and View Cart on `RoleSelection` and all current auth routes.

The P12 gap was state ownership. `RoleSelectionScreen` kept role in local component state and wrote the Redux role only when Continue was pressed. Phone/email screens initialized their visible role from route params, but an entry route could display `CHEF` while shared `auth.selectedRole` still held `CUSTOMER`. Since the authenticated root currently reads `auth.selectedRole`, a direct/alternate auth entry could therefore carry inconsistent role state into post-auth routing.

## Role-attempt state boundary implemented

### Shared auth-attempt role hook

Added `apps/mobile/src/features/auth/hooks/useAuthAttemptRole.ts`.

It provides one current-auth-attempt role owner for role-aware authentication screens:

- initializes from a typed route role when one exists, otherwise from existing `auth.selectedRole`;
- synchronizes a typed route role into the shared auth store on route entry;
- updates visible role and `auth.selectedRole` together when the user switches Customer/Chef;
- keeps the role in process memory only;
- deliberately does not write the role to AsyncStorage, SecureStore, route-independent persistence, or any new storage system.

This follows the phase boundary: preserve role for the current sign-in/recovery attempt without creating a new persistence architecture.

### Role Selection screen

`RoleSelectionScreen` now uses the shared auth-attempt role boundary instead of an isolated local `useState` value.

Consequences:

- selecting Customer/Chef updates the shared role immediately, before Continue;
- existing `AuthHero` copy/art changes from the same selected value;
- the segmented control selected state and Continue CTA label use the same role;
- Continue passes the same typed role into `PhoneSignIn`.

No new role-selection layout, backend call, or product route was invented.

### Role preservation across the existing auth chain

The same boundary is now used by the existing role-bearing authentication routes:

- `PhoneSignInScreen`
- `EmailSignInScreen`
- `OtpVerificationScreen`
- `ForgotPasswordScreen`
- `PasswordResetSentScreen`

This makes the route role and shared auth role agree on entry, preserves role when switching phone/email methods, keeps it through OTP and password recovery, and leaves the selected role intact when authentication transitions the app to its current authenticated root.

No phone/email/OTP/password-recovery business behavior was expanded beyond that role-state synchronization.

## Bottom-navigation and View Cart acceptance

P11's existing centralized route policy remains the owner. `RoleSelection`, `PhoneSignIn`, `EmailSignIn`, `OtpVerification`, `ForgotPassword`, and `PasswordResetSent` are all in `CURRENT_IMMERSIVE_ROUTES`; Auth domain defaults also disable bottom navigation and View Cart eligibility.

P12 introduces no screen-local chrome conditionals and no Customer cart UI.

## Focused tests

Added `apps/mobile/src/features/auth/state/authSlice.test.ts` covering the P12 state contract:

- a new anonymous auth attempt defaults to Customer;
- selecting Chef updates shared selected role immediately;
- selected Chef role survives the authentication state transition used by root routing;
- the same current attempt can switch back to Customer.

Prior P03–P11 tests remain part of the same CI run.

## Validation evidence

Validated implementation commit: `e152bf3e1479010078bb13c99333e12c298676f5`.

GitHub Actions run `31210359665` — **SUCCESS**.

Passed checks:

1. dependency install from lockfile,
2. strict TypeScript (`tsc --noEmit`),
3. ESLint with zero warnings,
4. Jest including the P12 role-state tests and all prior regressions,
5. production Android JavaScript bundle generation,
6. backend/APIM/infrastructure source-change guard.

No Gradle/APK packaging was run, per the implementation-phase build policy.

## Change boundary

Compared with P12 starting commit `58d3bc43cd510acb0ef37d7d0ee4d940d62bfe11`, validated implementation commit `e152bf3e1479010078bb13c99333e12c298676f5` changes only:

- `apps/mobile/src/features/auth/hooks/useAuthAttemptRole.ts`
- `apps/mobile/src/features/auth/screens/RoleSelectionScreen.tsx`
- `apps/mobile/src/features/auth/screens/PhoneSignInScreen.tsx`
- `apps/mobile/src/features/auth/screens/EmailSignInScreen.tsx`
- `apps/mobile/src/features/auth/screens/OtpVerificationScreen.tsx`
- `apps/mobile/src/features/auth/screens/ForgotPasswordScreen.tsx`
- `apps/mobile/src/features/auth/screens/PasswordResetSentScreen.tsx`
- `apps/mobile/src/features/auth/state/authSlice.test.ts`

No backend, APIM, infrastructure, database, Android-native, query-cache, HTTP-client, or token-security source is changed by P12.

## Guide/reference traceability

P12 uses the shared authentication context in full-guide reference images 01–04 (pages 23–33):

- Customer Phone Number Sign-In — role selector, `selectedRole`, customer role-aware illustration/copy, no bottom navigation/cart;
- Chef Phone Number Sign-In — Chef role selection preserved into alternate email flow and later account-status policy;
- Customer Email and Password Sign-In — role selector and `selectedRole`, preserve role through forgot-password and phone-login navigation;
- Chef Email and Password Sign-In — preserve Chef role through password recovery and phone-sign-in navigation, with bottom navigation/cart hidden.

P12 does **not** claim pixel-level device certification of the phone/email forms. Those reference-specific visual gates remain P13–P16. The code-level P12 acceptance is the role selector, role-aware copy/art binding, shared current-attempt state, typed role propagation, and immersive chrome policy.

## Explicit later-phase boundaries

- P13 owns Customer Phone Sign-In visual/interaction acceptance.
- P14 owns Chef Phone Sign-In visual/interaction acceptance.
- P15/P16 own Customer/Chef Email Sign-In visual/interaction acceptance.
- P17 owns OTP acceptance.
- P18 owns password-recovery acceptance.
- P19 owns Firebase-to-CRAVES exchange acceptance against the approved contract.
- P20 owns startup restoration/silent-refresh lifecycle UX.
- P21 owns authoritative backend identity/role/onboarding resolution.
- P24 owns logout/revoke/private-state cleanup and any final role cleanup policy.

P12 stops here and does not pre-implement P13.
