# CRAVES Mobile Build / Implementation Ledger

**Purpose:** This is the authoritative living record of what the current mobile rebuild has actually implemented and validated. Future agents must read this file before changing code. Do not infer completion from old APKs, old branches, screenshots, historical documents, or prior chat claims.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`

**Authoritative rebuild branch:** `mobile-ui-rebuild-from-scratch`

**Mobile workspace:** `apps/mobile`

**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`

**Implementation guide:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, 52 embedded reference images.

**Build policy:** Code-level validation during implementation. **No APK per phase.** Final Android APK/AAB only after all implementation/QA gates in `phases.md` are complete.

---

## 1. Current Control State

- **P00 — Execution Documents and Source Lock: DONE**.
- **P01 — Repository Architecture Inventory: DONE**.
- **P02 — APIM/OpenAPI Contract Inventory: DONE**.
- **P03 — Runtime Configuration and Environment Boundary: DONE**.
- **P04 — Design Token Baseline: DONE**.
- **P05 — Shared Motion and Reduced-Motion Baseline: DONE**.
- P01 started from branch HEAD `64dfbd18820b2644ee0263d5fffcefbd62172dfe`.
- P01 completion commit: `d27d6eacef2f2c21f8908116d526e1fffc6bf2a0`.
- P02 inventory artifact commit: `ed23344ea2cdbe89b1543432f265bb320e56d505`.
- P02 evidence: `docs/mobile-ui-rebuild/P02_APIM_OPENAPI_CONTRACT_INVENTORY.md`.
- P03 started from branch HEAD `ad37c1366b3399c9910e76a1343d9454f42f30eb`.
- P03 implementation completion commit: `57f371cc3851c78daa6a0bd6b28521f0c62babb2`.
- P03 evidence: `docs/mobile-ui-rebuild/P03_RUNTIME_CONFIGURATION_ENVIRONMENT_BOUNDARY.md`.
- P03 CI run: `31194872495` — **SUCCESS**.
- P04 started from branch HEAD `3a221d71819dc1bb079f01bbcfc5428fc65ca521`.
- P04 implementation completion commit: `ae15a1702923e68dbd3b3582d664e500ec723927`.
- P04 evidence: `docs/mobile-ui-rebuild/P04_DESIGN_TOKEN_BASELINE.md`.
- P04 CI run: `31196834196` — **SUCCESS**.
- P05 started from branch HEAD `783b29224661a969405837c2a1ef7f5a477b427c`.
- P05 implementation completion commit: `53f27fd405208cdd6b740124c0901857d04bd8fd`.
- P05 evidence: `docs/mobile-ui-rebuild/P05_SHARED_MOTION_REDUCED_MOTION_BASELINE.md`.
- P05 CI run: `31197890099` — **SUCCESS**.
- Next phase in sequence: **P06 — Shared Interaction Primitives**.
- Next phase authorization: **NONE AUTHORIZED**.
- Required action: stop and wait for the user to explicitly start/continue the next phase.

P05 extends the existing single design-system foundation with a shared motion vocabulary rather than introducing a parallel animation system. It defines restrained durations, easing curves, spring conventions, transform/opacity-only intent primitives for press/chip-tab/bounded list changes/bottom navigation/View Cart/modal/skeleton behavior, a platform reduced-motion preference hook, immediate low-motion resolution, zero animation delay for authentication/payment/error navigation, and a bounded-list guard that prevents whole-large-list animation. No P06 interaction component, navigation shell, marketplace screen, API, backend/APIM, storage, or product flow was implemented.

---

## 2. Branch Snapshot Before Governance Documents

The last product/CI commit before the four governance documents was:

- Commit: `b91802ecd98b76a6aa28680c7e3bf83693816d74`
- Message: `Stop per-phase APK builds and keep code-only mobile CI`
- This commit was 45 commits ahead of the protected backend/mobile-rebuild baseline `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`.

The rebuild diff from that baseline is confined to the new mobile application and mobile-focused GitHub workflow files; the current CI explicitly guards backend/APIM/infrastructure source from modification.

---

## 3. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Run:
- GitHub Actions run ID: `31197890099`
- Head SHA: `53f27fd405208cdd6b740124c0901857d04bd8fd`
- Conclusion: **SUCCESS**

Successful checks:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node setup,
3. `npm ci`,
4. strict TypeScript check (`tsc --noEmit`),
5. ESLint (`--max-warnings=0`),
6. Jest,
7. production Android JavaScript bundle generation with `react-native bundle`,
8. backend/APIM/infrastructure source-change guard.

Important: this workflow intentionally does **not** perform Java/Gradle/APK packaging. That is the correct implementation-phase policy.

P05 added the shared motion/reduced-motion foundation and focused motion-policy tests. Run `31197890099` is the accepted P05 code-level validation evidence. It does not claim device/reference visual certification, backend runtime validation, Gradle packaging, or APK verification.

---

## 4. What Is Actually Implemented Today

### 4.1 Fresh React Native CLI foundation — IMPLEMENTED

Current source includes a fresh `apps/mobile` React Native CLI project with:

- React Native `0.85.3`, React `19.2.3`, strict TypeScript,
- React Navigation native stack/bottom-tab dependencies,
- Redux Toolkit / React Redux,
- TanStack Query,
- Axios,
- React Hook Form + Zod resolver stack,
- Reanimated / Gesture Handler,
- Safe Area Context / Screens,
- FlashList,
- Firebase App/Auth,
- secure-storage module,
- Android native project and Firebase Android config,
- Jest/ESLint/Prettier/Metro/Babel configuration.

The dependency list existing in the repository is the current architecture baseline. Do not replace it wholesale to match a generic recommendation from the guide.

### 4.2 App/provider/navigation bootstrap — IMPLEMENTED FOR AUTH SCOPE

Key files include:

