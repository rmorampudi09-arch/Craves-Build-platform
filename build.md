# CRAVES Mobile Build / Implementation Ledger

**Purpose:** Authoritative living record for the current mobile rebuild. Read this before changing code. Do not infer completion from old APKs, old branches, screenshots, historical documents, or prior chat claims.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`

**Authoritative rebuild branch:** `mobile-ui-rebuild-from-scratch`

**Mobile workspace:** `apps/mobile`

**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`

**Implementation guide:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, 52 embedded reference images.

**Build policy:** Code-level validation during implementation. **No APK per phase.** Final Android APK/AAB only after all implementation/QA gates in `phases.md` are complete.

**Historical ledger preservation:** The complete ledger state through P12 is preserved at `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P12.md`. P13–P16 have dedicated evidence documents under `docs/mobile-ui-rebuild/`, including `P13_CUSTOMER_PHONE_SIGN_IN_VISUAL_INTERACTION.md`, `P14_CHEF_PHONE_SIGN_IN_VISUAL_INTERACTION.md`, `P15_CUSTOMER_EMAIL_SIGN_IN.md`, and `P16_CHEF_EMAIL_SIGN_IN.md`.

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

P16 completion evidence:

- Started from accepted P15 record HEAD: `35835055fcf5c7ed8c7edba5a46add836fc749f6`.
- Validated P16 implementation commit: `44f82184f169e3c01363658e8bd1c33eca3a85cc`.
- Evidence commit: `aada5e2fd867dba06792238a7cb67c05f1ea679f`.
- Evidence: `docs/mobile-ui-rebuild/P16_CHEF_EMAIL_SIGN_IN.md`.
- CI run: `31214293358` — **SUCCESS**.

**Next phase in sequence:** **P17 — OTP Verification, Resend, Expiry, Rate Limit**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop and wait for the user to explicitly start/continue P17. Do not pre-implement P17.

---

## 2. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Run:

- GitHub Actions run ID: `31214293358`
- Head SHA: `44f82184f169e3c01363658e8bd1c33eca3a85cc`
- Phase: **P16 — Chef Email/Password Sign-In**
- Conclusion: **SUCCESS**

Successful checks:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node setup,
3. `npm ci`,
4. strict TypeScript (`tsc --noEmit`),
5. ESLint with zero warnings,
6. Jest including P16 Chef role-preservation coverage and prior email-auth regressions,
7. production Android JavaScript bundle generation with `react-native bundle`,
8. backend/APIM/infrastructure source-change guard.

This workflow intentionally does **not** perform Java/Gradle/APK packaging. That remains the implementation-phase policy.

---

## 3. P16 Accepted Chef Email Sign-In Boundary

Guide scope: Screen 04 / Reference Image 04 — Chef Email and Password Sign-In (`image4.jpeg`), specification beginning on full-guide page 32 and screen-specific prompt beginning on page 33.

Key P16 implementation files:

- `apps/mobile/src/features/auth/screens/EmailSignInScreen.tsx`
- `apps/mobile/src/features/auth/domain/emailSignInPolicy.ts`
- `apps/mobile/src/features/auth/domain/emailSignInPolicy.test.ts`

Accepted P16 behavior:

- Reuses the single role-aware email/password screen and authentication engine accepted in P15; no duplicate Chef auth screen, API stack, navigation container, or transport layer was introduced.
- Chef selection drives the existing role-aware `AuthHero`, selector state, and approved-chef sign-in copy.
- Typed Chef email submissions preserve `CHEF` while normalizing email and leaving the password unchanged.
- Forgot Password preserves the selected Chef role and forwards only a valid normalized email prefill.
- Continue with phone number preserves the selected Chef role.
- `PHONE_VERIFICATION_REQUIRED` recovery preserves the captured submission role when replacing email sign-in with phone sign-in.
- Busy/disabled state prevents recovery, role changes, or alternate-auth navigation from racing an active credential attempt.
- Existing password visibility accessibility, Android autofill metadata, inline validation, synchronous duplicate-request protection, and non-disclosing Firebase credential errors remain shared with Customer sign-in.
- P15 Customer behavior remains covered by retained regression tests.
- Auth route policy continues to keep Customer/Chef bottom navigation, View Cart, and authenticated header controls absent.
- No fake Chef approval, fake success, TODO, empty handler, mock delay, or fabricated backend response was added.

### P16 exact authentication/API boundary

P16 adds no APIM endpoint and changes no backend/APIM/infrastructure source.

The credential chain remains:

`EmailSignInScreen.submit()` -> `createEmailSignInSubmission(role, email, password)` -> `authService.emailLogin(normalizedEmail, originalPassword)` -> `firebaseAuth.signInWithEmail()` -> React Native Firebase `signInWithEmailAndPassword(getAuth(), email, password)` -> Firebase ID token -> existing `POST /api/v1/auth/firebase/exchange` wrapper -> `sessionManager.acceptTokenPair()`.

