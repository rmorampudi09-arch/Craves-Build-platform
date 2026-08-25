# Scheduled Ordering — Production Policy Gate

## Status

`BLOCKED_PRODUCT_DECISION`

This branch intentionally does **not** expose a scheduled-order mutation API or customer scheduling screen.
The autonomous-agent prototype was removed because it encoded values and workflow assumptions that are not approved by the Craves functional/product baseline.

## Why the prototype was removed

The removed implementation contained production-unsafe assumptions, including hard-coded chef/cart/address identifiers, client-supplied estimated totals, a fixed locality/zone, free-form scheduling behavior, legacy `apps/customer-web` placement, and JPA repositories in the JDBC-based Order Service.

Those patterns would allow unapproved product policy to enter the order lifecycle and could cause scheduled orders to be treated as immediate orders by payment, chef-acceptance, notification and delivery orchestration.

## Existing safe foundation already on main

Craves already has Catalog-owned kitchen availability foundations, including:

- `catalog_schema.kitchen_schedule_config`
- `catalog_schema.kitchen_weekly_service_window`
- `catalog_schema.kitchen_schedule_date_override`
- `catalog_schema.kitchen_schedule_override_window`
- timezone-aware kitchen schedule evaluation used by the existing favorite/home availability implementation

These are availability foundations only. They do not define the transactional contract for a one-time future order.

## Product/operations decisions required before executable scheduled-order code is allowed

The approved product owner must define, at minimum:

1. whether a scheduled selection reserves kitchen capacity or only expresses a preferred time;
2. cutoff and minimum/maximum lead-time semantics;
3. preparation-window and capacity rules per kitchen/menu item;
4. whether payment is authorized/captured at scheduling time or closer to fulfillment;
5. the exact Order Service state transitions for a future order before chef acceptance;
6. when chef acceptance/notification becomes eligible;
7. when delivery orchestration may be scheduled relative to the requested fulfillment time and chef-provided prep time;
8. retry/idempotency behavior for duplicate schedule requests and payment retries;
9. customer/chef cancellation, expiry, reschedule and refund consequences;
10. interaction with multi-kitchen carts if/when that product behavior is approved;
11. admin override/audit behavior;
12. customer-facing messaging when the requested future time becomes unavailable.

## Required implementation after approval

Once the policy is approved, implement the feature as a dedicated bounded module using the current production stack:

- Spring Boot 3 / Java 21 / JDBC in Order Service;
- Catalog Service remains authority for kitchen schedule/availability data;
- PostgreSQL/Flyway for durable schedule reservation/intent state;
- server-authoritative cart totals and ownership;
- Firebase-derived Craves customer principal, never client-provided customer IDs;
- transactional idempotency for schedule creation/change/cancel;
- domain events/outbox for downstream chef, notification and delivery eligibility;
- production `apps/customer-web-next` App Router + BFF, not legacy `apps/customer-web`;
- APIM/auth/ownership tests and non-production smoke evidence before activation.

## Release rule

Do not merge or deploy a scheduled-order mutation implementation until the above product contract is approved and represented in tests. Existing immediate checkout/payment/chef/delivery flows must remain unchanged.
