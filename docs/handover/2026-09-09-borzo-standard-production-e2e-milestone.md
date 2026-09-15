# Borzo Standard Production End-to-End Milestone

Date: 2026-09-09
Status: **PASSED — production evidence accepted**
Milestone type: **Borzo `standard` delivery product**

## Purpose

This milestone records the first Craves production delivery test that is accepted end-to-end for the currently deployed Borzo `standard` product.

It is deliberately separate from Borzo Hyperlocal work. Current `main` still builds Borzo requests with `type=standard`; Hyperlocal PR #303 remains a separate blocked change and is not part of this milestone.

## Canonical production test

Test ID: `DEL-BORZO-STD-E2E-001`

Chef sub-order:

`005c348d-dc04-4506-ae45-fda4633232d7`

Parent order:

`7d8684a5-7988-4b84-a83b-6e3359e73baf`

Craves delivery job:

`5f24ffcb-32eb-4b8c-a739-8efac5f33dd7`

Provider:

`borzo`

Borzo provider delivery ID:

`93906874`

## Product proof

The production Borzo adapter on `main` sends:

```text
type=standard
```

for quote/create requests. Therefore this accepted test is a **Standard product milestone**, not a Hyperlocal milestone.

## End-to-end path under test

```text
Customer order
  -> payment-confirmed order lifecycle
  -> chef acceptance
  -> chef READY_FOR_PICKUP
  -> delivery command / provider selection
  -> Borzo quote
  -> Borzo production create
  -> courier assignment
  -> courier to pickup
  -> pickup
  -> in transit
  -> arrival at drop-off
  -> Borzo finished/delivered
  -> provider webhook/reconciliation
  -> Integration normalization
  -> DELIVERY_STATUS_CHANGED outbox
  -> Azure Service Bus
  -> Order Service delivery-status consumer
  -> provider-neutral delivery projection
  -> commercial order-status projection
  -> Customer/Chef-visible Delivered state
```

## Observed production lifecycle

Integration captured the normalized delivery sequence:

```text
SEARCHING
-> COURIER_ASSIGNED
-> COURIER_TO_PICKUP
-> AT_PICKUP
-> PICKED_UP
-> IN_TRANSIT
-> AT_DROPOFF
-> DELIVERED
```

Final provider state:

```text
provider_status = finished
normalized_status = DELIVERED
```

Final timing evidence already captured for this delivery:

```text
picked_up_at = 2026-09-09 09:30:40+00
delivered_at = 2026-09-09 09:30:59+00
```

## Integration-to-Order evidence

The Integration delivery job finished as `DELIVERED`.

Eight `DELIVERY_STATUS_CHANGED` events were published successfully, and Order Service processed the full normalized sequence through `DELIVERED`.

The Order delivery inbox/history recorded:

```text
SEARCHING
-> COURIER_ASSIGNED
-> COURIER_TO_PICKUP
-> AT_PICKUP
-> PICKED_UP
-> IN_TRANSIT
-> AT_DROPOFF
-> DELIVERED
```

No duplicate delivery booking was identified for this test.

## Commercial-status visibility correction

The original provider-neutral delivery projection correctly reached `DELIVERED`, but the commercial `customer_order.status` remained `READY_FOR_PICKUP`, which caused Craves Customer/Chef UI to show a stale state.

That visibility defect was corrected through the Order Service production fix:

- PR #305: synchronize unambiguous delivery milestones into commercial order status;
- PR #306: move the backfill from conflicting Flyway V20 to V21;
- PR #307: restore the exact production-applied V20 source migration and checksum;
- Order Service pipeline `36485` deployed the final fix;
- revision `ca-craves-order-service-prodlow--0000077` became Healthy;
- production V20 checksum `182093619` remained intact;
- V21 `delivery commercial status projection` applied successfully with checksum `440090775`.

The canonical test order then became:

```text
commercial_status = DELIVERED
delivery_status   = DELIVERED
```

The commercial audit history records:

```text
READY_FOR_PICKUP -> DELIVERED
reason = Delivery lifecycle backfill from existing DELIVERED projection
```

