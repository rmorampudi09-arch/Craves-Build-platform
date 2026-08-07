# P13 — Customer Phone Sign-In Visual + Interaction

## Phase record

- **Status:** DONE (implementation acceptance; device pixel-certification deferred to later visual-QA gates)
- **Branch:** `mobile-ui-rebuild-from-scratch`
- **Started from commit:** `5f223a9376ecfee6f484a58e99522607e968e56b`
- **Validated implementation commit:** `40e43930c1026b3805332e9d41e75fefc2457b17`
- **Primary implementation commit:** `68753493e98cfcc6c453cd86baf866ac519a9ab4`
- **Guide reference:** full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, Screen 01 / Reference Image 01 — Customer Phone Number Sign-In, pages 23–25 (`image1.jpeg`).
- **Phase boundary:** P13 only. P14 Chef Phone Sign-In was not accepted or advanced by this phase.

## Repository/source review

Before implementation, the phase was checked against `agent.md`, `build.md`, `phases.md`, `plan.md`, the full master guide, the current branch HEAD, and the existing auth/Firebase implementation. The accepted P11 navigation and P12 role-selection architecture remain authoritative.

## Changed implementation files

- `apps/mobile/src/features/auth/screens/PhoneSignInScreen.tsx`
- `apps/mobile/src/features/auth/components/RoleSelector.tsx`
- `apps/mobile/src/features/auth/domain/phoneSignInPolicy.ts`
- `apps/mobile/src/features/auth/domain/phoneSignInPolicy.test.ts`

## Behavior accepted in P13

- Retains the existing reference-aligned auth composition: warm auth shell, role-aware Customer hero/art, segmented role control, auth card, phone field, Flame Red Continue action, email/password alternative, and security note.
- Keeps P11 immersive auth policy intact: Customer bottom navigation, Chef bottom navigation, View Cart, and authenticated header actions are not rendered on the phone sign-in route.
- Keeps P12 role state intact and passes the current typed role through phone -> OTP and phone -> email navigation.
- Makes the supported phone-country boundary explicit and centralized. India is the only currently supported option (`IN`, `+91`, 10 national digits); no unsupported country or backend capability is fabricated.
- Sanitizes typed/pasted input to digits, handles an E.164-style `+91` paste without duplicating the dial code, caps the national number at 10 digits, validates with the existing shared Zod phone schema, and normalizes the submitted value to E.164.
- Keeps Continue disabled until the number is valid and disables mutable auth controls while a verification request is active.
- Supports the Android phone keypad and keyboard Done submission path.
- Separates local field validation from Firebase/request failures so a transport/authentication failure is announced as its own actionable alert rather than being misrepresented as a phone-format error.
- Adds a synchronous request gate in addition to the loading state, preventing rapid duplicate OTP-initiation taps before React can complete a re-render.
- Preserves the submitted role and E.164 phone snapshot for OTP navigation.
- The alternate email/password action remains real and preserves the current role.
- No fake OTP success, placeholder handler, TODO branch, mock delay, or hard-coded authentication success path was introduced.

## Exact authentication/API boundary

P13 does **not** add or change an APIM endpoint.

Phone verification uses the repository's existing native Firebase chain:

1. `PhoneSignInScreen.submit()`
2. `authService.beginPhone(role, e164Phone)`
3. `firebaseAuth.beginPhoneSignIn(e164Phone)`
4. React Native Firebase `signInWithPhoneNumber(getAuth(), e164Phone)`

The Firebase confirmation object remains in the existing Firebase auth module for P17 OTP verification. The Craves backend token exchange (`POST /api/v1/auth/firebase/exchange`) is not called by P13; its phase-specific acceptance remains P19 and its current P02 classification remains `CONTRACT_ONLY`. No backend/APIM/infrastructure source was changed.

## Tests and CI evidence

Focused tests in `phoneSignInPolicy.test.ts` cover:

- explicit India/+91 support boundary,
- local and E.164-style pasted number normalization,
- valid/invalid Indian mobile-number rules and E.164 conversion,
- duplicate request-gate acquisition/release behavior.

GitHub Actions workflow: `.github/workflows/mobile-phase1-ci.yml`

- Initial run `31211527038` correctly failed the zero-warning lint gate on one `no-void` warning in the keyboard-submit handler.
- The handler was corrected without changing phase scope in commit `40e43930c1026b3805332e9d41e75fefc2457b17`.
- Validation run `31211607174` — **SUCCESS**.

Successful checks in run `31211607174`:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node setup,
3. `npm ci`,
4. strict TypeScript (`tsc --noEmit`),
5. ESLint with `--max-warnings=0`,
6. Jest including the new P13 phone-policy tests plus prior regressions,
7. production Android JavaScript bundle generation,
8. backend/APIM/infrastructure source-change guard.

## Visual QA boundary

The P13 code was traced against Reference Image 01 and the master-guide layout/interaction requirements without redesigning the accepted shared auth composition. No claim of pixel-perfect physical-device screenshot certification is made in this phase. Device/reference screenshot comparison, supported-device matrix verification, and final visual-regression certification remain later QA work under the phase plan.

## Build/release boundary

- APK/AAB built: **No** — intentionally, per the implementation-phase policy.
- Android native/Gradle packaging changed: **No**.
- Backend/APIM/infrastructure source changed: **No**.
- Secrets or environment values added to source: **No**.

## Blockers

None for P13 implementation acceptance. Existing P02 `CONTRACT_ONLY`/`BLOCKED` backend-contract findings remain owned by their later phases and were not hidden or bypassed.

## Next phase

**NONE AUTHORIZED — waiting for the user.**

The next phase in `phases.md` is **P14 — Chef Phone Sign-In Visual + Interaction**. Do not begin it without explicit user authorization.
