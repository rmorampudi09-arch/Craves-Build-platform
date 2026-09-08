# Delivery Provider Production Status

Last verified: 2026-09-08  
Release branch: `feature/backend-open-pr-consolidation-20260905`  
Pull request: #297  
Routing posture: **fail closed; zero providers production-accepted**

## 2026-09-08 live production re-verification

- Delhivery One shows `Delhivery Local` as active for the Craves Local workspace, but its developer
  portal exposes only B2C/B2B parcel APIs. Delhivery's official Local instructions place orders in
  the Delhivery Direct mobile app and list Delhi-NCR, Bengaluru and Ahmedabad as the supported
  cities. There is no verified Local transaction API or published Hyderabad coverage for Craves.
- The production integration revision was running with Borzo enabled and the delivery command
  worker enabled even though the deployed branch predates the explicit
  `BORZO_INSTANT_PRODUCT_VERIFIED` and global maximum-total-ETA gates. This is not acceptable
  evidence of an instant-delivery product contract.
- Shiprocket production authentication was enabled only for read-only validation;
  `SHIPROCKET_CREATE_ENABLED=false` and attribution approval was false. The standard parcel/AWB API
  remains ineligible for Craves routing and must be disabled in the final fail-closed state.
- Delhivery production approval and API execution remained disabled. Shadowfax's published
  Hyperlocal adapter remained blocked on a valid Marketplace credential and Hyderabad account
  serviceability evidence.

The production safety action is to remove all provider execution from routing, stop delivery command
consumption, and set the global maximum total ETA to `0`. Production may be re-enabled only through
the coordinated activation gate after an account-specific instant product, Hyderabad serviceability,
live quote ETA, production-create lifecycle, callback and reconciliation evidence all pass.

## Launch decision

Craves must route food orders only through an instant/on-demand/hyperlocal intracity product. An
enabled API account, successful authentication, sandbox quote, manual dashboard or conventional
shipment create is not sufficient. Standard parcel, AWB, surface, next-day and multi-day products
must never enter quote ranking or create fallback.

`CRAVES_DELIVERY_MAX_TOTAL_ETA_MINUTES` is intentionally unset/blocking by default. Product owner
approval is required before choosing the commercial limit. Even after it is configured, each live
quote must carry provider evidence for immediate dispatch, order serviceability and a total ETA at
or below that limit.

## Provider matrix

| Provider | Exact product/API | Product fit | Quote and ETA | Create/tracking/webhooks | Account/production status | Routing status |
|---|---|---|---|---|---|---|
| Borzo | Business API 1.8, on-demand motorbike order (`/calculate-order`, `/create-order`, `/orders`, `/courier`, `/cancel-order`) | Intracity immediate-delivery candidate; thermobox supported | Provider stop timestamps are parsed into pickup and total ETA; absent/malformed ETA fails closed | Documented create, cancellation, order/rider tracking and callbacks; production lifecycle not yet proven | Production API enablement and account-specific instant-product proof pending | **BLOCKED** until production entitlement, configured callback, live <=limit quote and lifecycle evidence |
| Shiprocket | QUICK is the relevant hyperlocal product. The implemented `apiv2.shiprocket.in/v1/external` API is the separate ecommerce parcel/AWB product | QUICK is food-capable; external shipment API is invalid for Craves food | No account-accessible QUICK quote contract or ETA schema | Manual QUICK UI exists; no account-accessible official QUICK create/tracking/webhook API | Signed-in account has manual QUICK access. Public site advertises API integration, but entitlement is not exposed | **BLOCKED — INSTANT/HYPERLOCAL API PRODUCT NOT AVAILABLE**. Ecommerce create is disabled in code |
| Shadowfax | Hyperlocal Delivery | Public product supports restaurant/food orders, nearest-rider assignment and live tracking | No authenticated Craves quote/ETA contract | No private create/cancel/tracking/webhook contract supplied to Craves | Vendor onboarding required | **BLOCKED — VENDOR PRIVATE API CONTRACT REQUIRED** |
| Delhivery | Direct Intracity | On-demand product with published 15-minute pickup claim, but current cities are Delhi-NCR, Bengaluru and Ahmedabad | No authenticated Craves quote/ETA contract | No business API contract supplied to Craves | Hyderabad is not in published service coverage; prepaid activation includes an agreement/digital-consent step requiring a human | **BLOCKED — HYDERABAD UNSERVICEABLE AND API PRODUCT NOT VERIFIED** |

## Implemented routing gates

A provider reaches intelligent/ML ranking only after all of these are true:

1. `API_ENABLED`
2. `QUOTE_READY`
3. `PRODUCTION_CREATE_READY`
4. `INSTANT_DELIVERY_ELIGIBLE`
5. `SERVICEABLE_FOR_ORDER`
6. `ETA_WITHIN_CRAVES_LIMIT`
7. `EXECUTABLE_CANDIDATE`

Product eligibility is evaluated before quote fan-out. Quote-time serviceability, immediate-dispatch
evidence and ETA are evaluated before scoring. ML cannot compensate for a failed product or SLA
gate.

## Remaining acceptance evidence

No provider may be marked green until one authorized real Craves food order proves: eligible live
quote, production create, provider confirmation, immediate rider search/assignment, suitable pickup
ETA, live tracking, cancellation behavior, callbacks, reconciliation and delivery completion.

Provider onboarding/support requests may be prepared without accepting legal terms. Any agreement,
digital consent, commercial commitment, minimum spend or production order remains an explicit human
step.

Detailed evidence: [2026-09-06 instant-delivery product eligibility](2026-09-06-instant-delivery-product-eligibility.md).
