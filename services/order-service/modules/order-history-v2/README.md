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

This avoids the skip/duplicate behavior of offset pagination when new orders arrive between page loads.

## Customer read model

Customer history is database-scoped by:

```text
customer_order.customer_identity_id = authenticated identity
```

The query does not scan another customer's orders.

## Chef read model

The legacy chef list currently takes the marketplace's latest 100 orders and filters them in Java by repeatedly calling Catalog. That pattern is not safe at marketplace scale.

Order History v2 instead performs a single read-only Business DB projection:

```text
order_schema.customer_order.kitchen_id
    -> catalog_schema.kitchen_profile.id
    -> catalog_schema.kitchen_profile.identity_id = authenticated chef
```

This removes marketplace-wide truncation and cross-service N+1 calls. It is a read-only projection across two schemas that already reside in the same approved Business PostgreSQL database; neither service's source tables are modified by the other.

## Order-item batching

The new history service first loads one page of order headers, then loads all items for those order IDs in one `IN (:orderIds)` query.

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

Adds deterministic keyset indexes for:

```text
customer identity + created_at + id
customer identity + status + created_at + id
kitchen + created_at + id
kitchen + status + created_at + id
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

No new Azure resource and no new secret are required. Flyway V16 adds PostgreSQL indexes to the existing Business DB. Deploy through the current Order Service Azure DevOps pipeline using the established service connection.

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
