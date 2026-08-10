# P126 — Chef Visual QA Refs 2, 4, 38–52

## Phase record

- **Branch:** `mobile-ui-rebuild-from-scratch`
- **Authorized phase:** P126 only
- **Starting branch HEAD:** `611487c4cae68c0f9f92cb76fe74e796186285c0`
- **Initial deterministic guard commit:** `8c313422ccb0031bf9802222387a8f0be3dc6cc7`
- **Validated QA/test commit:** `0cae3a5823246ac8240c54db12336eb50301a432`
- **CI:** CRAVES Mobile Implementation CI **#479**, run ID `31393909447` — **SUCCESS**
- **Status:** **PARTIAL / QA PENDING** — deterministic reference/source preflight is implemented and CI validated; required live Android device/emulator reference comparison remains pending.
- **Guide authority:** full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`.
- **Phase scope:** guide refs **2, 4, 38–52** only. P127 is not started by this phase.

## Authority and dependency reconciliation

Before writing the P126 guard, the current branch was reconciled against `plan.md`, `phases.md`, `agent.md`, `build.md`, the full-guide phase traceability already recorded in the repository, the current production feature tree, and the accepted evidence for the implementation phases that own refs 2, 4, and 38–52.

P125 remains independently **PARTIAL / QA PENDING** because its live customer screenshot comparison is still outstanding. The user explicitly authorized continuing to the next single phase; this P126 execution therefore records the maximum deterministic Chef visual-QA boundary that can be established from this connector environment without falsely clearing either visual gate.

The repository does not expose an Android emulator/device framebuffer or side-by-side screenshot capture surface through this execution environment. P126 therefore does not claim pixel-perfect certification and does not make speculative production UI changes without observed reference-backed mismatches.

## Locked Chef reference matrix

| Ref | Guide/reference state | Production implementation target | Current implementation availability | Live certification |
|---:|---|---|---|---|
| 2 | Chef Phone Number Sign-In | `apps/mobile/src/features/auth/screens/PhoneSignInScreen.tsx` | Implemented role-aware auth state | Pending device comparison |
| 4 | Chef Email and Password Sign-In | `apps/mobile/src/features/auth/screens/EmailSignInScreen.tsx` | Implemented role-aware auth state | Pending device comparison |
| 38 | Chef Dashboard | `apps/mobile/src/features/chefDashboard/screens/ChefDashboardScreen.tsx` | Implemented | Pending device comparison |
| 39 | Chef New Order Detail | `apps/mobile/src/features/chefOrders/screens/ChefOrderDetailScreen.tsx` | Implemented at accepted action boundary | Pending device comparison |
| 40 | Chef Preparing Orders | `apps/mobile/src/features/chefOrders/screens/ChefPreparingOrdersScreen.tsx` | Partial capability | Pending device comparison |
| 41 | Chef Orders — New | `apps/mobile/src/features/chefOrders/screens/ChefNewOrdersScreen.tsx` | Partial capability | Pending device comparison |
| 42 | Chef Ready for Pickup | `apps/mobile/src/features/chefOrders/screens/ChefReadyOrdersScreen.tsx` | Partial capability | Pending device comparison |
| 43 | Chef Completed Orders | `apps/mobile/src/features/chefOrders/screens/ChefCompletedOrdersScreen.tsx` | Partial capability | Pending device comparison |
| 44 | Chef Menu | `apps/mobile/src/features/chefMenu/screens/ChefMenuScreen.tsx` | Partial capability | Pending device comparison |
| 45 | Chef Add New Menu Item | `apps/mobile/src/features/chefMenu/screens/ChefAddMenuItemScreen.tsx` | Partial capability | Pending device comparison |
| 46 | Chef Analytics | `apps/mobile/src/features/chefAnalytics/screens/ChefAnalyticsScreen.tsx` | Partial capability | Pending device comparison |
| 47 | Chef Account/Profile | `apps/mobile/src/features/chefProfile/screens/ChefProfileScreen.tsx` | Partial capability | Pending device comparison |
| 48 | Chef Edit Profile | `apps/mobile/src/features/chefProfile/screens/ChefEditProfileScreen.tsx` | Partial capability | Pending device comparison |
| 49 | Chef Business Information | `apps/mobile/src/features/chefBusinessInformation/screens/ChefBusinessInformationScreen.tsx` | Partial capability | Pending device comparison |
| 50 | Chef Payout History | `apps/mobile/src/features/chefPayout/screens/ChefPayoutHistoryScreen.tsx` | Partial capability | Pending device comparison |
| 51 | Chef Subscription Plan | `apps/mobile/src/features/chefSubscription/screens/ChefSubscriptionPlanScreen.tsx` | Partial capability / fail-closed contract | Pending device comparison |
| 52 | Chef App Preferences | `apps/mobile/src/features/chefPreferences/screens/ChefAppPreferencesScreen.tsx` | Partial capability / fail-closed persistence | Pending device comparison |

The two auth references intentionally reuse the shared role-aware auth screens; P126 does not create a parallel Chef authentication UI stack. Refs 38–52 stay on existing `chef*` feature modules.

## Deterministic P126 guard

Added `apps/mobile/__tests__/visual/P126ChefVisualQATargets.test.ts`. The guard locks:

1. exact P126 reference coverage and order: `2, 4, 38–52`;
2. Chef role context for both shared authentication references;
3. all operational refs 38–52 to existing Chef feature modules;
4. exclusion of customer-shell/View-Cart/cart-overlay chrome from the Chef target matrix;
5. explicit implementation availability rather than fabricated screens/data;
6. `pending-device-comparison` for every target until actual reference comparison is performed;
7. safe-area, hierarchy, typography, colors, spacing, radii, icons, crops, vertical rhythm, and overlays as required comparison dimensions.

This is a deterministic preflight/evidence guard, not a screenshot test, and cannot turn a target into a visual pass by itself.

## CI correction and validation

The initial P126 guard push triggered **CI #478 / run ID `31393047864`**, which failed at the TypeScript strict step. The failure exposed a branch-level test-scope issue: the P124 and P125 visual-QA test files were script-scoped and declared identical top-level test-only identifiers (`CustomerVisualQaTarget`, `CUSTOMER_VISUAL_QA_TARGETS`, and `REQUIRED_COMPARISON_DIMENSIONS`). Adding the P126 guard caused TypeScript to compile the visual-QA files together and surface those collisions.

The correction was deliberately minimal and QA-only: `export {};` was added to P124, P125, and P126 visual-QA test files so each is treated as its own module. No test intent, reference mapping, phase status, production code, runtime behavior, or visual certification changed.

Corrected commit: `0cae3a5823246ac8240c54db12336eb50301a432`.

**CRAVES Mobile Implementation CI #479 / ID `31393909447` completed successfully** for that commit. Passed stages:

- dependency installation;
- TypeScript strict check;
- ESLint;
- full Jest suite, including the P126 visual-QA preflight;
- production Android JavaScript bundle generation;
- backend/APIM/infrastructure source-change guard.

The successful code/CI gate does **not** substitute for the device/reference visual gate.

## Required live comparison dimensions

Each of the 17 P126 reference states must still be rendered on the supported Android device/emulator matrix and compared directly with the corresponding master-guide image for safe areas, hierarchy, typography, colors, spacing, radii, icons, image/illustration crops, vertical rhythm, overlays/sticky actions, keyboard behavior where applicable, and supported loading/empty/error/disabled states.

For refs 2 and 4, the live capture must explicitly select the **Chef** role. For refs 38–52, the capture must run inside the authenticated Chef route boundary. Customer bottom navigation and the customer View Cart overlay must remain absent throughout Chef operational captures.

## Live capture ledger

The following rows are intentionally not marked PASS until real device/emulator comparison evidence exists:

- [ ] Ref 2 — `image2.jpeg` — Chef Phone Number Sign-In
- [ ] Ref 4 — `image4.jpeg` — Chef Email and Password Sign-In
- [ ] Ref 38 — `image38.jpeg` — Chef Dashboard
- [ ] Ref 39 — `image39.jpeg` — Chef New Order Detail
- [ ] Ref 40 — `image40.jpeg` — Chef Preparing Orders
- [ ] Ref 41 — `image41.jpeg` — Chef Orders — New
- [ ] Ref 42 — `image42.jpeg` — Chef Ready for Pickup
- [ ] Ref 43 — `image43.jpeg` — Chef Completed Orders
- [ ] Ref 44 — `image44.jpeg` — Chef Menu
- [ ] Ref 45 — `image45.jpeg` — Chef Add New Menu Item
- [ ] Ref 46 — `image46.jpeg` — Chef Analytics
- [ ] Ref 47 — `image47.jpeg` — Chef Account/Profile
- [ ] Ref 48 — `image48.jpeg` — Chef Edit Profile
- [ ] Ref 49 — `image49.jpeg` — Chef Business Information
- [ ] Ref 50 — `image50.jpeg` — Chef Payout History
- [ ] Ref 51 — `image51.jpeg` — Chef Subscription Plan
- [ ] Ref 52 — `image52.jpeg` — Chef App Preferences

For every row, completion requires: capture -> side-by-side reference comparison -> record deviations -> fix only confirmed mismatches within the existing product/contract boundary -> recapture -> mark PASS. Contract-blocked data/actions must stay fail-closed; visual QA must never invent backend capability just to resemble a populated reference.

## Changed-file boundary

P126 introduced or updated only QA/evidence/control files:

- `apps/mobile/__tests__/visual/P126ChefVisualQATargets.test.ts`
- `apps/mobile/__tests__/visual/P124CustomerVisualQATargets.test.ts` — module-scope compile correction only
- `apps/mobile/__tests__/visual/P125CustomerVisualQATargets.test.ts` — module-scope compile correction only
- `docs/mobile-ui-rebuild/P126_CHEF_VISUAL_QA_REFS_2_4_38_52.md`
- `build.md`
- `docs/mobile-ui-rebuild/archive/BUILD_LEDGER_PRE_P126_2026-08-10.md` — exact preservation copy of the pre-P126 expanded ledger

No backend, APIM, OpenAPI, infrastructure, Android-native, Gradle, auth/session contract, product API contract, customer runtime UI, Chef runtime UI, or dependency source was changed by P126.

## P126 completion gate

P126 may move from **PARTIAL / QA PENDING** to **DONE** only after all 17 reference rows have real device/emulator evidence and every confirmed deviation is either corrected and recaptured or explicitly accepted. Until then, the deterministic guard remains `pending-device-comparison`.

## Phase stop

**P127 is NOT STARTED.** This execution stops at P126 and does not perform regression/readiness work assigned to the next phase.
