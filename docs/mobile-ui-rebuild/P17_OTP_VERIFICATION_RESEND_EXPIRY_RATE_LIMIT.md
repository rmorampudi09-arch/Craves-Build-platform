# P17 — OTP Verification, Resend, Expiry, Rate Limit

**Status:** DONE at implementation level

**Branch:** `mobile-ui-rebuild-from-scratch`

**Started from commit:** `56e8b49baccca580b960c7ab6b347fbece2ef8eb`

**Validated implementation commit:** `9400a269d6f750712227550c27df4430cc00853c`

**CI:** GitHub Actions run `31215342272` — SUCCESS

## Authorized scope

P17 is limited to OTP entry, native Firebase verification, resend countdown/eligibility, expiry/rate-limit recovery, focus/accessibility behavior, and duplicate-request protection. P18 password recovery and P19 Firebase-to-CRAVES session-exchange acceptance were not started.

The full CRAVES master guide requires role/phone preservation through the OTP round trip, immersive auth chrome, resend eligibility/countdown, anti-abuse behavior, actionable error states, and accessible status changes. The existing repository architecture and exact runtime contracts remain authoritative.

## Existing baseline audited

The pre-P17 implementation already had:

- one typed `OtpVerification` route carrying `role` and E.164 `phone`,
- native React Native Firebase `signInWithPhoneNumber` initiation,
- in-memory Firebase confirmation state,
- six-digit OTP validation,
- a basic 30-second resend countdown,
- existing Firebase-ID-token to CRAVES exchange orchestration in `authService.confirmOtp`.

P17 hardened that path instead of introducing a second OTP/auth stack.

## Changed implementation files

- `apps/mobile/src/features/auth/screens/OtpVerificationScreen.tsx`
- `apps/mobile/src/features/auth/domain/otpVerificationPolicy.ts`
- `apps/mobile/src/features/auth/domain/otpVerificationPolicy.test.ts`
- `apps/mobile/src/features/auth/firebase/firebaseAuthError.ts`
- `apps/mobile/src/features/auth/firebase/firebaseAuthError.test.ts`
- `apps/mobile/src/features/auth/state/authService.ts`

## Behavior accepted

### OTP input and verification

- OTP input is sanitized to digits and bounded to six characters.
- The field uses Android one-time-code semantics, autofocus, submit handling, and explicit accessibility labels/hints.
- Verification is disabled until a complete code exists and is unavailable while the request is busy, the challenge requires resend, or a local rate-limit cooldown is active.
- A synchronous request gate protects verify/resend in addition to rendered disabled state, preventing same-tick duplicate mutations.
- OTP values are never logged or persisted by P17.

### Resend eligibility

- The resend window is represented by an absolute deadline rather than a decrement-only state timer, so elapsed background time is reflected when the UI clock resumes.
- A successful resend clears the old code/error state, retains the typed role and E.164 phone route context, installs the new Firebase confirmation challenge, and starts a fresh 30-second local resend cooldown.
- Resend availability and successful resend are announced through the platform accessibility API.

### Invalid, expired, and throttled recovery

A centralized Firebase auth error mapper now normalizes provider/internal conditions without exposing raw provider details:

- invalid/missing verification code -> `INVALID_OTP`; clear the entered code and allow another attempt against the current challenge,
- expired Firebase verification session/code, missing in-memory challenge, or unusable confirmation result -> `OTP_EXPIRED`; clear the code, require a fresh challenge, and make resend available,
- Firebase too-many-requests/quota conditions -> `OTP_RATE_LIMITED`; show safe public copy and apply a bounded local minimum cooldown before another verify/resend attempt,
- Firebase network-request-failed -> retriable `NETWORK_ERROR`,
- prior P15/P16 non-disclosing email credential mappings are preserved.

## Rate-limit contract boundary

No CRAVES/APIM OTP-initiation endpoint or typed provider/server `Retry-After` duration is present in the accepted mobile contract for this phase. P17 therefore does not invent a server retry field or claim an exact Firebase retry duration. The 60-second value in `otpVerificationPolicy.ts` is a client-side minimum anti-abuse cooldown after Firebase reports throttling; Firebase remains authoritative and may continue rejecting requests after that local window.

If a future approved backend/provider contract supplies an exact retry window, that duration should replace/extend the local minimum through the typed integration boundary rather than being guessed.

## API / architecture boundary

P17 adds no APIM endpoint and changes no backend, APIM, infrastructure, or database source.

The native verification path remains:

`PhoneSignInScreen` -> `authService.beginPhone(role, E.164 phone)` -> React Native Firebase `signInWithPhoneNumber` -> typed `OtpVerification` route -> Firebase confirmation `confirm(code)`.

After Firebase confirmation succeeds, the existing baseline still proceeds through the already-present CRAVES exchange/session code. P17 does not claim P19 acceptance or runtime verification of `POST /api/v1/auth/firebase/exchange`; that remains a later phase.

## Validation evidence

GitHub Actions run `31215342272` validated implementation commit `9400a269d6f750712227550c27df4430cc00853c` successfully:

1. checkout of `mobile-ui-rebuild-from-scratch`,
2. Node setup,
3. `npm ci`,
4. TypeScript strict check (`tsc --noEmit`),
5. ESLint with zero warnings,
6. Jest including focused OTP policy and Firebase-error-mapping tests plus prior regressions,
7. production Android JavaScript bundle generation,
8. backend/APIM/infrastructure source-change guard.

## Visual QA / build policy

- No separate OTP reference image was introduced or redesigned during P17; the existing auth composition was retained and the behavior/accessibility layer was hardened.
- Physical-device visual certification remains part of the later visual-QA gate.
- No APK/AAB was built, consistent with the implementation-phase policy.

## Boundaries deliberately not pulled forward

- P18 password recovery granular acceptance: not started.
- P19 Firebase -> CRAVES exchange granular acceptance/runtime verification: not started.
- P20 restore/silent-refresh lifecycle: not started by P17.
- P21 authoritative backend identity/role/onboarding resolution: not started by P17.
- Chef approval/application resolution remains later-phase work.

**Next phase:** NONE AUTHORIZED — wait for explicit user authorization before P18.
