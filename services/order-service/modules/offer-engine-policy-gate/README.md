# Offer Engine — Production Policy Gate

## Status

`BLOCKED_PRODUCT_DECISION`

This branch intentionally exposes **no offer/coupon mutation or calculation endpoint** and adds **no offer Flyway schema**.
The autonomous-agent implementation and the interim generic discount model were removed because the current Craves functional baseline does not define the commercial rules required to calculate or apply promotions safely.

## Why executable offer logic is blocked

Craves requires cart and checkout totals to remain server-authoritative, but server authority does not give engineering permission to invent commercial policy. A generic `FLAT` / `PERCENT` implementation would still choose a promotion model, stacking behavior, eligibility semantics and refund consequences that are not approved in the current product contract.

The removed agent code also contained production-unsafe client inputs such as hard-coded customer/cart identifiers, coupon codes, discount amounts, minimum-cart values and cart totals.

## Product/operations decisions required before implementation

The approved product owner must define at minimum:

1. supported promotion types and whether percentage/fixed/free-delivery/other benefits exist;
2. eligibility dimensions: customer cohort, first order, kitchen/chef/menu/category, geography, payment method or other scope;
3. validity windows and timezone semantics;
4. minimum-order and maximum-discount rules;
5. per-customer/global redemption limits and idempotent redemption semantics;
6. stacking/exclusivity rules between multiple offers and any subscription/loyalty benefits;
7. whether offers affect food subtotal, platform fees, delivery fees, tax base, or another approved amount;
8. when an offer is reserved versus finally consumed in checkout/payment flow;
9. cancellation/refund consequences for consumed offers;
10. admin creation/approval/audit requirements and who may activate/deactivate a campaign;
11. abuse/fraud controls, enumeration protection and customer-facing error semantics;
12. reporting/reconciliation requirements.

## Safe implementation requirements after approval

Once the commercial contract is approved:

- Order Service remains authoritative for current cart and checkout totals.
- Client requests may submit only customer intent (for example an offer code), never discount amounts or authoritative totals.
- Promotion configuration must be durable, audited, versioned and disabled by default until explicitly activated.
- Redemption must be ownership-scoped, concurrency-safe and idempotent.
- Checkout must persist the exact applied promotion snapshot used for payment/reconciliation.
- Refund/cancellation behavior must follow the approved product policy rather than a developer default.
- Web integration must use `apps/customer-web-next` and the authenticated BFF/session pattern.
- APIM, service tests, Flyway validation and authenticated smoke tests are required before activation.

## Release rule

Do not merge or deploy an executable Offer Engine until the approved commercial rules above are represented in tests and configuration. Existing cart, pricing, checkout and payment behavior must remain unchanged.
