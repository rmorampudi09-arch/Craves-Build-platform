# Craves Dynamic Delivery Checkout Pricing — Handover

Date: 2026-08-15  
Branch: `feature/dynamic-delivery-pricing`  
Owner service: `services/order-service`  
Customer surface: `apps/customer-web-next`  
Gateway: Azure API Management  
Maps: Azure Maps Route Directions `2025-01-01`  
Payment: Cashfree remains owned by Integration Service

## 1. Requirement implemented

Craves previously used the active admin `charge_policy` for platform fee, tax percentage, and a flat delivery fee. The requested behavior is now:

1. Customer selects a saved address.
2. Backend knows the customer drop-off coordinates and selected chef/kitchen pickup coordinates.
3. Order Service calculates driving-road distance using Azure Maps before checkout/payment.
4. Delivery pricing is market-rule based, not an admin flat fee.
5. Current Hyderabad pricing version is `₹75` through `5 km`, then `₹8/km` beyond `5 km`, with excess distance billed upward in `0.1 km` increments.
6. Platform fee remains admin-controlled.
7. Tax is computed by a backend tax policy rather than the admin charge-policy row.
8. Customer sees the dynamic delivery fee and total on the checkout page before a payable checkout is created.
9. Customer confirms the reviewed quote; checkout persists the exact reviewed amounts.
10. Cashfree continues to receive `checkout.grandTotal()` from Integration Service and therefore cannot trust or use a browser-supplied amount.

## 2. Pricing rationale

The initial Hyderabad customer delivery curve is intentionally transparent and no-surge:

```text
0–5 km: ₹75
>5 km: +₹8/km
excess billing granularity: 0.1 km, rounded upward
```

This is aligned to the public Hyderabad hyperlocal benchmark used during implementation (Borzo example: 5 km ₹75 and 10 km ₹115) and was checked against current local-delivery market starting-price ranges. It is not represented as a real-time quote from the eventual fulfilment provider.

No peak-hour surcharge, rain surcharge, small-cart fee, handling fee, or hidden fee is added by this module.

## 3. Tax implementation and legal gate

Backend tax profile:

```text
IN_MARKETPLACE_GST_2026_08_V1
restaurant/service GST default: 5%
platform/delivery fee tax audit rate default: 18%
```

Food GST is added to checkout. Platform and delivery fee values are treated as gross customer-visible values and the configured tax component is extracted for audit; it is not added a second time on top of those fees.

The 5% restaurant-service framework and ECO responsibility have statutory support. The exact tax classification/invoicing treatment of Craves' own platform and delivery services depends on the final commercial and legal structure. Therefore Finance/CA sign-off is a mandatory production gate for `CRAVES_FEE_INCLUSIVE_GST_PERCENT` and final invoice presentation.

## 4. Backend request flow

### 4.1 Quote

```http
POST /api/v1/checkout/quote
```

Input:

```json
{
  "deliveryAddressId": "<saved-address-uuid>"
}
```

Order Service:

- validates authenticated customer;
- loads active owned address from User-Chef Service;
- validates customer GPS coordinates;
- validates cart against Catalog Service;
- loads active platform fee policy;
- groups cart by kitchen;
- loads each kitchen pickup snapshot and coordinates;
- calls Azure Maps driving route;
- prices road distance;
- calculates tax breakdown;
- persists an immutable quote;
- returns a customer-displayable payment breakdown.

### 4.2 Final checkout

```http
POST /api/v1/checkout
```

Input:

```json
{
  "deliveryAddressId": "<saved-address-uuid>",
  "pricingQuoteId": "<quote-uuid>",
  "note": "optional"
}
```

A quote is mandatory. The backend verifies:

- quote belongs to authenticated customer;
- quote is not expired;
- quote is not already consumed;
- selected address matches;
- customer coordinates match;
- cart SHA-256 fingerprint matches;
- kitchens match;
- kitchen pickup coordinates match;
- per-kitchen food subtotal matches.

The quote is consumed once inside the final checkout transaction. If checkout fails later, the transaction rolls back the consumption as well.

## 5. Price lock and tamper resistance

The browser never supplies platform fee, tax, delivery fee, or grand total. The browser only supplies `deliveryAddressId`, `pricingQuoteId`, and optional note.

