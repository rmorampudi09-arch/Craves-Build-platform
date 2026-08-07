# CRAVES Mobile Build / Implementation Ledger

**Purpose:** Authoritative living record for the current mobile rebuild. Read this before changing code. Do not infer completion from old APKs, old branches, screenshots, historical documents, or prior chat claims.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`

**Authoritative rebuild branch:** `mobile-ui-rebuild-from-scratch`

**Mobile workspace:** `apps/mobile`

**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`

**Implementation guide:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, 52 embedded reference images.

**Build policy:** Code-level validation during implementation. **No APK per phase.** Final Android APK/AAB only after all implementation/QA gates in `phases.md` are complete.

**Historical preservation:** The complete ledger state through P12 is preserved at `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P12.md`. P13–P18 each have dedicated evidence under `docs/mobile-ui-rebuild/`.

---

## 1. Current Control State

- **P00 — Execution Documents and Source Lock: DONE**.
- **P01 — Repository Architecture Inventory: DONE**.
- **P02 — APIM/OpenAPI Contract Inventory: DONE**.
- **P03 — Runtime Configuration and Environment Boundary: DONE**.
- **P04 — Design Token Baseline: DONE**.
- **P05 — Shared Motion and Reduced-Motion Baseline: DONE**.
- **P06 — Shared Interaction Primitives: DONE**.
- **P07 — Shared Screen/Lifecycle Primitives: DONE**.
- **P08 — Query/Store Provider and Cache Rules: DONE**.
- **P09 — Typed HTTP Client Foundation: DONE**.
- **P10 — Session Token Security Foundation: DONE**.
- **P11 — Root Navigation and Typed Route Policy: DONE**.
- **P12 — Role Selection UI and State: DONE**.
- **P13 — Customer Phone Sign-In Visual + Interaction: DONE** at implementation level; device pixel-certification remains a later visual-QA gate.
- **P14 — Chef Phone Sign-In Visual + Interaction: DONE** at implementation level; device pixel-certification remains a later visual-QA gate.
- **P15 — Customer Email/Password Sign-In: DONE** at implementation level; device pixel-certification remains a later visual-QA gate.
- **P16 — Chef Email/Password Sign-In: DONE** at implementation level; device pixel-certification remains a later visual-QA gate.
- **P17 — OTP Verification, Resend, Expiry, Rate Limit: DONE** at implementation level.
- **P18 — Password Recovery Flow: DONE** at implementation level.

P18 completion evidence:

- Validated P18 implementation commit: `e8c7f280ab68801b3a420ff93b7c07b7e15cb1ce`.
- Evidence commit: `fcca218bc4224e55f4318715f70f6e141bee1d7e`.
- Evidence: `docs/mobile-ui-rebuild/P18_PASSWORD_RECOVERY_FLOW.md`.
- CI run: `31217157970` — **SUCCESS**.

**Next phase in sequence:** **P19 — Firebase -> CRAVES Exchange**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop and wait for the user to explicitly start/continue P19. Do not pre-implement P19.

---

## 2. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Run:

- GitHub Actions run ID: `31217157970`
- Head SHA: `e8c7f280ab68801b3a420ff93b7c07b7e15cb1ce`
- Phase: **P18 — Password Recovery Flow**
- Conclusion: **SUCCESS**

Successful checks:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node setup,
3. `npm ci`,
4. strict TypeScript (`tsc --noEmit`),
5. ESLint with zero warnings,
6. Jest including focused P18 recovery-policy/Firebase error-mapping tests and prior auth regressions,
7. production Android JavaScript bundle generation with `react-native bundle`,
8. backend/APIM/infrastructure source-change guard.

This workflow intentionally does **not** perform Java/Gradle/APK packaging. That remains the implementation-phase policy.

---

## 3. P18 Accepted Password-Recovery Boundary

P18 completes the existing typed forgot-password flow without creating another authentication architecture or inventing a CRAVES/APIM password-recovery route.

Key P18 files:

- `apps/mobile/src/features/auth/screens/ForgotPasswordScreen.tsx`
- `apps/mobile/src/features/auth/screens/PasswordResetSentScreen.tsx`
- `apps/mobile/src/features/auth/domain/passwordRecoveryPolicy.ts`
- `apps/mobile/src/features/auth/domain/passwordRecoveryPolicy.test.ts`
- `apps/mobile/src/features/auth/firebase/firebaseAuthError.ts`
- `apps/mobile/src/features/auth/firebase/firebaseAuthError.test.ts`
- `apps/mobile/src/features/auth/state/authService.ts`

