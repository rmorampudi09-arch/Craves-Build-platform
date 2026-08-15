# Craves Order Service

Order Service owns customer carts, pre-payment checkout pricing, chef-specific orders, order items, immutable checkout snapshots, order status transitions, delivery-package metadata, and the admin-controlled platform-fee policy.

The service follows the Craves service boundaries already present in the repository: User-Chef Service remains the source of truth for saved customer addresses, Catalog Service remains the source of truth for active kitchens/menu items, Azure Maps provides road routing, and Order Service stores the immutable commercial snapshot used by payment and fulfilment.

## Current scope

- Customer cart CRUD and catalog validation.
- Saved customer delivery-address validation through User-Chef Service.
- Immutable customer drop-off and kitchen pickup snapshots.
- Pre-payment pricing quote derived completely on the backend.
- Azure Maps driving-route distance from each chef pickup to the customer drop-off.
- Redis best-effort route caching to reduce repeated Azure Maps transactions.
- Hyderabad market delivery curve: `₹75` through `5 km`, then `₹8/km` beyond `5 km`, billed in `0.1 km` increments.
- Admin-controlled platform fee only.
- Versioned tax profile and persisted tax audit breakdown.
- Ten-minute immutable pricing quote by default.
- Quote/cart/address/kitchen-coordinate stale checks before checkout creation.
- One-time quote consumption so a reviewed price cannot be reused for another checkout.
- One chef-specific order per kitchen.
- Package weight and thermobox metadata snapshots.
- Chef acceptance/rejection/ready-for-pickup transitions.

## Checkout pricing flow

```text
Customer selects saved address
    ↓
POST /api/v1/checkout/quote
    ↓
Order Service validates customer + cart
    ↓
Chef pickup coordinates + customer drop-off coordinates
    ↓
Azure Maps Route Directions 2025-01-01
(driving + fastestWithTraffic)
    ↓
Road distance in metres
    ↓
Market delivery pricing rule
    ↓
Admin platform fee
    ↓
Tax profile
    ↓
Immutable checkout_pricing_quote stored
    ↓
Customer sees full payment details
    ↓
POST /api/v1/checkout with pricingQuoteId
    ↓
Backend verifies quote is owned, current and unconsumed
    ↓
Checkout/order rows copy the reviewed quote
    ↓
Cashfree later uses checkout.grandTotal from Order Service
```

The browser does not calculate platform fee, tax, delivery fee, or grand total.

## Delivery-price rule

Pricing version:

```text
HYDERABAD_MARKET_2026_08_V1
```

Default backend values:

```text
0.0 km – 5.0 km   = ₹75.00
above 5.0 km      = ₹8.00 per additional km
billing increment = 0.1 km, rounded upward
```

Examples:

```text
4.2 km   -> ₹75.00
5.0 km   -> ₹75.00
5.001 km -> ₹75.80
7.5 km   -> ₹95.00
10.0 km  -> ₹115.00
```

No rain surcharge, peak-hour surge, small-cart fee, handling fee, or hidden delivery surcharge is introduced by this module.

These values are backend configuration, not admin charge-policy fields. They can be changed through controlled deployment configuration after Product/Finance review without releasing customer-web code.

## Platform-fee policy

The active `order_schema.charge_policy` row is still used for:

```text
platform_fee_percent
platform_fee_flat
```

The legacy columns below remain temporarily for schema/API compatibility but are ignored by the new checkout path and the admin controller forces them to zero on newly created policies:

```text
tax_percent
delivery_fee_flat
```

Admin endpoints remain:

```http
GET  /api/v1/admin/charge-policy/current
POST /api/v1/admin/charge-policy
```

Only platform-fee fields affect new dynamic-pricing checkouts.

## Tax profile

Tax profile version:

```text
IN_MARKETPLACE_GST_2026_08_V1
```

Current configurable defaults are:

```text
restaurant/service GST added to food subtotal = 5%
fee tax used for platform/delivery audit split = 18%
```

The customer-visible platform and delivery fee values are treated as gross amounts; the configured fee-tax component is extracted for audit rather than added again on top. The food-tax component is added to the checkout total.

**Production gate:** Craves Finance/CA must confirm the final GST treatment and invoicing model for Craves' own platform and delivery services before production activation. The restaurant-service 5% framework and ECO responsibilities are statutory topics, but the treatment of Craves' own fees depends on the final legal/commercial contracting model. Do not treat competitor receipts as tax authority.

## Quote API

```http
POST /api/v1/checkout/quote
Authorization: Bearer <Craves access token>
Content-Type: application/json
```

Request:

```json
{
  "deliveryAddressId": "11111111-2222-4333-8444-555555555555"
}
```

Representative response shape:

