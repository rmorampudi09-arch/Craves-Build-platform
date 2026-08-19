# Craves Multi-Provider Delivery Capability & Telemetry — Engineering Handover

**Date:** 2026-08-20  
**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Branch:** `chatgpt/backend-customer-chef-journey-20260819`  
**Production execution:** deferred. No Azure DevOps deployment, Service Bus filter mutation, APIM activation or live-location activation was executed while building this module.

Delivery is now modeled as a multi-provider capability system rather than a Borzo-centered implementation. Craves keeps one provider-neutral transaction/read model and uses provider-specific adapters to preserve each provider's verified capabilities.

## Providers

```text
Borzo
Shiprocket Quick
Shadowfax
Porter
Delhivery Direct Intracity
```

## Provider-neutral boundary

```text
DeliveryProviderAdapter.quote()
DeliveryProviderAdapter.create()
DeliveryProviderAdapter.cancel()
DeliveryProviderAdapter.track()
```

Provider-specific semantics stay inside Integration Service. Order Service receives normalized status and telemetry only. This module does not introduce provider priority/fallback, delivery fee, commission, refund consequences or delivery-radius rules.

## Capability model

```text
SERVICEABILITY
QUOTE
QUOTE_ETA
CREATE_DELIVERY
CANCEL_DELIVERY
TRACK
TRACKING_LINK
WEBHOOK_STATUS
LIVE_COURIER_LOCATION
PROVIDER_ETA
DELIVERY_VERIFICATION
PROOF_OF_DELIVERY
NDR_ACTION
RETURN_TRACKING
CREATE_RECONCILIATION
MULTI_STOP
```

States:

```text
AVAILABLE_NOW
SUPPORTED_NOT_WIRED
PRIVATE_CONTRACT_REQUIRED
NOT_VERIFIED
NOT_SUPPORTED
```

Source:

```text
services/integration-service/src/main/java/in/craves/integration/delivery/provider/DeliveryProviderCapability.java
services/integration-service/src/main/java/in/craves/integration/delivery/provider/DeliveryProviderCapabilityRegistry.java
```

Operational read:

```http
GET /api/v1/admin/operations/delivery-provider-contracts/capabilities
```

The capability matrix must never be used as a commercial provider-ranking table.

## Borzo

`BorzoDeliveryTelemetryExtractor` handles tracking and normalized webhook telemetry and can retain courier coordinates, exact pickup/drop-off ETA and provider arrival windows when supplied. POD/check-in/return/multi-stop provider features are represented but not automatically exposed as Craves business actions without approved product/privacy semantics.

## Shiprocket

`ShiprocketDeliveryTelemetryExtractor` is first-class rather than a status-only fallback. It handles tracking responses and normalized webhook payloads and can retain the latest valid GPS point from tracking scans, observation timestamp and provider ETD as exact drop-off ETA.

Safety:

```text
arbitrary top-level lat/lng is not rider GPS
only tracking scans are eligible
coordinates must be paired and in range
(0,0) rejected
future-skewed scans rejected
latest valid scan wins
```

Shiprocket NDR reattempt/RTO and return tracking are represented as supported but are not auto-triggered because choosing reattempt versus return is a Craves product/operations decision.

## Shadowfax, Porter and Delhivery Direct Intracity

They are represented as peer providers, not ignored. Public feature surfaces are recorded in the capability model. Exact Craves partner transaction/auth/webhook contracts are not present in the authoritative repository docs, so executable calls stay `PRIVATE_CONTRACT_REQUIRED` rather than being guessed.

Porter's represented API product's one-pickup/one-drop limitation is recorded instead of inventing multi-stop support. Delhivery Direct Intracity is not substituted with unrelated Delhivery B2C parcel APIs.

## Telemetry contract and storage

Producer:

```text
DELIVERY_TELEMETRY_UPDATED 1.1
```

Order accepts historical `1.0` and current `1.1`.

Exact provider ETA and provider ETA windows stay semantically distinct:

```text
estimatedPickupAt
estimatedPickupStartAt
estimatedPickupEndAt
estimatedDropoffAt
estimatedDropoffStartAt
estimatedDropoffEndAt
```

Migrations:

```text
Integration V112__delivery_telemetry_projection.sql
Integration V113__delivery_provider_exact_eta.sql
Order       V17__delivery_telemetry_projection.sql
Order       V18__delivery_provider_exact_eta.sql
```

Only the latest useful snapshot is projected; no unbounded GPS history is created.

