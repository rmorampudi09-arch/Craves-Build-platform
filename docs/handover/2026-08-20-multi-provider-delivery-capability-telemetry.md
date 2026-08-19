# Craves Multi-Provider Delivery Capability & Telemetry — Engineering Handover

**Date:** 2026-08-20  
**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Branch:** `chatgpt/backend-customer-chef-journey-20260819`  
**Production execution:** deferred. No Azure DevOps deployment, Service Bus filter mutation, APIM activation or live-location activation was executed while building this module.

## Executive handover

Delivery is now modeled as a multi-provider capability system rather than a Borzo-centered implementation. Craves keeps one provider-neutral transaction/read model and uses provider-specific adapters to preserve each provider's verified capabilities.

Providers represented:

```text
Borzo
Shiprocket Quick
Shadowfax
Porter
Delhivery Direct Intracity
```

Runtime-ready capabilities are separated from supported-but-not-yet-wired features and partner-contract-gated features. This capability state must never be used as a provider commercial ranking table.

## Provider-neutral engineering boundary

The existing Integration Service contract remains authoritative:

```text
DeliveryProviderAdapter.quote()
DeliveryProviderAdapter.create()
DeliveryProviderAdapter.cancel()
DeliveryProviderAdapter.track()
```

Provider-specific semantics stay inside Integration Service. Order Service receives normalized status and telemetry only.

No provider priority/fallback, delivery fee, commission, refund consequence or delivery-radius rule is introduced here.

## Capability vocabulary

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

Capability state:

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

## Borzo

`BorzoDeliveryTelemetryExtractor` handles tracking and normalized webhook telemetry. The provider-neutral projection can retain courier coordinates, provider-native exact pickup/drop-off ETA and arrival start/end windows when supplied.

POD/check-in/return/multi-stop provider features are represented as capabilities but are not automatically exposed as Craves business actions without approved product/privacy semantics.

## Shiprocket

`ShiprocketDeliveryTelemetryExtractor` is first-class rather than a status-only fallback.

It handles tracking responses and normalized webhook payloads and retains:

```text
latest valid GPS point from provider tracking scans
GPS observation timestamp
provider ETD as exact drop-off ETA
```

Safety:

```text
arbitrary top-level lat/lng is not treated as courier GPS
only tracking scans are eligible
coordinates must be paired and in range
(0,0) is rejected
future-skewed scans are rejected
latest valid scan wins
```

Shiprocket NDR reattempt/RTO and return tracking are represented as supported but are not auto-triggered. Choosing reattempt versus return is a Craves product/operations decision.

## Shadowfax

Public product capabilities can be represented, but the exact Craves partner transaction/auth/webhook contract is not present in the authoritative repository docs. Executable integration remains fail-closed as `PRIVATE_CONTRACT_REQUIRED` until verified.

## Porter

Public API capabilities include quote/serviceability, track, webhooks, live tracking link and optional delivery-code proof. Exact Craves partner credentials/contracts remain gated. The represented API product's one-pickup/one-drop limitation is recorded instead of inventing multi-stop support.

## Delhivery Direct Intracity

The provider is represented as a peer. Craves does not substitute Delhivery B2C parcel APIs for Direct Intracity. Exact Direct Intracity executable contracts remain fail-closed until verified.

## Telemetry contract

Producer:

```text
DELIVERY_TELEMETRY_UPDATED 1.1
```

Order consumer accepts:

```text
1.0
1.1
```

Version 1.1 adds exact provider ETA fields while preserving ETA windows:

```text
estimatedPickupAt
estimatedPickupStartAt
estimatedPickupEndAt
estimatedDropoffAt
estimatedDropoffStartAt
estimatedDropoffEndAt
```

Exact ETA is not converted into a fabricated zero-width window.

## Database migrations

Integration:

```text
V112__delivery_telemetry_projection.sql
V113__delivery_provider_exact_eta.sql
```

Order:

```text
V17__delivery_telemetry_projection.sql
V18__delivery_provider_exact_eta.sql
```

Only the latest useful snapshot is projected. No unbounded GPS history table is created.

## Webhook telemetry safety

Provider telemetry can update without a normalized status transition.

```text
status changed -> status event + eligible telemetry
newer same normalized state -> telemetry may update without another status event
stale/equal callback -> telemetry rejected
unknown callback -> telemetry rejected
terminal-protected regression -> telemetry rejected
```

A late non-terminal callback cannot resurrect live courier telemetry after the current delivery is terminal.

## Customer and chef tracking experience

Customer:

```http
GET /api/v1/orders/{orderId}/delivery-status
```

Chef:

```http
GET /api/v1/chef/orders/{orderId}/delivery-status
```

Both remain ownership-scoped.

The stable response exposes `trackingExperience`:

```text
fresh privacy-approved coordinates -> LIVE_MAP
otherwise provider tracking URL -> PROVIDER_TRACKING_LINK
otherwise -> STATUS_TIMELINE
```

This selection describes the experience available for an already-selected provider. It does not rank or select providers.

## Privacy

Exact live courier coordinates remain OFF by default:

```text
CRAVES_DELIVERY_LIVE_LOCATION_EXPOSURE_ENABLED=false
```

Coordinates require explicit activation, non-terminal delivery, paired coordinates, freshness and acceptable provider clock skew.

Never publicly exposed by this projection:

```text
courier phone/name/photo
raw provider payload
provider credentials
chef private address
customer delivery address
raw provider POD image URL
```

Terminal deliveries suppress live coordinates and live ETA fields.

## Tests

Integration coverage includes:

```text
DeliveryProviderCapabilityRegistryTest
BorzoDeliveryTelemetryExtractorTest
ShiprocketDeliveryTelemetryExtractorTest
DeliveryTelemetryPublisherServiceTest
DeliveryStatusUpdateServiceTest
DeliveryTrackingReconciliationWorkerTest
```

Order coverage includes:

```text
DeliveryTelemetryEventValidatorTest
```

Coverage includes all five provider profiles, private-contract gating, Borzo exact ETA/windows, Borzo webhook telemetry, Shiprocket GPS/ETD, rejection of non-scan destination coordinates, same-state telemetry refresh, stale/terminal rejection and v1.0/v1.1 compatibility.

## Validation status

GitHub **Backend completion CI run 396** completed successfully at multi-provider source/documentation head `33ab3c841538a123b17a9cd554aaffb68f0b9cd8`. Commits after that run only update this handover/validation wording and do not alter runtime Java, migrations, contracts or provider behavior.

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

A separate Admin dashboard workflow was also triggered. Its Order-service admin authorization job passed, while its unrelated Next.js admin test job failed. That web failure is not hidden and should be handled in the admin frontend workstream; it does not change the successful backend completion result for this module.

## Azure downstream CI source

```text
azure-pipelines-delivery-status-downstream-ci.yml
```

The source gate now verifies:

```text
Order + Integration + Notification builds
V17/V18 and V112/V113
provider capability registry
Borzo extractor
Shiprocket extractor
telemetry event v1.1
customer/chef trackingExperience contracts
no-provider-ranking source guard
private-contract fail-closed markers
live-location fail-closed default
runtime-preserving service deployment contracts
```

The Azure pipeline itself has not been executed, by project plan.

## Azure deployment later

When all backend modules are complete:

```text
1. run unified Azure backend CI
2. run delivery downstream CI
3. deploy Order and verify V17/V18
4. deploy Integration and verify V112/V113
5. keep exact live location OFF
6. broaden the existing Service Bus delivery filter
7. run controlled Borzo sandbox telemetry evidence
8. run controlled Shiprocket sandbox telemetry evidence
9. verify provider capability/readiness admin surfaces
10. configure chef delivery-status APIM operation
11. review privacy/accuracy evidence
12. only then activate exact courier coordinates if approved
```

No new Azure paid resource is required for this module.

## Partner-contract manual dependencies

For Shadowfax, Porter and Delhivery Direct Intracity, obtain from their onboarding/merchant channels:

```text
sandbox + production base URLs
API version
auth scheme
quote/serviceability contract
create contract
cancel contract
track contract
webhook event catalogue
webhook signature verification
idempotency expectations
provider delivery-ID semantics
retry/rate-limit guidance
POD/OTP semantics where applicable
```

Do not paste credential values into chat or source. Runtime secrets must ultimately be Key Vault-backed.

## Product decisions deliberately blocked

```text
provider commercial priority/fallback
when NDR should reattempt versus return
who can initiate a return
customer confirmation semantics for NDR
how POD should be shown
when delivery OTP/code is exposed
commercial consequences of failed/returned delivery
```

Engineering support exists or is represented, but these rules must not be invented.

## Rollback

Use the narrowest control first:

```text
live-coordinate problem -> disable live-location flag
telemetry routing problem -> rollback Service Bus filter to status-only
chef gateway problem -> remove only chef delivery-status APIM operation
service defect -> existing service revision rollback
```

V17/V18/V112/V113 are additive and should not be destructively dropped during incident rollback.