Accepted P18 behavior:

- Recovery email is validated before request and normalized by trimming/lower-casing.
- Invalid-email feedback is field-specific and submission remains disabled while invalid.
- Busy state disables the input/action and a synchronous request gate prevents same-tick duplicate reset requests.
- Customer/Chef role context is preserved through forgot-password submission, Reset Sent state, and return to email login.
- React Native Firebase `sendPasswordResetEmail` remains the recovery provider.
- Firebase account-specific outcomes such as user-not-found and disabled account resolve through the same neutral sent state as an accepted reset request.
- The Reset Sent copy does not claim that an account exists; it says only that if a Craves account exists, a secure reset link will be sent.
- Network, throttling, and provider/internal failures use generic public recovery messages and do not expose raw provider text.
- Successful submission replaces the forgot-password route, avoiding accidental resubmission through normal back behavior.
- Back-to-login resets the auth stack to `RoleSelection -> EmailSignIn` with role and normalized email preserved, avoiding duplicate login-route stacking.
- No password, reset credential, or provider-internal detail is logged or persisted by P18.

### P18 authentication/API boundary

P18 adds no APIM endpoint and changes no backend/APIM/infrastructure source.

The accepted recovery path is:

`EmailSignInScreen` -> typed `ForgotPassword {role, email?}` -> `authService.sendPasswordReset(normalizedEmail)` -> React Native Firebase `sendPasswordResetEmail` -> neutral typed `PasswordResetSent {role, email}` -> controlled return to `EmailSignIn`.

P18 does **not** claim P19 acceptance or runtime verification of `POST /api/v1/auth/firebase/exchange`; P19 remains the owning phase for that exact boundary.

Visual/device note: P18 retains the accepted auth composition while completing recovery behavior/accessibility. Physical-device visual certification remains a later QA gate.

---

## 4. Current Architecture Ownership After P18

### Navigation

- Application `NavigationContainer`: `app/navigation/AppNavigator.tsx` only.
- Typed route/domain definitions: `app/navigation/types.ts`.
- `ForgotPassword` carries `{role, email?}` and `PasswordResetSent` carries `{role, email}`.
- Bottom-nav/View-Cart/immersive policy: `app/navigation/navigationPolicy.ts`.
- Fail-closed anonymous deep-link validation: `app/navigation/deepLinkPolicy.ts`.

### Authentication role and sign-in state

- Shared current-attempt role: `features/auth/state/authSlice.ts` (`auth.selectedRole`).
- Auth-route role synchronization: `features/auth/hooks/useAuthAttemptRole.ts`.
- Customer/Chef phone, email, OTP, and recovery screens share one authentication engine; selected role is not treated as authoritative backend authorization.

### Auth input/recovery policy

- Phone sanitization/validation/E.164 normalization and request gate: `features/auth/domain/phoneSignInPolicy.ts`.
- Email sign-in normalization/field validation/request gate: `features/auth/domain/emailSignInPolicy.ts`.
- OTP validation/resend/recovery policy: `features/auth/domain/otpVerificationPolicy.ts`.
- Password recovery normalization/neutral copy/request gate/role context: `features/auth/domain/passwordRecoveryPolicy.ts`.
- Native Firebase operations: `features/auth/firebase/firebaseAuth.ts`.
- Firebase public error normalization, including non-enumerating recovery handling: `features/auth/firebase/firebaseAuthError.ts`.
- Shared Firebase/CRAVES orchestration: `features/auth/state/authService.ts`.

### Session/security

- Access token: process memory only through `core/security/tokenMemory.ts`.
- Refresh credential: platform-secure storage only through `core/security/refreshTokenStore.ts`.
- Token acceptance/restore/refresh/local-clear owner: `features/auth/api/sessionManager.ts`.
- Authenticated bearer injection and one-shot 401 replay: accepted P09 `core/http/apiClient.ts` boundary.

### Later-phase boundaries not pulled into P18

