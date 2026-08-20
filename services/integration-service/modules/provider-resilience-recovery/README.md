# Integration Service — Provider Resilience & Dead-Letter Recovery v1

## Purpose

This module closes the remaining Integration Service reliability gap without replacing the durable retry/idempotency systems that already exist for Cashfree and delivery webhooks.

It adds:

- finite default connect/read timeouts for Spring `RestClient` calls;
- optional, fail-safe circuit-breaker isolation for `DeliveryProviderAdapter` calls;
- per-provider semaphore bulkheads to stop one unhealthy provider from consuming all Integration Service worker capacity;
- low-cardinality Micrometer metrics for provider outcomes, circuit state and rejected calls;
- authenticated, audited investigation of Cashfree and delivery webhook recovery records;
- authenticated, audited replay of terminal webhook dead letters only.

It does **not**:

- retry a payment create blindly;
- retry a refund create blindly;
- issue a new delivery-provider create from the recovery API;
- replay a delivery command;
- alter provider ranking/priority;
- alter pricing, commission, delivery fees, cancellation/refund policy or settlement rules;
- activate any delivery provider;
- provision Azure resources.

## Why the implementation is additive

Craves already has the following production-grade foundations:

- Cashfree durable webhook inbox with idempotency, retry, stale-lease recovery and dead-letter state;
- delivery durable webhook inbox with duplicate/out-of-order/terminal-state protection;
- delivery create reconciliation for uncertain provider mutation outcomes;
- `WAITING_FOR_PROVIDER` delayed recovery for temporary provider outages;
- transactional delivery status outbox;
- admin investigation audit table.

This module reuses those controls instead of creating parallel mechanisms.

## Code paths

```text
services/integration-service/
  pom.xml
  src/main/java/in/craves/integration/resilience/
    IntegrationHttpClientProperties.java
    IntegrationRestClientCustomizer.java
    ProviderCallRejectedException.java
    ProviderFailureClassifier.java
    ProviderResilienceAspect.java
    ProviderResilienceProperties.java
  src/main/java/in/craves/integration/admin/
    AdminIntegrationRecoveryController.java
    AdminIntegrationRecoveryService.java
  src/main/resources/application.yml
  src/test/java/in/craves/integration/resilience/
    ProviderFailureClassifierTest.java
    ProviderResilienceAspectTest.java
  src/test/java/in/craves/integration/admin/
    AdminIntegrationRecoveryControllerTest.java
```

No Flyway migration is required. Recovery audit events reuse `payment_schema.admin_investigation_audit` from V106, and replay resets existing V102/V103 inbox rows through their existing state contracts.

## Runtime defaults

Provider circuit isolation is deliberately disabled by default:

```text
CRAVES_PROVIDER_RESILIENCE_ENABLED=false
```

Default finite HTTP timeouts are active when the service starts:

```text
CRAVES_INTEGRATION_HTTP_CONNECT_TIMEOUT_SECONDS=5
CRAVES_INTEGRATION_HTTP_READ_TIMEOUT_SECONDS=20
```

Borzo and Shiprocket retain their provider-specific timeout settings; provider-specific clients that install their own request factory/HTTP client remain authoritative for those calls.

## Circuit/bulkhead settings

```text
CRAVES_PROVIDER_RESILIENCE_ENABLED=false
CRAVES_PROVIDER_RESILIENCE_SLIDING_WINDOW_SIZE=20
CRAVES_PROVIDER_RESILIENCE_MINIMUM_CALLS=10
CRAVES_PROVIDER_RESILIENCE_FAILURE_RATE_THRESHOLD=50.0
CRAVES_PROVIDER_RESILIENCE_OPEN_STATE_SECONDS=30
CRAVES_PROVIDER_RESILIENCE_HALF_OPEN_CALLS=3
CRAVES_PROVIDER_RESILIENCE_MAX_CONCURRENT_CALLS=20
```

These are engineering safety defaults, not commercial/provider-priority rules. Tune them only after sandbox/load evidence.

The breaker records infrastructure/transient failures such as network I/O, HTTP 408, HTTP 429 and provider 5xx. Business validation errors do not count toward the provider infrastructure failure rate.

The bulkhead waits zero time for a permit. A saturated provider is rejected before provider I/O rather than allowing unbounded worker contention.

## Mutation-safety behavior

The circuit is applied at `DeliveryProviderAdapter` methods:

```text
quote
create
reconcileCreate
cancel
track
```

A circuit-open or bulkhead-full rejection happens before provider I/O.

Existing uncertain-create behavior remains authoritative. If a provider create request might have reached the provider but Craves did not receive a trustworthy response, the existing `ProviderCreateUncertainException`/reconciliation workflow continues to block provider fallback.

Cashfree payment creation is intentionally **not** wrapped in a blind payment-level retry/circuit fallback. The new finite HTTP timeout prevents indefinite socket occupation, while Cashfree idempotency and durable webhook/reconciliation paths remain the source of truth for uncertain outcomes.

## Recovery API

Base path:

```text
/api/v1/admin/operations/recovery/webhooks
```

Investigate one stored webhook recovery item:

```http
GET /api/v1/admin/operations/recovery/webhooks/{source}/{id}
Authorization: Bearer <admin token>
X-Admin-Reason: <10-500 character reason>
X-Correlation-ID: <uuid optional>
```

Replay one terminal dead letter:

```http
POST /api/v1/admin/operations/recovery/webhooks/{source}/{id}/replay
Authorization: Bearer <admin token>
X-Admin-Reason: <10-500 character reason>
X-Correlation-ID: <uuid optional>
```

