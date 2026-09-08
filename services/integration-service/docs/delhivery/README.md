# Delhivery Local / Direct Intracity integration

## Current milestone

Status on 2026-09-08: **account active, Craves integration fail-closed**.

The signed-in Delhivery One workspace shows Delhivery Local as active and exposes Direct Intracity
order tracking. Craves does not yet have an executable Delhivery Direct Intracity adapter, and the
production provider remains disabled. No Delhivery delivery was created during this investigation.

This is deliberate. Delhivery's public Direct Intracity instructions describe creating Local
Delivery orders in the Delhivery Direct mobile app and tracking them in Delhivery One. The official
developer catalogue available to this account documents parcel shipment APIs, not the Direct
Intracity rider-booking transaction contract Craves needs.

The current public Direct Intracity article lists Delhi-NCR, Bengaluru, and Ahmedabad. It does not
list Hyderabad. Delhivery Rapid is described separately as a shared in-city fulfilment network with
2–4-hour delivery and must not be substituted for the on-demand rider product without a separate
Craves product decision and API contract.

## Verified account and runtime state

| Area | Verified state |
|---|---|
| Delhivery One service | Delhivery Local active |
| Direct Intracity orders | Portal page available; zero orders observed |
| Published Hyderabad coverage | Not listed for Direct Intracity; vendor confirmation required |
| Wallet | ₹0.00 observed |
| Additional portal users | None observed |
| Existing API token | Present but masked; not revealed, copied, rotated, or bound to Craves |
| Craves Java adapter | Not implemented |
| Production base URL | Not configured |
| Azure Container App secret | No Delhivery secret bound |
| `DELHIVERY_API_ENABLED` | `false` |
| `DELHIVERY_API_ENVIRONMENT` | `SANDBOX` |
| `DELHIVERY_PRODUCTION_ACTIVATION_APPROVED` | `false` |
| Provider catalog | Must remain inactive |

## Why the existing APIs cannot be reused

The official Delhivery Integration Copilot reported these 18 available APIs:

```text
bulk_pincode
bulk_waybill
cancel_shipment
document_download
edit_shipment
ewaybill_update
expected_tat
invoice_charges
ndr_status
ndr_update
packing_slip
pickup_request
pincode_serviceability
rvp_qc
shipment_creation
tracking
warehouse_create
warehouse_edit
```

It exposes forward and reverse **parcel** journeys. It exposes no Direct Intracity coordinate
serviceability, instant quote, rider booking, rider cancellation, live rider location, or quick-
delivery webhook operation. Substituting `shipment_creation` would create the wrong logistics
product and would not make a restaurant order available to an on-demand local rider.

The Integration Copilot is documentation guidance only; it does not execute live API calls or
deploy integrations. The official API documentation remains authoritative.

## Required Direct Intracity contract

Obtain the following as one vendor-issued, versioned bundle before implementing the adapter:

1. Direct Intracity API entitlement for this Delhivery client account.
2. Written Hyderabad coverage confirmation for the Craves pickup and delivery operating area.
3. Sandbox/UAT and production base URLs.
4. Authentication header and confirmation that the issued credential is scoped to Direct
   Intracity, not B2C/B2B parcel shipments.
5. Coordinate/address serviceability request and response schemas.
6. Quote response semantics for availability, amount, currency, vehicle, and ETA.
7. Create-order request/response schemas, including pickup, drop, contact, payment/COD, client
   order reference, item constraints, and proof-of-delivery fields.
8. Idempotency key rules or a deterministic lookup-by-client-reference operation for resolving an
   uncertain create after a timeout.
9. Cancellation request, allowed states, charges, and terminal-state behavior.
10. Tracking response, rider identity/contact/location exposure, and canonical status catalogue.
11. Webhook payloads, registration method, authentication/signature verification, retry schedule,
    ordering guarantees, and duplicate-delivery behavior.
12. Rate limits, timeout/retry guidance, IP allowlisting requirements, wallet/COD settlement rules,
    and production support escalation path.