The quote contains the server-calculated totals. Final checkout copies those values into checkout/order snapshots. Cashfree later reads the backend checkout's `grandTotal` through Integration Service.

This prevents:

- browser editing of delivery fee;
- browser editing of tax;
- browser editing of grand total;
- reuse of a quote for another address/cart;
- use of an expired route price;
- use of a quote after chef coordinates change.

## 6. Azure Maps design

File:

`services/order-service/src/main/java/in/craves/order/pricing/AzureMapsRouteClient.java`

Behavior:

- API: `POST /route/directions?api-version=2025-01-01`;
- GeoJSON waypoint coordinates are longitude then latitude;
- travel mode: `driving`;
- optimization: `fastestWithTraffic`;
- response fields: road `distanceInMeters` and traffic-aware duration;
- managed identity token is used rather than a source-controlled Maps key;
- `AZURE_MAPS_CLIENT_ID` identifies the Azure Maps account;
- if route lookup fails, checkout quote fails closed with `DELIVERY_ROUTE_UNAVAILABLE`.

No Haversine/straight-line fallback is used for customer pricing.

## 7. Redis cache design

The route client uses the existing Spring Data Redis dependency.

Cache key contains:

- Azure route API version;
- pickup latitude/longitude rounded to five decimals;
- drop-off latitude/longitude rounded to five decimals.

Default TTL: five minutes.

Cache value:

```text
distanceMeters:trafficDurationSeconds
```

Redis is best effort. Redis errors are swallowed and Azure Maps is used directly. Route pricing must not become unavailable merely because the cache is unavailable.

## 8. Database changes

Migration:

`services/order-service/src/main/resources/db/migration/V14__dynamic_checkout_pricing.sql`

New parent table:

`order_schema.checkout_pricing_quote`

Stores:

- quote identity/customer/address;
- cart fingerprint;
- food/platform/tax/delivery/grand totals;
- charge-policy ID;
- delivery-pricing version;
- tax-profile version;
- drop-off coordinates;
- expiry/consumption timestamps.

New child table:

`order_schema.checkout_pricing_quote_kitchen`

Stores:

- kitchen ID/name;
- pickup coordinates;
- road distance;
- traffic duration;
- food/platform/tax values;
- base distance;
- base fee;
- excess distance;
- excess rate per km;
- excess fee;
- delivery fee;
- grand total.

Existing checkout/customer-order rows gain quote ID, pricing/tax versions, route metrics and tax audit fields.

Legacy `charge_policy.tax_percent` and `charge_policy.delivery_fee_flat` are retained only for migration/API compatibility. New checkout pricing does not consume them.

## 9. Admin policy behavior

File:

`services/order-service/src/main/java/in/craves/order/web/AdminChargePolicyController.java`

New policies accept existing DTO shape for compatibility, but controller sanitizes:

```text
tax_percent = 0
delivery_fee_flat = 0
```

GET also exposes those legacy fields as zero.

Only:

```text
platform_fee_percent
platform_fee_flat
```

affect dynamic checkout.

No admin UI/UX redesign was performed in this workstream.

## 10. Customer web behavior

File:

`apps/customer-web-next/src/components/customer-checkout.tsx`

After cart/address load, selecting an address triggers `/api/checkout/quote`.

Before checkout the customer sees:

- food subtotal;
- platform fee;
- GST on food;
- dynamic delivery fee;
- grand total;
- each chef/kitchen road distance;
- estimated current-traffic travel time;
- base delivery fee/range;
- excess distance/rate if applicable;
- tax included inside platform/delivery fees;
- quote expiry time.

Confirm button is disabled until a valid quote is present.

If backend returns `PRICING_QUOTE_STALE`, the UI discards the quote and recalculates automatically.

## 11. Customer web BFF

New:

`apps/customer-web-next/src/app/api/checkout/quote/route.ts`

Updated:

`apps/customer-web-next/src/app/api/checkout/route.ts`

Both enforce same-origin request checks and authenticated backend proxying. Backend pricing error codes are preserved so the UI can distinguish stale price, route outage, session error and validation failure.

## 12. APIM

Updated:

`scripts/apim/configure-customer-checkout-apim.sh`

New operation:

```text
operation id: quote-customer-checkout
method: POST
template: /quote
```

The existing checkout APIM policy continues to require Bearer authorization, points to the Order Service backend, and returns no-store headers.

