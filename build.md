# CRAVES Mobile Build / Implementation Ledger

**Purpose:** Authoritative living record for the current mobile rebuild. Read this before changing code. Do not infer completion from old APKs, old branches, screenshots, historical documents, or prior chat claims.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`

**Authoritative rebuild branch:** `mobile-ui-rebuild-from-scratch`

**Mobile workspace:** `apps/mobile`

**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`

**Implementation guide:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, 52 embedded reference images.

**Build policy:** Code-level validation during implementation. **No APK per phase.** Final Android APK/AAB only after all implementation/QA gates in `phases.md` are complete.

**Historical ledger preservation:** The complete ledger state through P12 is preserved at `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P12.md`. Earlier archives remain under `docs/mobile-ui-rebuild/`. P10–P14 have dedicated evidence documents, including `P13_CUSTOMER_PHONE_SIGN_IN_VISUAL_INTERACTION.md` and `P14_CHEF_PHONE_SIGN_IN_VISUAL_INTERACTION.md`.

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

P14 completion evidence:

- Started from P13 record HEAD: `95da34c3069aeda9a52888924a3df42f8b0dcce9`.
- Primary P14 implementation commit: `25568bf0284389ad1ad19bfbacffa46566731b9c`.
- Validated P14 implementation commit: `2735e0fa0d352863cda16ac480939b1862c1b483`.
- Evidence: `docs/mobile-ui-rebuild/P14_CHEF_PHONE_SIGN_IN_VISUAL_INTERACTION.md`.
- CI run: `31212292710` — **SUCCESS**.

**Next phase in sequence:** **P15 — Customer Email/Password Sign-In**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop and wait for the user to explicitly start/continue P15. Do not pre-implement P15.

---

## 2. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Run:

- GitHub Actions run ID: `31212292710`
- Head SHA: `2735e0fa0d352863cda16ac480939b1862c1b483`
- Phase: **P14 — Chef Phone Sign-In Visual + Interaction**
- Conclusion: **SUCCESS**

Successful checks:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node setup,
3. `npm ci`,
4. strict TypeScript (`tsc --noEmit`),
5. ESLint with `--max-warnings=0`,
6. Jest including P14 Chef-role/submission coverage and prior regressions,
7. production Android JavaScript bundle generation with `react-native bundle`,
8. backend/APIM/infrastructure source-change guard.

This workflow intentionally does **not** perform Java/Gradle/APK packaging. That remains the implementation-phase policy.

---

## 3. P14 Accepted Chef Phone Sign-In Boundary

Guide scope: Screen 02 / Reference Image 02 — Chef Phone Number Sign-In, full-guide pages 26–27 (`image2.jpeg`).

Key P14 implementation files:

- `apps/mobile/src/features/auth/screens/PhoneSignInScreen.tsx`
- `apps/mobile/src/features/auth/domain/phoneSignInPolicy.ts`
- `apps/mobile/src/features/auth/domain/phoneSignInPolicy.test.ts`

Accepted P14 behavior:

- Reuses the same role-aware phone screen and Firebase transport accepted in P13; no duplicate Chef authentication stack is introduced.
- Existing `AuthHero` continues to supply the Chef-specific illustration/header when the selected role is `CHEF`.
- Chef-specific phone guidance now instructs the user to use the number linked to the Chef account and explains that Chef access is checked after verification.
- Chef-specific Continue accessibility guidance is provided without changing the accepted Customer wording.
- The phone submission is captured once as a typed `{role, phone}` snapshot with E.164 normalization before verification starts.
- The same snapshot is passed to Firebase initiation and `OtpVerification`, preserving Chef role through the OTP boundary.
- Phone -> email/password navigation preserves the selected Chef role.
- P13 validation, loading/disabled state, keyboard submit, request-error mapping, India/+91 boundary, and synchronous duplicate-request guard are reused unchanged.
- Auth route policy keeps Customer/Chef bottom navigation, View Cart, and authenticated header controls absent.
- Tests explicitly cover Chef role + normalized-phone submission and retain a Customer snapshot regression guard.
- No fake OTP success, TODO, empty handler, mock delay, or fabricated backend response was added.

### P14 exact authentication/API boundary

No APIM endpoint is added or changed by P14.

The existing initiation chain remains:

`PhoneSignInScreen.submit()` -> `createPhoneSignInSubmission(role, phone)` -> `authService.beginPhone(role, e164Phone)` -> `firebaseAuth.beginPhoneSignIn(e164Phone)` -> React Native Firebase `signInWithPhoneNumber(getAuth(), e164Phone)` -> typed `OtpVerification` route params.

P17 owns OTP verification/resend acceptance. P19 owns Firebase-to-Craves session exchange. P21/P23 own authoritative backend identity, Chef-role authorization, application/approval-status resolution, and routing of unapproved/suspended/incomplete Chef accounts. P14 does not treat the UI-selected Chef role as backend authorization.

---

## 4. Current Architecture Ownership After P14

### Navigation

- Application `NavigationContainer`: `app/navigation/AppNavigator.tsx` only.
- Typed route/domain definitions: `app/navigation/types.ts`.
- Bottom-nav/View-Cart/immersive policy: `app/navigation/navigationPolicy.ts`.
- Fail-closed anonymous deep-link validation: `app/navigation/deepLinkPolicy.ts`.

