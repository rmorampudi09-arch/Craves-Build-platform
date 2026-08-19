# Craves Multi-Provider Delivery Capability & Telemetry — Engineering Handover

**Date:** 2026-08-20  
**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Branch:** `chatgpt/backend-customer-chef-journey-20260819`  
**Production execution:** deferred. No Azure DevOps deployment, Service Bus filter mutation, APIM activation or live-location activation was executed while building this module.

## 1. Reason for this correction

Delivery Telemetry v2 originally proved the provider-neutral tracking pipeline using Borzo because the Borzo adapter already exposed rich courier tracking fields. That was not a sufficient long-term architecture: different providers expose different useful capabilities and Craves must not reduce the customer experience to the lowest common denominator.

The corrected architecture treats every provider as a peer:

```text
provider transaction adapter
+ provider capability profile
+ provider-specific telemetry / advanced feature adapter
        |
        v
Integration Service provider-neutral contracts
        |
        v
Order-owned stable customer/chef read model
```

Borzo is no longer the implicit feature template.

## 2. Architecture boundary

The existing Integration Service contract remains authoritative:

```text
DeliveryProviderAdapter.quote()
DeliveryProviderAdapter.create()
DeliveryProviderAdapter.cancel()
DeliveryProviderAdapter.track()
```

Provider-specific semantics stay inside Integration Service.

Order Service receives normalized status/telemetry only. It does not import Shiprocket/Borzo/Shadowfax/Porter/Delhivery JSON models.

The implementation does not introduce or modify:

```text
provider commercial priority
provider fallback ordering
delivery price/fee rules
commission rules
cancellation/refund consequences
delivery radius policy
```

Those remain product/operations decisions.

## 3. Providers in the capability matrix

```text
borzo
shiprocket
shadowfax
porter
delhivery
```

Code:

```text
services/integration-service/src/main/java/in/craves/integration/delivery/provider/DeliveryProviderCapability.java
services/integration-service/src/main/java/in/craves/integration/delivery/provider/DeliveryProviderCapabilityRegistry.java
```

Operational endpoint:

```http
GET /api/v1/admin/operations/delivery-provider-contracts/capabilities
```

The endpoint is no-store and complements the existing provider-contract readiness endpoint.

## 4. Capability status meanings

```text
AVAILABLE_NOW
```

Craves source implements the capability behind a verified current adapter/contract. Runtime activation may still be disabled by environment/provider gates.

```text
SUPPORTED_NOT_WIRED
```

The provider exposes the feature but the Craves product/API workflow for the feature is not yet activated/wired.

```text
PRIVATE_CONTRACT_REQUIRED
```

The public product surface indicates the feature, but Craves does not have the exact executable partner request/auth/webhook contract in its authoritative repository documentation. Runtime calls remain blocked.

```text
NOT_VERIFIED
```

No reliable approved evidence is available for that capability.

```text
NOT_SUPPORTED
```

The provider explicitly does not support the capability for the represented API product.

## 5. Provider-neutral capability vocabulary

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

A future provider can add its own implementation without changing Order Service.

## 6. Borzo implementation

Current Craves source uses the existing Borzo adapter and now preserves provider-native tracking richness through:

```text
BorzoDeliveryTelemetryExtractor
```

Supported telemetry path:

```text
tracking snapshot
or authenticated/normalized webhook
 -> courier coordinates
 -> exact pickup ETA when supplied
 -> pickup arrival window when supplied
 -> exact drop-off ETA when supplied
 -> drop-off arrival window when supplied
 -> DELIVERY_TELEMETRY_UPDATED 1.1
```

Exact ETA and ETA windows remain semantically distinct.

Provider proof/check-in/return/multi-stop fields are represented in the capability matrix but are not automatically exposed as Craves business actions. Doing so requires the corresponding Craves product/privacy semantics.

## 7. Shiprocket implementation

Shiprocket is now a first-class telemetry provider instead of a status-only fallback.

Code:

```text
services/integration-service/src/main/java/in/craves/integration/delivery/shiprocket/ShiprocketDeliveryTelemetryExtractor.java
```

The extractor handles both:

```text
track() response metadata
normalized webhook provider metadata
```

It can retain:

```text
latest valid GPS point from tracking scans
GPS observation timestamp
ETD as provider-native exact drop-off ETA
```

### GPS safety rule

Shiprocket payloads can contain multiple latitude/longitude concepts. Craves therefore does **not** treat arbitrary top-level coordinates as courier coordinates.