- P19 owns Firebase-to-CRAVES exchange acceptance against the exact approved contract.
- P20 owns startup restore/silent-refresh lifecycle UX.
- P21 owns authoritative backend identity/role/onboarding resolution.
- P22/P23 own customer completion and Chef application/status flows.
- P24 owns full logout/revoke plus private cache/store/role cleanup orchestration.
- P25 onward owns product-shell and marketplace functionality.

---

## 5. Current Auth/API Contract Status

Current coded paths remain governed by P02, including:

- `POST /api/v1/auth/firebase/exchange` — `CONTRACT_ONLY`
- `POST /api/v1/auth/refresh` — `CONTRACT_ONLY`
- `POST /api/v1/auth/logout` — `CONTRACT_ONLY`
- `GET /api/v1/auth/me` — `BLOCKED` under accepted static repository evidence
- `GET /api/v1/customer/profile` — `BLOCKED`
- `PUT /api/v1/customer/profile` — `BLOCKED`
- `GET /api/v1/chef/application` — `BLOCKED`
- `POST /api/v1/chef/application` — `BLOCKED`

P18 does not invent, alter, or claim runtime verification of these routes or payloads.

---

## 6. Mini-Phase Status Mapping

| Phase | Status | Evidence/Reason |
|---|---|---|
| P00–P09 | **DONE** | Preserved in historical ledgers and dedicated evidence. |
| P10 Session Token Security | **DONE** | Secure token boundary accepted; CI `31208468433`. |
| P11 Root Navigation | **DONE** | Typed route/chrome/deep-link policy accepted; CI `31209520350`. |
| P12 Role Selection | **DONE** | Shared current-attempt role and auth-route synchronization accepted; CI `31210359665`. |
| P13 Customer Phone Sign-In | **DONE** | Customer phone validation/request guard/native Firebase initiation accepted; CI `31211607174`. |
| P14 Chef Phone Sign-In | **DONE** | Chef-specific role/copy/submission behavior accepted through shared phone engine; CI `31212292710`. |
| P15 Customer Email Sign-In | **DONE** | Customer credential UI/validation/request behavior accepted; CI `31213256378`. |
| P16 Chef Email Sign-In | **DONE** | Chef role preservation through shared email engine accepted; CI `31214293358`. |
| P17 OTP | **DONE** | OTP input, duplicate guards, resend deadline, invalid/expired/rate-limit/network recovery, accessibility and focused tests accepted; CI `31215342272`. |
| P18 Password Recovery | **DONE** | Neutral recovery outcome, account-enumeration protection, role continuity, validation/loading/error handling, deterministic navigation, and focused tests accepted; CI `31217157970`. |
| P19 Firebase -> CRAVES Exchange | PARTIAL / existing baseline | Mobile code exists; exact route remains `CONTRACT_ONLY` under P02. |
| P20 Session Restore/Refresh | PARTIAL / foundation exists | P10/P11 foundations exist; lifecycle/root UX acceptance pending. |
| P21 Identity/Role Resolution | PARTIAL / existing baseline | `/me` code exists; exact contract remains `BLOCKED` under P02. |
| P22 Customer Registration | PARTIAL / existing baseline | Customer profile contracts remain `BLOCKED`. |
| P23 Chef Application Status | PARTIAL / existing baseline | Chef application contracts remain `BLOCKED`. |
| P24 Logout Cleanup | PARTIAL / foundation exists | Full private cache/store/role cleanup acceptance remains later. |
| P25 onward | NOT STARTED / not accepted | Product/customer/chef phases have not been accepted under this rebuild protocol unless a later record explicitly says otherwise. |

---

## 7. Explicitly Not Complete After P18

Do not describe any of the following as complete:

- runtime/backend/APIM resolution of P02 `CONTRACT_ONLY` and `BLOCKED` routes,
- authoritative full APIM/OpenAPI restoration,
- full P19/P20/P21/P22/P23/P24 auth/account lifecycle acceptance,
- authoritative Chef approval/status resolution after credentials,
- physical-device pixel-perfect certification of accepted auth references or the remaining reference set,
- Customer product refs beyond the accepted auth phases,
- Chef product refs beyond the accepted auth visual states,
- Customer/chef bottom-tab product shells,
- View Cart authoritative UI/cart synchronization,
- authenticated product/resource deep links and notification routing,
- checkout/payment end-to-end flow,
- full lifecycle/accessibility/performance/security audits,
- 52-reference visual certification,
- production APK/AAB/signing/release readiness.

---

## 8. Phase Completion Recording Protocol

