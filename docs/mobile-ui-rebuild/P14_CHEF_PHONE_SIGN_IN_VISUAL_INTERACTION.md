# P14 — Chef Phone Sign-In Visual + Interaction

## Phase record

- **Status:** DONE (implementation acceptance; device pixel-certification deferred to later visual-QA gates)
- **Branch:** `mobile-ui-rebuild-from-scratch`
- **Started from commit:** `95da34c3069aeda9a52888924a3df42f8b0dcce9`
- **Primary implementation commit:** `25568bf0284389ad1ad19bfbacffa46566731b9c`
- **Validated implementation commit:** `2735e0fa0d352863cda16ac480939b1862c1b483`
- **Guide reference:** full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, Screen 02 / Reference Image 02 — Chef Phone Number Sign-In, pages 26–27 (`image2.jpeg`).
- **Phase boundary:** P14 only. P15 Customer Email/Password Sign-In is not implemented or accepted by this phase.

## Repository/source review

Before implementation, P14 was checked against `agent.md`, `build.md`, `phases.md`, `plan.md`, the full master guide, the current branch HEAD, the accepted P11/P12/P13 auth architecture, and the existing Firebase/session code. The shared phone-auth path remains authoritative; P14 does not create a separate Chef transport stack.

## Changed implementation files

- `apps/mobile/src/features/auth/screens/PhoneSignInScreen.tsx`
- `apps/mobile/src/features/auth/domain/phoneSignInPolicy.ts`
- `apps/mobile/src/features/auth/domain/phoneSignInPolicy.test.ts`

No backend, APIM, infrastructure, Android-native, or Gradle source was changed.

## Behavior accepted in P14

- Reuses the same role-aware phone sign-in screen and transport accepted in P13 rather than creating a separate Chef login implementation.
- Retains the existing Chef hero/illustration path from `AuthHero` when `role === 'CHEF'` and the shared Customer/Chef segmented selector.
- Adds Chef-specific sign-in guidance so the screen explicitly tells a Chef to use the number linked to the Craves chef account and makes clear that chef access is checked after verification.
- Adds a Chef-specific accessibility hint for the Continue action while preserving the existing Customer wording.
- Creates one immutable submission snapshot containing the current typed role plus normalized E.164 phone number before Firebase initiation.
- Passes that same snapshot to `authService.beginPhone(...)` and `OtpVerification`, preventing role drift between the request and OTP navigation.
- Preserves the Chef role when the alternate email/password action is used.
- Retains the P13 India/+91 validation boundary, paste-safe sanitization, existing Zod validation, loading/disabled states, keyboard submission, accessible request errors, and synchronous duplicate-request gate.
- Mutable role/phone/alternate-login controls remain disabled during an active Firebase verification request.
- Customer and Chef bottom navigation, View Cart, and authenticated header actions remain absent under the accepted immersive-auth route policy.
- Adds focused regression coverage proving both Chef and Customer submission snapshots preserve the intended role and normalized phone.
- No fake OTP success, mock delay, TODO, empty handler, hard-coded authentication success, or fabricated backend capability was introduced.

## Exact authentication/API boundary

P14 does **not** add, change, or claim runtime verification of any APIM endpoint.

The existing shared verification initiation chain remains:

1. `PhoneSignInScreen.submit()` creates `{role, phone}` through `createPhoneSignInSubmission(...)`.
2. `authService.beginPhone(role, e164Phone)` is called.
3. `firebaseAuth.beginPhoneSignIn(e164Phone)` is called.
4. React Native Firebase invokes native `signInWithPhoneNumber(getAuth(), e164Phone)`.
5. The typed `{role, phone}` snapshot is passed to `OtpVerification`.

P17 owns granular OTP verification/resend acceptance. P19 owns Firebase-to-Craves backend exchange acceptance. P21/P23 own authoritative backend identity, Chef-role authorization, application/approval-status resolution, and routing of unapproved/suspended/incomplete Chef accounts. P14 therefore does not infer Chef approval from the UI-selected role and does not simulate approval.

## Tests and CI evidence

Focused `phoneSignInPolicy.test.ts` coverage now includes:

- explicit India/+91 support boundary,
- local and E.164-style pasted number normalization,
- valid/invalid Indian mobile validation and E.164 conversion,
- Chef-specific phone-sign-in guidance,
- Chef role + normalized phone submission snapshot,
- Customer submission regression snapshot,
- duplicate phone-verification request gate behavior.

GitHub Actions workflow: `.github/workflows/mobile-phase1-ci.yml`

Validated commit: `2735e0fa0d352863cda16ac480939b1862c1b483`

Validation run `31212292710` — **SUCCESS**.

Successful checks:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node setup,
3. `npm ci`,
4. strict TypeScript (`tsc --noEmit`),
5. ESLint with `--max-warnings=0`,
6. Jest including P14 role/submission tests and all prior regressions,
7. production Android JavaScript bundle generation,
8. backend/APIM/infrastructure source-change guard.

The P14 compare from `95da34c3069aeda9a52888924a3df42f8b0dcce9` to validated commit `2735e0fa0d352863cda16ac480939b1862c1b483` contains only the three mobile auth implementation/test files listed above.

## Visual QA boundary

P14 is traced against Reference Image 02 and the full-guide Chef Phone Number Sign-In requirements while preserving the accepted shared authentication composition. The Chef hero/art and role-selector path already existed in the shared auth UI; this phase closes the Chef-specific role/copy/submission acceptance without redesigning that component family.

No claim of physical-device pixel-perfect screenshot certification is made here. Emulator/device reference comparison, supported-device matrix verification, and final visual-regression certification remain later QA phases.

## Build/release boundary

- APK/AAB built: **No** — intentionally, per implementation-phase policy.
- Android native/Gradle packaging changed: **No**.
- Backend/APIM/infrastructure source changed: **No**.
- New secret/environment value added: **No**.

## Blockers

None for P14 implementation acceptance. Existing P02 `CONTRACT_ONLY`/`BLOCKED` findings for later backend-auth/account-resolution phases remain explicit and were not bypassed.

## Next phase

**NONE AUTHORIZED — waiting for the user.**

The next phase in `phases.md` is **P15 — Customer Email/Password Sign-In**. Do not begin it without explicit user authorization.