Only coordinates under provider tracking `scans` are eligible for live rider telemetry.

Validation:

```text
latitude/longitude must be paired
valid geographic range required
(0,0) rejected
future-skewed scan observations rejected
latest valid scan selected
```

### NDR and returns

The provider exposes NDR reattempt/RTO operations and return states. They are represented as provider capabilities but are intentionally not automatically invoked by this module.

Reason:

```text
provider supports reattempt + return
!=
Craves has approved rules for when customer/order should choose reattempt + return
```

Automatic policy remains blocked rather than invented.

## 8. Shadowfax contract state

The provider's public hyperlocal product surface includes:

```text
API-based order intake
smart rider assignment
live tracking/customer updates
OTP / Proof of Delivery where applicable
```

Craves does not currently have the exact partner transaction/auth/webhook contract in the authoritative repository docs. Therefore executable operations remain fail-closed as `PRIVATE_CONTRACT_REQUIRED`.

This is deliberate production safety, not second-class provider treatment.

Once the verified partner contract is supplied, the provider plugs into:

```text
DeliveryProviderAdapter
DeliveryWebhookNormalizer
DeliveryTelemetryExtractor
DeliveryProviderCapabilityRegistry
```

without changing customer/chef API contracts.

## 9. Porter contract state

The public API feature surface includes:

```text
quote + serviceability
create order
track order API
webhooks
tracking link with live driver map
optional Delivery Code proof
```

The represented API product allows one pickup and one drop, so `MULTI_STOP` is explicitly `NOT_SUPPORTED` for that API product rather than silently assumed.

Exact Craves credentials/partner request schemas are not in the authoritative repository docs. Executable calls therefore remain `PRIVATE_CONTRACT_REQUIRED` until verified.

## 10. Delhivery Direct Intracity contract state

Craves represents Delhivery Direct Intracity as a provider and keeps its activation fail-closed.

The current product surface includes intracity booking/tracking concepts and multi-stop semantics; Hyderabad product availability is represented as an operational prerequisite. However the exact executable Direct Intracity API contract used by Craves is not in the repository.

Therefore the source does not substitute Delhivery B2C parcel APIs for the Direct Intracity contract.

## 11. Telemetry event contract v1.1

Schema:

```text
contracts/events/delivery-telemetry-updated-v1.schema.json
```

Producer:

```text
DELIVERY_TELEMETRY_UPDATED 1.1
```

Consumer compatibility:

```text
1.0 accepted
1.1 accepted
```

Version 1.1 adds:

```text
estimatedPickupAt
estimatedDropoffAt
```

while preserving:

```text
estimatedPickupStartAt
estimatedPickupEndAt
estimatedDropoffStartAt
estimatedDropoffEndAt
```

No raw provider payload is published to Order Service.

## 12. Integration database

Existing telemetry migration:

```text
V112__delivery_telemetry_projection.sql
```

Exact ETA supplement:

```text
V113__delivery_provider_exact_eta.sql
```

Latest-snapshot fields are used rather than storing an unbounded GPS trail.

## 13. Order database

Existing telemetry migration:

```text
V17__delivery_telemetry_projection.sql
```

Exact ETA supplement:

```text
V18__delivery_provider_exact_eta.sql
```

Order stores only the latest provider-neutral customer/chef projection.

## 14. Webhook telemetry behavior

Provider telemetry can change without normalized delivery status changing.

Example:

```text
10:01 IN_TRANSIT + GPS A
10:02 IN_TRANSIT + GPS B
```

The corrected behavior is:

```text
status changed -> DELIVERY_STATUS_CHANGED + eligible telemetry
newer same normalized state -> telemetry may update without another status event
stale/equal callback -> telemetry rejected
unknown callback -> telemetry rejected
terminal-protected regression -> telemetry rejected
```

A late `IN_TRANSIT` callback cannot resurrect live location after the current Craves delivery projection has become `DELIVERED`.

## 15. Customer/chef best-available tracking experience

Order Service exposes one stable response with:

```text
trackingExperience
```

Values:

```text
LIVE_MAP
PROVIDER_TRACKING_LINK
STATUS_TIMELINE
```

Selection is data-driven for the current order:

```text
fresh privacy-approved courier coordinates
 -> LIVE_MAP
else provider tracking URL exists
 -> PROVIDER_TRACKING_LINK
else
 -> STATUS_TIMELINE
```

This does not choose the delivery provider.