P16 does **not** treat the client-selected Chef role as authoritative Chef authorization. The existing P02 contract state remains authoritative. P19 owns Firebase-to-CRAVES exchange acceptance, P21 owns authoritative backend identity/role resolution, P23 owns Chef application/onboarding status, and P18 owns complete password-recovery acceptance.

---

## 4. Current Architecture Ownership After P16

### Navigation

- Application `NavigationContainer`: `app/navigation/AppNavigator.tsx` only.
- Typed route/domain definitions: `app/navigation/types.ts`.
- Bottom-nav/View-Cart/immersive policy: `app/navigation/navigationPolicy.ts`.
- Fail-closed anonymous deep-link validation: `app/navigation/deepLinkPolicy.ts`.
- Customer and Chef email sign-in remain one typed `EmailSignIn` route with role context; no parallel Chef navigator was created for P16.

### Authentication role state

- Shared current-attempt role: `features/auth/state/authSlice.ts` (`auth.selectedRole`).
- Auth-route role synchronization: `features/auth/hooks/useAuthAttemptRole.ts`.
- Role UI: `features/auth/components/RoleSelector.tsx`.
- Role-aware auth art: `features/auth/components/AuthHero.tsx`.
- Role remains current-attempt client state; backend authorization remains later-phase work.

### Phone sign-in policy

- Supported-country metadata, sanitization/validation, E.164 normalization, role-aware copy, typed submission snapshot, and synchronous duplicate-request gate: `features/auth/domain/phoneSignInPolicy.ts`.
- Native Firebase phone verification: `features/auth/firebase/firebaseAuth.ts`.

### Email sign-in policy

- Email normalization, field validation mapping, typed role/email/password submission snapshot, password-recovery prefill eligibility, typed role-preserving auth-route contexts, and synchronous duplicate-request gate: `features/auth/domain/emailSignInPolicy.ts`.
- Native Firebase email/password authentication: `features/auth/firebase/firebaseAuth.ts`.
- Shared Firebase/CRAVES orchestration and safe credential-error mapping: `features/auth/state/authService.ts`.

### Session/security

- Access token: process memory only through `core/security/tokenMemory.ts`.
- Refresh credential: platform-secure storage only through `core/security/refreshTokenStore.ts`.
- Token acceptance/restore/refresh/local-clear owner: `features/auth/api/sessionManager.ts`.
- Authenticated bearer injection and one-shot 401 replay: accepted P09 `core/http/apiClient.ts` boundary.

### Later-phase boundaries not pulled into P16

- P17 owns OTP verification/resend granular acceptance.
- P18 owns password recovery.
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

P16 does not invent, alter, or claim runtime verification of these routes or payloads.

---

## 6. Mini-Phase Status Mapping

| Phase | Status | Evidence/Reason |
|---|---|---|
| P00–P09 | **DONE** | Preserved in historical ledgers and dedicated evidence. |
| P10 Session Token Security | **DONE** | Secure token boundary accepted; CI `31208468433`. |
| P11 Root Navigation | **DONE** | Typed route/chrome/deep-link policy accepted; CI `31209520350`. |
| P12 Role Selection | **DONE** | Shared current-attempt role and auth-route synchronization accepted; CI `31210359665`. |
| P13 Customer Phone Sign-In | **DONE** | Customer phone validation, request guard, native Firebase initiation and focused tests accepted; CI `31211607174`. Device pixel-certification deferred. |
| P14 Chef Phone Sign-In | **DONE** | Chef-specific role/copy/submission acceptance through the shared phone-auth engine; CI `31212292710`. Device pixel-certification deferred. |
| P15 Customer Email Sign-In | **DONE** | Customer email normalization, field validation, password visibility/autofill, safe recovery prefill, duplicate-request guard, non-disclosing credential errors, and focused tests accepted; CI `31213256378`. Device pixel-certification deferred. |
| P16 Chef Email Sign-In | **DONE** | Chef role visual state remains in shared auth screen; typed Chef role preservation through submit/recovery/phone fallbacks accepted; CI `31214293358`. Device pixel-certification deferred. |
| P17 OTP | PARTIAL / existing baseline | Granular verification/resend acceptance pending; not authorized yet. |
| P18 Password Recovery | PARTIAL / existing baseline | Granular acceptance pending. |
| P19 Firebase -> CRAVES Exchange | PARTIAL / existing baseline | Mobile code exists; exact route remains `CONTRACT_ONLY` under P02. |
| P20 Session Restore/Refresh | PARTIAL / foundation exists | P10/P11 foundations exist; lifecycle/root UX acceptance pending. |
| P21 Identity/Role Resolution | PARTIAL / existing baseline | `/me` code exists; exact contract remains `BLOCKED` under P02. |
| P22 Customer Registration | PARTIAL / existing baseline | Customer profile contracts remain `BLOCKED`. |
| P23 Chef Application Status | PARTIAL / existing baseline | Chef application contracts remain `BLOCKED`. |
| P24 Logout Cleanup | PARTIAL / foundation exists | Full private cache/store/role cleanup acceptance remains later. |
| P25 onward | NOT STARTED / not accepted | Product/customer/chef phases have not been accepted under this rebuild protocol unless later records say otherwise. |

