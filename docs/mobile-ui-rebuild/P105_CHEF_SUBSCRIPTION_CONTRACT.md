# P105 — Chef Subscription Contract

## Status

**BLOCKED at full Guide/product-contract scope; exact fail-closed mobile contract boundary implemented.**

Phase P105 is limited to the Chef platform-subscription contract required by Guide Reference 51. No P106 Subscription Plan UI/navigation work is included.

## Authority reviewed

- `agent.md`
- `build.md`
- `phases.md` — P105 requires Chef plan catalogue/current plan/eligibility/pricing/change/cancel/effective dates and explicitly forbids reusing the unrelated customer meal-subscription contract.
- `plan.md`
- Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, Reference 51 / source document page 43 / `image51.jpeg`.

Guide Reference 51 requires server-owned `currentPlan`, `billingCycle`, `plans`, `eligibility`, `featureMatrix`, `subscriptionStatus`, and purchase/manage state, backed by plan/pricing, current subscription, entitlement, purchase/manage/cancel/renew, and billing-provider capabilities. Pricing, benefits, eligibility, proration, effective dates, and subscription lifecycle states must be authoritative.

## Exact repository contracts audited

- `services/subscription-service/src/main/java/in/craves/subscription/web/SubscriptionController.java`
- `services/subscription-service/src/main/java/in/craves/subscription/web/ApiDtos.java`
- `services/subscription-service/src/main/java/in/craves/subscription/service/SubscriptionService.java`
- `scripts/configure-subscription-apim.sh`
- `docs/handover/2026-07-30-customer-mobile-subscription-plans.md`

## Contract finding

The current repository subscription service is **not** the Guide-51 Chef platform-membership product.

The existing contract models customer meal-plan subscriptions:

- public plans use weekly/monthly billing periods and amount/currency;
- chefs/admins can create/list/status-manage sellable meal plans;
- customers create subscriptions using `planId`, `startDate`, optional `deliveryAddressId`, and notes;
- customer subscriptions expose service dates and customer pause/cancel behavior;
- the APIM script exposes those same customer/admin meal-plan routes.

Those routes cannot truthfully represent a Chef purchasing or managing a CRAVES platform subscription tier, plan entitlements, platform billing, upgrade/downgrade proration, effective dates, grace periods, or renewal state.

No approved current Chef platform-subscription contract was found for:

1. plan catalogue,
2. current Chef plan,
3. plan eligibility,
4. pricing/currency/tax/billing cycle,
5. feature entitlements,
6. upgrade/downgrade,
7. cancellation,
8. renewal/reactivation,
9. effective dates/pending/grace-period semantics,
10. billing-provider integration.

Per P105 acceptance, this missing Chef plan API is classified as **BLOCKED** rather than inferred from the customer meal-subscription domain.

## Implemented boundary

Added `apps/mobile/src/features/chefSubscription/domain/chefSubscriptionContract.ts` with:

- Guide-51 capability keys and explicit `BACKEND_CONTRACT_UNAVAILABLE` gaps;
- `CHEF_SUBSCRIPTION_CONTRACT_MODEL` with `status: 'blocked'`;
- explicit exclusion of the existing customer/admin meal-subscription paths so future work cannot accidentally reuse them for Chef platform membership;
- helper to list unavailable capabilities;
- complete-contract guard;
- fail-closed change/cancel/renew mutation boundary with `allowed: false`.

No network wrapper was added because no exact Chef platform-subscription APIM/backend contract exists.

No Basic/Premium/Pro values, pricing, benefits, eligibility, taxes, proration, dates, billing-provider state, or mutation route is hard-coded into production code.

## Focused tests

Added `apps/mobile/src/features/chefSubscription/domain/chefSubscriptionContract.test.ts` covering:

- all Guide-51 capabilities remain blocked;
- the current customer meal-subscription routes are explicitly excluded;
- change/cancel/renew remain disabled;
- no fabricated Chef subscription/plan/entitlement/billing endpoint is introduced;
- no plan tier value is fabricated into the contract model.

Focused test source is committed, but Jest execution is not claimed from this connector-only run. GitHub Actions are intentionally not used as a pass/fail signal because the account's monthly Actions capacity is exhausted and the user explicitly authorized continuing without it.

## Scope guard

No changes were made to:

- P106 Chef Subscription Plan UI,
- navigation/routes,
- Chef Profile rows,
- customer screens,
- customer subscription implementation,
- backend services,
- APIM/OpenAPI,
- database/infrastructure,
- dependencies,
- secrets/provider configuration.

## Git evidence

- Phase start HEAD: `e4bac0a0e36160c74f47030a9e7d519e358e8279`
- P105 code/test end: `564bcdf72bc662b1ca260da75c6bf259fcd69f96`
- Compare is fast-forward by two commits and contains only:
  - `apps/mobile/src/features/chefSubscription/domain/chefSubscriptionContract.ts`
  - `apps/mobile/src/features/chefSubscription/domain/chefSubscriptionContract.test.ts`

## Retained blockers

P106 must not claim a real current plan, plan pricing, plan benefits, entitlement state, upgrade/downgrade, cancel/renew, effective-date/proration behavior, or billing-provider operation until exact Chef platform-subscription contracts are approved and exposed.

## Next phase

**P106 — Chef Subscription Plan UI — NOT STARTED / NOT AUTHORIZED.**
