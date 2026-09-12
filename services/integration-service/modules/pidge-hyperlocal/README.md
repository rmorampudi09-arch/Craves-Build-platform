# Pidge hyperlocal delivery module

Pidge is integrated with the existing Java 21 / Spring Boot Integration Service delivery adapter, command worker, durable webhook inbox, status outbox, and tracking reconciler. It does not introduce another backend or deploy another Azure resource.

## Production contract

Official contract inspected on 12 September 2026: https://api-docs.pidge.in/.
Production origin: `https://api.pidge.in`. All paths below are relative to `/v1.0/store/channel/vendor`.

| Operation | Method and path | Behaviour |
|---|---|---|
| Quote | POST `/quote` | Chargeable real-time coordinates/weight quote; no order creation |
| Create | POST `/order` | Creates a pending food order using a manual-allocation channel |
| Serviceability | GET `/order/fulfillment/services?ids={id}` | Chargeable order-specific partner quote and ephemeral fulfilment token |
| Fulfil | POST `/order/fulfill` | Selects the same immediate partner, only when price has not increased |
| Track | GET `/order/{id}` | Verifies identity and reads provider status and observation time |
| Cancel | POST `/{id}/cancel` | Followed by a GET to verify cancellation |
| Webhook | POST to Craves callback | Authenticated Bearer credential; durable deduplication before acknowledgement |

Pidge explicitly permits duplicate `source_order_id` values across requests. Craves therefore claims a persistent `pidge_booking` row before sending create and records the provider ID before fulfilment. An uncertain request blocks retry and fallback. Recovery uses that ID or a unique authenticated callback reference. Missing callback evidence is never interpreted as proof that no order exists.

## Scope and selection

Only same-city, prepaid food orders with measured weight and complete contact/address/coordinate data are accepted. Only `pickup_now=true` network responses are eligible. Captive/self allocations are excluded. Thermobox requests fail closed because this contract does not prove a thermobox guarantee. No package dimensions, promised delivery time, delivery price, or rider coordinates are invented. Pidge candidates are sorted by current price, then stable network/service identifiers, before the existing Craves provider ranking runs.

The channel must be **Manual Allocation**, **Forward**, without partial-delivery or FIFO options. Do not enable auto manifest on this channel: the adapter explicitly fulfils the selected partner after the pending order is created. If serviceability changes or the price increases, cancellation must be confirmed before another provider can be tried.

The live Pidge dashboard requires a package-size default despite presenting that field as optional. The Craves channel uses **M (Laptop)** as its fallback parcel category. This is a channel setting, not measured package dimensions; actual order weight is always supplied by Craves and partner pricing is revalidated before dispatch. Token generation returns a dedicated username/password, which must be exchanged at `POST /login` for the bearer token used by the adapter. All three are stored in the existing Key Vault; the app binds only the bearer token and callback secret.

Production acceptance on 12 September 2026 established that `/quote` requires `attributes.volumetric_weight`. A manual canary (`178924303010162BT3SG1`) showed that Pidge assigns **900 g volumetric weight** to this channel's M fallback. The canary was confirmed cancelled and its authenticated provider callback reached the durable inbox in Azure run [38875](https://dev.azure.com/ravitejamorampudi7777/Craves/_build/results?buildId=38875). Quotes and bookings now explicitly use that same configurable minimum. This minimum is a Pidge parcel category, not a measurement of each food package. Businesses changing packaging or the channel minimum must update this setting consistently; route-specific dimensions are not currently in the canonical request.

## Files

