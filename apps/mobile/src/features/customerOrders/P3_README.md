# Craves Favorites 2.0 P3 — Mobile Habit / Order Like Last Time

## Purpose

P3 makes completed-order history useful without treating historical order data as current truth.

The Orders destination adds a compact `Your usual` surface above the existing order history. The customer can rebuild a completed historical basket with one explicit action, review the current Cart, and continue through normal current checkout validation.

## Read contract

`GET /api/v1/orders/repeat-candidates?limit=20&cursor=...`

Only Order Service decides candidate eligibility. The mobile app does not infer completion from presentation labels.

## Write contract

The existing:

`POST /api/v1/cart/reorder/{orderId}`

remains the authoritative write path. Its response replaces the Redux Cart snapshot only after the server succeeds.

If a current cart already has lines, mobile asks whether the customer wants to verify and replace it. The server validates the historical basket before deleting the current cart, so a validation failure leaves the previous cart intact.

## Current-truth UX

Each card labels its total as `Previous total`. It never presents the historical amount as today's price.

The card tells the customer that current menu availability and price are checked when rebuilding the cart. After success, the app navigates to the current Cart for review before checkout/payment.

When the historical basket cannot be rebuilt, the app does not substitute another dish. It offers `View today's menu from this kitchen` as same-kitchen recovery.

## Preference recall limitation

The current server candidate contract truthfully returns `preferenceRecallSupported=false` and `rememberedPreferenceCount=0` because current order history has no stable historical menu-option IDs for spice/oil/portion choices.

The UI explicitly says previous customizations are not silently assumed. This protects against stale or sensitive preference assumptions until a real option model exists.

## Rule-based familiarity ranking

P3 remains explainable and deterministic:

1. a favorite kitchen that Catalog proves is cooking now;
2. a favorite kitchen cooking later today;
3. other favorite-kitchen repeat candidates;
4. other completed repeat candidates;
5. within the same tier, higher delivered-order count first;
6. then latest completed order first.

This is not machine learning and does not create a public popularity score. `completedOrdersFromKitchen` is private first-party history for the authenticated customer.

## P2 dependency

The familiarity rank optionally consumes P2 favorite-kitchen and Catalog cooking-state data. If that enrichment is unavailable, the repeat list still falls back to private frequency/recency ordering; current reorder validation remains server-authoritative.

## Local verification

```bash
cd apps/mobile
npm ci
npx tsc --noEmit
npm run lint -- --max-warnings=0
npm test -- --runInBand --runTestsByPath \
  src/features/customerOrders/presentation/repeatOrderPresentation.test.ts
```

A broader P3 workflow also runs the existing Favorites P1/P2 tests and Android production bundle.

## Manual device certification later

- No DELIVERED history: `Your usual` is absent rather than showing fake data.
- Completed history: repeat cards show historical basket/total and private familiarity count.
- Existing cart: replacement confirmation appears.
- Active historical basket: reorder succeeds and opens current Cart.
- Current price changed: Cart shows server-current price, not historical card total.
- Historical item retired/unavailable: reorder fails and previous cart remains unchanged.
- Recovery CTA opens the same kitchen's current menu.
- Another customer's order ID cannot be reordered.
- Account switch does not leak repeat history through React Query cache.
- Large text/TalkBack keep basket, current-truth warning, CTA and recovery understandable.

## No deployment side effects

This source work creates no Azure resources, APIM operations, database migrations, secrets, Firebase changes, payment changes, DNS changes, signing operations or store publication.