### Authentication role state

- Shared current-attempt role: `features/auth/state/authSlice.ts` (`auth.selectedRole`).
- Auth-route role synchronization: `features/auth/hooks/useAuthAttemptRole.ts`.
- Role UI: `features/auth/components/RoleSelector.tsx`.
- Role-aware auth art: `features/auth/components/AuthHero.tsx`.
- Role-aware phone guidance/submission snapshot: `features/auth/domain/phoneSignInPolicy.ts`.
- Role remains current-attempt client state; backend authorization remains later-phase work.

### Phone sign-in policy

- Supported-country metadata, phone sanitization/validation adaptation, E.164 normalization, role-aware phone copy, typed submission snapshot, and synchronous duplicate-request gate: `features/auth/domain/phoneSignInPolicy.ts`.
- Shared base schema: `utils/validation.ts`.
- Native Firebase phone verification: `features/auth/firebase/firebaseAuth.ts`.
- Auth orchestration: `features/auth/state/authService.ts`.

### Session/security

- Access token: process memory only through `core/security/tokenMemory.ts`.
- Refresh credential: platform-secure storage only through `core/security/refreshTokenStore.ts`.
- Token acceptance/restore/refresh/local-clear owner: `features/auth/api/sessionManager.ts`.
- Authenticated bearer injection and one-shot 401 replay: accepted P09 `core/http/apiClient.ts` boundary.

### Later-phase boundaries not pulled into P14

- P15/P16 own Customer/Chef Email Sign-In acceptance.
- P17 owns OTP verification/resend granular acceptance.
- P18 owns password recovery.
- P19 owns Firebase-to-Craves exchange acceptance against the exact approved contract.
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

P14 does not invent, alter, or claim runtime verification of these routes or payloads.

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
| P15 Customer Email Sign-In | PARTIAL / existing baseline | Granular acceptance pending; not authorized yet. |
| P16 Chef Email Sign-In | PARTIAL / existing baseline | Granular acceptance pending. |
| P17 OTP | PARTIAL / existing baseline | Granular verification/resend acceptance pending. |
| P18 Password Recovery | PARTIAL / existing baseline | Granular acceptance pending. |
| P19 Firebase -> CRAVES Exchange | PARTIAL / existing baseline | Mobile code exists; exact route remains `CONTRACT_ONLY` under P02. |
| P20 Session Restore/Refresh | PARTIAL / foundation exists | P10/P11 foundations exist; lifecycle/root UX acceptance pending. |
| P21 Identity/Role Resolution | PARTIAL / existing baseline | `/me` code exists; exact contract remains `BLOCKED` under P02. |
| P22 Customer Registration | PARTIAL / existing baseline | Customer profile contracts remain `BLOCKED`. |
| P23 Chef Application Status | PARTIAL / existing baseline | Chef application contracts remain `BLOCKED`. |
| P24 Logout Cleanup | PARTIAL / foundation exists | Full private cache/store/role cleanup acceptance remains later. |
| P25 onward | NOT STARTED / not accepted | Product/customer/chef phases have not been accepted under this rebuild protocol unless later records say otherwise. |

---

## 7. Explicitly Not Complete After P14

Do not describe any of the following as complete:

- P15/P16 email sign-in reference/device acceptance,
- P17 OTP and P18 password-recovery granular acceptance,
- runtime/backend/APIM resolution of P02 `CONTRACT_ONLY` and `BLOCKED` routes,
- authoritative full APIM/OpenAPI restoration,
- full P19/P20/P21/P22/P23/P24 auth/account lifecycle acceptance,
- physical-device pixel-perfect certification of References 01–02 or the remaining reference set,
- Customer product refs beyond the accepted auth phases,
- Chef product refs beyond the accepted Chef phone-auth visual state,
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
- Started from commit: `5f223a9376ecfee6f484a58e99522607e968e56b`.
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
- Changed implementation files: `PhoneSignInScreen.tsx`, `phoneSignInPolicy.ts`, `phoneSignInPolicy.test.ts`.
- API/contracts used: existing native React Native Firebase phone sign-in only; no new/changed APIM route. Backend exchange/identity/approval remain later phases.
- Behavior completed: Chef-specific sign-in guidance, role-preserving normalized submission snapshot, role-preserving OTP/email navigation, reuse of P13 validation/loading/error/duplicate-request controls, and Customer regression protection.
- Tests/checks: GitHub Actions run `31212292710` — **SUCCESS**.
- Visual QA: guide/code traceability completed without redesign; physical-device pixel-perfect screenshot certification deferred.
- APK built: **No**, per implementation-phase policy.
- Backend/APIM/infrastructure source changed: **No**.
- Blockers: none to P14 implementation acceptance; P02 later-phase contract blockers remain.
- Next phase: **NONE AUTHORIZED — waiting for user**.

---

## 10. Current Next Step

**Stop here.**

P14 is complete at the authorized implementation boundary. **P15 — Customer Email/Password Sign-In** is next in `phases.md`, but it is **not authorized** by completion of P14. Begin P15 only after the user explicitly says to continue/start the next phase.
