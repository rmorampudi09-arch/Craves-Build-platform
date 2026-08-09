# P109 — Chef Cross-Screen Reconciliation Audit

**Branch:** `mobile-ui-rebuild-from-scratch`  
**Authorized phase:** P109 only  
**Status:** **PARTIAL at full Guide/product scope; all currently supported Chef cross-screen state is reconciled at the exact approved contract boundary, while payout-balance and analytics-total propagation remain blocked by missing authoritative contracts.**

## 1. Scope reviewed

P109 was executed only after re-reading `plan.md`, `phases.md`, `agent.md`, `build.md`, the full `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, and the implemented Chef phases P80–P108.

The audit covered the exact P109 scope: order counts/status, notifications, active cards, payout balance, menu availability, analytics totals, and identity/verification state. P110 deep-link/notification routing was not started.

## 2. Reconciliation result

### Order counts/status and active cards

`ChefOperationalProvider` is the shared authoritative mobile cache for Chef operational orders. Dashboard counters/active cards and all Chef order tabs derive from that same query state. Near-real-time order refresh from P91 continues to reconcile server snapshots without allowing older snapshots to regress visible lifecycle state.

One supported-path gap was found: the order-detail accept/reject mutation updated the order-detail cache and then waited for `operational.refresh()` before other mounted Chef surfaces saw the change. P109 now writes the authoritative mutation/conflict response into `reconcileOrderStatus(...)` immediately, then keeps the existing server refresh. Dashboard counters, active cards and Orders tabs therefore move together as soon as the mutation response is accepted.

### Notifications

The Chef header badge and Dashboard notification summary both derive from the single `chef-notifications` query owned by `ChefOperationalProvider`. Mark-read already updates that shared query cache, so no duplicate notification store or P109 mutation layer was added.

### Menu availability

P93–P95 already synchronize Chef Menu mutations with the Dashboard menu cache. Availability changes use optimistic update/rollback plus authoritative response replacement and revalidation; add/edit mutations update both Menu and Dashboard sources. P109 keeps that architecture unchanged rather than introducing another store.

### Identity / verification

Chef Profile, Edit Profile and Business Information already share the canonical `chef-profile-kitchen` query. P109 extends the post-save synchronization boundary so a successful profile replacement also invalidates `chef-business-information`. Navigating immediately from Edit Profile to Business Information can no longer reuse a stale verification read after a profile write; the canonical kitchen cache still updates synchronously first.

### Payout balance

Full payout-balance propagation remains blocked. P103 established that the currently approved mobile boundary does not expose wallet balance, payout-series/transaction, bank destination, withdrawal eligibility or payout-initiation contracts. The earning ledger must not be relabeled as a withdrawable payout balance. P109 records this as an explicit blocker and does not fabricate cross-screen financial state.

### Analytics totals

Full analytics-total propagation remains blocked. P96/P97 established that no approved Chef analytics aggregate/date-range contract exists. Existing Orders/Earnings/Menu reads remain reconciliation sources only and are not converted into fabricated analytics KPIs or totals.

## 3. P109 audit contract

Added `chefCrossScreenReconciliation.ts` as a focused, typed audit matrix covering every P109 area exactly once. Supported areas are classified by their actual shared-cache or post-write revalidation mechanism. Payout balance and analytics totals are explicitly `blocked` with contract reasons.

This matrix is documentation/testable guard state; it does not create a second runtime source of truth.

## 4. Files changed

- `apps/mobile/src/features/chefOrders/state/useChefOrderDecision.ts`
- `apps/mobile/src/features/chefProfile/state/chefProfileSynchronization.ts`
- `apps/mobile/src/features/chefProfile/state/chefProfileSynchronization.test.ts`
- `apps/mobile/src/features/chefShell/domain/chefCrossScreenReconciliation.ts`
- `apps/mobile/src/features/chefShell/domain/chefCrossScreenReconciliation.test.ts`
- `docs/mobile-ui-rebuild/P109_CHEF_CROSS_SCREEN_RECONCILIATION_AUDIT.md`
- `build.md` (ledger update follows the implementation/evidence commit)

No customer UI, Chef visual redesign, backend, APIM, OpenAPI, database, infrastructure, dependencies, secrets, or P110 work is included.

## 5. Validation / guard state

- Focused source tests are committed for the seven-area P109 audit matrix and the expanded profile/verification invalidation behavior.
- The order-detail reconciliation change uses the existing `ChefOperationalProvider.reconcileOrderStatus` contract and preserves the existing authoritative refresh/conflict handling.
- Full repository Jest/typecheck/build execution is not claimed from this connector-only run.
- GitHub Actions are not used as a P109 acceptance signal because the account's monthly Actions capacity is exhausted and the user explicitly authorized continuing without it.

## 6. Retained blockers / completion gate

P109 remains PARTIAL at full Guide/product scope until authoritative contracts exist for:

1. Chef wallet/payout balance and payout transaction reconciliation;
2. payout eligibility/initiation/status propagation;
3. Chef analytics aggregate/date-range totals and time-series reconciliation;
4. any future server-driven verification mutation/event path beyond the current read/revalidation boundary.

Therefore:

- **P109 — Chef Cross-Screen Reconciliation Audit: PARTIAL at full Guide/product scope; current supported reconciliation boundary implemented and audited.**
- **P110 onward: NOT STARTED / NOT AUTHORIZED in this run.**

Stop after P109.
