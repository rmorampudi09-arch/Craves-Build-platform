# Craves Chef Ready-for-Pickup Idempotency v1

## Purpose

Make repeated/retried chef “Ready for pickup” actions safe. A double tap, mobile retry or network replay must not create duplicate order-state transitions or duplicate status-history rows.

## Endpoint

Existing route retained:

```http
POST /api/v1/chef/orders/{orderId}/ready-for-pickup
```

## Behavior

`ChefReadyForPickupService` verifies CHEF role, locks the order row and checks the Order-owned `chef_identity_id` snapshot. Valid source states are:

```text
CHEF_ACCEPTED
PREPARING
```

The first valid request writes `READY_FOR_PICKUP` and one status-history row. A later request that finds the order already `READY_FOR_PICKUP` succeeds without writing another transition.

Other source states return conflict.

## Lock-scope design

Only PostgreSQL work occurs while the row is locked. After the transaction commits, the response is fetched normally. Catalog/network calls are therefore not held open inside the database lock.

## Files

```text
src/main/java/in/craves/order/service/ChefReadyForPickupService.java
src/main/java/in/craves/order/web/ChefOrderController.java
```

## Production validation

```text
send ready request once -> 200 and one READY_FOR_PICKUP history row
send same request again -> 200 and still one transition row
send two concurrent requests -> one transition row
wrong chef -> 403
invalid state -> 409
```

The existing delivery/order outbox/advice chain should still observe the resulting ready order state according to its existing contract.

## Product rules not introduced

This change does not define preparation-extension rules, courier assignment, cancellation/refund behavior, substitutions or provider priority.
