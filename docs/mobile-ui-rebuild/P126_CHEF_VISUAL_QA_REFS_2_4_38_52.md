# P126 — Chef Visual QA Refs 2, 4, 38–52

## Phase record

- **Branch:** `mobile-ui-rebuild-from-scratch`
- **Authorized phase:** P126 only
- **Starting branch HEAD:** `611487c4cae68c0f9f92cb76fe74e796186285c0`
- **Deterministic guard commit:** `8c313422ccb0031bf9802222387a8f0be3dc6cc7`
- **Status:** **PARTIAL / QA PENDING** — deterministic reference/source preflight is implemented; required live Android device/emulator reference comparison remains pending.
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

Added:

- `apps/mobile/__tests__/visual/P126ChefVisualQATargets.test.ts`

The guard locks the following before any live visual certification can be claimed:

1. exact P126 reference coverage and order: `2, 4, 38–52`;
2. Chef role context for both shared authentication references;
3. all operational refs 38–52 remain bound to existing Chef feature modules;
4. no P126 target opts into customer-shell/View-Cart/cart-overlay chrome;
5. implementation availability remains explicit rather than fabricating screens for missing backend capability;
6. every target remains `pending-device-comparison` until actual reference comparison is performed;
7. the required visual comparison dimensions remain locked.

This is a deterministic preflight/evidence guard. It is not a screenshot test and is deliberately unable to turn a target into a visual pass by itself.

## Required live comparison dimensions

Each of the 17 P126 reference states must still be rendered on the supported Android device/emulator matrix and compared directly with the corresponding master-guide image for:

- safe-area placement and system-bar clearance;
- hierarchy and section ordering;
- typography scale, weight, line-height, wrapping, and truncation;
- Flame Red/Espresso Brown and warm-surface color fidelity;
- horizontal/vertical spacing and alignment;
- radii, borders, shadows/elevation, and separators;
- icon family, sizing, stroke weight, position, and state treatment;
- image/illustration crop, aspect ratio, and focal position;
- vertical rhythm across populated, loading, empty, unavailable, error, and disabled states that are actually supported by each implementation;
- overlays, sticky actions, keyboard interaction, and safe-area clearance where applicable.

For refs 2 and 4, the live capture must explicitly select the **Chef** role. For refs 38–52, the capture must run inside the authenticated Chef route boundary. Customer bottom navigation and the customer View Cart overlay must remain absent throughout the Chef operational captures.

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

For every row, completion requires: capture -> side-by-side reference comparison -> record every observed deviation -> fix only confirmed mismatches within the existing product/contract boundary -> recapture -> mark PASS. Contract-blocked data/actions must stay fail-closed; visual QA must never invent backend capability just to resemble a populated reference.

## Chef/customer chrome isolation

P126 preserves the role-isolation contract:

- shared auth refs 2 and 4 use focused auth chrome and carry `CHEF` role context;
- Chef operational refs 38–52 bind only to Chef feature screens;
- customer bottom tabs are not part of the P126 operational target matrix;
- customer View Cart/cart-overlay chrome is forbidden on Chef operational screens;
- no customer-cart product source was modified in P126.

The live device run must still verify this behavior visually; the deterministic guard prevents the QA matrix itself from normalizing customer chrome into Chef acceptance.

## Validation boundary

Repository/source traceability and static guard construction are complete at the P126 connector-accessible boundary. Full local TypeScript/Jest/ESLint/Android bundle execution and physical/emulator screenshot comparison are not claimed from this environment unless a CI run independently completes after the commits.

No backend, APIM, OpenAPI, infrastructure, Android-native, Gradle, auth/session contract, product API contract, customer runtime UI, Chef runtime UI, or dependency source was changed by P126. The phase intentionally adds only QA/evidence control artifacts plus the required implementation-ledger update.

## P126 completion gate

P126 may move from **PARTIAL / QA PENDING** to **DONE** only after all 17 reference rows have real device/emulator evidence and every confirmed deviation is either corrected and recaptured or explicitly accepted. Until then, the deterministic guard must continue to report every target as `pending-device-comparison`.

## Phase stop

**P127 is NOT STARTED.** This execution stops at P126 and does not perform regression/readiness work assigned to the next phase.