Supported `source` values:

```text
CASHFREE
DELIVERY
```

Replay is accepted only when `processing_status=DEAD_LETTER`. The operation resets the existing inbox row to `RECEIVED`, clears terminal worker metadata and lets the already-existing worker process the stored raw event again.

Raw payloads, webhook signatures, provider secrets and customer/chef addresses are not returned from the recovery API.

## RBAC

Read/investigation:

```text
CASHFREE: PLATFORM_ADMIN, SUPPORT_ADMIN, PAYMENTS_ADMIN, AUDIT_ADMIN
DELIVERY: PLATFORM_ADMIN, SUPPORT_ADMIN, OPERATIONS_ADMIN, AUDIT_ADMIN
```

Replay/write:

```text
CASHFREE: PLATFORM_ADMIN, PAYMENTS_ADMIN
DELIVERY: PLATFORM_ADMIN, OPERATIONS_ADMIN
```

Support and audit roles therefore remain read-only for replay operations.

Every investigation and replay writes an append-only row to:

```text
payment_schema.admin_investigation_audit
```

with actor identity, resource, action, reason, correlation ID and timestamp.

## Metrics

Prometheus/Actuator already exposes Integration Service metrics.

New metric families:

```text
craves.integration.provider.calls
  tags: provider, outcome
  outcomes: success, transient_failure, non_transient_failure

craves.integration.provider.rejections
  tags: provider, reason
  reasons: circuit_open, bulkhead_full

craves.integration.provider.circuit.state
  tag: provider
  value: 0 CLOSED, 1 OPEN, 2 HALF_OPEN, 3+ special state

craves.integration.recovery.replay
  tags: source, outcome
```

Provider IDs are bounded application configuration values; no order/customer/event IDs are used as metric tags.

## Local validation

From the repository root:

```bash
cd services/integration-service
mvn -B -ntp clean verify
```

Important regression expectations:

1. existing Cashfree webhook worker tests remain green;
2. existing delivery command/reconciliation/webhook/tracking tests remain green;
3. provider transient classifier tests pass;
4. circuit opens after the configured transient-failure threshold;
5. business validation failures do not count as provider infrastructure failures;
6. SUPPORT_ADMIN cannot replay Cashfree dead letters;
7. PAYMENTS_ADMIN can request a Cashfree dead-letter replay;
8. application context starts with provider resilience disabled.

## Deployment sequence

Do not activate the breaker merely because the image was deployed.

Recommended order:

```text
1. Run azure-pipelines-customer-chef-backend-experience-v2-ci.yml.
2. Run the normal Integration Service deployment pipeline.
3. Verify health/readiness and existing payment/delivery smoke paths with CRAVES_PROVIDER_RESILIENCE_ENABLED=false.
4. Verify the recovery endpoints using controlled sandbox dead-letter rows only.
5. Capture baseline provider latency/error metrics.
6. In sandbox, set CRAVES_PROVIDER_RESILIENCE_ENABLED=true.
7. Exercise controlled provider 429/5xx/network-failure scenarios.
8. Verify circuit opens, requests are rejected before provider I/O, then half-open/recovery succeeds.
9. Run delivery-create reconciliation regression to prove uncertain mutation handling is unchanged.
10. Only after evidence review should the flag be considered for production.
```

## Rollback

Fastest circuit rollback:

```text
CRAVES_PROVIDER_RESILIENCE_ENABLED=false
```

This disables circuit/bulkhead interception without changing the deployed image or database.

The finite HTTP timeouts can be tuned through:

```text
CRAVES_INTEGRATION_HTTP_CONNECT_TIMEOUT_SECONDS
CRAVES_INTEGRATION_HTTP_READ_TIMEOUT_SECONDS
```

Do not remove/alter durable inbox rows during rollback. The recovery endpoint only changes a selected terminal row after an authenticated audited request.

## Manual steps required

### Azure Portal / Container App

Only when the module is intentionally activated later:

- update `CRAVES_PROVIDER_RESILIENCE_ENABLED=true` on the Integration Service Container App;
- optionally tune the documented resilience values after sandbox evidence;
- verify the new revision is healthy before shifting/retaining traffic.

No new paid Azure resource is required.

### Azure Monitor

Recommended but not provisioned here:

- alert when `WAITING_FOR_PROVIDER` age exceeds the operations threshold;
- alert on new delivery webhook `DEAD_LETTER` rows;
- alert on new Cashfree webhook `DEAD_LETTER` rows;
- alert when a provider circuit remains OPEN beyond the agreed operations threshold;
- dashboard provider transient-failure and circuit-rejection rates.

Creating Azure Monitor alert rules can be billing-sensitive depending on rule type/volume, so this module does not create them automatically.

### Secrets

No new secret value is introduced. Never paste Cashfree, Borzo, Shiprocket, database, Firebase or internal-service secrets into source, pipeline YAML or chat.

## Remaining reliability work after v1

This module deliberately does not claim the entire world-class reliability roadmap is finished. Follow-on work should include:

- production-tested Azure Monitor alert thresholds;
- OpenTelemetry trace export across APIM -> service -> Service Bus/provider boundaries;
- operator UI over the recovery API;
- controlled recovery for delivery commands only after a duplicate-create-safe command replay contract is formally defined;
- provider-specific circuit evidence for additional executable provider adapters;
- payment-provider mutation reconciliation improvements before adding any payment-level circuit/fallback behavior.
