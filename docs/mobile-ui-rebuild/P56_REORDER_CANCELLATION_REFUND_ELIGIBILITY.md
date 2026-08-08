# P56 — Reorder, Cancellation, and Refund Eligibility

**Branch:** `mobile-ui-rebuild-from-scratch`  
**Phase status:** PARTIAL  
**Started from:** `38ddcfdcba11749dd767dc0c421059c95a3746a7`  
**Validated implementation:** `20081ccef8abb89a25b47c6a8bb278ec42ec45d5`  
**Scope owner:** authoritative customer reorder/cancellation/refund mutation eligibility boundary and pre-mutation revalidation guard.

## Source audit

P56 was started only after the user explicitly authorized exactly one next phase after P55. The implementation was checked against `plan.md`, `phases.md`, `agent.md`, `build.md`, the full `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, the current mobile source, and the exact Order Service/APIM source on this branch.

The current customer Order Controller exposes only:

```text
GET /api/v1/orders
GET /api/v1/orders/{orderId}
```

The current customer-order APIM read policy allows only:

```text
GET /api/v1/orders
GET /api/v1/orders/{orderId}
GET /api/v1/orders/{orderId}/delivery-status
```

The existing Cart Controller exposes normal cart read/add/update/delete/clear/validate primitives, but no reorder-validation contract and no approved historical-order-to-active-cart merge/replace contract. Checkout has quote/intent/status routes, not reorder/cancellation/refund eligibility. Chef order accept/reject/status routes are chef-authority routes and are not customer mutation authority. The refund package contains internal refund status/event processing and does not expose a customer refund eligibility/mutation REST contract.

Therefore this branch has no exact customer-exposed contract for:

- authoritative reorder eligibility or reorder mutation;
- active-cart merge/replace behavior for reorder;
- cancellation eligibility or customer cancellation mutation;
- refund eligibility or customer refund mutation.

P56 does not invent any of those routes or repurpose unrelated cart/chef/internal APIs.

## Implemented boundary

### Fail-closed mutation authority

`customerOrderActionEligibility.ts` adds one internal typed boundary for:

```text
REORDER
CANCEL
REFUND
```

Production decisions are deliberately fail-closed until an exact customer server/APIM contract exists. Raw client order status is intentionally not accepted by this authority function, so a visual/reference state can never grant mutation eligibility.

Current production blockers are:

```text
P53_REORDER_ELIGIBILITY_CONTRACT_UNAVAILABLE
P54_REORDER_CART_MERGE_CONTRACT_UNAVAILABLE
P56_CUSTOMER_ORDER_CANCELLATION_ELIGIBILITY_CONTRACT_UNAVAILABLE
P56_CUSTOMER_ORDER_REFUND_ELIGIBILITY_CONTRACT_UNAVAILABLE
```

Reorder remains blocked by both the missing authoritative historical-order eligibility contract and the unresolved active-cart merge/replace contract. Cancellation and refund remain blocked until the server exposes customer-authoritative eligibility plus mutation behavior.

### Revalidate-before-mutate guard

`executeCustomerOrderMutationAfterRevalidation(...)` establishes the P56 execution invariant for a future exact adapter:

1. call authoritative `revalidate(action)` first;
2. if the decision is not `ELIGIBLE`, return blocked and never call mutation;
3. if revalidation throws/fails, propagate the failure and never call mutation;
4. call `mutate(action)` only after the immediately preceding revalidation returned `ELIGIBLE`.

This is an app-internal safety boundary, not a fabricated REST contract.

### My Orders reorder presentation

The existing delivered-order `Reorder` reference action remains disabled. Its accessibility hint and explanatory copy now come from the centralized P56 production authority decision instead of ad-hoc phase copy.

P56 does not render actionable cancellation/refund controls because the current customer contract cannot authoritatively say that an order is eligible. This preserves the guide rule that refund/cancellation eligibility must not be client-assumed.

## Acceptance status

P56 acceptance requires exact reorder validation and cancellation/refund eligibility actions. The client now enforces the required revalidation-before-mutation invariant and explicitly prevents client-assumed eligibility, but the actual customer server/APIM contracts do not exist on this branch.

P56 is therefore **PARTIAL**, not DONE.

No backend, APIM, OpenAPI, database, infrastructure, package dependency, Android native, Gradle, APK, or AAB source was changed.

## Tests added

`customerOrderActionEligibility.test.ts` proves:

- production reorder remains blocked even though delivered orders can visually suggest the reference action;
- cancellation and refund are not inferred from client order state;
- blocked authoritative revalidation never calls mutation;
- an eligible decision calls mutation only after revalidation;
- a failed/throwing revalidation never calls mutation.

## Required CI

Workflow: `.github/workflows/mobile-phase1-ci.yml`  
Run/job: `31269398555` / `93132711235`  
Head SHA: `20081ccef8abb89a25b47c6a8bb278ec42ec45d5`  
Conclusion: **SUCCESS**

Validated gates:

- dependency install — SUCCESS;
- TypeScript strict check — SUCCESS;
- ESLint zero-warning gate — SUCCESS;
- Jest — SUCCESS;
- production Android JavaScript bundle — SUCCESS;
- backend/APIM/infrastructure source guard — SUCCESS.

No APK was produced, consistent with the implementation-phase policy.

## Files changed

Implementation/test:

- `apps/mobile/src/features/customerOrders/domain/customerOrderActionEligibility.ts`
- `apps/mobile/src/features/customerOrders/customerOrderActionEligibility.test.ts`
- `apps/mobile/src/features/customerOrders/components/CustomerOrderCard.tsx`

Evidence/ledger:

- `docs/mobile-ui-rebuild/P56_REORDER_CANCELLATION_REFUND_ELIGIBILITY.md`
- `build.md`

## Handoff

P56 is the only phase authorized and executed in this turn. **P57 was not started.**

**Next phase authorization:** NONE AUTHORIZED. Stop and wait for explicit user direction.
