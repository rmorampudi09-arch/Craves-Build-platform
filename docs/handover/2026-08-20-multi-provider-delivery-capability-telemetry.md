# Craves Multi-Provider Delivery Capability & Telemetry — Engineering Handover

**Status:** source-ready; Azure deployment intentionally deferred until all backend modules are complete.

Craves delivery is provider-neutral across Borzo, Shiprocket Quick, Shadowfax, Porter and Delhivery Direct Intracity. Provider-specific capabilities remain inside Integration Service and the customer/chef API exposes the strongest safe experience available for the actual provider assigned to the order.

Authoritative paths:

```text
services/integration-service/src/main/java/in/craves/integration/delivery/provider/DeliveryProviderCapability.java
services/integration-service/src/main/java/in/craves/integration/delivery/provider/DeliveryProviderCapabilityRegistry.java
services/integration-service/src/main/java/in/craves/integration/delivery/borzo/BorzoDeliveryTelemetryExtractor.java
services/integration-service/src/main/java/in/craves/integration/delivery/shiprocket/ShiprocketDeliveryTelemetryExtractor.java
services/integration-service/src/main/java/in/craves/integration/delivery/telemetry/
services/integration-service/src/main/java/in/craves/integration/delivery/status/DeliveryStatusUpdateService.java
services/integration-service/src/main/resources/db/migration/V112__delivery_telemetry_projection.sql
services/integration-service/src/main/resources/db/migration/V113__delivery_provider_exact_eta.sql
services/order-service/src/main/resources/db/migration/V17__delivery_telemetry_projection.sql
services/order-service/src/main/resources/db/migration/V18__delivery_provider_exact_eta.sql
contracts/events/delivery-telemetry-updated-v1.schema.json
contracts/openapi/order-delivery-status-v1.openapi.json
contracts/openapi/chef-delivery-status-v1.openapi.json
azure-pipelines-delivery-status-downstream-ci.yml
```

Capability states distinguish `AVAILABLE_NOW`, `SUPPORTED_NOT_WIRED`, `PRIVATE_CONTRACT_REQUIRED`, `NOT_VERIFIED` and `NOT_SUPPORTED`. The capability registry must never be used for commercial provider ranking.

Borzo and Shiprocket have provider-specific telemetry extractors. Shiprocket rider GPS is accepted only from trusted tracking scan structures rather than arbitrary payload coordinates. Exact provider ETA and ETA windows remain semantically separate. Same-state newer webhooks can update telemetry, while stale, unknown and terminal-protected callbacks cannot.

Customer/chef tracking uses `LIVE_MAP` when fresh privacy-approved coordinates exist, otherwise `PROVIDER_TRACKING_LINK` when supplied by the provider, otherwise `STATUS_TIMELINE`. Exact live courier location remains fail-closed by default.

Shadowfax, Porter and Delhivery Direct Intracity remain first-class provider profiles. Executable calls stay fail-closed until exact Craves partner transaction/auth/webhook contracts are verified; public feature descriptions are never converted into guessed API schemas.

Business-policy operations such as NDR reattempt versus return, return authorization, POD presentation and Delivery Code/OTP exposure remain product/operations controlled.

GitHub Backend completion CI run 396 passed backend source integrity and Maven verification for all seven Java services at the validated multi-provider runtime state. Azure pipelines remain unexecuted by project plan.
