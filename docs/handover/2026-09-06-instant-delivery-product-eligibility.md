# Craves Instant-Delivery Product Eligibility

Date: 2026-09-06  
Decision state: fail closed; no provider is production-accepted by this review

## Non-negotiable rule

Craves customer food orders may use only an authenticated, production-enabled instant/on-demand,
intracity or hyperlocal product whose live quote proves serviceability, immediate dispatch and a
provider-supplied total ETA within the product-owner-approved
`CRAVES_DELIVERY_MAX_TOTAL_ETA_MINUTES` threshold. The threshold defaults to `0` (unset/block).
Standard parcel, AWB, surface, next-day and multi-day products are excluded before ML ranking.

## Provider/product verification matrix

| Provider | Exact product/API evaluated | Delivery type | Immediate dispatch | Intracity/hyperlocal | Food appropriate | Live ETA evidence | Pickup ETA | Delivery ETA | Maximum supported SLA | Create endpoint | Live tracking/rider | Webhooks | Production account enabled | Suitable for Craves |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Shiprocket | Signed-in Shiprocket QUICK dashboard plus the separately documented `apiv2.shiprocket.in/v1/external` ecommerce shipment API currently implemented | QUICK UI is local/hyperlocal; implemented API is conventional ecommerce parcel/AWB | QUICK advertises rider assignment, but programmable immediate dispatch is not exposed to this account | QUICK dashboard access confirmed; official public page advertises separate API integration, but no QUICK API entitlement/configuration is exposed to this account | QUICK UI allows package type `Food`; implemented parcel API is not appropriate | QUICK UI requests pickup/drop before showing pricing; no official QUICK API quote schema is available to Craves | Not available through an official Craves-accessible QUICK API | Not available through an official Craves-accessible QUICK API | No account-specific API SLA proven as <=60 minutes | Manual QUICK order form exists; no official QUICK create endpoint/contract is available to Craves | Public QUICK material describes live tracking; no Craves-accessible API contract is available | Not available through an official Craves-accessible QUICK API | **Manual QUICK dashboard enabled; production QUICK API entitlement not available/verified** | **NO — BLOCKED: INSTANT/HYPERLOCAL API PRODUCT NOT AVAILABLE** |
| Borzo | Business API 1.8 (`calculate-order`, `create-order`, `orders`, `courier`, `cancel-order`) | On-demand intracity motorbike courier (`type=standard` is the API's documented immediate order type, not a parcel network) | Product supports on-demand booking; production-account proof pending | Yes, product class | Potentially, with motorbike/thermobox and commercial approval | Adapter derives total ETA from documented `created_datetime` to final-stop `estimated_arrival_datetime`; missing/invalid values block routing | Adapter derives pickup ETA from first-stop `estimated_arrival_datetime` | Provider timestamp required before routing | Public product says same-day/as-soon-as-possible delivery, but no contractual maximum total SLA has been verified for this account | `POST /create-order` | `GET /orders`, `GET /courier`, tracking URL | Callback implementation exists; production callbacks not yet evidenced | **Not verified**; current browser session is signed out and `BORZO_INSTANT_PRODUCT_VERIFIED=false` by default | **NO for production today; product is a candidate after account, ETA and lifecycle proof** |
| Shadowfax | Public Hyperlocal Delivery product; no Craves private API contract supplied | Hyperlocal/on-demand | Public product describes nearest-rider assignment | Yes | Public product includes restaurants/food | Public site says real-time tracking, but Craves has no authenticated quote contract | Not verified | Not verified | No <=60-minute contractual maximum verified | Not available to Craves | Not available to Craves | Not available to Craves | No | **NO — BLOCKED: VENDOR_PRIVATE_API_CONTRACT_REQUIRED** |
| Delhivery | Delhivery Direct intracity product is documented as an app workflow; no Craves business API contract supplied | On-demand intracity | Public material describes pickup in as little as 15 minutes | Yes, where launched | Not proven for Craves food workflow | No authenticated API quote evidence | Public product claim only | Not verified | No <=60-minute contractual maximum verified | Not available to Craves | Not available to Craves | Not available to Craves | No; current published availability is Delhi-NCR, Bengaluru and Ahmedabad, not Hyderabad | **NO — BLOCKED: HYDERABAD UNSERVICEABLE AND API PRODUCT NOT VERIFIED** |

Official public references:

- Shiprocket QUICK: <https://www.shiprocket.in/quick/>
- Shiprocket standard API documentation: <https://apidocs.shiprocket.in/>
- Borzo Business API: <https://borzodelivery.com/in/business-api/doc>
- Borzo business product: <https://borzodelivery.com/in/business-2>
- Shadowfax Hyperlocal: <https://www.shadowfax.in/hyperlocal>
- Delhivery Direct intracity help: <https://help.delhivery.com/docs/direct-intracity>

Public documentation proves that product categories exist. It does not prove that the Craves
account is entitled to the production product, that Hyderabad is serviceable for the exact order,
or that a production create will start an immediate rider search.

### Shiprocket account-specific evidence (2026-09-06)

The authenticated Craves account opened `quick.shiprocket.in/quick/create-order` and showed a
Shiprocket QUICK order form with pickup, drop, package type `Food`, prepaid/pay-on-delivery and a
checkout panel that displays delivery options and pricing after addresses are entered. This proves
manual QUICK product access only. The account navigation exposed Add Order, All Orders, Analytics,
Settings and call support, but no API/developer configuration, API credentials, create endpoint,
webhook configuration or machine-readable tracking contract for QUICK. No addresses were entered,
support request submitted or delivery created during verification.

Accordingly, the existing `apiv2.shiprocket.in/v1/external` adapter must remain classified as the
standard ecommerce shipment product and excluded before quote fan-out/ML scoring. Shiprocket can
be reconsidered only after Shiprocket provides an official production QUICK API contract and
enables it for the Craves account; browser calls used by the QUICK dashboard must not be copied or
reverse-engineered as an integration.

## Routing gates implemented

Every adapter declares:

1. `apiEnabled`
2. `quoteReady`
3. `productionCreateReady`
4. `instantDeliveryEligible`

Every live quote must additionally provide:

5. `serviceable_for_order=true`
6. `total_eta_minutes <= CRAVES_DELIVERY_MAX_TOTAL_ETA_MINUTES`
7. `instant_delivery=true` and `immediate_dispatch=true`

Only then is `executableCandidate=true` and the quote is passed to delivery intelligence. Missing,
ambiguous or malformed evidence excludes the provider. A high ML score cannot override a failed
gate.

## Production acceptance still required

For each provider retain evidence for one real Craves food order showing: live eligible quote,
production create, provider confirmation, immediate rider search/assignment, suitable pickup ETA,
live rider/order tracking, cancellation behavior, webhook callbacks, reconciliation and final
delivery. Authentication, KYC, a sandbox quote or a standard parcel shipment is not acceptance.

No real provider order was created during this review.
