# 36444
Borzo Delivery Provider Adapter

This module integrates Borzo Business API 1.8 into the existing Craves Integration Service.
It is deliberately disabled by default and must remain inactive in the delivery-provider registry
until sandbox callbacks, commercial onboarding and production KYC are complete.

Official technical reference:

- https://borzodelivery.com/in/business-api/doc

## Production integration record (2026-09-08 IST)

This section is the execution ledger for change `CRV-INT-BORZO-PROD-002`. It contains no
credential values.

### Approved production contract

```text
API version: 1.8
Production API base URL: https://robot-in.borzodelivery.com/api/business/1.8
Public callback URL: https://api.craves.in/api/v1/webhooks/delivery/borzo
```

Production credentials are isolated in Key Vault and are not recorded in source control.

### Preflight evidence

| Check | Result | Evidence |
|---|---|---|
| Integration Container App | PASS | `ca-craves-integration-service-pr` is running on ready revision `0000106` |
| Current Borzo runtime | CONFIRMED SANDBOX | API enabled against `robotapitest-in.borzodelivery.com`; production approval is false |
| Secret provenance | CONFIRMED SANDBOX | Both stable Container App secret names point to sandbox-named Key Vault secrets |
| Borzo provider row | PASS | One row exists and is active for the current sandbox runtime |
| Non-terminal Borzo jobs | PASS | Count is `0` |
| Public callback route | PASS | Unsigned `POST` returns HTTP `401` (route exists and fails closed) |
| APIM operation | PASS | Exactly one `POST /borzo` operation exists under `api/v1/webhooks/delivery` |
| Delivery command queue | OBSERVED | active `0`, scheduled `0`, historical DLQ `6` |
| Delivery-status subscription | OBSERVED | active `0`, historical DLQ `1` |
| Current-main production CI | PASS | Azure DevOps build `36439` / `20260907.1`, source `e668a313` |
| Published-branch production CI | PASS | Azure DevOps build `36443` / `20260908.1`, source `16a57a0d` |

The historical dead letters were inspected read-only and retained. They are not silently deleted
or replayed during this cutover. The observed counts are the only acceptable activation-pipeline
inputs unless a fresh observation shows that the broker state changed.

### Source hardening prepared in this change

- Production readiness now accepts only the approved India API 1.8 base URL, rather than merely
  rejecting hostnames containing `test` or `sandbox`.
- The stale readiness fixture was corrected from the lookalike `robotapi-in` host to `robot-in`.
- The stale callback fixture was corrected to `/api/v1/webhooks/delivery/borzo`.
- Both single-provider and coordinated activation pipelines now use the same exact production
  endpoint allow-list.

### Cutover status

| Change | Result | Evidence |
|---|---|---|
| Borzo callback configuration | PASS | Cabinet retained the approved callback URL after reload |
| Production credential binding | PASS | Separate production credentials are bound through Key Vault; no credential values are recorded in source control |
| Production Key Vault binding | PASS | Production auth and callback configuration is isolated from sandbox configuration |
| Container App binding | PASS | Runtime references were moved to the production Key Vault-backed configuration |
| Production root authentication | PASS | Exact production API 1.8 base returned HTTP `200` and `is_successful=true` |
| Fail-closed downstream stage | PASS | Azure DevOps build `36442` / `20260908.1`, with provider create disabled |
| Provider-create activation | PASS | Guarded production activation build `36444` / `20260908.2` completed successfully with `enableProvider=true`, `activationStage=provider_create` and explicit production approval |

`PRODUCTION ACTIVATED` — the production credentials and callback are bound, the account
authenticates successfully and the guarded provider-create switch completed in Azure DevOps build
`36444` / `20260908.2`. No real delivery was booked during activation; a controlled billable pilot
remains a separate approval and evidence gate.
Post-activation verification confirmed revision `0000110` as latest and ready, provisioning
`Succeeded`, runtime `Running`, `BORZO_API_ENABLED=true`, production approval `true`, the Borzo
provider row active and zero open Borzo delivery jobs.

## What this module implements

- Provider-neutral `DeliveryProviderAdapter` contract.
- Adapter registry for future delivery-command worker lookup.
- Borzo price calculation through `POST /calculate-order`.
- Borzo order creation through `POST /create-order`.
- Borzo cancellation through `POST /cancel-order`.
- Borzo tracking through `GET /orders` and `GET /courier`.
- Motorbike vehicle type `8`, currently limited to 20 kg.
- Optional thermobox request propagation.
- Craves client reference propagation through destination `client_order_id`.
- Borzo order and delivery status normalization.
- HMAC-SHA256 callback verification against the exact raw request body.
- Durable callback ingestion into `delivery_schema.delivery_webhook_inbox`.
- Internal, service-key-protected sandbox/operational endpoints for quote, create, track and cancel.
- Exact retry deduplication through a deterministic event identity.
- An inactive Borzo provider-registry seed through Flyway V3.

## Files

