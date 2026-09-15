# Favorites 2.0 P3 — Order Like Last Time

## Purpose

P3 turns confirmed historical behavior into a deterministic repeat-order surface without pretending historical data is current catalog truth.

New read endpoint:

`GET /api/v1/orders/repeat-candidates?limit=20&cursor=...`

Existing atomic cart replacement endpoint remains the action:

`POST /api/v1/cart/reorder/{orderId}`

## Eligibility

Only customer-owned orders with `status = DELIVERED` and at least one valid historical menu-item reference are returned as repeat candidates. This satisfies the blueprint rule that `Order Like Last Time` appears only after a completed order.

## Candidate data

Order Service emits only facts it owns:

- historical order ID
- kitchen ID/name snapshot
- last ordered timestamp
- delivered-order count from that kitchen for the authenticated customer
- historical item IDs/names/quantities
- historical total/currency, explicitly labelled as previous-order data
- current-validation notice

The candidate endpoint does **not** fan out to Catalog on every Saved/Home refresh. Current Catalog validation happens when the customer actually chooses to rebuild the cart.

## Current-truth action

`OrderService.replaceCartFromOrder(...)` already performs the required atomic pattern:

1. verify historical order belongs to authenticated customer;
2. resolve every historical menu item against current active Catalog;
3. fail before changing the current cart if any required item cannot be validated;
4. only after all items resolve, replace the cart transactionally;
5. write current menu names/prices/kitchen snapshots into cart rows;
6. return the current server-authoritative cart for customer review.

The mobile P3 slice must navigate to Cart after success. Checkout/address/serviceability remains revalidated through the normal current ordering path before payment.

## Preference recall is deliberately not fabricated

Current `order_schema.order_item` stores item ID/name/category/food type/unit price/quantity but no stable selectable option IDs or values for spice/oil/portion customizations.

Therefore every P3 candidate currently returns:

- `preferenceRecallSupported = false`
- `rememberedPreferenceCount = 0`

This is an explicit truthful limitation. A future preference-recall enhancement requires a real menu-option model and historical option snapshots before P3 may prefill choices.

## Rule-based familiarity signals

`completedOrdersFromKitchen` is an Order-owned first-party familiarity signal. The mobile client may use it for explanatory copy such as `Ordered from this kitchen 4 times`, but should not turn it into a public popularity/follower metric.

No ML ranking is introduced here.

## Failure recovery

If current validation rejects a repeat order, the mobile app must keep the old cart untouched and offer `View today's menu` for the same kitchen when the historical candidate has a kitchen ID. It must not silently substitute a different dish.

## Scale

- Cursor pagination defaults to 20 and caps at 50 candidates per page.
- Candidate headers are one bounded query.
- Page order items are loaded in one batch query.
- Familiar kitchen counts are loaded in one grouped query.
- No Catalog HTTP request is made merely to render the repeat-candidate list.

## Local verification

```bash
cd services/order-service
mvn -B -ntp clean verify
```

## Manual runtime certification later

1. Deploy current Order Service through the existing guarded pipeline.
2. Verify a customer with DELIVERED history sees only their own repeat candidates.
3. Confirm non-delivered orders do not appear.
4. Reorder a still-active historical basket and verify current prices appear in Cart.
5. Make one historical item inactive and prove reorder fails with current cart unchanged.
6. Confirm another customer cannot reorder the order ID.
7. Continue through normal preflight/checkout and prove current address/serviceability rules still apply.

No Azure resource, secret, database migration, payment setting, DNS record, Firebase setting or billable infrastructure is created by this module.