After every authorized phase, record:

```text
Phase: Pxx — Title
Status: DONE | PARTIAL | BLOCKED
Started from commit: <sha>
Completed at commit: <sha>
Guide references: <screen refs/pages>
Changed files: <exact paths>
APIM/contracts used: <exact route/method/model source>
Behavior completed: <bounded summary>
Tests/checks: <results/run id>
Visual QA: <deferred or evidence>
Blockers: <none or exact missing dependency>
Next phase: NONE AUTHORIZED — waiting for user
```

Preserve useful prior history under `docs/mobile-ui-rebuild/` before compacting this living ledger.

---

## 9. Recent Phase History

### P13 — Customer Phone Sign-In Visual + Interaction

- Status: **DONE** at implementation level.
- Validated implementation commit: `40e43930c1026b3805332e9d41e75fefc2457b17`.
- Evidence: `docs/mobile-ui-rebuild/P13_CUSTOMER_PHONE_SIGN_IN_VISUAL_INTERACTION.md`.
- CI: `31211607174` — **SUCCESS**.

### P14 — Chef Phone Sign-In Visual + Interaction

- Status: **DONE** at implementation level.
- Validated implementation commit: `2735e0fa0d352863cda16ac480939b1862c1b483`.
- Evidence: `docs/mobile-ui-rebuild/P14_CHEF_PHONE_SIGN_IN_VISUAL_INTERACTION.md`.
- CI: `31212292710` — **SUCCESS**.

### P15 — Customer Email/Password Sign-In

- Status: **DONE** at implementation level.
- Validated implementation commit: `595bdf73a2afefc58554b0d3cd3beda600d8aa6c`.
- Evidence: `docs/mobile-ui-rebuild/P15_CUSTOMER_EMAIL_SIGN_IN.md`.
- CI: `31213256378` — **SUCCESS**.

### P16 — Chef Email/Password Sign-In

- Status: **DONE** at implementation level.
- Validated implementation commit: `44f82184f169e3c01363658e8bd1c33eca3a85cc`.
- Evidence: `docs/mobile-ui-rebuild/P16_CHEF_EMAIL_SIGN_IN.md`.
- CI: `31214293358` — **SUCCESS**.

### P17 — OTP Verification, Resend, Expiry, Rate Limit

- Status: **DONE** at implementation level.
- Validated implementation commit: `9400a269d6f750712227550c27df4430cc00853c`.
- Evidence: `docs/mobile-ui-rebuild/P17_OTP_VERIFICATION_RESEND_EXPIRY_RATE_LIMIT.md`.
- CI: `31215342272` — **SUCCESS**.

### P18 — Password Recovery Flow

- Status: **DONE** at implementation level.
- Validated implementation commit: `e8c7f280ab68801b3a420ff93b7c07b7e15cb1ce`.
- Evidence commit: `fcca218bc4224e55f4318715f70f6e141bee1d7e`.
- Evidence: `docs/mobile-ui-rebuild/P18_PASSWORD_RECOVERY_FLOW.md`.
- Changed implementation files: `ForgotPasswordScreen.tsx`, `PasswordResetSentScreen.tsx`, `passwordRecoveryPolicy.ts`, `passwordRecoveryPolicy.test.ts`, `firebaseAuthError.ts`, `firebaseAuthError.test.ts`, `authService.ts`.
- API/contracts used: existing React Native Firebase `sendPasswordResetEmail`; no new or changed APIM route.
- Behavior completed: normalized/validated email recovery, duplicate-request protection, non-enumerating provider outcome mapping, neutral Reset Sent copy, role continuity, controlled back/login navigation, safe operational errors, and focused regression tests.
- Tests/checks: GitHub Actions run `31217157970` — **SUCCESS**.
- Visual QA: existing auth composition retained; physical-device visual certification deferred.
- APK built: **No**, per implementation-phase policy.
- Backend/APIM/infrastructure source changed: **No**.
- Blockers: none to the bounded P18 implementation acceptance.
- Next phase: **NONE AUTHORIZED — waiting for user**.

---

## 10. Current Next Step

**Stop here.**

P18 is complete at the authorized implementation boundary. **P19 — Firebase -> CRAVES Exchange** is next in `phases.md`, but it is **not authorized** by completion of P18. Begin P19 only after the user explicitly says to continue/start the next phase.
