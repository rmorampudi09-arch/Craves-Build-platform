# P52 — Customer Orders Contract and Pagination Evidence

**Branch:** `mobile-ui-rebuild-from-scratch`  
**Phase status:** **PARTIAL**  
**Authorized scope:** P52 only. P53 was not started.  
**Starting branch head:** `4ade7c0fe267c8aab506fe6e06508383b3539e3c`  
**Validated implementation commit:** `8222927c4556896c2d686b078b6eb5ec6465b60f`

## 1. Authoritative phase scope

`phases.md` defines P52 as the Customer Orders contract/pagination/cache phase for guide References 9 and 10. The mobile implementation must derive order state/counts from authoritative server data and must not invent pagination, status semantics, fields, or endpoints.

The full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0` requires the My Orders screen to support lifecycle tabs, order summaries, independent status-list state, and server-backed order data. P53/P54 own the actual empty-cart/active-cart Orders UI variants, so P52 deliberately implements no Orders screen UI.

## 2. Exact backend/APIM contracts audited

The current authenticated customer order list operation is:

```text
GET /api/v1/orders
```

Order Service currently implements the list as:

```text
SELECT *
FROM order_schema.customer_order
WHERE customer_identity_id = ?
ORDER BY created_at DESC
LIMIT 50
```

The controller returns a raw `List<OrderResponse>`.

The current APIM customer-read operation exposes the same GET list route with **no query/template parameters**. There is no current `page`, `size`, `cursor`, `status`, `offset`, `hasNext`, `totalElements`, `totalPages`, or total-count response contract.

The exact current order statuses are:

```text
PAYMENT_PENDING
PAID
CHEF_ACCEPTANCE_PENDING
CHEF_ACCEPTED
PREPARING
READY_FOR_PICKUP
OUT_FOR_DELIVERY
DELIVERED
CHEF_REJECTED
CANCELLED
REFUND_PENDING
REFUNDED
REFUND_FAILED
```

P52 does not create aliases or fabricate additional backend statuses.

## 3. Mobile contract boundary

P52 adds a focused `customerOrders` feature boundary:

- `apps/mobile/src/features/customerOrders/api/customerOrdersApi.ts`
- `apps/mobile/src/features/customerOrders/domain/customerOrderTypes.ts`
- `apps/mobile/src/features/customerOrders/domain/customerOrdersModel.ts`
- `apps/mobile/src/features/customerOrders/query/customerOrdersQueries.ts`

The API adapter calls only `GET /api/v1/orders` and sends no invented pagination/status parameters.

### Strict response validation

The list response is validated before it enters mobile state:

- maximum 50 returned orders, matching the exact current server window;
- UUID validation for order/checkout/kitchen/item identifiers retained by mobile;
- known backend status only;
- ISO timestamp validation;
- three-letter uppercase currency validation;
- bounded non-negative authoritative monetary values;
- bounded item quantities;
- duplicate order IDs rejected;
- newest-first ordering verified.

Malformed data fails closed with a customer-safe `CUSTOMER_ORDERS_INVALID_RESPONSE` error.

### Customer-safe allowlist

Mobile retains only fields needed by current/future customer Orders presentation. Server response fields that are not required by this customer surface are not retained in the parsed mobile model.

In particular, the P52 model does not retain the server customer identity field or delivery snapshot contact/source-coordinate metadata. Money is preserved from the backend and is never recalculated from item lines.

## 4. Cache and status-summary model

P52 adds one private React Query cache domain:

```text
craves / v1 / private / customer-orders
```

The key is scoped by authenticated customer identity and records the fixed authoritative server window limit of 50. This prevents mixing Orders data with public caches or another signed-in customer cache.

The cached value is a `CustomerOrdersSnapshot` containing:

- the authoritative returned order window;
- exact raw-status counts derived only from that returned server window;
- returned row count;
- an explicit history-completeness state.

Completeness is modeled conservatively:

```text
< 50 returned rows  -> COMPLETE
50 returned rows    -> UNKNOWN_AFTER_SERVER_LIMIT
```

When the server window is saturated, mobile therefore does **not** claim that 50 is the customer's full order count and does not claim global per-tab counts.

An invalidation helper is provided for later order-changing flows. The query supports cancellation and a short stale window appropriate for changing order status.

## 5. Pagination/status capability blocker

True P52 pagination cannot be completed from the current contract.

The backend currently truncates customer history at the newest 50 orders and exposes no next-page/cursor operation. APIM exposes no list pagination parameters or metadata. Client-side slicing of those 50 rows would only paginate the truncated window and would falsely imply access to complete history, so P52 deliberately does not implement fake pagination.

The guide's presentation buckets (`All`, `Upcoming`, `Completed`, `Cancelled`) also do not have an authoritative current contract mapping those product buckets to the exact backend status enum. P52 therefore preserves and counts exact raw statuses only rather than inventing lifecycle-bucket membership.

Explicit blockers:

```text
CUSTOMER_ORDERS_SERVER_PAGINATION_UNAVAILABLE
CUSTOMER_ORDERS_GLOBAL_COUNTS_UNAVAILABLE
CUSTOMER_ORDERS_LIFECYCLE_BUCKET_MAPPING_UNAVAILABLE
```

## 6. Focused tests

P52 adds:

- `apps/mobile/src/features/customerOrders/customerOrdersApi.test.ts`
- `apps/mobile/src/features/customerOrders/customerOrdersModel.test.ts`

Coverage verifies:

- only the exact unpaginated list route is called;
- private/non-presentation fields are stripped from the parsed model;
- authoritative amounts/currency are preserved;
- unknown statuses are rejected;
- responses larger than the exact 50-order server window are rejected;
- newest-first ordering is enforced;
- raw-status counts derive from returned authoritative data;
- a saturated 50-order response is marked history-unknown rather than complete;
- cache keys are private and customer-scoped;
- invalidation targets only the Customer Orders query domain.

## 7. Validation

GitHub Actions workflow: `.github/workflows/mobile-phase1-ci.yml`

- Final run: `31265306860`
- Final job: `93122377531`
- Head: `8222927c4556896c2d686b078b6eb5ec6465b60f`
- Conclusion: **SUCCESS**
- `npm ci`: **SUCCESS**
- TypeScript strict check: **SUCCESS**
- ESLint zero-warning gate: **SUCCESS**
- Jest: **SUCCESS**
- Production Android JavaScript bundle: **SUCCESS**
- Backend/APIM/infrastructure source guard: **SUCCESS**

No Java/Gradle/APK packaging was performed, consistent with the implementation-phase policy.

## 8. Why P52 is PARTIAL

All currently supportable mobile behavior for the exact existing customer-order list contract is implemented and CI-validated: strict order parsing, customer-safe allowlisting, authoritative money/status preservation, private cache ownership, exact returned-window status counts, conservative completeness signaling, cancellation, and invalidation.

Full P52 acceptance cannot be claimed because the owning server/APIM layers currently provide only a newest-50 unpaginated list and do not expose:

1. page/cursor navigation or page metadata;
2. global order totals/per-status totals; or
3. an authoritative mapping from exact backend statuses into the guide's lifecycle presentation buckets.

Those capabilities must be supplied/reviewed at their owning layer rather than fabricated by mobile.

## 9. Phase boundary

- P51 remains **PARTIAL** for its previously recorded native callback/new-attempt/backend-terminal-state blockers.
- P52 is **PARTIAL** with all currently supportable customer-order contract/cache behavior implemented and validated.
- P53 — My Orders — Empty Cart (UI) was **not started**.
- No Orders UI, backend, APIM, OpenAPI, database, infrastructure, or native source was changed.
- Stop after P52 and wait for explicit authorization before any P53 work.
