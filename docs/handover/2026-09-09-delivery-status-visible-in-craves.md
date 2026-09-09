# Craves Delivery Status Visibility Fix — Production Handover

Date: 2026-09-09

## Production defect

A real Borzo production delivery completed successfully for chef sub-order:

`005c348d-dc04-4506-ae45-fda4633232d7`

Integration Service normalized the provider lifecycle through:

`SEARCHING -> COURIER_ASSIGNED -> COURIER_TO_PICKUP -> AT_PICKUP -> PICKED_UP -> IN_TRANSIT -> AT_DROPOFF -> DELIVERED`

The final Integration delivery job state was `DELIVERED` with provider status `finished`. Eight `DELIVERY_STATUS_CHANGED` outbox events were published, and Order Service processed all eight. Order Service's durable delivery projection and history also ended at `DELIVERED`.

However, `order_schema.customer_order.status` remained `READY_FOR_PICKUP`, so existing Customer and Chef APIs/UI continued to render the old commercial status even though `delivery_status=DELIVERED` was correct.

## Root cause

The delivery-status consumer intentionally updated only dedicated `delivery_*` columns. Existing customer and chef order contracts render `customer_order.status`, which contains `OUT_FOR_DELIVERY` and `DELIVERED` states but was never synchronized from the provider-neutral delivery projection.

## Fix

Branch: `fix/delivery-status-visible-in-craves`

The fix keeps provider-neutral delivery detail separate while synchronizing only two unambiguous fulfillment milestones already present in the commercial order enum:

- `READY_FOR_PICKUP` + `PICKED_UP`/`IN_TRANSIT`/`AT_DROPOFF` -> `OUT_FOR_DELIVERY`
- `READY_FOR_PICKUP` or `OUT_FOR_DELIVERY` + `DELIVERED` -> `DELIVERED`

The synchronization runs inside the same Order Service database transaction as the accepted delivery projection and appends an `order_status_history` row with a system/null actor.

It never changes payment, rejection, cancellation, refund or refund-completion states from provider callbacks.

## Existing-order repair

Flyway migration `V20__delivery_commercial_status_projection.sql` repairs already-processed orders whose durable delivery projection proves one of the two mappings above. It includes status-history evidence and deliberately ignores cancellation/refund/rejection states.

For the proven production order above, deployment of V20 should change only the commercial status from `READY_FOR_PICKUP` to `DELIVERED`; the existing delivery projection, provider identifiers, webhook evidence and delivery history remain untouched.

## Regression coverage

`DeliveryCommercialOrderStatusProjectionTest` verifies:

- pickup/in-transit/drop-off map `READY_FOR_PICKUP` to `OUT_FOR_DELIVERY`;
- `DELIVERED` maps `READY_FOR_PICKUP` or `OUT_FOR_DELIVERY` to `DELIVERED`;
- pre-pickup statuses do not advance the commercial order;
- cancellation/refund terminal states are preserved.

## Deployment validation

After Order Service deployment:

1. Confirm Flyway V20 applied successfully.
2. Confirm the delivered production order has `status=DELIVERED` and `delivery_status=DELIVERED`.
3. Confirm the Order delivery-status consumer remains enabled.
4. Confirm no new Service Bus DLQ growth is caused by the change.
5. On the next real delivery, verify `READY_FOR_PICKUP -> OUT_FOR_DELIVERY -> DELIVERED` appears in Craves without manual database edits.

## Separate known item

The existing Service Bus delivery-status subscription showed one DLQ message during diagnosis. It did not block the successful production order because all eight events for that order were processed. Inspect that DLQ item separately; do not conflate it with this visibility bug.

## Hyperlocal separation

This fix is independent of Borzo Hyperlocal PR #303. Production Borzo remains on the working `standard` product until Borzo enables/accepts `type=hyperlocal`. Do not mix the Hyperlocal deployment with this Order status visibility fix.
