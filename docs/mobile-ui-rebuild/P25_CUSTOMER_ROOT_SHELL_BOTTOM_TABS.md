# P25 — Customer Root Shell and Bottom Tabs

**Status:** DONE at implementation/static-navigation level.

## Authorization and phase boundary

The user authorized exactly one next phase after P24. `phases.md` identifies that phase as **P25 — Customer Root Shell and Bottom Tabs**.

P25 scope is limited to:

- typed Customer bottom tabs: Home, Chefs, Orders, Profile,
- active Flame Red state,
- safe-area-aware bottom-navigation layout,
- preserving independent tab stacks/state,
- routing an authenticated Customer whose onboarding status is `READY` into the Customer product shell.

P26 scroll-driven hide/reveal behavior is explicitly outside this phase and was not implemented.

## Sources used

- `agent.md` — one-phase authorization, repository/navigation discipline, CI and ledger requirements.
- `build.md` — P24 accepted baseline and P25 next-phase authorization target.
- `phases.md` — exact P25 scope and acceptance; P26 boundary.
- `plan.md` — Customer shell architecture, typed navigation, state preservation, safe-area and active-tab requirements.
- Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0` — Navigation Standards, Smart UI Behaviors, UI Standards, responsive/safe-area rules, and the customer shell definition.

## Commit evidence

- Started from branch HEAD: `85545d24c8f05a88ad2b7f7cffcaa6fe08438bfb`.
- Initial P25 implementation commit: `40d31af0b8ac9045b9031991b041ddac4a85d153`.
- Final validated implementation commit: `f3b6f9458f2c5e42c58989dbe6115fd382102f85`.
- Initial CI run `31226522662` correctly failed on one ESLint `react/no-unstable-nested-components` warning in the tab icon renderer; no type failure occurred.
- The icon renderers were moved to stable module-level functions in the final validated commit.
- Final CI run: `31226669633` — **SUCCESS**.

## Accepted behavior

- The existing single `NavigationContainer` remains authoritative; no parallel navigation architecture was introduced.
- `AppNavigator` now routes an authenticated Customer with `accountResolution.flow === 'CUSTOMER'` and `onboardingStatus === 'READY'` into `CustomerRootNavigator`.
- Customer onboarding with `PROFILE_REQUIRED` remains on the existing Customer registration/account-resolution path.
- `CustomerRootNavigator` owns four typed tabs in the required order: **Home, Chefs, Orders, Profile**.
- Each tab owns a separate typed native stack navigator so later product child routes can be added without resetting sibling-tab navigation state.
- Tab navigators remain mounted and `popToTopOnBlur` is disabled, preserving each tab stack rather than resetting it on tab changes.
- Active tab tint is the shared Flame Red design token (`#F62E18`); inactive tint uses the shared muted-text token.
- The bottom-tabs implementation remains inside the existing `SafeAreaProvider` hierarchy and does not impose a fixed bottom offset/height, allowing React Navigation/safe-area context to keep it clear of Android system navigation/gesture insets.
- The bottom bar hides while the keyboard is shown to avoid conflicting with form/IME space.
- Customer tab routes resolve to the non-immersive Customer chrome policy; existing auth/account-resolution routes remain immersive.
- Shared Home and Orders SVG icons were added to the existing `Icon` family rather than introducing another icon system.

## Product-screen boundary

P25 does **not** accept Home, Chefs discovery, My Orders, or Customer Profile as completed product screens. Those product/reference implementations belong to later phases.

Until their owning phases replace the roots, each tab stack reuses the already-accepted `CustomerAccountStatusScreen` as a functional signed-in surface with the real P24 logout path. This avoids fake marketplace data, empty handlers, unreachable routes, or falsely claiming later product references as complete.

No P26 scroll hide/reveal behavior, cart/View Cart implementation, catalog discovery, orders domain, customer profile product UI, deep-link product routing, or Chef product shell was added.

## Changed files

- `apps/mobile/src/app/navigation/AppNavigator.tsx`
- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/app/navigation/customerTabs.ts`
- `apps/mobile/src/app/navigation/customerTabs.test.ts`
- `apps/mobile/src/app/navigation/navigationPolicy.ts`
- `apps/mobile/src/app/navigation/navigationPolicy.test.ts`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/features/auth/screens/CustomerAccountStatusScreen.tsx`
- `apps/mobile/src/shared/components/Icon.tsx`

## APIM/backend contracts

None. P25 is a navigation-shell phase. No backend, OpenAPI, APIM, infrastructure, database, authentication contract, or Android native build configuration was changed.

## Validation

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Final run `31226669633` on `f3b6f9458f2c5e42c58989dbe6115fd382102f85` passed:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node 22.13 setup,
3. `npm ci`,
4. strict TypeScript (`tsc --noEmit`),
5. ESLint with zero warnings,
6. Jest including the new customer-tab/navigation-policy tests and prior regressions,
7. production Android JavaScript bundle generation,
8. backend/APIM/infrastructure source-change guard.

Per project policy, no Gradle/APK packaging was performed for this phase.

## Visual QA

Device/emulator pixel-fidelity certification is deferred to the later visual QA phases. P25 claims the shell/navigation behavior and tokenized styling only; it does not claim that any later Customer product reference image is visually complete.

## Blockers

None for the bounded P25 shell implementation.

## Next phase

**P26 — Customer Bottom-Nav Scroll Hide/Reveal** is next in sequence but is **NOT AUTHORIZED** by this completion record. Stop and wait for explicit user authorization.
