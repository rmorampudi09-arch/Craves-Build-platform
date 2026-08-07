# CRAVES Mobile Build / Implementation Ledger

**Purpose:** Authoritative living record for the current mobile rebuild. Read this before changing code. Do not infer completion from old APKs, old branches, screenshots, historical documents, or prior chat claims.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`

**Authoritative rebuild branch:** `mobile-ui-rebuild-from-scratch`

**Mobile workspace:** `apps/mobile`

**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`

**Implementation guide:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, 52 embedded reference images.

**Build policy:** Code-level validation during implementation. **No APK per phase.** Final Android APK/AAB only after all implementation/QA gates in `phases.md` are complete.

**Historical ledger preservation:** The complete ledger state through P12 is preserved byte-for-byte at `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P12.md`. Earlier archives through P09 and P08 remain under `docs/mobile-ui-rebuild/`. P10–P13 also have dedicated evidence documents.

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

P13 completion evidence:

- Started from P12 record HEAD: `5f223a9376ecfee6f484a58e99522607e968e56b`.
- Primary P13 implementation commit: `68753493e98cfcc6c453cd86baf866ac519a9ab4`.
- Validated P13 implementation commit: `40e43930c1026b3805332e9d41e75fefc2457b17`.
- Evidence: `docs/mobile-ui-rebuild/P13_CUSTOMER_PHONE_SIGN_IN_VISUAL_INTERACTION.md`.
- CI run: `31211607174` — **SUCCESS**.

**Next phase in sequence:** **P14 — Chef Phone Sign-In Visual + Interaction**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop and wait for the user to explicitly start/continue P14. Do not pre-implement P14.

---

## 2. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Run:

- GitHub Actions run ID: `31211607174`
- Head SHA: `40e43930c1026b3805332e9d41e75fefc2457b17`
- Phase: **P13 — Customer Phone Sign-In Visual + Interaction**
- Conclusion: **SUCCESS**

Successful checks:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node setup,
3. `npm ci`,
4. strict TypeScript (`tsc --noEmit`),
5. ESLint with `--max-warnings=0`,
6. Jest including P13 phone-policy tests and all prior regressions,
7. production Android JavaScript bundle generation with `react-native bundle`,
8. backend/APIM/infrastructure source-change guard.

The first P13 CI attempt (`31211527038`) failed only because the keyboard-submit handler triggered one `no-void` lint warning. Commit `40e43930c1026b3805332e9d41e75fefc2457b17` corrected that warning; the complete gate then passed.

This workflow intentionally does **not** perform Java/Gradle/APK packaging. That remains the correct implementation-phase policy.

---

## 3. P13 Accepted Customer Phone Sign-In Boundary

Guide scope: Screen 01 / Reference Image 01 — Customer Phone Number Sign-In, full-guide pages 23–25 (`image1.jpeg`).

Key implementation files:

- `apps/mobile/src/features/auth/screens/PhoneSignInScreen.tsx`
- `apps/mobile/src/features/auth/components/RoleSelector.tsx`
- `apps/mobile/src/features/auth/domain/phoneSignInPolicy.ts`
- `apps/mobile/src/features/auth/domain/phoneSignInPolicy.test.ts`

Accepted P13 behavior:

- Existing shared auth shell, Customer hero/art, segmented role selector, auth card, phone input, Continue CTA, email/password alternative, and security note remain the reference-aligned composition; P13 does not redesign the screen.
- P11 immersive auth policy remains authoritative: bottom navigation, View Cart, and authenticated header actions are absent.
- P12 selected-role ownership remains authoritative; phone -> OTP and phone -> email preserve the typed current-attempt role.
- India is the explicit currently supported phone-country boundary (`IN`, `+91`, 10 national digits). No unsupported country capability is invented.
- Local and `+91`/E.164-style pasted phone values are sanitized safely, capped to 10 national digits, validated through the existing shared Zod schema, and submitted as E.164.
- Continue remains disabled until the phone is valid and enters loading/disabled state during Firebase verification initiation.
- Keyboard Done submits the same validated action.
- Phone field, role selector, and alternate-login control are disabled during an active verification request to avoid state mutation while the submission snapshot is in flight.
- A synchronous request gate prevents rapid duplicate OTP-initiation taps even before React can finish the loading-state re-render.
- Local format errors and Firebase/request errors are presented separately and accessibly.
- No fake OTP success path, empty handler, TODO, mock delay, or fabricated API response exists.

### P13 exact authentication/API boundary

No APIM endpoint is added or changed by P13.

The phone-verification initiation chain is:

`PhoneSignInScreen.submit()` -> `authService.beginPhone(role, e164Phone)` -> `firebaseAuth.beginPhoneSignIn(e164Phone)` -> React Native Firebase `signInWithPhoneNumber(getAuth(), e164Phone)`.

The Firebase confirmation object remains owned by the existing Firebase auth module for the later OTP phase. `POST /api/v1/auth/firebase/exchange` is not called by P13; P19 owns its granular acceptance and P02 still classifies the current repository evidence for that route as `CONTRACT_ONLY`.

---

## 4. Current Architecture Ownership After P13

### Navigation

- Application `NavigationContainer`: `app/navigation/AppNavigator.tsx` only.
- Typed route/domain definitions: `app/navigation/types.ts`.
- Bottom-nav/View-Cart/immersive policy: `app/navigation/navigationPolicy.ts`.
- Fail-closed anonymous deep-link validation: `app/navigation/deepLinkPolicy.ts`.

### Authentication role state

