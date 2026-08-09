# P106 — Chef Subscription Plan UI

**Branch:** `mobile-ui-rebuild-from-scratch`  
**Guide authority:** full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, Reference 51 / source page 43 / `image51.jpeg`  
**Phase start HEAD:** `bba0543da67b2b2571c70afb45c129d7c296784a`  
**Implementation/code end:** `2803914efaffd65f000a9e6d44c9889d23433ebd`  
**Status:** **PARTIAL at full Guide Reference-51 scope; the real routed UI is implemented at the exact fail-closed P105 contract boundary.**

## Authorized scope implemented

P106 alone was implemented. No P107 work was started.

- Added the typed `ChefSubscriptionPlan` route to the existing Chef Profile stack.
- Wired the existing Chef Profile `Subscription plan` row to the real route.
- Kept the screen inside the Profile tab stack so the existing Chef bottom navigation remains stable.
- Reused the existing `ChefHeader`, design tokens, `Icon`, safe-area handling, and Chef navigation architecture.
- Added the Reference-51 structure that can be truthfully represented without inventing backend data:
  - back/Profile navigation,
  - Chef header/notification surface,
  - current-plan banner,
  - plan catalogue unavailable state,
  - annual-savings unavailable banner,
  - comparison/entitlement capability section,
  - manage-plan CTA boundary,
  - change/cancel/renew explanation actions,
  - support CTA boundary,
  - inherited Chef bottom navigation.
- Added an explicit P106 presentation-boundary model derived from the P105 contract boundary.
- Added focused tests for empty server-owned values, non-runnable high-impact mutations, support fail-closed behavior, and absence of reference-only tier/currency values.

## Contract safety retained from P105

Reference 51 requires current plan, billing cycle, plans, eligibility, pricing, feature entitlements, subscription status, purchase/manage state, billing-provider integration, and high-impact plan-management behavior to be authoritative.

The audited repository still has no approved Chef platform-subscription contract for those capabilities. Therefore P106 deliberately does **not**:

- reuse `/api/v1/subscriptions*` or `/api/v1/admin/subscription*` customer meal-plan/sellable-plan contracts;
- present Basic/Premium/Pro as live plan data merely because those names appear in the reference design;
- hard-code plan prices, currency, tax, discounts, annual savings, benefits, or eligibility;
- claim a current plan or subscription status;
- fabricate proration/effective-date/grace-period state;
- fabricate a checkout/billing-provider flow;
- execute change/cancel/renew mutations without an exact backend contract;
- create a fake subscription support destination.

The primary manage action is visibly disabled. Change/cancel/renew and support rows only explain the exact unavailable boundary; they do not execute a mutation or fake a success flow.

## Changed code files

- `apps/mobile/src/features/chefSubscription/domain/chefSubscriptionPlanBoundary.ts`
- `apps/mobile/src/features/chefSubscription/domain/chefSubscriptionPlanBoundary.test.ts`
- `apps/mobile/src/features/chefSubscription/screens/ChefSubscriptionPlanScreen.tsx`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/app/navigation/ChefRootNavigator.tsx`
- `apps/mobile/src/features/chefProfile/screens/ChefProfileScreen.tsx`

Evidence/ledger files:

- `docs/mobile-ui-rebuild/P106_CHEF_SUBSCRIPTION_PLAN_UI.md`
- `build.md`

## Validation / guard state

- `GitHub.compare_commits` from phase-start HEAD `bba0543da67b2b2571c70afb45c129d7c296784a` through code end `2803914efaffd65f000a9e6d44c9889d23433ebd` is fast-forward by six commits and contains exactly the six P106 code/test/navigation/profile files listed above.
- The existing `ChefProfileScreen.tsx` replacement was source-diff checked: the phase changes only the subscription-row boundary copy and adds the `ChefSubscriptionPlan` navigation branch; unrelated Profile logic/styles were preserved.
- Source review confirms the new route is inside the existing Chef Profile stack, so the Chef bottom navigation is inherited and no Customer cart/view-cart state is introduced.
- Focused test source verifies server-owned plan values remain empty and change/cancel/renew remain `allowed: false` while the P105 backend contract is unavailable.
- GitHub Actions are intentionally not claimed as a P106 pass/fail signal because the account's monthly Actions capacity is exhausted and the user explicitly instructed continuing without it.
- Full workspace dependency installation, strict TypeScript execution, ESLint execution, Jest execution, production Android bundle/build, emulator/device behavior, and Reference-51 pixel-level visual certification are **not recorded as passing or failing for P106** from this connector-only phase.

## Remaining blockers at full Guide-51 scope

1. No approved Chef platform plan catalogue/current-plan contract.
2. No authoritative pricing/currency/tax/billing-cycle/annual-savings contract.
3. No Chef plan eligibility contract.
4. No feature-entitlement matrix contract.
5. No subscription pending/failed/grace-period/cancelled/effective-date state model.
6. No upgrade/downgrade confirmation/proration/idempotency contract.
7. No cancellation or renewal/reactivation contract.
8. No Chef platform billing-provider integration contract.
9. No approved Chef subscription-specific support destination.
10. Device visual comparison against `image51.jpeg` remains a later visual-certification concern and cannot convert missing business contracts into UI constants.

## Phase result

P106 is **PARTIAL**, not DONE: the real production route and fail-closed Reference-51 screen boundary are present and reachable from Chef Profile, but the product capabilities that depend on missing authoritative Chef subscription contracts remain intentionally non-runnable and unpopulated.

**Stop boundary:** P107 is not authorized by this phase and was not started.
