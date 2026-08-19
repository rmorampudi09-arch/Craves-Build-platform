# Craves Customer + Home-Chef Backend Experience v2 — Production Release Runbook

**Date:** 2026-08-20  
**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Release branch:** `chatgpt/backend-customer-chef-journey-20260819`  
**Scope:** backend, PostgreSQL/Flyway, APIM, OpenAPI and Azure DevOps only. Web/mobile frontend remains unchanged.

The detailed engineering handover is:

```text
docs/handover/2026-08-19-customer-chef-production-backend-master-handover.md
```

Integration provider resilience/recovery supplement:

```text
docs/handover/2026-08-20-integration-provider-resilience-recovery-v1.md
```

Delivery Telemetry v2 supplement:

```text
docs/handover/2026-08-20-delivery-telemetry-v2.md
```

> **2026-08-20 release supplement:** Delivery Telemetry v2 extends the existing provider-neutral status path with latest courier coordinates/provider arrival windows, Integration V112, Order V17, `DELIVERY_TELEMETRY_UPDATED`, chef-owned delivery-status read access, guarded reuse of the existing Service Bus subscription, and a fail-closed exact-location feature flag. No raw GPS history is created. Exact courier location remains OFF until sandbox privacy/accuracy validation. GitHub `Backend completion CI` run 337 is green for source integrity and all seven Java services at source head `0ad87f62febdd1935259a26d37f7cfee8514d1b9`. Azure DevOps validation/deployment remains intentionally deferred until the module set is complete.

---

## Release execution principle

Run the full production sequence only after all backend modules planned for this release are source-complete. Until then, keep this branch/PR in draft and do not represent any source feature as deployed or active.

### Unified validation

Before any Azure deployment, run:

```text
azure-pipelines-customer-chef-backend-experience-v2-ci.yml
```

For delivery telemetry specifically, also run:

```text
azure-pipelines-delivery-status-downstream-ci.yml
```

Both must pass before delivery telemetry deployment or broker/APIM activation.

### Core production prerequisites

Run the existing customer/chef production prerequisite gate and verify the documented Catalog/Order internal-secret binding before the Catalog privacy sequence.

Do not paste secret values into source, pipeline YAML, documentation or chat.

### Service deployment ordering

Preserve the already-documented service rollout order for the customer/chef backend pack. Delivery Telemetry v2 adds these requirements around Order and Integration:

1. Deploy Order Service first and verify Flyway `V17__delivery_telemetry_projection.sql` while exact live-location exposure remains false.
2. Confirm the existing Order delivery-status subscription/consumer is healthy.
3. Deploy Integration Service and verify Flyway `V112__delivery_telemetry_projection.sql`.
4. Do not create a new telemetry subscription.
5. Run `azure-pipelines-delivery-telemetry-v2-stream-filter.yml` only after both revisions are healthy. It safely broadens the existing SQL filter to accept `DELIVERY_TELEMETRY_UPDATED` in addition to `DELIVERY_STATUS_CHANGED`.
6. Validate provider tracking -> Integration telemetry -> outbox -> Service Bus -> Order projection with controlled sandbox delivery evidence.
7. Configure the chef delivery-status APIM operation only after the Order route is healthy.
8. Keep `CRAVES_DELIVERY_LIVE_LOCATION_EXPOSURE_ENABLED=false` during this validation.
9. Only after privacy/accuracy evidence is approved, run `azure-pipelines-delivery-live-location-activation.yml` with explicit confirmation.

### Delivery telemetry rollback

Use the narrowest rollback first:

```text
azure-pipelines-delivery-live-location-rollback.yml
azure-pipelines-delivery-telemetry-v2-stream-filter-rollback.yml
scripts/apim/rollback-chef-delivery-status-apim.sh
```

If a service revision itself is unhealthy, use the existing Order/Integration revision rollback process. Database telemetry migrations are additive; do not destructively drop telemetry columns during an operational rollback.

### Delivery telemetry smoke requirements

Customer:

```text
owned chef-specific order returns delivery status + telemetry object
unowned order returns 404
provider ETA windows are present only when supplied by provider data
liveLocationAvailable=false while exact-location flag is false
fresh active courier coordinates appear only after explicit activation
stale/future-skewed location is hidden
terminal delivery hides coordinates and ETA windows
```

Chef:

```text
owned chef sub-order returns delivery status + telemetry
another chef's order returns 404
private customer/chef addresses are not exposed
raw provider payload/courier phone/name/photo are not exposed
```

Event safety:

```text
duplicate telemetry event is not reapplied
stale telemetry is not reapplied
telemetry may safely arrive before the matching status projection
established delivery job/provider identity cannot change through telemetry
terminal delivery prevents later live telemetry exposure
```

Scale/observability:

```text
no unbounded GPS history table
no telemetry event when the latest useful telemetry did not materially change
existing delivery subscription backlog remains controlled
Integration telemetry capture metrics observed
Order telemetry projection metrics observed
tracking reconciliation errors monitored
p95/p99 delivery-status latency remains acceptable
```

### Existing release capabilities retained

This runbook supplement does not replace the existing customer/chef backend handover. The release still includes the previously documented request/correlation hardening, Catalog discovery/privacy/schedule/bulk availability, Order history/cart preflight/ready-for-pickup safeguards, Notification inbox, Support Cases, Integration reliability/recovery, APIM baselines, secret prerequisites and staged privacy activation.

No pricing, commission, cancellation/refund, delivery-radius, GST, FSSAI/KYC, ratings/reviews, substitutions, one-time scheduled-order policy, delivery-provider commercial priority or personalization rules are introduced by Delivery Telemetry v2.

For detailed file-level instructions, failure modes, privacy logic, migration sequencing, CI history and smoke evidence, use:

```text
docs/handover/2026-08-20-delivery-telemetry-v2.md
```
