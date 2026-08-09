# P86 — Chef Order Tab Query Architecture

**Branch:** `mobile-ui-rebuild-from-scratch`  
**Guide references:** 40–43 — Chef Preparing Orders, Chef Orders - New, Ready for Pickup, Chef Completed Orders  
**Phase scope:** query keys, bounded paging, tab counts, independent scroll state, server-derived preparation timers.  
**Stop boundary:** P87 Preparing UI is not implemented here.

## Contract inspection

The exact target-branch backend contract was inspected before implementation:

- `GET /api/v1/chef/orders` returns `List<OrderResponse>` with no `status`, `page`, `pageSize`, or cursor parameters.
- `OrderService.listChefOrders` already bounds the server snapshot with `ORDER BY created_at DESC LIMIT 100`, then filters to the authenticated Chef's kitchens.
- `OrderResponse` carries authoritative lifecycle `status`, `prepTimeMinutes`, `createdAt`, and `updatedAt` fields.
- No backend/APIM source was changed in P86.

Because the current endpoint has no server paging/status contract, P86 does **not** invent unsupported parameters. It creates bounded client pages over the existing bounded 100-order authoritative snapshot. True server-side history pagination remains an exact-contract gap, especially for the Completed long-history requirement.

## Implemented architecture

### Four deterministic status projections

`chefOrderTabs.ts` owns the one-to-one tab policy:

- `NEW` -> `CHEF_ACCEPTANCE_PENDING`
- `PREPARING` -> `CHEF_ACCEPTED`, `PREPARING`
- `READY` -> `READY_FOR_PICKUP`
- `COMPLETED` -> `DELIVERED`

Cancelled/rejected/refund/payment/transit statuses are not silently forced into an unrelated Guide tab.

### Stable role-scoped query keys

Each status/page projection has an isolated private query key containing:

- authenticated Chef identity;
- role `CHEF`;
- status tab;
- effective page;
- bounded page size.

The underlying network request remains the single P81 `chef-operational-orders` query, avoiding four duplicate requests to the same unfilterable endpoint.

### Bounded paging and counts

- Default page size: 20.
- Maximum client page size: 50.
- Page requests clamp safely when a reconciliation removes/moves rows.
- Counts derive from the same authoritative order snapshot used by Dashboard/shared operational state.

### Independent tab/list state

The already-root-mounted `ChefOperationalProvider` now owns P86 tab UI state above the Chef stack, so list/detail navigation does not recreate it:

- `selectedStatus`
- `ordersPage` per status
- `scrollState` per status
- `tabCounts`
- projected pages/query keys
- `prepTimers`

Changing tabs does not overwrite another tab's page or scroll offset.

### Server-derived timers

Operational order parsing now preserves only the non-sensitive lifecycle timer fields needed by P86 (`prepTimeMinutes`, `createdAt`, `updatedAt`) while still discarding customer/private payload fields.

Preparation timers are recomputed from `updatedAt + prepTimeMinutes` against a fresh wall-clock sample. A 15-second display tick samples `Date.now()` again; it never increments a local elapsed/remaining counter. Therefore app pauses or delayed JS execution cannot accumulate timer drift.

## Focused tests added/updated

- lifecycle status -> tab count mapping;
- client paging boundaries;
- query-key isolation by status/page;
- independent tab page/scroll preservation;
- wall-clock/server-timestamp timer derivation;
- operational parser lifecycle timer field retention and malformed-field fail-closed behavior.

## Known exact-contract boundary

Guide References 40–43 call for logical orders-by-status APIs and scalable pagination. The current backend exposes only the bounded newest-100 list. P86 is therefore **PARTIAL at full product-contract scope** even though the mobile architecture is implemented at the currently authorized backend boundary. A later backend/APIM-authorized phase must provide status/date/page or cursor pagination before Completed history can satisfy the long-history requirement without a 100-order ceiling.

## Validation truth

Code was implemented only within mobile/docs scope. No APK was requested or produced. CI status must be recorded from the resulting commit; if GitHub prevents runner startup, that is an external validation blocker rather than a code-pass claim.

## Explicit stop

P86 stops here. **P87 — Chef Preparing Orders UI is not implemented.**