The operator then visually confirmed in Craves that the order status is displayed as **Delivered**.

## Service Bus evidence

At final acceptance:

```text
active messages       = 0
dead-letter messages  = 1
previous DLQ baseline = 1
```

There was **no DLQ growth caused by this milestone**. The single pre-existing DLQ item is a separate investigation and did not block this order, because all eight delivery-status events for the canonical order were processed successfully.

## Acceptance matrix

| Gate | Actual result | Status |
| --- | --- | --- |
| Real production Borzo order created | Provider delivery ID `93906874` | PASS |
| Product type | `standard` | PASS |
| Provider acceptance / courier assignment | Observed | PASS |
| Pickup lifecycle | Observed through `PICKED_UP` | PASS |
| Transit lifecycle | Observed through `IN_TRANSIT` | PASS |
| Drop-off lifecycle | Observed through `AT_DROPOFF` | PASS |
| Physical delivery | Confirmed | PASS |
| Provider final state | `finished` | PASS |
| Integration normalization | `DELIVERED` | PASS |
| Integration status outbox | Published | PASS |
| Service Bus transport | Processed; no new DLQ growth | PASS |
| Order delivery consumer | Full sequence processed | PASS |
| Delivery projection | `DELIVERED` | PASS |
| Commercial order projection | `DELIVERED` | PASS |
| Customer/Chef-visible status | Operator confirmed `Delivered` | PASS |
| Duplicate booking | None identified | PASS |

## Milestone result

**`DEL-BORZO-STD-E2E-001` = PASSED**

For the currently deployed Borzo `standard` product, Craves has now proven:

```text
Order
-> READY_FOR_PICKUP
-> Borzo production booking
-> rider lifecycle
-> physical delivery
-> webhook/reconciliation
-> normalized delivery events
-> Service Bus
-> Order Service
-> commercial DELIVERED
-> Craves UI Delivered
```

This is the accepted **Borzo Standard production end-to-end delivery milestone**.

## Reusable regression test for future Standard releases

For any future release that changes Order Service, Integration Service, Service Bus delivery consumers, Borzo adapter behavior, delivery-status mapping, or Customer/Chef order presentation, execute the following controlled production regression only when a real order is otherwise authorized:

1. Confirm deployed Borzo product is intentionally `standard` and Hyperlocal changes are not mixed into the release.
2. Create one normal Craves production order through the customer path.
3. Complete the normal payment and chef-acceptance flow.
4. Mark the chef sub-order `READY_FOR_PICKUP` through the normal Chef UI/API.
5. Prove exactly one Craves delivery command/job and exactly one Borzo provider booking.
6. Observe courier assignment and provider lifecycle through pickup, transit and drop-off.
7. Confirm the real delivery completes physically.
8. Verify Integration final state is `DELIVERED` and provider status is terminal/finished.
9. Verify the normalized status sequence is published once per accepted transition and no unintended duplicate state transition occurs.
10. Verify Order Service delivery inbox/history reaches `DELIVERED`.
11. Verify `customer_order.delivery_status=DELIVERED`.
12. Verify `customer_order.status=DELIVERED`.
13. Verify Customer and Chef surfaces display `Delivered`.
14. Verify no duplicate provider booking and no unexpected Service Bus DLQ growth.
15. Preserve the order/job/provider IDs, timestamps, pipeline/revision IDs, and status history as milestone evidence without exposing PII or secrets.

## Boundaries

This milestone does **not** certify Borzo Hyperlocal. Hyperlocal remains blocked until Borzo accepts/enables the explicit Hyperlocal product for the Craves production account and a separate end-to-end test proves that product.

Do not use this Standard milestone as evidence that `type=hyperlocal` is live.

## No manual shortcuts used

- no manual production order-status SQL update;
- no manual delivery-status SQL update;
- no Flyway repair;
- no Borzo credential change;
- no Razorpay credential change;
- no provider-type switch during the test;
- no new Azure resource provisioned for this milestone.
