# Craves Backend Order Experience v2 — Convergence Handover

Date: 2026-09-11  
Service: Order Service  
Runtime posture: source only; no Azure, APIM, database, payment or delivery mutation

## Purpose

Converge the tested long-history and cart-current-truth backend onto current `main` without importing stale payment, refund or delivery changes from the broad backend branch.

## Capabilities

### Customer order history

`GET /api/v1/orders/history?status=&limit=&cursor=` returns only orders owned by the authenticated CUSTOMER. It uses deterministic timestamp/UUID keyset pagination so newly inserted orders do not cause deep pages to skip or duplicate records.

### Chef order history

`GET /api/v1/chef/orders/history?status=&limit=&cursor=` uses the immutable Order-owned `chef_identity_id` snapshot. A chef cannot enumerate another chef's order history.

### Cart preflight

`GET /api/v1/cart/preflight` compares every cart line with one bounded internal Catalog batch resolution. It reports, without modifying the cart:

- menu item unavailable;
- required delivery package metadata missing;
- price changed;
- kitchen changed;
- item name changed.

Blocking issues and review-required changes are separate. The preflight never copies the current Catalog price into the payable order by itself and never silently substitutes a dish. Final checkout remains server-authoritative.

### Internal Catalog batch client

Order Service uses `POST /internal/menu-items/resolve` with the existing `X-Craves-Internal-Key` secret reference. No internal key, raw Catalog response or pickup/private field is exposed to the browser.

## Existing database migration

Current `main` already contains `V16__order_history_cursor_indexes.sql`. This package restores its owning history implementation and tests without changing, duplicating, renumbering or repairing the migration.

## Primary paths

```text
services/order-service/src/main/java/in/craves/order/service/OrderHistoryCursorCodec.java
services/order-service/src/main/java/in/craves/order/service/OrderHistoryService.java
services/order-service/src/main/java/in/craves/order/service/CartPreflightService.java
services/order-service/src/main/java/in/craves/order/service/CatalogClient.java
services/order-service/src/main/java/in/craves/order/web/CustomerOrderHistoryController.java
services/order-service/src/main/java/in/craves/order/web/ChefOrderHistoryController.java
services/order-service/src/main/java/in/craves/order/web/CartPreflightDtos.java
services/order-service/src/main/java/in/craves/order/web/CartController.java
```

## Boundaries preserved

This module does not:

- create a new order, payment or delivery;
- define refund/cancellation consequences;
- update prices automatically;
- substitute unavailable food;
- infer provider serviceability;
- expose another customer's or chef's history;
- change the existing Order Like Last Time/reorder behavior;
- change the current READY_FOR_PICKUP or delivered-state production fixes.

## Scale and consistency

- keyset cursors rather than offset history scans;
- bounded page sizes and status allow-lists;
- existing V16 owner/status/time indexes;
- one Catalog batch call rather than one call per cart item;
- duplicate menu IDs collapse before the batch request;
- item results remain in original cart order;
- current-truth checks are read-only and safe to retry.

## Validation

Dedicated Java 21 CI runs Order Service `mvn clean verify`, existing history/preflight/internal-client tests, privacy checks and static ownership/current-truth guards.

## Deployment later

1. Confirm exact V16 checksum in the target Order database.
2. Deploy the reviewed Order Service image through the existing guarded pipeline.
3. Publish only the new history/preflight operations through controlled APIM source.
4. Smoke customer and chef ownership boundaries with two identities each.
5. Change a Catalog price/availability in a non-production fixture and prove preflight reports the difference without mutating the cart.
6. Confirm reorder, checkout, payment and READY_FOR_PICKUP regressions remain green.

No new Azure resource or secret is required. The existing Catalog internal access binding is reused.
