# Shadowfax Hyperlocal production integration

Status date: 2026-09-08

## Milestone outcome

Craves now has an executable Spring Boot adapter for the published **Shadowfax HL Marketplace
Orders API**. This is the point-to-point restaurant/store hyperlocal product; it is not Shadowfax
360 forward parcel shipping, reverse pickup, warehouse delivery, or AWB logistics.

The adapter is deployed in the production Integration Service image `36449` on healthy revision
`ca-craves-integration-service-pr--0000113`. Runtime configuration was preserved, so Shadowfax
provider creation remains disabled and no delivery was submitted.

The repository implementation covers:

- `PUT /api/v1/order-serviceability/` for a non-mutating quote, delivery fee, pickup ETA and drop ETA;
- `POST /api/v2/orders/` for prepaid Hyperlocal order creation;
- `GET /api/v2/orders/{sfx_order_id}/status/` for state, rider and location reconciliation;
- `PUT /api/v2/orders/{sfx_order_id}/cancel/` for seller-initiated cancellation;
- `PUT /api/v2/orders/{client_order_id}/dispatch-ready/` for the food-ready signal;
- `POST /api/v1/webhooks/delivery/shadowfax` for authenticated, durable, idempotent callbacks;
- canonical mapping for `ACCEPTED`, `ALLOTTED`, `ARRIVED`, `DISPATCHED`,
  `ARRIVED_CUSTOMER_DOORSTEP`, `DELIVERED`, `CANCELLED`, `CANCELLED_BY_CUSTOMER`, and
  `RETURNED_TO_SELLER`;
- exact production-origin enforcement: `https://api.shadowfax.in`;
- exact staging-origin enforcement: `https://hlbackend.staging.shadowfax.in`;
- prepaid-only enforcement inside Craves;
- fail-closed production activation and APIM route validation.

Authoritative API contract: [Shadowfax HL Marketplace Orders API](https://sfxhlmarketplaceapi.docs.apiary.io/).

## Source changes

| Area | Files |
|---|---|
| Runtime configuration | `config/ShadowfaxProperties.java`, `application.yml` |
| Hyperlocal client | `delivery/shadowfax/ShadowfaxApiClient.java` |
| Status mapping | `delivery/shadowfax/ShadowfaxStatusMapper.java` |
| Webhook intake | `ShadowfaxWebhookService.java`, `ShadowfaxWebhookInboxRepository.java`, `ShadowfaxWebhookController.java` |
| Async normalization | `ShadowfaxWebhookNormalizer.java` |
| Database profile | `V116__shadowfax_hyperlocal_marketplace_contract.sql` |
| Azure controls | `azure-pipelines-shadowfax-environment.yml`, `azure-pipelines-delivery-provider-webhooks-apim.yml` |
| Contract tests | `ShadowfaxApiClientTest.java`, `ShadowfaxStatusMapperTest.java` |

## Production safety state

The code is production-capable but the provider remains deliberately **inactive** until the
account-specific gates below are evidenced. Publishing code does not itself create or charge for a
delivery.

| Gate | State on 2026-09-08 | Required evidence |
|---|---|---|
| Public HL Marketplace schema | Passed | Published contract inspected and implemented |
| Exact production host | Passed in code | Runtime must equal `https://api.shadowfax.in` |
| Token credential model | Passed in code | `Authorization: Token ...` bound from Key Vault |
| CRAVES Hyperlocal client code | Pending | Shadowfax-issued `client_code`, stored as a secret |
| Azure outbound IP allowlist | Pending | Shadowfax confirmation that all production egress IPs are allowed |
| Hyderabad account serviceability | Pending | Authenticated, non-mutating serviceability response for pilot zones |
| Callback registration | Pending | Shadowfax configuration for the Craves HTTPS callback and custom header |
| Uncertain-create reconciliation | Blocked by published API | Written idempotency/recovery contract or lookup by `client_order_id` |
| Live provider activation | Blocked | All preceding gates plus guarded pipeline pass |

The published contract exposes a status lookup by `sfx_order_id`, but no lookup by
`client_order_id`. Therefore a timed-out create cannot yet be deterministically reconciled before a
retry or provider fallback. The adapter returns `UNSUPPORTED` for this operation, and the activation
pipeline requires explicit evidence before enabling Shadowfax. This prevents duplicate rider
bookings and duplicate charges.

## Required secret bindings

Never put values in Git, pipeline parameters, screenshots, or logs.

| Runtime variable | Container App secret reference |
|---|---|
| `SHADOWFAX_API_AUTH_TOKEN` | `shadowfax-api-token` |
| `SHADOWFAX_CLIENT_CODE` | `shadowfax-client-code` |
| `SHADOWFAX_CALLBACK_TOKEN` | `shadowfax-callback-token` |

The callback token is a Craves-generated random secret supplied to Shadowfax as the value of the
custom `X-Craves-Shadowfax-Token` callback header. The backend compares it in constant time and
stores only a SHA-256 fingerprint.

## Activation runbook

1. Obtain the account-specific HL Marketplace `client_code` and written product entitlement.
2. Confirm Azure production outbound IP addresses are allowlisted by Shadowfax.
3. Store the production token, client code, and callback token in Key Vault-backed Container App secrets.
4. Deploy Integration Service and run its CI tests.
5. Expose the Shadowfax APIM operation with `enableShadowfaxRoute=true`; verify an invalid callback returns `401`.
6. Register `https://api.craves.in/api/v1/webhooks/delivery/shadowfax` with Shadowfax using HTTP POST and the custom secret header.
7. Run authenticated production serviceability for real Hyderabad pilot coordinates without creating an order.
8. Resolve the uncertain-create recovery contract with Shadowfax and test it in staging.
9. Run `azure-pipelines-shadowfax-environment.yml` with every confirmation gate true and the product-owner-approved maximum ETA.
10. Verify the deployed revision is ready, the provider catalog row is active, and no delivery job was accidentally created.
11. Perform one owner-approved billable pilot only after all non-mutating checks pass.

## Rollback

Run `azure-pipelines-shadowfax-environment.yml` with `enableProvider=false`. It deactivates only the
Shadowfax catalog row and its runtime flag. Other active delivery providers and the global worker are
left running. In-flight Shadowfax jobs must continue through webhook/tracking reconciliation; do not
delete them during rollback.

## Verification record

- Contract source inspected on 2026-09-08.
- Azure DevOps delivery-provider production CI `36446 / 20260908.3`: passed in 1m 29s
  against public source commit `33898ecd`.
- Azure DevOps Integration Service deployment `36449 / 20260908.3`: passed against public source
  commit `17aef1d5`; immutable image `36449` is ready on revision `0000113` with liveness and
  readiness both `UP`.
- Integration Service and delivery-provider tests: passed in CI on Java 21.
- Order Service delivery-event contract tests: passed in CI on Java 21.
- Fail-closed defaults, activation-neutral database migration, secret backing, and source hygiene:
  passed in CI.
- Existing applied Flyway `V115` was preserved byte-for-byte; the Shadowfax profile is append-only
  migration `V116`.
- Local YAML parsing: passed.
- Git whitespace/error check: passed.
- No Shadowfax API token, client code, callback token, phone number, or live order payload is stored in this milestone.
- No real/billable Shadowfax order was created by this milestone.