The script verifies quote/create/get operations and their policy after update.

## 13. Launch policy

Updated:

`services/order-service/src/main/java/in/craves/order/launchpolicy/LaunchPolicyCheckoutAspect.java`

The final checkout pointcut now wraps `CheckoutPricingService.checkout(...)` instead of the superseded `OrderService.checkout(...)` entry point. Existing minimum-order and launch serviceability controls therefore continue to apply.

Pricing and serviceability remain separate concerns.

## 14. Files added

```text
apps/customer-web-next/src/app/api/checkout/quote/route.ts
services/order-service/src/main/java/in/craves/order/pricing/AzureMapsRouteClient.java
services/order-service/src/main/java/in/craves/order/pricing/CheckoutPricingModels.java
services/order-service/src/main/java/in/craves/order/pricing/CheckoutPricingQuoteRepository.java
services/order-service/src/main/java/in/craves/order/pricing/CheckoutPricingService.java
services/order-service/src/main/java/in/craves/order/pricing/MarketDeliveryPricing.java
services/order-service/src/main/java/in/craves/order/pricing/MarketplaceTaxPolicy.java
services/order-service/src/main/resources/db/migration/V14__dynamic_checkout_pricing.sql
services/order-service/src/test/java/in/craves/order/pricing/AzureMapsRouteClientTest.java
services/order-service/src/test/java/in/craves/order/pricing/MarketDeliveryPricingTest.java
services/order-service/src/test/java/in/craves/order/pricing/MarketplaceTaxPolicyTest.java
docs/handover/2026-08-15-dynamic-delivery-checkout-pricing.md
```

## 15. Files modified

```text
apps/customer-web-next/src/app/api/checkout/route.ts
apps/customer-web-next/src/components/customer-checkout.tsx
apps/customer-web-next/src/lib/checkout-contract.ts
apps/customer-web-next/src/lib/checkout-contract.test.ts
azure-pipelines-customer-web-next-checkout-ci.yml
scripts/apim/configure-customer-checkout-apim.sh
services/order-service/README.md
services/order-service/src/main/java/in/craves/order/launchpolicy/LaunchPolicyCheckoutAspect.java
services/order-service/src/main/java/in/craves/order/web/AdminChargePolicyController.java
services/order-service/src/main/java/in/craves/order/web/ApiDtos.java
services/order-service/src/main/java/in/craves/order/web/CheckoutController.java
services/order-service/src/main/resources/application.yml
```

## 16. Backend tests added

`MarketDeliveryPricingTest` verifies:

- 0 km -> ₹75;
- below 5 km -> ₹75;
- exactly 5 km -> ₹75;
- 5.001 km -> 0.1 excess km -> ₹75.80;
- 10 km -> ₹115.

`MarketplaceTaxPolicyTest` verifies food GST addition and tax extraction from gross platform/delivery fees.

`AzureMapsRouteClientTest` verifies route-path distance and traffic duration parsing.

## 17. Customer web tests updated

`checkout-contract.test.ts` now verifies:

- dynamic quote parsing;
- route fields;
- tax breakdown;
- quote input validation;
- final checkout input with `pricingQuoteId`;
- invalid quote IDs/distances are rejected.

## 18. CI safety checks

`azure-pipelines-customer-web-next-checkout-ci.yml` now checks:

- typecheck;
- test;
- Next.js build;
- APIM script shell syntax;
- APIM policy XML parse;
- presence of `pricingQuoteId` contract;
- presence of quote parser;
- same-origin protection on quote/create BFF routes;
- presence of APIM quote operation;
- absence of direct frontend arithmetic on backend-owned amount variables.

## 19. Manual Azure steps

### Azure Maps

1. Open the existing Craves Azure Maps account.
2. Record its account/client ID for configuration; this is not a secret.
3. Confirm the Order Service managed identity is enabled.
4. Grant the managed identity the appropriate Azure Maps data-plane role for route operations if not already inherited/assigned.
5. Configure Order Service environment variable:

```text
AZURE_MAPS_CLIENT_ID=<existing Maps account client ID>
```

Do not paste credentials or access tokens into chat.

### Redis

Confirm the existing secret-backed variable remains present:

```text
SPRING_DATA_REDIS_URL
```

No new Redis resource is required.

### APIM