- `config/PidgeProperties.java`: fail-closed environment and activation gates.
- `delivery/pidge/PidgeTransport.java`: HTTPS-only, no redirects, finite request timeouts, no automatic chargeable retries, sanitized errors.
- `delivery/pidge/PidgeApiClient.java`: quote, booking, fulfilment, cancellation, tracking and create reconciliation.
- `delivery/pidge/PidgeBookingRepository.java`: independently committed booking claim and provider-ID journal.
- `delivery/pidge/PidgeStatusMapper.java`: parent and fulfilment status separation.
- `delivery/pidge/PidgeWebhook{Controller,Service,Normalizer}.java`: exact callback path, constant-time credential comparison, validation, deduplication and canonical status normalization.
- `delivery/pidge/PidgeReadinessController.java`: internal-secret-protected readiness and explicit quote diagnostic.
- `delivery/production/DeliveryProviderReadinessService.java`: Pidge in the admin readiness matrix.
- `security/CravesJwtAuthenticationFilter.java`: delegates only the exact Pidge POST callback to provider authentication; customer/admin JWT handling remains on all other paths.
- `db/migration/V119__pidge_hyperlocal_booking_journal.sql`: inactive catalog registration, journal and callback lookup index.
- `.github/workflows/pidge-hyperlocal-ci.yml`: Integration Service verification and test evidence.
- `azure-pipelines-delivery-provider-webhooks-apim.yml`: additive `enablePidgeRoute` switch.

Java paths above are relative to `services/integration-service/src/main/java/in/craves/integration/`; migration path is relative to `services/integration-service/src/main/resources/`.

## Runtime settings

| Environment variable | Default / required value |
|---|---|
| `PIDGE_API_ENABLED` | `false`; enable for authenticated diagnostics first |
| `PIDGE_CREATE_ENABLED` | `false`; enable only after provider and downstream validation |
| `PIDGE_API_ENVIRONMENT` | `PRODUCTION` |
| `PIDGE_API_BASE_URL` | `https://api.pidge.in` |
| `PIDGE_API_AUTH_TOKEN` | Existing Azure secret reference `pidge-api-auth-token` |
| `PIDGE_CHANNEL` | `Craves Hyperlocal` |
| `PIDGE_WEBHOOK_TOKEN` | Dedicated Azure secret reference `pidge-webhook-token` |
| `PIDGE_CALLBACK_URL` | `https://api.craves.in/api/v1/webhooks/delivery/pidge` |
| `PIDGE_PRODUCTION_ACTIVATION_APPROVED` | `false` |
| `PIDGE_MANUAL_ALLOCATION_VERIFIED` | `false` until Pidge channel configuration is verified |
| `PIDGE_WEBHOOK_VERIFIED` | `false` until a provider-origin authenticated callback is verified |
| `PIDGE_CONNECT_TIMEOUT_SECONDS` | `5` |
| `PIDGE_READ_TIMEOUT_SECONDS` | `20` |
| `PIDGE_DEFAULT_VOLUMETRIC_WEIGHT_GRAMS` | `900`; verified Pidge M channel minimum, used in both quote and booking |

Do not paste secrets into chat or Git. Pidge tokens can expire after inactivity or account configuration changes. The adapter surfaces HTTP 401 without retrying chargeable calls; replace the secret using Pidge's supported credential renewal flow, then restart/revise the app. Automated username/password login is not included in this token-based module.

## Build and local tests

From `services/integration-service`, with Java 21 and Maven installed:

```bash
mvn -B -ntp verify
```

Tests cover immediate-delivery filtering, actual food and weight payloads, no mutation during quote, exact partner/price selection, cancellation before fallback, uncertain create, missing response ID, duplicate claim prevention, reconciliation, tracking identity mismatch, ambiguous parent status, HTTPS origin validation and authenticated/deduplicated callbacks. Existing Integration Service tests run alongside these.

For local startup, use the existing service database/Redis/JWT/internal-secret configuration and retain `PIDGE_API_ENABLED=false`. Never use live production credentials for local automated tests. Enabling Pidge diagnostics makes chargeable API calls and requires funded provider access.

## Deployment and activation order