## 16. Customer/chef routes

Customer:

```http
GET /api/v1/orders/{orderId}/delivery-status
```

Chef:

```http
GET /api/v1/chef/orders/{orderId}/delivery-status
```

Both remain ownership-scoped.

## 17. Privacy

Exact live courier coordinates remain OFF by default:

```text
CRAVES_DELIVERY_LIVE_LOCATION_EXPOSURE_ENABLED=false
```

Coordinates are returned only when:

```text
explicitly activated
non-terminal delivery
paired coordinates
fresh observation
no material future clock skew
```

Never exposed:

```text
courier phone
courier name/photo
raw provider payload
provider credentials
chef private address
customer delivery address
raw provider POD image URL
```

Terminal deliveries suppress live coordinates and ETA fields in the active public response.

## 18. Scale controls

The design does not create a raw GPS stream.

Telemetry events are suppressed when:

```text
terminal
empty
stale
unchanged
```

Only latest useful telemetry is projected.

No new Service Bus subscription is created. The existing Order delivery subscription is reused after a guarded SQL-filter upgrade.

## 19. Tests

Integration:

```text
DeliveryProviderCapabilityRegistryTest
BorzoDeliveryTelemetryExtractorTest
ShiprocketDeliveryTelemetryExtractorTest
DeliveryTelemetryPublisherServiceTest
DeliveryStatusUpdateServiceTest
DeliveryTrackingReconciliationWorkerTest
```

Order:

```text
DeliveryTelemetryEventValidatorTest
```

The test suite covers:

```text
all five providers represented in matrix
private-contract states preserved
Borzo exact ETA + windows
Borzo webhook telemetry
Shiprocket latest valid GPS scan
Shiprocket ETD exact ETA
Shiprocket destination-coordinate rejection
same-status webhook telemetry refresh
stale webhook telemetry rejection
terminal-protected webhook telemetry rejection
telemetry v1.0 + v1.1 consumer compatibility
```

## 20. CI

Module source gate:

```text
azure-pipelines-delivery-status-downstream-ci.yml
```

It now checks:

```text
Order Maven clean verify
Integration Maven clean verify
Notification compatibility
V17 + V18
V112 + V113
capability registry
Borzo extractor
Shiprocket extractor
telemetry event v1.1
customer/chef OpenAPI trackingExperience
provider-neutral no-ranking source marker
fail-closed live location
runtime-preserving deployment contract
```

Branch-wide source validation is also provided by GitHub `Backend completion CI`.

## 21. Azure deployment later

Do not run now. The project owner explicitly deferred all Azure pipeline execution until the module set is finished.

Eventual order:

```text
1. unified backend CI
2. delivery downstream CI
3. deploy Order and verify V17/V18
4. deploy Integration and verify V112/V113
5. keep exact live location OFF
6. broaden existing Service Bus delivery filter
7. controlled Borzo sandbox telemetry evidence
8. controlled Shiprocket sandbox telemetry evidence
9. verify capability/readiness admin surfaces
10. configure chef delivery-status APIM operation
11. privacy/accuracy review
12. only then activate exact live courier coordinates if approved
```

## 22. Partner-contract manual dependencies

For Shadowfax, Porter and Delhivery Direct Intracity, obtain through the provider/merchant onboarding channel:

```text
exact production + sandbox base URLs
API version
credential/auth scheme
quote/serviceability request + response examples
create request + response examples
cancel contract
track contract
webhook event catalogue
webhook signature verification contract
idempotency expectations
provider delivery ID semantics
retry/rate-limit guidance
POD/OTP semantics where applicable
```

Do not paste secrets into chat or source. Secret material must ultimately be Key Vault-backed.

## 23. Product decisions still deliberately blocked

Engineering can expose provider capabilities, but the following decisions remain product/operations owned:

```text
provider priority/fallback
when NDR should reattempt versus return
who may initiate provider return
customer confirmation semantics for NDR
how provider POD should appear to customer/chef
whether/check when Delivery Code or OTP is exposed
commercial consequences of failed/returned delivery
```

The code must not invent these rules.

## 24. Rollback philosophy

Use the smallest switch first:

```text
live-coordinate problem -> disable live-location flag
telemetry routing problem -> rollback Service Bus filter to status-only
chef gateway problem -> remove only chef delivery-status APIM operation
service defect -> existing revision rollback
```

Database migrations V17/V18/V112/V113 are additive and should not be destructively dropped during incident rollback.