## Webhook safety

```text
status changed -> status event + eligible telemetry
newer same state -> telemetry may update without another status event
stale/equal -> no telemetry
unknown -> no telemetry
terminal-protected regression -> no telemetry
```

A late non-terminal callback cannot resurrect live telemetry after the delivery is terminal.

## Customer and chef tracking experience

Customer:

```http
GET /api/v1/orders/{orderId}/delivery-status
```

Chef:

```http
GET /api/v1/chef/orders/{orderId}/delivery-status
```

Stable response:

```text
fresh privacy-approved coordinates -> LIVE_MAP
otherwise provider tracking URL -> PROVIDER_TRACKING_LINK
otherwise -> STATUS_TIMELINE
```

This describes the best experience for an already-selected provider; it does not select the provider.

## Privacy

```text
CRAVES_DELIVERY_LIVE_LOCATION_EXPOSURE_ENABLED=false
```

Exact live coordinates require explicit activation, active delivery, paired/fresh coordinates and acceptable clock skew. Courier phone/name/photo, raw provider payload, credentials, chef private address, customer delivery address and raw provider POD URLs are not exposed by this projection. Terminal deliveries suppress live coordinates and live ETA fields.

## Test coverage

```text
DeliveryProviderCapabilityRegistryTest
BorzoDeliveryTelemetryExtractorTest
ShiprocketDeliveryTelemetryExtractorTest
DeliveryTelemetryPublisherServiceTest
DeliveryStatusUpdateServiceTest
DeliveryTrackingReconciliationWorkerTest
DeliveryTelemetryEventValidatorTest
```

Coverage includes all five provider profiles, private-contract gating, Borzo ETA/windows/webhook telemetry, Shiprocket GPS/ETD and destination-coordinate rejection, same-state telemetry refresh, stale/terminal rejection and telemetry v1.0/v1.1 compatibility.

## Validation

GitHub **Backend completion CI run 396** completed successfully at multi-provider runtime/documentation head `33ab3c841538a123b17a9cd554aaffb68f0b9cd8`. Subsequent commits only refine handover text and Azure CI source; runtime provider behavior is unchanged from that validated state.

Passed:

```text
Backend source integrity
Maven verify — Auth
Maven verify — User-Chef
Maven verify — Catalog
Maven verify — Order
Maven verify — Subscription
Maven verify — Integration
Maven verify — Notification
```

The separate Admin dashboard workflow had a passing Order-service admin authorization job and an unrelated failing Next.js admin test job. That frontend failure remains visible for the admin-web workstream.

## Azure downstream CI

```text
azure-pipelines-delivery-status-downstream-ci.yml
```

The source gate checks Order/Integration/Notification builds, V17/V18/V112/V113, capability registry, Borzo/Shiprocket extractors, telemetry v1.1, customer/chef `trackingExperience`, no-ranking/private-contract guards, live-location fail-closed default and runtime-preserving deployment contracts.

The Azure pipeline itself has not been executed, by project plan.

## Deployment later

```text
1. unified Azure backend CI
2. delivery downstream CI
3. deploy Order; verify V17/V18
4. deploy Integration; verify V112/V113
5. keep exact live location OFF
6. broaden existing Service Bus delivery filter
7. Borzo sandbox telemetry evidence
8. Shiprocket sandbox telemetry evidence
9. provider capability/readiness evidence
10. chef delivery-status APIM
11. privacy/accuracy review
12. optional live-location activation only after approval
```

No new Azure paid resource is required by this module.

## Partner contracts needed later

For Shadowfax, Porter and Delhivery Direct Intracity obtain exact sandbox/production URLs, API version, auth, quote/serviceability, create/cancel/track, webhooks/signatures, idempotency, provider IDs, retry/rate-limit and POD/OTP semantics from their partner onboarding channels. Do not paste credential values into chat/source; runtime secrets must be Key Vault-backed.

## Product decisions still blocked

```text
provider priority/fallback
NDR reattempt versus return
who may initiate return
customer confirmation for NDR
POD presentation
Delivery Code/OTP exposure
commercial consequences of failed/returned delivery
```

## Rollback

```text
live-coordinate issue -> disable live-location flag
telemetry routing issue -> rollback Service Bus filter to status-only
chef gateway issue -> remove chef delivery-status APIM operation
service issue -> existing service revision rollback
```

V17/V18/V112/V113 are additive and should not be destructively dropped during incident rollback.