After Order Service is healthy, run:

```text
scripts/apim/configure-customer-checkout-apim.sh
```

This adds/verifies `POST /quote` on the existing customer checkout API.

### Finance/CA

Confirm:

```text
CRAVES_RESTAURANT_GST_PERCENT
CRAVES_FEE_INCLUSIVE_GST_PERCENT
```

and invoice treatment before real production collection.

## 20. Deployment sequence

```text
1. Merge reviewed branch
2. Run Order Service build/tests
3. Deploy Order Service
4. Verify Flyway V14
5. Verify Order Service health/revision
6. Verify Azure Maps managed identity access
7. Verify Redis connection
8. Configure APIM /quote operation
9. Deploy customer web
10. Quote test with <=5 km address
11. Quote test with >5 km address
12. Change address and verify recalculation
13. Change cart and verify stale quote rejection
14. Let quote expire and verify stale quote rejection
15. Create checkout with reviewed quote
16. Create Cashfree sandbox payment order
17. Confirm Cashfree amount equals checkout.grandTotal
18. Verify checkout/order pricing audit columns
19. Verify admin delivery/tax legacy values do not affect checkout
20. Complete GST/Finance production sign-off
```

## 21. Local verification commands

Backend:

```bash
cd services/order-service
mvn -B clean test
```

Customer web:

```bash
cd apps/customer-web-next
npm install --ignore-scripts
npm run typecheck
npm run test
npm run build
```

APIM static checks:

```bash
bash -n scripts/apim/configure-customer-checkout-apim.sh
python3 - <<'PY'
import xml.etree.ElementTree as ET
ET.parse('infra/apim/customer-checkout/customer-checkout-policy.xml')
print('OK')
PY
```

## 22. Production verification cases

### Case A — within 5 km

Expected:

```text
road distance <= 5.000 km
delivery = ₹75.00
```

### Case B — 7.5 km

Expected:

```text
base = ₹75.00
extra = 2.5 × ₹8 = ₹20.00
delivery = ₹95.00
```

### Case C — 10 km

Expected:

```text
base = ₹75.00
extra = 5 × ₹8 = ₹40.00
delivery = ₹115.00
```

### Case D — map outage

Expected:

```text
HTTP 503
DELIVERY_ROUTE_UNAVAILABLE
no checkout created
no payment created
```

### Case E — cart changed after quote

Expected:

```text
HTTP 409
PRICING_QUOTE_STALE
customer web automatically gets a fresh quote
```

### Case F — quote replay

Expected:

```text
second checkout using same quote fails
```

### Case G — browser tampers amount

Expected:

```text
no effect because amount fields are not accepted in quote/checkout input
```

## 23. Rollback strategy

Do not delete V14 tables/columns during an emergency rollback. They are additive and safe to leave in place.

Application rollback sequence:

1. stop customer web from calling `/checkout/quote` by rolling back customer-web revision;
2. roll back Order Service application revision if necessary;
3. keep V14 schema intact;
4. if APIM quote operation becomes unused, it can remain safely routed or be disabled through the existing APIM change process;
5. do not manually rewrite completed checkout/order amounts;
6. retain quote/audit data for support/finance traceability.

Because new final checkout requires `pricingQuoteId`, frontend and backend should be deployed as a coordinated release. Do not deploy the new backend alone to production clients that still create checkout without first obtaining a quote.

## 24. Scale notes

- Azure Maps route calls happen outside the quote-persistence transaction.
- Quote DB persistence is isolated in a short atomic transaction.
- Redis reduces repeated route transactions.
- Managed identity token is cached in-process.
- Route failure is fail-closed, not a guessed fee.
- Quote TTL bounds stale commercial decisions.
- A very high scale production rollout should separately load-test existing Catalog/User-Chef validation paths because those predate this module and include service-to-service calls during cart/checkout validation.

## 25. Known production gates / pending items

Code implementation is complete on the feature branch, but production activation still requires:

- successful Maven backend test/build;
- successful customer-web typecheck/test/build;
- Azure Maps managed identity verification;
- APIM quote operation deployment;
- Flyway V14 verification;
- Cashfree sandbox end-to-end amount verification;
- Finance/CA tax sign-off;
- controlled merge/deploy through the existing Craves pipeline process.

No claim is made in this handover that those external deployment/runtime steps have already run.