---

## 7. Explicitly Not Complete After P16

Do not describe any of the following as complete:

- P17 OTP and P18 password-recovery granular acceptance,
- runtime/backend/APIM resolution of P02 `CONTRACT_ONLY` and `BLOCKED` routes,
- authoritative full APIM/OpenAPI restoration,
- full P19/P20/P21/P22/P23/P24 auth/account lifecycle acceptance,
- authoritative Chef approval/status resolution after credentials,
- physical-device pixel-perfect certification of References 01–04 or the remaining reference set,
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
- Visual QA: final device/reference certification deferred.

### P14 — Chef Phone Sign-In Visual + Interaction

- Status: **DONE** at implementation level.
- Started from commit: `95da34c3069aeda9a52888924a3df42f8b0dcce9`.
- Primary implementation commit: `25568bf0284389ad1ad19bfbacffa46566731b9c`.
- Validated implementation commit: `2735e0fa0d352863cda16ac480939b1862c1b483`.
- Evidence: `docs/mobile-ui-rebuild/P14_CHEF_PHONE_SIGN_IN_VISUAL_INTERACTION.md`.
- Guide reference: Screen 02 / Reference Image 02, pages 26–27 (`image2.jpeg`).
- CI: `31212292710` — **SUCCESS**.
- Visual QA: physical-device pixel-perfect screenshot certification deferred.

### P15 — Customer Email/Password Sign-In

- Status: **DONE** at implementation level.
- Started from commit: `4007a0496fe36993a2b3fedb96bf4343a384deef`.
- Validated implementation commit: `595bdf73a2afefc58554b0d3cd3beda600d8aa6c`.
- Evidence commit: `862cb3357a7d0c2f495c45c2d7e5002cb66cc4f4`.
- Evidence: `docs/mobile-ui-rebuild/P15_CUSTOMER_EMAIL_SIGN_IN.md`.
- Guide reference: Screen 03 / Reference Image 03, pages 29–31 (`image3.jpeg`).
- Changed implementation files: `EmailSignInScreen.tsx`, `emailSignInPolicy.ts`, `emailSignInPolicy.test.ts`, `authService.ts`.
- API/contracts used: existing React Native Firebase email/password authentication and existing `POST /api/v1/auth/firebase/exchange` wrapper; no new/changed APIM route. Exchange runtime acceptance remains P19.
- Tests/checks: GitHub Actions run `31213256378` — **SUCCESS**.
- Visual QA: guide/code traceability completed without redesign; physical-device pixel-perfect screenshot certification deferred.
- APK built: **No**, per implementation-phase policy.
- Backend/APIM/infrastructure source changed: **No**.

### P16 — Chef Email/Password Sign-In

- Status: **DONE** at implementation level.
- Started from accepted P15 record HEAD: `35835055fcf5c7ed8c7edba5a46add836fc749f6`.
- Validated implementation commit: `44f82184f169e3c01363658e8bd1c33eca3a85cc`.
- Evidence commit: `aada5e2fd867dba06792238a7cb67c05f1ea679f`.
- Evidence: `docs/mobile-ui-rebuild/P16_CHEF_EMAIL_SIGN_IN.md`.
- Guide reference: Screen 04 / Reference Image 04 (`image4.jpeg`), specification page 32 and implementation prompt beginning page 33.
- Changed implementation files: `EmailSignInScreen.tsx`, `emailSignInPolicy.ts`, `emailSignInPolicy.test.ts`.
- API/contracts used: same shared React Native Firebase email/password authentication and existing `POST /api/v1/auth/firebase/exchange` wrapper; no new or changed APIM route.
- Behavior completed: Chef role is explicitly preserved through typed email submission, valid-only forgot-password prefill, alternate phone navigation, and phone-verification-required fallback while retaining the shared P15 credential engine and Customer regressions.
- Tests/checks: GitHub Actions run `31214293358` — **SUCCESS**.
- Visual QA: guide/code traceability completed without redesign; physical-device pixel-perfect screenshot certification deferred.
- APK built: **No**, per implementation-phase policy.
- Backend/APIM/infrastructure source changed: **No**.
- Blockers: none to the P16 implementation acceptance boundary; authoritative Chef role/application status remains owned by P21/P23 and existing P02 contract blockers remain.
- Next phase: **NONE AUTHORIZED — waiting for user**.

---

## 10. Current Next Step

**Stop here.**

P16 is complete at the authorized implementation boundary. **P17 — OTP Verification, Resend, Expiry, Rate Limit** is next in `phases.md`, but it is **not authorized** by completion of P16. Begin P17 only after the user explicitly says to continue/start the next phase.