```json
{
  "quoteId": "99999999-9999-4999-8999-999999999999",
  "deliveryAddressId": "11111111-2222-4333-8444-555555555555",
  "currency": "INR",
  "foodSubtotal": 200.00,
  "platformFee": 10.00,
  "taxAmount": 10.00,
  "deliveryFee": 75.00,
  "grandTotal": 295.00,
  "chargePolicyId": "20000000-0000-0000-0000-000000000001",
  "taxes": {
    "profileVersion": "IN_MARKETPLACE_GST_2026_08_V1",
    "restaurantGstPercent": 5.00,
    "feeInclusiveGstPercent": 18.00,
    "foodTaxAdded": 10.00,
    "platformTaxIncluded": 1.53,
    "deliveryTaxIncluded": 11.44,
    "taxAmountAddedToCheckout": 10.00,
    "totalTaxAmount": 22.97
  },
  "deliveries": [
    {
      "kitchenId": "44444444-4444-4444-8444-444444444444",
      "kitchenName": "Annapurna",
      "roadDistanceKm": 4.2,
      "roadDistanceMeters": 4200,
      "estimatedTravelMinutes": 16,
      "baseDistanceKm": 5.0,
      "baseDeliveryFee": 75.00,
      "extraDistanceKm": 0.0,
      "extraPerKm": 8.00,
      "extraDistanceFee": 0.00,
      "deliveryFee": 75.00,
      "pricingVersion": "HYDERABAD_MARKET_2026_08_V1"
    }
  ],
  "expiresAt": "2026-08-15T03:30:00Z",
  "createdAt": "2026-08-15T03:20:00Z"
}
```

## Checkout API

A final checkout now requires the reviewed quote:

```http
POST /api/v1/checkout
Authorization: Bearer <Craves access token>
Content-Type: application/json
```

```json
{
  "deliveryAddressId": "11111111-2222-4333-8444-555555555555",
  "pricingQuoteId": "99999999-9999-4999-8999-999999999999",
  "note": "Please call on arrival"
}
```

Important errors:

```text
DELIVERY_ADDRESS_REQUIRED
DELIVERY_ADDRESS_NOT_AVAILABLE
DELIVERY_ADDRESS_INCOMPLETE
KITCHEN_PICKUP_ADDRESS_INCOMPLETE
DELIVERY_ROUTE_COORDINATES_INVALID
DELIVERY_ROUTE_UNAVAILABLE
PRICING_QUOTE_REQUIRED
PRICING_QUOTE_NOT_FOUND
PRICING_QUOTE_STALE
CART_EMPTY
```

`PRICING_QUOTE_STALE` means the quote expired, was already consumed, the cart changed, the selected address changed, or the chef pickup coordinates changed. Customer web automatically requests a fresh quote in this case.

## Address and route integrity

Both addresses must have valid latitude/longitude. Order Service will not fall back to straight-line/Haversine distance for pricing. If Azure Maps cannot return a driving route, the quote fails closed with `DELIVERY_ROUTE_UNAVAILABLE`; Craves does not guess a fee and does not allow payment with an unverified route.

The existing launch-policy serviceability radius remains separate from pricing. A larger market-price curve does not automatically make an address serviceable if launch policy rejects the delivery area.

## Immutable quote and audit data

Flyway `V14__dynamic_checkout_pricing.sql` adds:

```text
order_schema.checkout_pricing_quote
order_schema.checkout_pricing_quote_kitchen
```

The quote stores:

- customer identity and selected address;
- SHA-256 cart fingerprint;
- food/platform/tax/delivery/grand totals;
- active platform policy ID;
- delivery-pricing version;
- tax-profile version;
- drop-off coordinates;
- per-kitchen pickup coordinates;
- road distance in metres;
- traffic-aware duration;
- base distance/base fee;
- extra distance/rate/fee;
- quote expiry and one-time consumption timestamps.

The checkout and customer-order tables also snapshot the quote ID, route metrics, pricing/tax versions, and tax breakdown. This allows later finance/support investigation without recalculating a historical order against newer rules.

## Redis route cache

`AzureMapsRouteClient` uses `StringRedisTemplate` as a best-effort optimization. Cache keys use pickup/drop-off coordinates rounded to five decimal places and route API version. Default TTL is five minutes.

If Redis is unavailable, pricing continues by calling Azure Maps directly. Redis failure must not become a checkout failure.

## Azure Maps authentication

No Azure Maps subscription key is stored in source or sent to customer web. Order Service obtains a Microsoft Entra access token through the Container App/App Service managed identity endpoint and sends:

```text
Authorization: Bearer <managed identity token>
x-ms-client-id: <Azure Maps account client ID>
```

Required runtime value:

```text
AZURE_MAPS_CLIENT_ID
```

The managed identity must have an Azure Maps data-plane role that permits route calls on the target Maps account.

## Package and fulfilment snapshots

Catalog Service supplies packaged weight and thermobox requirements for every item. Order Service stores:

