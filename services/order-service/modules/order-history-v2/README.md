# Order History v2

## Purpose

This backend-only module provides production-scale order-history reads for both Craves customers and home chefs without changing checkout, payment, delivery, cancellation, refund, pricing or frontend behavior.

The legacy list endpoints remain available for current clients. New clients can migrate to cursor-paged endpoints when web/mobile work resumes.

## Existing endpoints preserved

```http
GET /api/v1/orders
GET /api/v1/chef/orders
```

No behavior is removed from those routes in this module.

## New customer endpoint

```http
GET /api/v1/orders/page?limit=20&cursor=<opaque-cursor>&status=DELIVERED
```

`status` is optional and uses the existing `OrderStatus` enum.

## New chef endpoint

```http
GET /api/v1/chef/orders/page?limit=20&cursor=<opaque-cursor>&status=CHEF_ACCEPTANCE_PENDING
```

The chef identity is taken from the authenticated `CravesPrincipal`; no kitchen ID or chef ID is accepted from client input.

## Response

```json
{
  "orders": [],
  "nextCursor": null,
  "hasMore": false
}
```

## Cursor behavior

Orders are ordered by:

```text
created_at DESC, id DESC
```

The opaque cursor records the final `(created_at, id)` tuple from the current page. The next request selects rows strictly older than that tuple.

This avoids skip/duplicate behavior when new orders arrive between page loads.

## Customer read model

Customer history is database-scoped by:

```text
customer_order.customer_identity_id = authenticated identity
```

The query does not scan another customer's orders.

## Chef ownership snapshot

The legacy chef list reads the marketplace's latest 100 orders, calls Catalog for each row, and filters by chef in Java. That can omit valid chef orders as marketplace volume grows and creates an N+1 dependency.

Order History v2 stores the owning chef identity in Order Service's own order record:

```text
order_schema.customer_order.chef_identity_id
```

Flyway V16 performs a one-time backfill for existing orders from the authoritative Catalog kitchen ownership data. It also installs a database insert/update snapshot hook while Catalog and Order schemas share the approved Business PostgreSQL database. New history reads therefore use only `order_schema.customer_order`; they do not perform a runtime join or one Catalog HTTP call per order.

If Catalog and Order move to separate physical databases later, replace the same-database snapshot hook with an event-maintained ownership projection. The public cursor API can remain unchanged.

## Order-item batching

The new history service loads one page of order headers, then loads all items for those order IDs in one `IN (:orderIds)` query.

This avoids the legacy `mapOrder -> listOrderItems` one-query-per-order pattern for the new history endpoints.

## Validation

```text
limit = 1..100
cursor = optional opaque token, max 512 characters
status = optional existing OrderStatus value
```

Customer and chef role checks happen before database access.

## Database migration

```text
V16__order_history_cursor_indexes.sql
```

V16 adds/backfills `chef_identity_id`, installs the ownership snapshot hook, and adds deterministic keyset indexes for:

```text
customer identity + created_at + id
customer identity + status + created_at + id
chef identity + created_at + id
chef identity + status + created_at + id
```

## Files

```text
services/order-service/src/main/java/in/craves/order/domain/OrderHistoryCursor.java
services/order-service/src/main/java/in/craves/order/service/OrderHistoryCursorCodec.java
services/order-service/src/main/java/in/craves/order/service/OrderHistoryService.java
services/order-service/src/main/java/in/craves/order/web/OrderHistoryDtos.java
services/order-service/src/main/java/in/craves/order/web/CustomerOrderHistoryController.java
services/order-service/src/main/java/in/craves/order/web/ChefOrderHistoryController.java
services/order-service/src/main/resources/db/migration/V16__order_history_cursor_indexes.sql
services/order-service/src/test/java/in/craves/order/service/OrderHistoryCursorCodecTest.java
services/order-service/src/test/java/in/craves/order/service/OrderHistoryServiceValidationTest.java
```

## Local test

```bash
cd services/order-service
mvn -B -ntp clean verify
```

Recommended integration tests:

```text
Flyway V16 backfills chef ownership for historical rows
new order insert resolves chef_identity_id
customer first and next page
chef first and next page
new order inserted between page requests
same-created_at tie ordering by UUID
all OrderStatus filter values
customer cannot access chef history
chef cannot access customer history
chef sees historical orders regardless of marketplace-wide recent volume
order items returned in original creation order
empty history
invalid limit
invalid cursor
```

## Azure impact

No new Azure resource and no new secret are required. Flyway V16 changes the existing Business DB schema and creates indexes. Deploy through the current Order Service Azure DevOps pipeline using the established service connection.

## Deliberately excluded

This module does not define or change:

```text
pricing
platform commission
delivery fees
delivery radius
cancellation/refund rules
ratings/reviews
FSSAI/KYC
tax/GST
provider selection
order-state transition rules
frontend UI
```
