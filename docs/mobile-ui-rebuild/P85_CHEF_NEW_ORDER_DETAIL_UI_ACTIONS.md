# P85 — Chef New Order Detail UI/Actions

## Status

**DONE at authorized code scope; repository CI is the completion gate for this commit.**

P85 implements Guide Reference 39's Chef New Order Detail presentation/action boundary on `mobile-ui-rebuild-from-scratch` and stops before P86 Chef Order Tab Query Architecture.

## Scope implemented

- Registers the immersive `ChefOrderDetail` native-stack route above the existing Chef bottom tabs, so the bottom navigation is hidden on the transactional detail screen.
- Renders the authoritative P84 order detail: order/status metadata, items, totals, customer, delivery address, and current state.
- Adds sticky Reject/Accept actions with a required preparation-time input for Accept and a reason/confirmation sheet for Reject.
- Uses one shared per-order decision guard so Accept and Reject are mutually exclusive and duplicate/concurrent decisions are blocked.
- Revalidates `GET /api/v1/chef/orders/{orderId}` immediately before either mutation.
- Derives the stable `Idempotency-Key` from action + order ID + latest authoritative server revision, then uses only the P84 canonical accept/reject API boundary.
- Reconciles successful mutation responses into the Chef detail cache and refreshes the shared operational order owner so Dashboard/badge counters follow server state.
- On server conflict, refreshes the latest detail where possible instead of preserving an optimistic local decision.
- Displays only a masked phone representation from the server-authorized delivery snapshot. Call/chat remain disabled because no separate authorization/chat/support-event contract exists.

## Explicit contract gaps preserved

P85 does not fabricate Reference-39 data that the backend does not expose:

- no acceptance countdown is derived from `createdAt`;
- no status timeline is synthesized;
- no customer checkout note or payment-method detail is invented;
- no call/chat/map deep link is enabled without its required authorization/event contract.

The screen explains those unavailable capabilities in place while retaining the reference hierarchy and brand treatment.

## Files changed

- `apps/mobile/src/app/navigation/ChefRootNavigator.tsx`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/features/chefOrders/domain/chefOrderDecision.ts`
- `apps/mobile/src/features/chefOrders/domain/chefOrderDecision.test.ts`
- `apps/mobile/src/features/chefOrders/screens/ChefOrderDetailScreen.tsx`
- `apps/mobile/src/features/chefOrders/state/useChefOrderDecision.ts`
- `apps/mobile/src/features/chefOrders/state/useChefOrderDetailContract.ts`
- `docs/mobile-ui-rebuild/P85_CHEF_NEW_ORDER_DETAIL_UI_ACTIONS.md`

## Validation contract

The repository workflow must pass the same mobile gates used by the rebuild before P85 is reported complete: strict TypeScript, ESLint, Jest, Android production JS bundle, and source-boundary guard. The decision tests cover server revalidation, stale-state mutation prevention, duplicate accept/reject blocking, stable idempotency, and masked contact output.

## Phase boundary

- Current phase: **P85 — Chef New Order Detail UI/Actions**.
- P86 — Chef Order Tab Query Architecture is **not implemented by this change**.
- No P86 order-tab queries, filters, pagination, tab state, or list screens are added here.
