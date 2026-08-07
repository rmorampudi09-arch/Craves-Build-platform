# P15 — Customer Email/Password Sign-In Evidence

## Phase boundary

- Phase: **P15 — Customer Email/Password Sign-In**
- Status: **DONE at implementation level**
- Started from branch HEAD: `4007a0496fe36993a2b3fedb96bf4343a384deef`
- Validated implementation commit: `595bdf73a2afefc58554b0d3cd3beda600d8aa6c`
- Guide: full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`
- Guide reference: Screen 03 / Reference Image 03 — Customer Email and Password Sign-In, pages 29–31 (`image3.jpeg`)
- Visual QA: source/guide traceability completed; physical-device pixel-perfect screenshot certification remains deferred to the later visual-QA phases.
- APK built: **No**, per implementation-phase policy.

## Changed implementation files

- `apps/mobile/src/features/auth/domain/emailSignInPolicy.ts`
- `apps/mobile/src/features/auth/domain/emailSignInPolicy.test.ts`
- `apps/mobile/src/features/auth/screens/EmailSignInScreen.tsx`
- `apps/mobile/src/features/auth/state/authService.ts`

## Accepted behavior

- Reuses the existing role-aware auth shell, role selector, hero, inputs, buttons, security note, auth store, Firebase integration, and CRAVES session boundary; no parallel auth stack was introduced.
- Customer email submission is normalized with trim + lowercase while the password is passed through exactly as entered.
- Email and password validation remain field-specific and are shown inline after the corresponding field is touched or a submit is attempted.
- The Login CTA and keyboard submit remain disabled/guarded until the form is valid, and a synchronous request gate prevents same-tick duplicate login requests in addition to the visible loading/disabled state.
- Email/password controls are disabled while a login request is active so role/method/recovery navigation cannot race the in-flight credential attempt.
- Firebase credential failures for wrong password, invalid credential, missing user, and provider-invalid email map to the same `INVALID_CREDENTIALS` public message so the client does not disclose account existence.
- Password visibility is an accessible real control with explicit Show/Hide labels and no password transformation.
- Android autofill/password-manager metadata is provided for email and current password fields without persisting raw credentials in app storage.
- Forgot Password preserves the current selected role and prefills only a valid normalized email; an invalid email is not forwarded as a recovery prefill.
- Continue with phone number preserves the selected role and remains unavailable during an active email login.
- Authentication chrome policy remains unchanged: customer/chef bottom navigation, View Cart, and authenticated header controls remain absent on the auth route.
- Existing `PHONE_VERIFICATION_REQUIRED` recovery continues to replace the route with role-preserving phone sign-in rather than creating a fake credential success.

## Authentication/API boundary

P15 adds **no new APIM endpoint** and changes no backend/APIM/infrastructure source.

The accepted credential chain remains:

`EmailSignInScreen.submit()` -> `createEmailSignInSubmission(role, email, password)` -> `authService.emailLogin(normalizedEmail, originalPassword)` -> `firebaseAuth.signInWithEmail()` -> React Native Firebase `signInWithEmailAndPassword(getAuth(), email, password)` -> Firebase ID token -> existing `POST /api/v1/auth/firebase/exchange` wrapper -> `sessionManager.acceptTokenPair()`.

`POST /api/v1/auth/firebase/exchange` remains `CONTRACT_ONLY` under the accepted P02 static contract inventory. P19 owns granular Firebase-to-CRAVES exchange acceptance/runtime verification, P20 owns restore/refresh lifecycle acceptance, and P21 owns authoritative backend identity/role/onboarding resolution. P15 does not claim those later phases complete.

Password recovery implementation itself remains owned by P18; P15 only supplies the valid normalized prefill/navigation boundary required by Screen 03.

## Validation evidence

GitHub Actions workflow: `.github/workflows/mobile-phase1-ci.yml`

- Run ID: `31213256378`
- Head SHA: `595bdf73a2afefc58554b0d3cd3beda600d8aa6c`
- Conclusion: **SUCCESS**

Passed steps:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node 22.13.0 setup,
3. `npm ci`,
4. strict TypeScript — `npx tsc --noEmit`,
5. ESLint — `npm run lint -- --max-warnings=0`,
6. Jest — includes `emailSignInPolicy.test.ts` plus existing regression suites,
7. production Android JavaScript bundle generation via `react-native bundle`,
8. backend/APIM/infrastructure source-change guard against baseline `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`.

## Phase stop

P15 is complete at the authorized implementation boundary. **P16 — Chef Email/Password Sign-In is not authorized by this phase and was not implemented.**