## Vendor request

Use the following request without including any existing token value:

> Subject: Direct Intracity API onboarding for CRAVES LOCAL — Hyderabad
>
> We have activated Delhivery Local in our Delhivery One workspace and need a server-to-server
> Direct Intracity integration for Craves restaurant/store quick delivery in Hyderabad. Please
> enable the product for our client account and provide the current versioned sandbox and
> production API bundle covering coordinate serviceability/quote, rider-order creation,
> cancellation, tracking/live location, status webhooks and webhook authentication, idempotency or
> lookup-by-client-order-reference for uncertain-create recovery, rate limits, IP allowlisting, and
> wallet/COD settlement. Please confirm whether the existing masked API token is authorized for
> Direct Intracity or issue a product-scoped credential. Please also provide written Hyderabad
> coverage confirmation and test coordinates/order procedure that does not create a billable job.

## Craves implementation plan after receipt

Implement the adapter only from sanitized fixtures derived from the vendor bundle:

```text
services/integration-service/src/main/java/in/craves/integration/delivery/delhivery/
  DelhiveryDirectIntracityApiClient.java
  DelhiveryDirectIntracityProperties.java
  DelhiveryDirectIntracityStatusMapper.java
  DelhiveryDirectIntracityWebhookController.java
  DelhiveryDirectIntracityWebhookService.java
```

The client must implement the provider-neutral `DeliveryProviderAdapter` operations:

```text
quote
create
cancel
track
reconcileCreate
```

Add focused tests for request/response serialization, HTTP/auth behavior, amount units, status
mapping, webhook authentication and deduplication, idempotency, uncertain-create recovery, retry
classification, and PII/secret redaction. Do not expose a public callback route until backend
signature/authentication validation exists.

## Activation gates

`azure-pipelines-delhivery-environment.yml` defaults to disabled and now requires all of these
explicit confirmations before any Delhivery activation:

- reviewed Direct Intracity contract and recorded version;
- verified Direct Intracity credential model;
- verified Hyderabad serviceability;
- verified webhook payload/authentication contract;
- deterministic uncertain-create reconciliation;
- real Java adapter and runtime configuration;
- vendor-issued HTTPS base URL and Azure secret binding;
- explicit production switch confirmation.

Contract evidence, a deployed adapter, and an active database catalog row remain independent gates.
The admin readiness endpoint must report `routingEligible=true` before Craves routing can select
Delhivery:

```text
GET /api/v1/admin/operations/delivery-provider-contracts/readiness
```

## Non-billable validation and cutover

After Delhivery supplies the contract and credential:

1. Run the Integration Service Maven tests and delivery-provider production CI.
2. Store the product-scoped credential in Azure Key Vault; never place it in Git or pipeline
   parameters.
3. Deploy with `enableProvider=false` and confirm the revision becomes ready.
4. Validate authentication and Hyderabad serviceability using Delhivery's approved non-billable
   procedure.
5. Register the production callback and verify signed/authenticated callback rejection and
   acceptance without exposing credential values.
6. Verify zero open Delhivery jobs and pin existing dead-letter counts.
7. Run the Delhivery environment pipeline with every contract confirmation set to true and the
   reviewed contract version recorded.
8. Confirm the provider catalog row is active, runtime is ready, and readiness reports
   `routingEligible=true`.

Creating a real delivery remains a separate, billable acceptance test and requires an explicit
action-time decision.

## Rollback

Run `azure-pipelines-delhivery-environment.yml` with `enableProvider=false`. The pipeline disables
the provider database row first, keeps any other active provider working, clears Delhivery contract
evidence flags, and leaves the global delivery worker on only when another provider remains active.

## Official references

- Delhivery Help Center: `https://help.delhivery.com/docs/direct-intracity`
- Delhivery Help Center: `https://help.delhivery.com/docs/direct-intracity-orders`
- Delhivery B2C Developer Portal: `https://one.delhivery.com/developer-portal/documents/b2c/`