```text
src/main/java/in/craves/integration/config/BorzoProperties.java
src/main/java/in/craves/integration/delivery/provider/DeliveryProviderAdapter.java
src/main/java/in/craves/integration/delivery/provider/DeliveryProviderAdapterRegistry.java
src/main/java/in/craves/integration/delivery/borzo/BorzoApiClient.java
src/main/java/in/craves/integration/delivery/borzo/BorzoSignatureVerifier.java
src/main/java/in/craves/integration/delivery/borzo/BorzoStatusMapper.java
src/main/java/in/craves/integration/delivery/borzo/BorzoWebhookInboxRepository.java
src/main/java/in/craves/integration/delivery/borzo/BorzoWebhookService.java
src/main/java/in/craves/integration/web/BorzoWebhookController.java
src/main/java/in/craves/integration/web/BorzoInternalController.java
src/main/java/in/craves/integration/web/BorzoControllerAdvice.java
src/main/resources/db/migration/V3__register_borzo_provider.sql
```

## Runtime variables

```text
BORZO_API_ENABLED=false
BORZO_API_BASE_URL=https://robotapitest-in.borzodelivery.com/api/business/1.8
BORZO_API_AUTH_TOKEN=<secret>
BORZO_CALLBACK_TOKEN=<secret>
BORZO_CONNECT_TIMEOUT_SECONDS=5
BORZO_READ_TIMEOUT_SECONDS=20
```

`BORZO_API_AUTH_TOKEN` is sent only to Borzo in the `X-DV-Auth-Token` header.
`BORZO_CALLBACK_TOKEN` is used only to validate the `X-DV-Signature` callback header.
They must be different secrets and must never be committed to Git.

Production values are stored in Azure Key Vault and consumed by Azure Container Apps through
Key Vault secret references. Sandbox and production values use separate Key Vault secret names.

## Internal adapter endpoints

All endpoints require:

```http
X-Craves-Internal-Secret: <CRAVES_INTERNAL_SERVICE_KEY>
```

```http
POST /internal/v1/delivery-providers/borzo/quote
POST /internal/v1/delivery-providers/borzo/deliveries
GET  /internal/v1/delivery-providers/borzo/deliveries/{providerDeliveryId}
POST /internal/v1/delivery-providers/borzo/deliveries/{providerDeliveryId}/cancel
```

They return `503 Service Unavailable` while `BORZO_API_ENABLED=false`. Do not expose these routes
through public APIM products. They are intended for controlled service-to-service and sandbox use.

## Callback endpoint

```http
POST /api/v1/webhooks/delivery/borzo
Content-Type: application/json
X-DV-Signature: <lowercase HMAC-SHA256 hex>
```

The signature is calculated over the exact UTF-8 request body. Parsing or re-serializing the body
before verification would change the bytes and invalidate the signature.

Valid callbacks are stored in:

```text
delivery_schema.delivery_webhook_inbox
```

The endpoint returns a JSON receipt containing the event identity, event type, normalized status
and whether the callback was a duplicate.

The callback stays in `RECEIVED` state. A later delivery-event processor will associate it with
`delivery_job`, insert the normalized `delivery_event`, update the job and create the outbox event.
This separation allows the webhook endpoint to respond quickly and safely.

## Status normalization

Examples:

```text
planned                  -> SEARCHING
courier_assigned         -> COURIER_ASSIGNED
courier_departed         -> COURIER_TO_PICKUP
courier_at_pickup        -> AT_PICKUP
parcel_picked_up         -> PICKED_UP
active                   -> IN_TRANSIT
courier_arrived          -> AT_DROPOFF
finished                 -> DELIVERED
canceled                 -> CANCELLED
delayed                  -> DELAYED
return_*                 -> RETURNING / RETURNED
invalid or deleted       -> FAILED
```

## Local test

```bash
cd services/integration-service
mvn -B clean test
```

Do not use a real token in automated tests. The API client tests use Spring's mock HTTP server.

## Safe deployment sequence

1. Deploy with `BORZO_API_ENABLED=false` and no Borzo secrets.
2. Confirm Maven tests, Flyway V3 and Spring startup.
3. Add the sandbox API token and callback token as Container App secrets.
4. Bind the environment variables to those secret references.
5. Keep `BORZO_API_ENABLED=false` while testing only callback signature handling.
6. Configure the sandbox callback URL in the Borzo test cabinet.
7. Send controlled sandbox callbacks and confirm inbox deduplication.
8. Set `BORZO_API_ENABLED=true` only for controlled sandbox adapter tests.
9. Keep `delivery_provider.is_active=false` until all acceptance checks pass.

## Current limitations

- No automatic order-service event wiring yet.
- No delivery-command worker yet.
- No quote fan-out or fallback execution yet.
- No callback-to-delivery-job processor yet.
- Borzo does not document `client_order_id` as a guaranteed idempotency key. Craves must prevent
  duplicate create attempts using its own delivery command and job records.
- The adapter currently uses motorbike type `8`. Vehicle selection must become policy-driven before
  supporting heavier or oversized deliveries.
- Thermobox request support does not prove rider availability. Written operational confirmation
  from Borzo is still required.
- Production configuration and the provider-create feature gate are active. Business registration,
  KYC and commercial terms remain operational prerequisites, and a controlled Hyderabad pilot is
  still required before the integration can be described as end-to-end production accepted.