- `apps/mobile/App.tsx`
- `apps/mobile/src/app/providers/AppProviders.tsx`
- `apps/mobile/src/app/store/store.ts`
- `apps/mobile/src/app/store/hooks.ts`
- `apps/mobile/src/app/navigation/AppNavigator.tsx`
- `apps/mobile/src/app/navigation/types.ts`

The current root navigator implements the authentication/account-resolution stack. It does **not** yet implement the complete Customer and Chef marketplace shells.

### 4.3 Runtime configuration — IMPLEMENTED / P03 ACCEPTED

Key files:

- `apps/mobile/src/core/config/runtimeConfig.ts`
- `apps/mobile/src/core/config/runtimeConfig.test.ts`
- `apps/mobile/.env.example`
- `apps/mobile/android/app/build.gradle`
- `docs/mobile-ui-rebuild/P03_RUNTIME_CONFIGURATION_ENVIRONMENT_BOUNDARY.md`

Accepted P03 behavior:

- `runtimeConfig.ts` remains the single runtime configuration owner.
- `CRAVES_API_BASE_URL` is required, normalized, and validated as an absolute HTTP(S) URL.
- Non-development environments require HTTPS.
- Base URLs containing embedded credentials, query parameters, or fragments are rejected.
- `CRAVES_ENVIRONMENT` supports `development`, `staging`, and `production`; invalid explicit values fail with `RuntimeConfigurationError`.
- `.env.example` documents the public schema only and contains a reserved non-production placeholder rather than a production endpoint.
- Root `.gitignore` excludes `.env`/`.env.*` while allowing `.env.example`, keeping deployment environment files outside source control.
- Android applies the existing `react-native-config` `dotenv.gradle` bridge so injected environment values reach the native module.
- Existing Firebase Android Google Services wiring and `com.cravesapp` package alignment were statically verified and retained.
- No feature-flag reads, Firebase Remote Config SDK, established remote-config provider, or current P00–P03 flag consumer exists. P03 records that boundary and prohibits future ad hoc screen/environment flags; exact provider, keys, defaults, rollout semantics, and cache policy must be approved when a feature actually requires them.

No backend route, APIM policy, secret, or environment-specific production value was introduced by P03.

### 4.4 Shared design-token baseline — IMPLEMENTED / P04 ACCEPTED

Key files:

- `apps/mobile/src/design/tokens.ts`
- `apps/mobile/src/design/tokens.test.ts`
- `docs/mobile-ui-rebuild/P04_DESIGN_TOKEN_BASELINE.md`

Accepted P04 baseline includes:

- locked Flame Red `#F62E18` and Espresso Brown `#261A15`,
- warm/base/muted semantic surfaces,
- primary/secondary/placeholder text colors,
- distinct success/warning/error/information semantic colors,
- a 4 dp shared spacing rhythm,
- shared radii and standard/focus/strong border widths,
- typography sizes and shared font-weight vocabulary,
- dynamic type policy with React Native font scaling enabled and no fixed token line-height that would clip scaled text,
- shared icon sizes,
- Android-first `48 dp` minimum and `56 dp` comfortable interaction targets,
- safe-area content/floating clearances that remain additive to runtime `react-native-safe-area-context` device insets,
- restrained shared `none`, `card`, and `primaryAction` elevation/shadow definitions.

Existing foundation adoption in P04 is intentionally narrow: `Icon.tsx`, `AuthCard.tsx`, `PrimaryButton.tsx`, `InputField.tsx`, and `AuthShell.tsx` consume the relevant shared baseline values instead of carrying equivalent raw/default values.

All 52 references have **not** been visually certified against the token baseline; reference/device visual certification remains in the later screen and QA phases.

### 4.5 Shared motion and reduced-motion baseline — IMPLEMENTED / P05 ACCEPTED

Key files:

- `apps/mobile/src/design/motion.ts`
- `apps/mobile/src/design/reducedMotion.ts`
- `apps/mobile/src/design/motion.test.ts`
- `docs/mobile-ui-rebuild/P05_SHARED_MOTION_REDUCED_MOTION_BASELINE.md`

Accepted P05 baseline includes:

- shared durations for press, selection, bounded item insertion/removal, bottom navigation, View Cart, modal transitions, and skeleton cycles,
- standard/enter/exit cubic-bezier conventions,
- restrained feedback/settle spring conventions with overshoot clamped,
- intent-level motion definitions restricted to opacity and transform,
- platform reduced-motion preference tracking through React Native `AccessibilityInfo`,
- conservative reduced-motion startup behavior until the platform preference resolves,
- immediate reduced-motion equivalents with springs and continuous shimmer disabled,
- explicit zero animation delay for authentication navigation, payment navigation, and error presentation,
- whole-large-list animation disabled by shared policy,
- bounded visible list-change animation via `shouldAnimateListChanges`.

P05 defines the baseline only. It intentionally does not convert existing auth controls into P06 shared interaction primitives, does not implement View Cart/bottom navigation/modal product surfaces, and does not claim screen-level motion/device certification.

### 4.6 HTTP/error/correlation foundation — IMPLEMENTED FOUNDATION

Key files:

- `apps/mobile/src/core/http/apiClient.ts`
- `apps/mobile/src/core/http/apiError.ts`
- `apps/mobile/src/core/http/correlation.ts`

The central client/error/correlation architecture exists. P02 completed the static inventory of all currently consumed mobile operations; unresolved APIM/OpenAPI/backend contracts remain explicitly classified in `docs/mobile-ui-rebuild/P02_APIM_OPENAPI_CONTRACT_INVENTORY.md`. Future feature wrappers still require exact contracts before implementation.

### 4.7 Token/session security — IMPLEMENTED FOR CURRENT AUTH FLOW

Key files:

- `apps/mobile/src/core/security/tokenMemory.ts`
- `apps/mobile/src/core/security/refreshTokenStore.ts`
- `apps/mobile/src/features/auth/api/sessionManager.ts`

Verified implementation behavior:

