# Craves Multi-Provider Delivery Capability & Telemetry — Engineering Handover

Delivery is provider-neutral across Borzo, Shiprocket Quick, Shadowfax, Porter and Delhivery Direct Intracity. See repository history for the full detailed engineering handover. The authoritative implementation is on `chatgpt/backend-customer-chef-journey-20260819` and remains undeployed by project plan.

Core artifacts:

```text
services/integration-service/src/main/java/in/craves/integration/delivery/provider/DeliveryProviderCapability.java
services/integration-service/src/main/java/in/craves/integration/delivery/provider/DeliveryProviderCapabilityRegistry.java
services/integration-service/src/main/java/in/craves/integration/delivery/borzo/BorzoDeliveryTelemetryExtractor.java
services/integration-service/src/main/java/in/craves/integration/delivery/shiprocket/ShiprocketDeliveryTelemetryExtractor.java
services/integration-service/src/main/resources/db/migration/V112__delivery_telemetry_projection.sql
services/integration-service/src/main/resources/db/migration/V113__delivery_provider_exact_eta.sql
services/order-service/src/main/resources/db/migration/V17__delivery_telemetry_projection.sql
services/order-service/src/main/resources/db/migration/V18__delivery_provider_exact_eta.sql
contracts/events/delivery-telemetry-updated-v1.schema.json
contracts/openapi/order-delivery-status-v1.openapi.json
contracts/openapi/chef-delivery-status-v1.openapi.json
azure-pipelines-delivery-status-downstream-ci.yml
```

Provider capability states distinguish runtime-ready, supported-but-not-wired, private-contract-required, unverified and unsupported features. This matrix must never be used as commercial provider ranking.

Borzo and Shiprocket have provider-specific telemetry extraction. Shiprocket GPS is accepted only from trusted tracking scans, not arbitrary destination coordinates. Exact provider ETA and ETA windows remain distinct. Same-state newer webhooks can refresh telemetry, while stale/unknown/terminal-protected callbacks cannot.

Customer/chef tracking uses the strongest safe experience available for the already-selected provider: `LIVE_MAP`, else `PROVIDER_TRACKING_LINK`, else `STATUS_TIMELINE`. Exact live coordinates remain fail-closed by default.

Shadowfax, Porter and Delhivery Direct Intracity are first-class provider profiles, but executable calls remain fail-closed until their exact Craves partner contracts are verified. Their public feature support is not converted into guessed API schemas.

GitHub Backend completion CI run 396 passed source integrity and Maven verify for all seven Java services at the validated multi-provider runtime state. Azure pipelines are intentionally deferred until the full module set is complete.
