# P18 — Password Recovery Flow

**Status:** DONE at implementation level

**Branch:** `mobile-ui-rebuild-from-scratch`

**Started after accepted P17 implementation:** `9400a269d6f750712227550c27df4430cc00853c`

**Validated P18 implementation commit:** `e8c7f280ab68801b3a420ff93b7c07b7e15cb1ce`

**CI:** GitHub Actions run `31217157970` — SUCCESS

## Authorized scope

P18 is limited to forgot-password input, Firebase recovery request handling, the Password Reset Sent state, safe account-existence messaging, Customer/Chef role continuity, controlled navigation, validation/loading/error states, and duplicate-request protection. P19 Firebase-to-CRAVES exchange acceptance was not started.

## Existing baseline audited

The pre-P18 implementation already had:

- typed `ForgotPassword` and `PasswordResetSent` routes carrying auth role context,
- React Native Firebase `sendPasswordResetEmail`,
- a basic forgot-password form,
- a basic reset-sent confirmation screen,
- the accepted P15/P16 shared email normalization and request-gate patterns.

P18 completed and hardened that existing path rather than adding a backend endpoint or second auth architecture.

## Changed implementation files

- `apps/mobile/src/features/auth/screens/ForgotPasswordScreen.tsx`
- `apps/mobile/src/features/auth/screens/PasswordResetSentScreen.tsx`
- `apps/mobile/src/features/auth/domain/passwordRecoveryPolicy.ts`
- `apps/mobile/src/features/auth/domain/passwordRecoveryPolicy.test.ts`
- `apps/mobile/src/features/auth/firebase/firebaseAuthError.ts`
- `apps/mobile/src/features/auth/firebase/firebaseAuthError.test.ts`
- `apps/mobile/src/features/auth/state/authService.ts`

## Behavior accepted

### Recovery request

- Email is trimmed/lower-cased before submission.
- Invalid email receives field-specific validation and the request remains disabled.
- Busy state disables editing/submission and a synchronous request gate prevents same-tick duplicate recovery requests.
- The selected Customer/Chef role is preserved through recovery submission and the sent state.
- Firebase remains the accepted password-recovery provider; P18 adds no CRAVES/APIM recovery endpoint.

### Anti-enumeration and errors

Password recovery does not reveal whether the supplied email belongs to a registered or disabled account:

- Firebase `user-not-found` / equivalent credential-state failures resolve through the same neutral sent state as an accepted recovery request.
- Firebase disabled-account outcomes also resolve through that same neutral sent state.
- The confirmation copy states only that if a Craves account exists for the email, a secure reset link will be sent.
- Network failures remain actionable and generic.
- Provider throttling is exposed as a password-recovery-specific generic rate-limit message.
- Other provider/internal failures are mapped to a generic password-recovery failure rather than raw Firebase/provider text.

### Navigation

- Forgot-password back behavior returns to the existing email-login route when possible and uses a typed login fallback when there is no prior route.
- Successful submission replaces the forgot-password route with `PasswordResetSent`, so the form is not accidentally resubmitted by ordinary back navigation.
- `Back to login` resets the auth stack to `RoleSelection -> EmailSignIn` with the selected role and normalized email preserved, preventing duplicate login-route stacking.

## Validation evidence

GitHub Actions run `31217157970` validated implementation commit `e8c7f280ab68801b3a420ff93b7c07b7e15cb1ce` successfully:

1. checkout of `mobile-ui-rebuild-from-scratch`,
2. Node setup and `npm ci`,
3. strict TypeScript (`tsc --noEmit`),
4. ESLint with zero warnings,
5. Jest including focused P18 recovery-policy/error-mapping tests and prior auth regressions,
6. production Android JavaScript bundle generation,
7. backend/APIM/infrastructure source-change guard.

## Build / phase boundary

- No APK/AAB was built, consistent with the implementation-phase policy.
- P18 changes only mobile auth/recovery code and evidence documentation.
- P19 Firebase -> CRAVES exchange acceptance/runtime verification is not started.
- P20+ lifecycle/product phases are not started by P18.

**Next phase:** NONE AUTHORIZED — wait for explicit user authorization before P19.