- access token stored in process memory,
- refresh token stored through secure storage,
- refresh token rotation through `/api/v1/auth/refresh`,
- one in-flight refresh promise guard,
- local secure credentials cleared on refresh failure/logout.

This matches the guide’s session-storage model. P02 found that the corresponding current backend/APIM refresh contract is not runtime-verified and is `CONTRACT_ONLY`; wider application cache cleanup and role-transition auditing remain later phases.

### 4.8 Authentication UI/components — IMPLEMENTED FOUNDATION, FINAL VISUAL QA PENDING

Current shared auth components include:

- `AuthCard.tsx`
- `AuthHero.tsx`
- `AuthShell.tsx`
- `InputField.tsx`
- `PrimaryButton.tsx`
- `RoleSelector.tsx`
- `ScreenHeader.tsx`
- `SecurityNote.tsx`

Current auth screens include:

- `RoleSelectionScreen.tsx`
- `PhoneSignInScreen.tsx`
- `EmailSignInScreen.tsx`
- `OtpVerificationScreen.tsx`
- `ForgotPasswordScreen.tsx`
- `PasswordResetSentScreen.tsx`
- `SplashScreen.tsx`
- `StartupErrorScreen.tsx`

These implement the current role-aware authentication foundation, but no pixel-perfect claim is recorded until final reference/device QA.

### 4.9 Firebase authentication — IMPLEMENTED FOR CURRENT AUTH FLOW

Key file:

- `apps/mobile/src/features/auth/firebase/firebaseAuth.ts`

Current flow supports native Firebase phone sign-in/OTP and Firebase email/password/password-reset operations used by the auth service.

### 4.10 CRAVES Auth Service integration — IMPLEMENTED FOR CURRENT AUTH FLOW

Key files:

- `apps/mobile/src/features/auth/api/authApi.ts`
- `apps/mobile/src/features/auth/state/authService.ts`

Currently coded exact paths include:

- `POST /api/v1/auth/firebase/exchange`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`

The current auth implementation exchanges Firebase identity for the CRAVES session, maps selected Firebase/network errors, restores sessions, and performs best-effort remote logout followed by mandatory local credential clearing.

**P02 contract result:** Firebase exchange, refresh, and logout are `CONTRACT_ONLY`; `/api/v1/auth/me` is `BLOCKED`. Existing mobile code presence is not evidence that these routes are currently runnable. See the P02 inventory before any later contract-dependent change.

### 4.11 Customer profile completion — IMPLEMENTED ONLY FOR AUTH/ONBOARDING HANDOFF

Key file:

- `apps/mobile/src/features/auth/api/profileApi.ts`

Currently coded paths:

- `GET /api/v1/customer/profile`
- `PUT /api/v1/customer/profile`

`CustomerRegistrationScreen.tsx` and `AccountRouterScreen.tsx` use the profile capability to decide whether customer profile completion is needed.

P02 classifies both current customer-profile operations as `BLOCKED` pending an authoritative repository contract/backend mapping. This does **not** mean the master-guide Customer Profile/Edit Profile experiences are complete.

### 4.12 Chef application/onboarding handoff — IMPLEMENTED ONLY FOR AUTH/ACCOUNT STATUS

Current coded paths:

- `GET /api/v1/chef/application`
- `POST /api/v1/chef/application`

Current screens include:

- `ChefRegistrationScreen.tsx`
- `ChefAccountStatusScreen.tsx`

P02 classifies both current chef-application operations as `BLOCKED`: an APIM policy template exists, but exact operation/backend/schema evidence is insufficient. This covers the auth-time chef application/status handoff code only. It does **not** mean Chef Dashboard, Orders, Menu, Analytics, Profile, Business, Payout, Subscription, or Preferences are complete.

### 4.13 Account router — IMPLEMENTED AS TEMPORARY AUTH COMPLETION ROUTER

`AccountRouterScreen.tsx` resolves profile/application state after authentication.

The present `CustomerAccountStatusScreen.tsx` explicitly says the customer marketplace shell is connected in a later implementation phase. Therefore the marketplace/customer screen implementation is not complete and must not be inferred from successful authentication.

---

## 5. P01 Accepted Repository Architecture Inventory

P01 formally audited the current mobile source against the full master guide's requirement to reuse the established architecture rather than create parallel systems.

### 5.1 Application entry and root ownership

- `apps/mobile/index.js` is the React Native entry point and registers `CravesMobile`.
- `apps/mobile/App.tsx` is the single application component. It owns the global status-bar setup and composes `AppProviders` with `AppNavigator`.
- `apps/mobile/app.json` keeps the `CravesMobile` component identity and declares the existing `expo-secure-store` module integration.
- There is no second mobile application entry or alternate runtime root in `apps/mobile`.

### 5.2 Provider ownership

`apps/mobile/src/app/providers/AppProviders.tsx` is the single provider composition boundary. It owns:

- `GestureHandlerRootView`,
- `SafeAreaProvider`,
- the single Redux `Provider`,
- the single TanStack `QueryClientProvider`.

The current query client is created once for the application lifetime with default query retry/staleness/reconnect rules and mutation retry disabled. Future cache policy work must extend this provider rather than add a second query client.

### 5.3 Navigation ownership

- `apps/mobile/src/app/navigation/AppNavigator.tsx` owns the single `NavigationContainer` and current native-stack root.
- `apps/mobile/src/app/navigation/types.ts` owns the current typed route parameter list.
- The present navigator covers authentication, registration, account routing, and account-status handoff only.
- Customer shell, Chef shell, transactional/checkout, modal domains, bottom tabs, deep-link allowlisting, and route-level View Cart/bottom-nav policy are not yet implemented and remain later-phase work.

No second navigation container or alternate route framework was found in the current mobile source.

### 5.4 Global application state ownership

- `apps/mobile/src/app/store/store.ts` owns the single Redux Toolkit store.
- The store currently contains only the `auth` reducer because the rebuild has not reached cart/location/profile/preferences marketplace phases.
- `apps/mobile/src/app/store/hooks.ts` owns typed Redux access hooks.
- `apps/mobile/src/features/auth/state/authSlice.ts` owns current bootstrap status, selected role, identity, and auth error state.

Future global slices must extend this store. Server collections must remain in the query/cache layer instead of being copied into arbitrary Redux arrays.

### 5.5 Server/query state ownership

- TanStack Query is installed and the single `QueryClient` is owned by `AppProviders.tsx`.
- No second server-state cache was found.
- The current auth foundation primarily uses imperative service calls because the implemented scope is authentication/bootstrap; marketplace query keys, pagination policies, and private-cache cleanup are intentionally pending P08 and later feature phases.

### 5.6 Runtime configuration ownership

- `apps/mobile/src/core/config/runtimeConfig.ts` is the single runtime configuration boundary currently used by the mobile client.
- `CRAVES_API_BASE_URL` is injected through `react-native-config`; P03 additionally validates environment identity, URL structure, and HTTPS requirements and keeps deployment values external.
- `.env.example` is the non-secret configuration schema/template.

Future runtime values/flags must extend the established configuration boundary rather than introduce ad hoc environment access in screens.

### 5.7 HTTP and error ownership

- `apps/mobile/src/core/http/apiClient.ts` is the single general authenticated Axios client.
- It centralizes APIM base URL resolution, bearer injection, correlation ID, timeout, one-time 401 replay, and delegation to the shared session refresh manager.
- `apps/mobile/src/core/http/apiError.ts` owns normalized public API errors.
- `apps/mobile/src/core/http/correlation.ts` owns correlation ID generation.
- `apps/mobile/src/features/auth/api/profileApi.ts` correctly uses the central authenticated client.
- `apps/mobile/src/features/auth/api/authApi.ts` and `sessionManager.ts` use narrowly scoped raw Axios calls for pre-session token exchange, refresh-token rotation, and logout/revocation flows where routing through the bearer-refresh interceptor would be inappropriate or recursive. These are bounded auth exceptions, not a second general API architecture.

### 5.8 Session and secure-storage ownership

- `apps/mobile/src/core/security/tokenMemory.ts` is the single in-process access-token owner.
- `apps/mobile/src/core/security/refreshTokenStore.ts` is the single refresh-credential persistence boundary and uses `expo-secure-store`.
- `apps/mobile/src/features/auth/api/sessionManager.ts` owns token-pair acceptance, restore/refresh rotation, the one-in-flight refresh guard, and local credential clearing.
- `AsyncStorage` is installed but is not used for access/refresh tokens in the inspected current source.

No duplicate secure-token store was found.

### 5.9 Firebase ownership

- `apps/mobile/src/features/auth/firebase/firebaseAuth.ts` is the single Firebase Auth platform wrapper for phone verification, OTP confirmation, email/password sign-in, password reset, and sign-out.
- `apps/mobile/android/app/google-services.json` supplies the Android Firebase application configuration.
- Android applies the Google Services Gradle plugin.
- P03 statically re-verified that the Firebase Android client package aligns with `com.cravesapp`.

No second Firebase Auth wrapper or web-auth implementation was found in the current mobile runtime.

### 5.10 Design-system ownership

- `apps/mobile/src/design/tokens.ts` is the single current design-token source. P04 accepts it for brand colors, warm/semantic surfaces, semantic status/text colors, spacing, radii, border widths, typography/font weights, icon sizes, touch targets, safe-area content clearances, dynamic type, and elevation/shadow definitions.
- `apps/mobile/src/design/motion.ts` is the single shared motion-convention source accepted by P05; `apps/mobile/src/design/reducedMotion.ts` owns the platform reduced-motion preference boundary for future animated consumers.
- `apps/mobile/src/shared/components/Icon.tsx` is the current cross-feature shared component and consumes the shared icon/color baseline.
- Auth-specific visual primitives remain under `apps/mobile/src/features/auth/components` because they are feature-scoped today.

There is no competing ThemeProvider, duplicate color-token system, or second accepted motion vocabulary. Later design/component phases must extend these owners instead of creating parallel theme/animation architecture.

### 5.11 Feature/module ownership

The only implemented product feature module under `apps/mobile/src/features` is currently `auth`, organized into:

- `api` — auth/profile/session transport boundaries,
- `components` — auth visual primitives,
- `domain` — auth domain types,
- `firebase` — platform authentication wrapper,
- `hooks` — bootstrap coordination,
- `screens` — auth/account-resolution presentation,
- `state` — auth reducer and orchestration service.

Customer and Chef marketplace feature families have not yet been added in this rebuild.

### 5.12 Validation and tests

- `apps/mobile/src/utils/validation.ts` is the current validation-helper boundary with focused unit coverage.
- `apps/mobile/__tests__/App.test.tsx` is the current root render test.
- `apps/mobile/src/core/security/tokenMemory.test.ts` covers access-token memory behavior.
- `apps/mobile/src/core/config/runtimeConfig.test.ts` covers the P03 runtime environment/configuration boundary.
- `apps/mobile/src/design/tokens.test.ts` covers P04 brand, spacing, semantic-color, touch-target, dynamic-type, and safe-area token invariants.
- `apps/mobile/src/design/motion.test.ts` covers P05 duration, transform/opacity, reduced-motion, critical-delay, and large-list motion invariants.
- `apps/mobile/jest.config.js` owns Jest setup and transform rules.
- `apps/mobile/tsconfig.json` extends the React Native TypeScript configuration and includes all TypeScript source/test files.

Coverage is intentionally small and is not sufficient for later customer/chef features.

### 5.13 Android native ownership

- `apps/mobile/android` is the native Android project owned by this React Native CLI app.
- Application ID/namespace is `com.cravesapp`.
- React Native New Architecture and Hermes are enabled.
- The project uses React Native Gradle ownership plus Expo module autolinking only for approved bare-RN native modules such as SecureStore; this is **not** an Expo-managed application.
- `MainActivity` registers the `CravesMobile` component and uses `adjustResize` through the Android manifest for keyboard behavior.
- P03 wires the existing `react-native-config` Android dotenv bridge; it does not introduce a second configuration system.
- Current Android release configuration still points to debug signing; production signing remains intentionally deferred to final release readiness.

### 5.14 CI ownership

- `.github/workflows/mobile-phase1-ci.yml` is the current general mobile implementation CI despite its historical filename.
- It runs dependency install, TypeScript, ESLint, Jest, production Android JavaScript bundling, and the backend/APIM/infrastructure source guard.
- It intentionally does not build an APK per phase.
- `.github/workflows/mobile-phase1-bootstrap.yml`, `mobile-phase1-deps.yml`, and `mobile-phase1-implement.yml` are historical one-time, write-capable bootstrap helpers. They are not the current implementation architecture and must not be reused as an automatic phase engine.
- `apps/mobile/PHASE1.md` is historical foundation documentation. `build.md` is the authoritative completion ledger.

### 5.15 Duplicate/dead architecture result

No active duplicate runtime navigation container, Redux store, TanStack Query client, general authenticated HTTP client, secure-token store, Firebase Auth wrapper, runtime configuration owner, design-token system, or accepted motion baseline was found in the current `apps/mobile` source.

Installed baseline libraries that are not yet exercised by the auth-only implementation (for example bottom tabs, FlashList, React Hook Form/Zod, AsyncStorage for approved non-sensitive persistence, and animation/media helpers) are reserved dependencies, not parallel architecture. Future phases must reuse them where appropriate rather than add competing libraries without approval.

### 5.16 Deferred cleanup/refinement notes

These findings do **not** block P01–P05 completion, but later owning phases should address them deliberately:

1. `src/core/http/apiError.ts` imports the `ApiErrorResponse` transport type from `features/auth/domain/types`. Even though it is type-only, shared core HTTP infrastructure should not depend inward on the auth feature. P09 should move/define the generic API error response at a core/shared transport boundary.
2. The `QueryClient` is intentionally private inside `AppProviders.tsx`; once private server state exists, P08/P24 must provide a controlled cache-clearing/invalidation boundary for logout and role switching rather than creating another query client.
3. `AppNavigator.tsx` is currently auth-only and `AccountRouterScreen.tsx` performs temporary account-resolution orchestration. P11 and the account-resolution phases must evolve these existing owners instead of creating separate root navigators.
4. Android Kotlin files are physically under `android/app/src/main/java/com/cravesmobile/` while declaring package `com.cravesapp`. The declarations/application ID are consistent at runtime, but the directory should be normalized in a future native-configuration cleanup for maintainability.
5. Android release currently uses the debug signing configuration. Production signing is a final release-readiness concern and must not be introduced during intermediate UI phases.
6. Historical write-capable Phase 1 bootstrap/dependency/implementation workflows remain in the repository. They are quarantined as legacy helpers; a later repository-hygiene change may retire them, but they must not be triggered/edited as part of normal phased implementation.
7. There is currently no approved/established feature-flag or remote-config provider in the mobile runtime. This is not a P03 blocker because no current P00–P05 behavior consumes a flag. Before later flag-controlled behavior is implemented, the owning phase must establish the approved centralized typed mechanism and exact key/default/rollout contract rather than adding ad hoc local conditionals.

**Current foundation blocker status:** none for P05. The unresolved P02 backend/APIM contracts remain visible and unchanged.

---

## 6. Current Test Coverage

Known tests currently include:

- `apps/mobile/__tests__/App.test.tsx` — basic root render,
- `apps/mobile/src/core/security/tokenMemory.test.ts` — token-memory behavior,
- `apps/mobile/src/core/config/runtimeConfig.test.ts` — runtime environment/base URL validation and failure behavior,
- `apps/mobile/src/design/tokens.test.ts` — P04 brand, spacing, semantic, touch, dynamic-type, and safe-area token invariants,
- `apps/mobile/src/design/motion.test.ts` — P05 shared duration, property, reduced-motion, critical-delay, and bounded-list invariants,
- `apps/mobile/src/utils/validation.test.ts` — current validation helpers.

CI run `31197890099` is green for the accepted P05 implementation. This test set is intentionally not considered sufficient for the complete guide. Each future phase must add focused unit/component/integration coverage as the domain grows.

---

## 7. Current Mini-Phase Status Mapping

The granular `phases.md` was introduced after the existing auth foundation was written. To avoid retroactively overstating completion, existing code is mapped conservatively:

| Phase | Status | Evidence/Reason |
|---|---|---|
| P00 Execution Documents | **DONE** | `plan.md`, `phases.md`, `build.md`, and `agent.md` committed; source hierarchy and execution policy locked. |
| P01 Repository Inventory | **DONE** | Formal repository architecture audit recorded in this ledger; current entry/navigation/provider/store/query/config/HTTP/security/Firebase/design/native/test/CI ownership is documented and duplicate architecture was checked. |
| P02 APIM/OpenAPI Inventory | **DONE** | `docs/mobile-ui-rebuild/P02_APIM_OPENAPI_CONTRACT_INVENTORY.md` inventories all 8 currently consumed mobile HTTP operations, route-key/auth expectations, path/source mismatches, validation gaps, and static classifications: 3 `CONTRACT_ONLY`, 5 `BLOCKED`, 0 runtime-verified. |
| P03 Runtime Config | **DONE** | Runtime schema/base URL validation, Android `react-native-config` injection, non-secret `.env.example`, Firebase Android audit, explicit remote-config/feature-flag boundary, focused tests, and successful CI are recorded in `docs/mobile-ui-rebuild/P03_RUNTIME_CONFIGURATION_ENVIRONMENT_BOUNDARY.md`. |
| P04 Design Tokens | **DONE** | `docs/mobile-ui-rebuild/P04_DESIGN_TOKEN_BASELINE.md` records the accepted single token baseline for brand/warm/semantic colors, spacing, radius, typography, borders/elevation, icon/touch sizes, safe-area clearances, dynamic type, focused tests, and successful CI. |
| P05 Motion Baseline | **DONE** | `docs/mobile-ui-rebuild/P05_SHARED_MOTION_REDUCED_MOTION_BASELINE.md` records the accepted shared motion vocabulary, platform reduced-motion preference boundary, critical-flow zero-delay rule, bounded-list guard, focused tests, and successful CI. |
| P06 Shared Interaction Primitives | PARTIAL | Auth primitives exist only. |
| P07 Shared Lifecycle Primitives | PARTIAL | Auth/startup states exist; app-wide lifecycle primitives pending. |
| P08 Query/Store Cache Rules | PARTIAL | Providers/dependencies exist; feature cache rules not audited. |
| P09 Typed HTTP Client | PARTIAL | Foundation exists; full retry/cancellation/contract audit pending. |
| P10 Session Token Security | PARTIAL / strong foundation | Memory/secure-store/refresh implementation exists and CI passes; later full security audit still required. |
| P11 Root Navigation | PARTIAL | Auth stack exists; Customer/Chef/Transactional/Modal domains incomplete. |
| P12 Role Selection | PARTIAL / implemented | Functional code exists; final visual/device acceptance pending. |
| P13 Customer Phone Sign-In | PARTIAL / implemented | Functional code exists; reference-specific final acceptance pending. |
| P14 Chef Phone Sign-In | PARTIAL / implemented | Shared role-aware phone flow exists; reference-specific final acceptance pending. |
| P15 Customer Email Sign-In | PARTIAL / implemented | Functional code exists; reference-specific acceptance pending. |
| P16 Chef Email Sign-In | PARTIAL / implemented | Shared role-aware email flow exists; reference-specific acceptance pending. |
| P17 OTP | PARTIAL / implemented | Verification/resend behavior exists; granular acceptance audit pending. |
| P18 Password Recovery | PARTIAL / implemented | Recovery screens/service exist; acceptance audit pending. |
| P19 Firebase→CRAVES Exchange | PARTIAL / implemented | Auth exchange code exists; P02 classifies the corresponding current contract as `CONTRACT_ONLY`, so later runtime completion still requires aligned backend/APIM evidence. |
| P20 Session Restore/Refresh | PARTIAL / implemented | Session manager/bootstrap exists; P02 records the refresh route as `CONTRACT_ONLY`. |
| P21 Identity/Role Resolution | PARTIAL / implemented | `/me` and account routing code exist; P02 classifies the exact `/api/v1/auth/me` contract as `BLOCKED`. |
| P22 Customer Registration | PARTIAL / implemented | Auth-time profile completion code exists; P02 classifies customer profile GET/PUT contracts as `BLOCKED`. |
| P23 Chef Application Status | PARTIAL / implemented | Auth-time application/status code exists; P02 classifies chef application GET/POST contracts as `BLOCKED`. |
| P24 Logout Cleanup | PARTIAL / implemented | Auth/local cleanup exists; P02 records the logout route as `CONTRACT_ONLY`; full cross-feature cache cleanup cannot be complete until those features exist. |
| P25 onward | NOT STARTED | Product marketplace/customer/chef experiences have not been accepted under this rebuild protocol. |

A future phase may upgrade an existing `PARTIAL` item to `DONE` by auditing it against the exact guide reference/contracts and completing any missing tests/behavior. Do not rewrite already-correct code merely to make the status label change.

---

## 8. Explicitly Not Complete

The following must **not** be described as complete at this point:

- runtime/backend/APIM resolution of the `CONTRACT_ONLY` and `BLOCKED` routes identified by P02,
- restoration/approval of the missing authoritative full APIM/OpenAPI contract,
- an approved production feature-flag/remote-config provider/key contract for future flag-controlled features,
- P06 Shared Interaction Primitives acceptance,
- per-screen/reference visual certification of the P04 token baseline and P05 motion baseline,
- Customer Home refs 5/6,
- Discover Chefs refs 7/8,
- Orders refs 9/10 and order child flows,
- Customer Profile refs 11/12,
- Dish/Kitchen/Filter/Cart refs 13–18,
- Favorites/Notifications/Profile Edit/Addresses/Payments/Offers/Reviews/Settings/Support refs 19–36,
- reference 37 eight-state system,
- Chef Dashboard and all Chef operational/product refs 38–52,
- customer bottom-nav scroll behavior,
- authoritative full cart/View Cart system,
- checkout/payment end-to-end flow,
- full lifecycle/offline/error state matrix,
- full accessibility/performance/security audits,
- 52-reference device visual certification,
- final production signing/release build.

---

## 9. Historical Artifact Quarantine

Earlier conversations/branches produced experimental or validation APK/source packages using a different implementation path. Those artifacts are **historical only** and are **not** evidence that the current `mobile-ui-rebuild-from-scratch` rebuild has completed the 52-reference application.

Future agents must not:

- copy old generated screen implementations into this branch without explicit review,
- mark phases complete because an older APK once built,
- use old artifact checksums as current release evidence,
- resume an old release workflow as though it represents this branch,
- treat the historical `mobile-phase1-bootstrap.yml`, `mobile-phase1-deps.yml`, `mobile-phase1-implement.yml`, or `apps/mobile/PHASE1.md` as the current phase-control mechanism.

Only this ledger plus current branch code/CI evidence determines current completion.

---

## 10. Phase Completion Recording Protocol

After every authorized phase, append/update a record containing:

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

Do not erase useful history. If a later phase changes an earlier implementation, record the new phase/commit and note the superseded behavior.

---

## 11. Phase History

### P00 — Execution Documents and Source Lock

- Status: **DONE**
- Started from product-code commit: `b91802ecd98b76a6aa28680c7e3bf83693816d74`
- Documentation commits:
  - `plan.md` — `5ffe4abdb4899b65065a7ed01752092b11fa88d3`
  - `phases.md` — `144ff81acfa6fdbfeda5c8c49ebf25f94e83c456`
  - initial `build.md` — `7283b4ddae569e6826da8467e7e1cde1f6c9ddca`
  - `agent.md` — `29add4fafac303b4293840b7f89ae8ab2c98f7d7`
- Guide scope locked: 183 pages / 52 references, customer + chef.
- Backend/APIM code changed: **No**.
- Product source changed: **No**.
- APK built: **No**.
- CI: no new product CI required because P00 is documentation-only; latest product-code CI run `31178539054` remains green.
- Blockers: none.
- Next phase at completion: **NONE AUTHORIZED — waiting for user**.

### P01 — Repository Architecture Inventory

- Status: **DONE**
- Started from commit: `64dfbd18820b2644ee0263d5fffcefbd62172dfe`
- Completed at commit: `d27d6eacef2f2c21f8908116d526e1fffc6bf2a0`
- Guide references: global Project Overview, Technology Stack, Development Rules, State Management, Code Quality, Security, and Testing standards from the full 183-page / 52-reference master guide; no screen reference was implemented in this phase.
- Changed files: `build.md` only.
- APIM/contracts used: none. P02 contract inventory was deliberately not started.
- Behavior completed: no product behavior changed. Formal ownership inventory completed for mobile entry/root, providers, navigation, Redux, TanStack Query, runtime config, HTTP/error/correlation, secure session storage, Firebase Auth, design tokens/shared components, feature organization, tests, Android native project, and mobile CI. Duplicate/legacy architecture findings and deferred cleanup notes are documented in Section 5.
- Tests/checks: repository branch/head, mobile directory trees, source owners, Android configuration, dependency manifest, tests, and CI workflow were inspected. No code-level CI rerun was required because P01 changes documentation only; latest product-code CI run `31178539054` remains **SUCCESS**.
- Visual QA: not applicable to this architecture-inventory phase; no UI changed.
- APK built: **No**.
- Backend/APIM/infrastructure code changed: **No**.
- Blockers: none.
- Next phase: **NONE AUTHORIZED — waiting for user**.

### P02 — APIM/OpenAPI Contract Inventory

- Status: **DONE**
- Started from commit: `5b40ca380f6a8e0a6d3f0ddd9fa6cf262ac3787f`
- Inventory artifact commit: `ed23344ea2cdbe89b1543432f265bb320e56d505`
- Guide references: global API/integration/authentication/state/validation rules only; no screen reference was implemented.
- Changed files: `docs/mobile-ui-rebuild/P02_APIM_OPENAPI_CONTRACT_INVENTORY.md`, `build.md`.
- APIM/contracts used: current mobile consumers under `apps/mobile/src/**`; current backend evidence under `apps/api/**`; APIM evidence under `infra/apim/**`; `docs/CRV-AUTH-001-auth-service-LLD.md`; `main` used only as reference where expected paths were absent.
- Behavior completed: **No product behavior changed.** All 8 currently consumed mobile HTTP operations were inventoried with method/path, contract/backend/APIM evidence, auth expectation, route-key expectation, status, and mitigation.
- Classification: **0 `VERIFIED`, 3 `CONTRACT_ONLY`, 5 `BLOCKED`**. P02 makes no runtime-verification claim.
- Key gaps recorded: missing `infra/apim/full/openapi.yaml`; expected `backend/functions/src/functions/**`, `mobile/src/services/api/**`, and `infra/apim/policies/**` layouts do not match current repository layout; mobile `/api/v1/...` vs current Express `/api/auth/...` auth path mismatch; refresh/logout backend handlers are `501` stubs; `/auth/me`, customer profile, and exact chef application operation evidence is incomplete; chef APIM policy contains placeholder backend/function-key values.
- Route-key result: no client route key/subscription key requirement was found for the 8 consumed operations; the Chef APIM template's downstream `x-functions-key` injection is not treated as a mobile route key.
- Tests/checks: static repository audit and cross-branch reference checks only. No API runtime calls, device tests, APK build, or new product CI run were performed or claimed because P02 changed documentation only.
- Visual QA: not applicable; no UI changed.
- APK built: **No**.
- Backend/APIM/infrastructure code changed: **No**.
- Product source changed: **No**.
- Blockers: unresolved API contracts remain explicitly recorded in the P02 inventory; they do not invalidate completion of the inventory phase.
- Next phase: **NONE AUTHORIZED — waiting for user**.

### P03 — Runtime Configuration and Environment Boundary

- Status: **DONE**
- Started from commit: `ad37c1366b3399c9910e76a1343d9454f42f30eb`
- Completed implementation at commit: `57f371cc3851c78daa6a0bd6b28521f0c62babb2`
- Evidence: `docs/mobile-ui-rebuild/P03_RUNTIME_CONFIGURATION_ENVIRONMENT_BOUNDARY.md`.
- Guide references: global Development Rules, runtime/networking configuration, security, state ownership, and feature-flag/remote-configuration rules from the full 183-page / 52-reference master guide; no screen reference or UI was implemented.
- Changed implementation/evidence files: `apps/mobile/src/core/config/runtimeConfig.ts`, `apps/mobile/src/core/config/runtimeConfig.test.ts`, `apps/mobile/.env.example`, `apps/mobile/android/app/build.gradle`, `apps/mobile/jest.setup.js`, `docs/mobile-ui-rebuild/P03_RUNTIME_CONFIGURATION_ENVIRONMENT_BOUNDARY.md`; `build.md` updated only as the completion ledger.
- APIM/contracts used: **No new endpoint or backend contract was introduced.** The existing central HTTP client continues to source `apiBaseUrl` from `getRuntimeConfig()`. P02 route classifications and blockers are unchanged.
- Behavior completed: hardened the existing runtime schema and typed failure behavior; externalized deployment-specific endpoint/environment values; removed the production endpoint from committed example/test configuration; wired Android to the existing `react-native-config` dotenv bridge; statically verified current Firebase Android Google Services/package configuration; audited feature flags/remote config and recorded that no established provider/SDK/current consumer exists, so no arbitrary key/provider was fabricated.
- Tests/checks: GitHub Actions run `31194872495` — **SUCCESS**. `npm ci`, TypeScript strict check, ESLint with zero warnings, Jest including new runtime-config tests, production Android JavaScript bundle generation, and backend/APIM/infrastructure source guard all passed.
- Visual QA: not applicable; P03 changes no screen layout or visual behavior.
- APK built: **No**, per the implementation-phase policy.
- Backend/APIM/infrastructure source changed: **No**.
- Blockers: none to P03 acceptance. Future flag-controlled product behavior requires an approved centralized provider and exact key/default/rollout contract before implementation.
- Next phase: **NONE AUTHORIZED — waiting for user**.

### P04 — Design Token Baseline

- Status: **DONE**
- Started from commit: `3a221d71819dc1bb079f01bbcfc5428fc65ca521`
- Completed implementation at commit: `ae15a1702923e68dbd3b3582d664e500ec723927`
- Evidence: `docs/mobile-ui-rebuild/P04_DESIGN_TOKEN_BASELINE.md`.
- Guide references: full 183-page master guide global UI standards: brand tokens, warm surfaces, semantic colors, tokenized spacing/radius/typography/icon/elevation/borders, safe-area-aware layout, Android interaction sizing, scalable text, and restrained shadows/borders. No individual screen reference was implemented.
- Changed implementation/evidence files: `apps/mobile/src/design/tokens.ts`, `apps/mobile/src/design/tokens.test.ts`, `apps/mobile/src/shared/components/Icon.tsx`, `apps/mobile/src/features/auth/components/AuthCard.tsx`, `apps/mobile/src/features/auth/components/PrimaryButton.tsx`, `apps/mobile/src/features/auth/components/InputField.tsx`, `apps/mobile/src/features/auth/components/AuthShell.tsx`, `docs/mobile-ui-rebuild/P04_DESIGN_TOKEN_BASELINE.md`; `build.md` updated only as the completion ledger.
- APIM/contracts used: **None.** P04 is a design-system foundation phase and introduces no network/backend behavior. P02 route classifications and blockers are unchanged.
- Behavior completed: retained the existing single token system; locked Flame Red/Espresso Brown; normalized warm/semantic surfaces, semantic status/text colors, 4 dp spacing, radii, border widths, typography/font-weight vocabulary, icon sizes, Android-first touch targets, safe-area content clearances, dynamic-type policy, and shared elevation/shadow definitions; migrated current foundation consumers only where they carried those baseline values.
- Tests/checks: GitHub Actions run `31196834196` — **SUCCESS**. `npm ci`, TypeScript strict check, ESLint with zero warnings, Jest including the new design-token invariant suite, production Android JavaScript bundle generation, and backend/APIM/infrastructure source guard all passed.
- Visual QA: final reference/device visual certification intentionally deferred. P04 does not claim pixel-perfect certification of any reference image.
- APK built: **No**, per the implementation-phase policy.
- Backend/APIM/infrastructure source changed: **No**.
- Blockers: none to P04 acceptance.
- Next phase: **NONE AUTHORIZED — waiting for user**.

### P05 — Shared Motion and Reduced-Motion Baseline

- Status: **DONE**
- Started from commit: `783b29224661a969405837c2a1ef7f5a477b427c`
- Completed implementation at commit: `53f27fd405208cdd6b740124c0901857d04bd8fd`
- Evidence: `docs/mobile-ui-rebuild/P05_SHARED_MOTION_REDUCED_MOTION_BASELINE.md`.
- Guide references: full 183-page master guide page 14 Animation Guidelines plus global UX/performance/accessibility rules requiring consistent motion, transform/opacity preference, reduced-motion equivalents, smooth mid-range Android behavior, and no animation that delays critical navigation/error handling. No individual screen reference was implemented.
- Changed implementation/evidence files: `apps/mobile/src/design/motion.ts`, `apps/mobile/src/design/reducedMotion.ts`, `apps/mobile/src/design/motion.test.ts`, `docs/mobile-ui-rebuild/P05_SHARED_MOTION_REDUCED_MOTION_BASELINE.md`; `build.md` updated only as the completion ledger.
- APIM/contracts used: **None.** P05 is a client design-system foundation phase. No endpoint, route key, request/response model, auth contract, backend/APIM/infrastructure source, or environment behavior changed. P02 classifications remain unchanged.
- Behavior completed: added a single intent-level motion vocabulary for press/chip-tab/bounded list insertion-removal/bottom navigation/View Cart/modal/skeleton behavior; standardized short durations, cubic-bezier curves, and restrained springs; restricted shared transition properties to opacity/transform; added platform reduced-motion preference tracking with a conservative startup default; added immediate low-motion resolution disabling springs/continuous shimmer; fixed critical auth/payment/error animation delays at zero; prevented whole-large-list animation and bounded list-item change animation.
- Tests/checks: GitHub Actions run `31197890099` — **SUCCESS**. `npm ci`, TypeScript strict check, ESLint with zero warnings, Jest including the new P05 motion invariant suite, production Android JavaScript bundle generation, and backend/APIM/infrastructure source guard all passed.
- Visual QA: no screen/reference was implemented in P05; device-level reduced-motion and reference animation certification remains in later component/screen/QA phases.
- APK built: **No**, per the implementation-phase policy.
- Backend/APIM/infrastructure source changed: **No**.
- Blockers: none to P05 acceptance.
- Next phase: **NONE AUTHORIZED — waiting for user**.

---

## 12. Current Next Step

**Stop here.**

P05 is complete. P06 — Shared Interaction Primitives is the next phase in `phases.md`, but it is **not authorized** by completion of P05. Begin P06 only after the user explicitly says to continue/start the next phase.