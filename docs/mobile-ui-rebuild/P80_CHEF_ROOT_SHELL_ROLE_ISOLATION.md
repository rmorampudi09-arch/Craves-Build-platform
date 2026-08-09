# P80 — Chef Root Shell and Role Isolation

**Branch:** `mobile-ui-rebuild-from-scratch`  
**Authorized phase:** P80 only  
**Guide source:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`  
**Guide boundary:** Global role-shell guidance and Chef navigation guidance (including the five-tab Chef shell and explicit no-customer-cart rule).  
**Phase acceptance:** Chef routes expose Dashboard / Orders / Menu / Analytics / Profile while customer-only cart/navigation/state cannot leak into the Chef shell.  
**Start commit:** `28d57054a5c3a4d2e04398a8a3662f2e8d19fcc1`  
**Validated mobile code head:** `92925304027e52884eca8efedf83a7090ec12d3d`  
**CI:** run `31301169438` / job `93214080252` — **SUCCESS**

## 1. Implemented Chef shell boundary

P80 establishes the Chef product root without pre-implementing P81+ operational screens.

- An authenticated approved Chef resolution (`flow: CHEF`) now enters a dedicated `ChefRootNavigator` instead of remaining in the Chef onboarding/status stack.
- `CHEF_ONBOARDING` remains isolated in the existing registration/account-status flow; P80 does not bypass application state or approval requirements.
- The Chef navigation domain is typed independently from the customer navigation domain.
- The Chef bottom navigation registers exactly five destinations, in the approved product order: **Dashboard, Orders, Menu, Analytics, Profile**.
- The Chef shell uses its own standard bottom-tab surface. It does not reuse `CustomerBottomTabBar`, customer bottom-nav visibility state, customer View Cart overlays, a cart tab, a cart icon, or reserved cart space.
- Active Chef tabs use the existing Flame Red brand token and inactive tabs use the existing muted text token.
- Chef tabs remain mounted across tab changes (`lazy: true`, `popToTopOnBlur: false`) so the shell has the correct state-preservation foundation for later Chef feature phases.
- A semantic Analytics icon was added to the shared icon set rather than substituting an unrelated glyph.
- The five tab destinations intentionally render only structural P80 route boundaries. Their real dashboard/order/menu/analytics/profile content remains owned by later authorized phases and is not falsely claimed complete here.

## 2. Role-isolation boundary

Before the Chef product shell becomes usable, P80 removes customer-owned private state using the existing state/query architecture:

- customer-private React Query entries are cancelled/removed through the existing role-scoped `clearPrivateQueryCache(..., {role: 'CUSTOMER'})` helper;
- customer browsing location state is reset;
- customer discovery filter sessions are reset;
- customer search/query draft and scroll state are reset;
- the customer primary-payment selection is cleared;
- the customer cart domain is reset, including its snapshot, dependencies, and mutation state.

The isolation routine resets local customer Redux state in a `finally` boundary even when private-query cancellation/removal rejects. `ChefRootNavigator` itself fails closed: the five-tab Chef shell is rendered only after isolation resolves successfully. If isolation fails, the user sees a retryable Chef-workspace error boundary instead of a shell that could retain customer state.

This phase does not invent a second auth/session store or duplicate server-state infrastructure. It reuses the existing account resolution, Redux store, React Query client, private query-key role metadata, and reset actions already present on the branch.

## 3. Explicit P81+ exclusion

P80 does **not** implement or fabricate any later Chef feature contract or screen, including:

- shared Chef header/badge/operational counters;
- Chef dashboard metrics, earnings, reviews, availability, or active-order cards;
- live Chef Orders lists/details/actions;
- menu CRUD, availability, scheduling, inventory, pricing, or image flows;
- analytics data/charts;
- Chef profile, kitchen, settings, notifications, payouts, subscriptions, or support flows.

Those remain owned by P81 onward and require their own exact phase authorization and contract checks.

## 4. Files changed

P80 code/test scope:

- `apps/mobile/src/app/navigation/AppNavigator.tsx`
- `apps/mobile/src/app/navigation/ChefRootNavigator.tsx`
- `apps/mobile/src/app/navigation/chefTabs.ts`
- `apps/mobile/src/app/navigation/chefTabs.test.ts`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/features/chefShell/state/chefRoleIsolation.ts`
- `apps/mobile/src/features/chefShell/state/chefRoleIsolation.test.ts`
- `apps/mobile/src/shared/components/Icon.tsx`

Phase evidence/ledger:

- `docs/mobile-ui-rebuild/P80_CHEF_ROOT_SHELL_ROLE_ISOLATION.md`
- `build.md`

No backend, APIM, infrastructure, database, or customer product-screen source was changed by P80.

## 5. Validation coverage

Focused P80 tests verify:

- the exact five Chef routes and labels in the approved order;
- there is no Chef Cart route and no cart icon in the Chef tab contract;
- Flame Red active-tab styling and tab-state preservation options;
- explicit semantic icons for all five Chef destinations;
- every customer-only Redux domain owned by the P80 policy is reset;
- customer-private cache cleanup is awaited before isolation completes;
- local customer state still resets when private cache cleanup rejects.

Repository implementation CI passed on validated mobile code head `92925304027e52884eca8efedf83a7090ec12d3d`: dependency install, strict TypeScript, ESLint, Jest, production Android JavaScript bundle, and backend/APIM/infrastructure source guard all succeeded in run `31301169438`, job `93214080252`.

No APK/AAB was built, consistent with the implementation-phase policy. Physical Android/reference-image certification is not claimed from source/CI alone.

## 6. Phase boundary

**P80 is DONE at the authorized code/CI scope.** The exact Chef root-shell/navigation and customer-state-isolation acceptance boundary is implemented and validated.

**P81 — Chef Shared Header/Badge/Operational Counters is NOT STARTED and was not authorized in this turn.**