```text
order_item.unit_package_weight_grams_snapshot
order_item.thermobox_required_snapshot
customer_order.total_package_weight_grams
customer_order.thermobox_required
```

Delivery-provider creation remains the Integration Service responsibility after the relevant order lifecycle event. Dynamic customer delivery pricing does not move provider integration into Order Service.

## Main endpoints

### Customer cart

```http
GET    /api/v1/cart
POST   /api/v1/cart/items
PUT    /api/v1/cart/items/{cartItemId}
DELETE /api/v1/cart/items/{cartItemId}
DELETE /api/v1/cart
POST   /api/v1/cart/validate
```

### Checkout and orders

```http
POST /api/v1/checkout/quote
POST /api/v1/checkout
GET  /api/v1/checkout/{checkoutId}
GET  /api/v1/orders
GET  /api/v1/orders/{orderId}
```

### Chef orders

```http
GET  /api/v1/chef/orders
GET  /api/v1/chef/orders/{orderId}
POST /api/v1/chef/orders/{orderId}/accept
POST /api/v1/chef/orders/{orderId}/reject
POST /api/v1/chef/orders/{orderId}/ready-for-pickup
```

## Environment variables

Core existing values:

```text
SPRING_DATASOURCE_URL
SPRING_DATASOURCE_USERNAME
SPRING_DATASOURCE_PASSWORD
SPRING_DATA_REDIS_URL
CRAVES_JWT_VERIFICATION_PEM_BASE64
CRAVES_JWT_ISSUER
CRAVES_JWT_AUDIENCE
CRAVES_CATALOG_BASE_URL
CRAVES_USER_CHEF_INTERNAL_BASE_URL
CRAVES_INTERNAL_SERVICE_SECRET
```

Dynamic-pricing values:

```text
AZURE_MAPS_CLIENT_ID
AZURE_MAPS_ENDPOINT=https://atlas.microsoft.com
CRAVES_CHECKOUT_QUOTE_TTL_MINUTES=10
CRAVES_DELIVERY_BASE_DISTANCE_KM=5.0
CRAVES_DELIVERY_BASE_FEE=75.00
CRAVES_DELIVERY_EXTRA_PER_KM=8.00
CRAVES_RESTAURANT_GST_PERCENT=5.00
CRAVES_FEE_INCLUSIVE_GST_PERCENT=18.00
```

Never paste database passwords, internal service secrets, Redis credentials, or Azure credentials into chat/source control. Use the existing Azure/DevOps secret path.

## Local run

Prerequisites:

- Java 21;
- Maven;
- PostgreSQL business database;
- User-Chef Service;
- Catalog Service;
- Redis optional for route caching;
- local Azure Maps authentication is not automatically available through Azure managed identity environment variables.

Run tests:

```bash
cd services/order-service
mvn -B clean test
```

Customer-web checkout tests/build:

```bash
cd apps/customer-web-next
npm install --ignore-scripts
npm run typecheck
npm run test
npm run build
```

For an end-to-end route quote, use an Azure-hosted Order Service revision with managed identity or provide an approved local authentication mechanism rather than committing a Maps key.

## Deployment order

1. Review/merge code.
2. Run Order Service tests.
3. Deploy Order Service so Flyway V14 runs.
4. Verify the new revision is healthy.
5. Configure/verify Azure Maps managed-identity permission and `AZURE_MAPS_CLIENT_ID`.
6. Confirm production Redis binding remains healthy.
7. Run `scripts/apim/configure-customer-checkout-apim.sh` to add `POST /quote` to the existing checkout API.
8. Deploy customer web.
9. Run authenticated quote -> checkout -> Cashfree sandbox end-to-end verification.
10. Complete Finance/CA tax sign-off before production payment activation.

## Manual steps required

- **Azure Maps / Azure Portal:** confirm the existing Maps account and Order Service managed identity, then grant the appropriate Azure Maps data-plane role if not already present.
- **Container App configuration:** set `AZURE_MAPS_CLIENT_ID` to the Maps account client ID. It is not a secret.
- **Redis:** confirm the existing `SPRING_DATA_REDIS_URL` secret remains bound to Order Service. No new Redis resource is required.
- **APIM:** run the checkout APIM configuration after the backend revision is healthy so `POST /api/v1/checkout/quote` routes to Order Service.
- **Finance/CA:** approve the final GST treatment/rates and invoice presentation for food, Craves platform fee, and Craves delivery fee.
- **Testing:** run the backend and customer-web pipelines and then a real saved-address checkout in Cashfree sandbox.

## Billing note

This module does not require a new Azure Maps resource if Craves continues to use its existing Maps account, but Route Directions requests are Azure Maps transactions and can increase usage/cost. Redis caching is intentionally included to reduce repeated route calls for the same chef/customer coordinate pair.
