# Craves Multi-Provider Delivery Capability & Telemetry — Engineering Handover

**Status:** source-ready, Azure deployment intentionally deferred until the module set is complete.

The implementation treats Borzo, Shiprocket Quick, Shadowfax, Porter and Delhivery Direct Intracity as peer delivery providers behind Craves' provider-neutral Integration Service boundary.

## Authoritative code paths

```text
services/integration-service/src/main/java/in/craves/integration/delivery/provider/DeliveryProviderCapability.java
services/integration-service/src/main/java/in/craves/integration/delivery/provider/DeliveryProviderCapabilityRegistry.java
services/integration-service/src/main/java/in/craves/integration/delivery/borzo/BorzoDeliveryTelemetryExtractor.java
services/integration-service/src/main/java/in/craves/integration/delivery/shiprocket/ShiprocketDeliveryTelemetryExtractor.java
services/integration-service/src/main/java/in/craves/integration/delivery/telemetry/
services/integration-service/src/main/java/in/craves/integration/delivery/status/DeliveryStatusUpdateService.java
services/order-service/src/main/java/in/craves/order/delivery/
services/order-service/src/main/java/in/craves/order/web/DeliveryStatusDtos.java
services/order-service/src/main/resources/db/migration/V17__delivery_telemetry_projection.sql
services/order-service/src/main/resources/db/migration/V18__delivery_provider_exact_eta.sql
services/integration-service/src/main/resources/db/migration/V112__delivery_telemetry_projection.sql
services/integration-service/src/main/resources/db/migration/V113__delivery_provider_exact_eta.sql
contracts/events/delivery-telemetry-updated-v1.schema.json
contracts/openapi/order-delivery-status-v1.openapi.json
contracts/openapi/chef-delivery-status-v1.openapi.json
azure-pipelines-delivery-status-downstream-ci.yml
```

## Design outcome

Craves records which features each provider supports without using capability support as a commercial ranking rule. Capability states distinguish runtime-ready, supported-not-wired, private-contract-required, unverified and unsupported features.

Borzo and Shiprocket have provider-specific telemetry extraction. Shiprocket GPS is accepted only from trusted tracking scan structures rather than arbitrary payload coordinates. Exact ETA and ETA windows are preserved separately. Newer same-state provider webhooks can update telemetry, while stale, unknown and terminal-protected callbacks cannot.

Customer/chef tracking exposes the strongest safe UX available for the already-selected provider: live map when fresh privacy-approved coordinates exist, otherwise provider tracking link when available, otherwise Craves status timeline.

Shadowfax, Porter and Delhivery Direct Intracity remain first-class provider profiles but executable calls stay fail-closed until their exact Craves partner contracts are verified. Public product descriptions are never converted into guessed request/response schemas.

Provider operations that change business policy—such as NDR reattempt versus return, return authorization, POD presentation or Delivery Code/OTP exposure—remain explicitly product/operations controlled.

## Validation

GitHub Backend completion CI run 396 passed backend source integrity and Maven verification for all seven Java services at the validated multi-provider runtime state. Later changes to this file are documentation-only. Azure pipelines remain intentionally unexecuted.
