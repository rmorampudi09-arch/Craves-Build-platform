# P16 — Chef Email/Password Sign-In Evidence

## Phase boundary

- Phase: **P16 — Chef Email/Password Sign-In**
- Status: **DONE at implementation level**
- Started from accepted P15 branch HEAD: `35835055fcf5c7ed8c7edba5a46add836fc749f6`
- Validated implementation commit: `44f82184f169e3c01363658e8bd1c33eca3a85cc`
- Guide: full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`
- Guide reference: Screen 04 / Reference Image 04 — Chef Email and Password Sign-In (`image4.jpeg`), specification beginning on page 32 and screen-specific implementation prompt beginning on page 33.
- Visual QA: guide/source traceability completed; physical-device pixel-perfect screenshot certification remains deferred to the later visual-QA phases.
- APK built: **No**, per implementation-phase policy.

## Changed implementation files

- `apps/mobile/src/features/auth/domain/emailSignInPolicy.ts`
- `apps/mobile/src/features/auth/domain/emailSignInPolicy.test.ts`
- `apps/mobile/src/features/auth/screens/EmailSignInScreen.tsx`

## Accepted behavior

- Reuses the single role-aware email/password screen and the authentication engine accepted in P15; no separate Chef authentication stack, API client, or navigation container was introduced.
- A typed Chef email submission preserves `CHEF` as the auth-attempt role while the email is trimmed/lowercased and the password is passed through unchanged.
- The existing role-aware `AuthHero`, `RoleSelector`, and Chef-specific approved-account copy continue to render the Chef visual state from the selected role.
- Forgot Password now uses an explicit typed auth-route context helper that preserves the selected Chef role and carries only a valid normalized email prefill.
- Continue with phone number uses the same explicit typed role context and preserves `CHEF`.
- The `PHONE_VERIFICATION_REQUIRED` recovery path also preserves the role from the captured submission snapshot when replacing email sign-in with phone sign-in.
- Existing busy/disabled state prevents role, recovery, or alternate-auth navigation from racing an active credential request.
- Existing password visibility accessibility, autofill metadata, field validation, duplicate-request gate, safe credential error mapping, and raw-credential non-persistence remain shared with Customer sign-in.
- P15 Customer behavior remains covered by the retained regression tests.
- Authentication route policy continues to keep customer/chef bottom navigation, View Cart, and authenticated header controls absent.
- No fake approval, fake login success, TODO, empty handler, mock delay, or fabricated backend response was added.

## Authentication/API boundary

P16 adds **no APIM endpoint** and changes no backend/APIM/infrastructure source.

The credential chain remains:

`EmailSignInScreen.submit()` -> `createEmailSignInSubmission(role, email, password)` -> `authService.emailLogin(normalizedEmail, originalPassword)` -> `firebaseAuth.signInWithEmail()` -> React Native Firebase `signInWithEmailAndPassword(getAuth(), email, password)` -> Firebase ID token -> existing `POST /api/v1/auth/firebase/exchange` wrapper -> `sessionManager.acceptTokenPair()`.

The selected Chef role remains auth-attempt client state at this phase. P16 does **not** treat that selection as authoritative Chef authorization and does not fabricate approval/account-status data. The existing P02 contract status remains authoritative: Firebase exchange is `CONTRACT_ONLY`, while exact identity/role and Chef application capabilities remain blocked under the accepted static inventory. P19 owns Firebase-to-CRAVES exchange acceptance, P21 owns authoritative identity/role resolution, and P23 owns Chef application/onboarding status. P18 owns complete password-recovery acceptance.

## Validation evidence

GitHub Actions workflow: `.github/workflows/mobile-phase1-ci.yml`

- Run ID: `31214293358`
- Head SHA: `44f82184f169e3c01363658e8bd1c33eca3a85cc`
- Conclusion: **SUCCESS**

Passed steps:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node setup,
3. `npm ci`,
4. strict TypeScript — `tsc --noEmit`,
5. ESLint with zero warnings,
6. Jest including focused Chef role-preservation coverage and the retained Customer email-sign-in regressions,
7. production Android JavaScript bundle generation,
8. backend/APIM/infrastructure source-change guard against baseline `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`.

The P16 implementation compare from accepted P15 HEAD to the validated implementation commit contains exactly the three mobile auth files listed above. No backend/APIM/infrastructure source was changed.

## Phase stop

P16 is complete at the authorized implementation boundary. **P17 — OTP Verification, Resend, Expiry, Rate Limit is next but is not authorized by this phase and was not implemented.**