- Shared current-attempt role: `features/auth/state/authSlice.ts` (`auth.selectedRole`).
- Auth-route role synchronization: `features/auth/hooks/useAuthAttemptRole.ts`.
- Role UI: `features/auth/components/RoleSelector.tsx`.
- Role-aware auth art/copy: `features/auth/components/AuthHero.tsx` and role-aware screen copy.
- Role remains process-memory/current-attempt state; user selection is not backend authorization.

### Phone sign-in policy

- Current supported-country metadata, phone sanitization/validation adaptation, E.164 normalization, and synchronous duplicate-request gate: `features/auth/domain/phoneSignInPolicy.ts`.
- Existing shared base schema remains in `utils/validation.ts`.
- Native Firebase phone verification remains in `features/auth/firebase/firebaseAuth.ts`.
- Auth orchestration remains in `features/auth/state/authService.ts`.

### Session/security

- Access token: process memory only through `core/security/tokenMemory.ts`.
- Refresh credential: platform-secure storage only through `core/security/refreshTokenStore.ts`.
- Token acceptance/restore/refresh/local-clear owner: `features/auth/api/sessionManager.ts`.
- Authenticated bearer injection and one-shot 401 replay: accepted P09 `core/http/apiClient.ts` boundary.

### Later-phase boundaries not pulled into P13

- P14 owns Chef Phone Sign-In reference/interaction acceptance.
- P15/P16 own Customer/Chef Email Sign-In acceptance.
- P17 owns OTP verification/resend granular acceptance.
- P18 owns password recovery.
- P19 owns Firebase-to-Craves exchange acceptance against the exact approved contract.
- P20 owns startup restore/silent-refresh lifecycle UX.
- P21 owns authoritative backend identity/role/onboarding resolution.
- P24 owns full logout/revoke plus private cache/store/role cleanup orchestration.
- P25/P26 own Customer bottom-tab product shell behavior.
- P29 owns View Cart UI/animation/synchronization.

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

P13 does not invent, alter, or runtime-verify any of these routes or payloads.

---

## 6. Mini-Phase Status Mapping

| Phase | Status | Evidence/Reason |
|---|---|---|
| P00–P09 | **DONE** | Preserved in historical ledgers and dedicated evidence. |
| P10 Session Token Security | **DONE** | Secure token boundary accepted; CI `31208468433`. |
| P11 Root Navigation | **DONE** | Typed route/chrome/deep-link policy accepted; CI `31209520350`. |
| P12 Role Selection | **DONE** | Shared current-attempt role and auth-route synchronization accepted; CI `31210359665`. |
| P13 Customer Phone Sign-In | **DONE** | Customer phone validation, keyboard, loading/error, duplicate guard, native Firebase initiation and focused tests accepted; CI `31211607174`. Device pixel-certification deferred. |
| P14 Chef Phone Sign-In | PARTIAL / existing baseline | Existing shared role-aware code only; phase-specific/reference acceptance not authorized. |
| P15 Customer Email Sign-In | PARTIAL / existing baseline | Granular acceptance pending. |
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

## 7. Explicitly Not Complete After P13

Do not describe any of the following as complete:

- P14 Chef Phone Sign-In reference/device acceptance,
- P15/P16 email sign-in reference/device acceptance,
- P17 OTP and P18 password-recovery granular acceptance,
- runtime/backend/APIM resolution of P02 `CONTRACT_ONLY` and `BLOCKED` routes,
- authoritative full APIM/OpenAPI restoration,
- full P19/P20/P21/P24 auth lifecycle acceptance,
- physical-device pixel-perfect certification of Reference Image 01 or the remaining reference set,
- Customer product refs beyond the accepted auth phase,
- Chef product refs,
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

## 9. P13 Phase History

### P13 — Customer Phone Sign-In Visual + Interaction

- Status: **DONE** at implementation level.
- Started from commit: `5f223a9376ecfee6f484a58e99522607e968e56b`.
- Primary implementation commit: `68753493e98cfcc6c453cd86baf866ac519a9ab4`.
- Validated implementation completion commit: `40e43930c1026b3805332e9d41e75fefc2457b17`.
- Evidence: `docs/mobile-ui-rebuild/P13_CUSTOMER_PHONE_SIGN_IN_VISUAL_INTERACTION.md`.
- Guide references: Screen 01 / Reference Image 01, pages 23–25.
- Changed implementation files: `PhoneSignInScreen.tsx`, `RoleSelector.tsx`, `phoneSignInPolicy.ts`, `phoneSignInPolicy.test.ts`.
- API/contracts used: existing native React Native Firebase phone sign-in only; no new/changed APIM route. Backend exchange remains P19.
- Behavior completed: India/+91 phone boundary, paste-safe normalization, existing Zod validation, E.164 submission, disabled/loading states, keyboard submit, separate request error, synchronous duplicate-request gate, role-preserving OTP/email navigation, active-request control locking.
- Tests/checks: GitHub Actions run `31211607174` — **SUCCESS**.
- Visual QA: reference/code traceability completed without redesign; no physical-device pixel-perfect screenshot claim. Later visual-QA gates remain authoritative for final certification.
- APK built: **No**, per implementation-phase policy.
- Backend/APIM/infrastructure source changed: **No**.
- Blockers: none to P13 implementation acceptance; P02 later-phase contract blockers remain.
- Next phase: **NONE AUTHORIZED — waiting for user**.

---

## 10. Current Next Step

**Stop here.**

P13 is complete at the authorized implementation boundary. **P14 — Chef Phone Sign-In Visual + Interaction** is next in `phases.md`, but it is **not authorized** by completion of P13. Begin P14 only after the user explicitly says to continue/start the next phase.