1. Verify the source commit through CI.
2. Deploy that commit using `azure-pipelines-integration-service.yml`. This pipeline preserves runtime settings and secrets, builds the existing image, runs Flyway, and observes the exact new Container App revision.
3. Generate the dedicated Pidge manual/forward channel and webhook credential after the required credential-transfer approval. Bind both secrets to the existing Integration Service. Leave create disabled and the catalog inactive.
4. Publish only the Pidge webhook operation using `azure-pipelines-delivery-provider-webhooks-apim.yml`: `confirmApimWrite=true`, `enablePidgeRoute=true`, and other route switches false. Verify no transformation of Authorization or raw body.
5. Confirm unauthorized callback requests fail, then verify one authentic Pidge-origin event reaches the durable inbox. A local synthetic event alone does not establish provider callback acceptance.
6. Run the internal quote diagnostic with an approved real Hyderabad route and account cost allowance. Verify an immediate network and price are returned. Verify wallet/credit and provider/KYC eligibility in Pidge.
7. Confirm delivery command, create reconciliation, webhook processor, status publisher and Order Service status consumer are enabled and healthy. Check backlog before activation so existing pending jobs are understood.
8. Set manual allocation and callback evidence flags to true only after those checks; enable create with production approval. Wait for the exact ready revision.
9. Make only the `pidge` catalog row active. Confirm the internal readiness endpoint and admin matrix report production ready.
10. Observe a real approved order from chef acceptance through one Pidge booking, fulfilment, authentic status updates and final delivery. A green build or pending Pidge order is not production acceptance.

Readiness: `GET /internal/v1/delivery-provider-readiness/pidge`, with the existing `X-Craves-Internal-Secret`.
Explicit chargeable quote diagnostic: `POST /internal/v1/delivery-provider-readiness/pidge/quote` with the canonical `QuoteRequest` JSON and same authorization.

The existing webhook pipeline also supports `pidgeOperation=check` or `activate`, with an explicit `pidgeRouteCommandId` from Craves. These modes can run with `confirmApimWrite=false` and do not modify APIM. `check` verifies callback authentication and makes one chargeable quote for that real Hyderabad route. `activate` additionally requires `confirmPidgeActivation=true`, zero pending commands, and a new independently identified manual-allocation canary. The canary never calls fulfil/dispatch, must be confirmed cancelled, and must produce an authenticated provider-origin callback before the script enables creation and activates the Pidge catalog row. Uncertain create is journaled and never retried. The pipeline preserves the current application image. Full delivery acceptance still requires observing the first real order through delivery.

`inspectPidgePackageDefaults=true` is available only with `pidgeOperation=check`. It creates and cancels the manual canary to inspect Pidge's effective parcel fields and verify its callback without quoting or enabling routing. A failed quote can also trigger one direct provider diagnostic quote; errors are stripped of credentials and request strings. The checks require Order Service's delivery-status consumer to be enabled.

## Rollback and recovery

Deactivate only the Pidge catalog row and set `PIDGE_CREATE_ENABLED=false` to stop new bookings. Keep API reads, existing credentials, callback ingress and shared reconciliation/status workers available to finish in-flight orders. Do not delete the journal or modify applied migration files. If a create/fulfil request is uncertain, inspect the journal and Pidge order; never reset the claim or force another provider without confirmed cancellation.

Status callbacks with stale/equal observation times are rejected by existing status processing. Parent `COMPLETED` alone does not mean delivered; returned/disposed/lost/damaged outcomes retain their distinct canonical statuses. A Pidge unallocation is pending, not cancellation of the Craves order.

## Limits that require real acceptance evidence

No live provider order, chargeable route quote, KYC clearance, funded credit line or provider-origin callback is established by the source tests. Provider account onboarding and rate limits remain external dependencies. Pidge rider-location polling has a documented 30-second per-order limit and is not automatically called by this module. Tracking responses preserve provider rider/fulfilment details in audit metadata; this change publishes the existing canonical order-status contract and does not add new customer map/ETA fields. A claim of million-user throughput requires capacity testing and provider rate-limit agreements; this module makes no such claim.
