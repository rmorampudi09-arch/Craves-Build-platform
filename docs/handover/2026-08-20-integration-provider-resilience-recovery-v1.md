# Craves Integration Provider Resilience & Recovery v1 — Engineering Handover

**Date:** 2026-08-20  
**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Branch:** `chatgpt/backend-customer-chef-journey-20260819`  
**Parent release:** Customer + Home-Chef Backend Experience v2  
**Deployment status:** source implemented; Azure pipeline/deployment/activation not represented as completed.

## 1. Why this module was built

A fresh market-standard comparison identified reliability/event safety as the best next backend investment. A repository audit then showed that Craves already had substantial resilience foundations: durable Cashfree webhook ingress, durable delivery webhook ingress, idempotency, stale-lock recovery, delayed provider-outage retries, uncertain-create reconciliation and status outboxes.

The correct next step was therefore not to create another retry framework. This module fills the remaining gaps around outbound provider isolation and operator-safe recovery.

## 2. Existing controls deliberately retained

The implementation does not replace:

- `CashfreeWebhookInboxService` / `CashfreeWebhookWorker`;
- `DeliveryStatusRepository` and existing webhook status worker;
- delivery event duplicate/out-of-order/terminal-state protection;
- `WAITING_FOR_PROVIDER` delayed retry behavior;
- delivery create reconciliation and `ProviderCreateUncertainException` semantics;
- Service Bus outboxes;
- V106 admin investigation audit;
- Borzo/Shiprocket provider-specific timeout and mutation-safety logic.

This is important because replacing these mature paths would increase regression risk without adding customer value.

## 3. Implementation

### 3.1 Finite RestClient timeouts

`IntegrationRestClientCustomizer` gives the Integration Service's Spring `RestClient.Builder` a finite default connect/read timeout.

Defaults:

```text
connect = 5 seconds
read    = 20 seconds
```

The goal is to stop an unhealthy downstream from occupying a worker thread indefinitely. Provider clients that explicitly install their own request factory retain their provider-specific values.

### 3.2 Delivery provider circuit breaker

`ProviderResilienceAspect` surrounds provider-neutral delivery adapter calls at the `DeliveryProviderAdapter` boundary. It uses Resilience4j circuit breaker and semaphore bulkhead primitives.

The feature is staged and disabled by default:

```text
CRAVES_PROVIDER_RESILIENCE_ENABLED=false
```

Only transient/infrastructure failures contribute to breaker failure rate. Business validation errors are recorded for metrics but treated as successful infrastructure calls from the circuit's point of view.

### 3.3 Bulkhead

Each provider gets its own bounded semaphore. A saturated provider cannot consume unlimited Integration Service worker capacity. The bulkhead does not queue/wait for a permit; a full provider is rejected before external I/O.

### 3.4 Mutation safety

No resilience wrapper converts an uncertain provider mutation into an automatic retry.

For delivery create:

```text
request definitely not started because breaker/bulkhead rejected
    -> safe runtime provider failure/fallback behavior

request may have reached provider but response is uncertain
    -> existing ProviderCreateUncertainException
    -> reconciliation required
    -> provider fallback blocked
```

That distinction is intentionally preserved.

### 3.5 Dead-letter investigation

Authenticated admins can inspect one Cashfree or delivery webhook recovery record without exposing raw webhook payload/signature/private address data.

### 3.6 Dead-letter replay

Only rows whose terminal status is exactly `DEAD_LETTER` can be requeued. Replay changes the existing row back to `RECEIVED`, clears worker-terminal metadata and allows the existing worker to retry the stored event.

The recovery API never:

- calls Cashfree create/payment/refund APIs;
- calls a delivery provider create API;
- creates a new customer order;
- replays a Service Bus delivery command;
- changes business/commercial state directly.

### 3.7 Audit

Investigation and replay write to the existing append-only `payment_schema.admin_investigation_audit` table with actor, resource, action, reason, correlation ID and timestamp.

No new Flyway migration was necessary.

## 4. Security model

Investigation is broader than replay because investigation is read-only.

Cashfree investigation:

```text
PLATFORM_ADMIN
SUPPORT_ADMIN
PAYMENTS_ADMIN
AUDIT_ADMIN
```

Cashfree replay:

```text
PLATFORM_ADMIN
PAYMENTS_ADMIN
```

Delivery investigation:

```text
PLATFORM_ADMIN
SUPPORT_ADMIN
OPERATIONS_ADMIN
AUDIT_ADMIN
```

Delivery replay:

```text
PLATFORM_ADMIN
OPERATIONS_ADMIN
```

Every endpoint remains under `/api/v1/admin/**`, which is already protected by Integration Service security configuration. `X-Admin-Reason` is mandatory and must contain 10-500 characters. `X-Correlation-ID` is validated as UUID when supplied.

## 5. API

```text
GET  /api/v1/admin/operations/recovery/webhooks/{source}/{id}
POST /api/v1/admin/operations/recovery/webhooks/{source}/{id}/replay
```

`source`:

```text
CASHFREE
DELIVERY
```

POST response uses HTTP 202 Accepted because the endpoint only requeues the stored event; the existing asynchronous worker performs the actual processing.

## 6. Observability

Added low-cardinality metrics:

```text
craves.integration.provider.calls
craves.integration.provider.rejections
craves.integration.provider.circuit.state
craves.integration.recovery.replay
```

No customer identity, order ID, webhook ID or other high-cardinality identifier is used as a metric tag.

The existing Prometheus actuator exposure can scrape these metrics after deployment.

## 7. Dependency decision

Integration Service now uses Resilience4j 2.4.0 circuit-breaker and bulkhead modules plus Spring AOP. The provider isolation logic is programmatic/manual at the aspect boundary instead of relying on annotation fallback methods. This keeps the existing provider exception semantics visible to the delivery routing/reconciliation code.

## 8. Changed paths

```text
services/integration-service/pom.xml
services/integration-service/src/main/resources/application.yml
services/integration-service/src/main/java/in/craves/integration/resilience/IntegrationHttpClientProperties.java
services/integration-service/src/main/java/in/craves/integration/resilience/IntegrationRestClientCustomizer.java
services/integration-service/src/main/java/in/craves/integration/resilience/ProviderCallRejectedException.java
services/integration-service/src/main/java/in/craves/integration/resilience/ProviderFailureClassifier.java
services/integration-service/src/main/java/in/craves/integration/resilience/ProviderResilienceAspect.java
services/integration-service/src/main/java/in/craves/integration/resilience/ProviderResilienceProperties.java
services/integration-service/src/main/java/in/craves/integration/admin/AdminIntegrationRecoveryController.java
services/integration-service/src/main/java/in/craves/integration/admin/AdminIntegrationRecoveryService.java
services/integration-service/src/test/java/in/craves/integration/resilience/ProviderFailureClassifierTest.java
services/integration-service/src/test/java/in/craves/integration/resilience/ProviderResilienceAspectTest.java
services/integration-service/src/test/java/in/craves/integration/admin/AdminIntegrationRecoveryControllerTest.java
services/integration-service/modules/provider-resilience-recovery/README.md
docs/handover/2026-08-20-integration-provider-resilience-recovery-v1.md
```

## 9. Database impact

No new schema object is created.

Existing objects reused:

```text
payment_schema.cashfree_webhook_delivery
delivery_schema.delivery_webhook_inbox
payment_schema.admin_investigation_audit
```

Replay performs a controlled state reset only on one row that is locked and verified to be `DEAD_LETTER` in the same transaction.

## 10. Configuration

Finite HTTP timeout defaults:

```text
CRAVES_INTEGRATION_HTTP_CONNECT_TIMEOUT_SECONDS=5
CRAVES_INTEGRATION_HTTP_READ_TIMEOUT_SECONDS=20
```

Staged provider resilience:

```text
CRAVES_PROVIDER_RESILIENCE_ENABLED=false
CRAVES_PROVIDER_RESILIENCE_SLIDING_WINDOW_SIZE=20
CRAVES_PROVIDER_RESILIENCE_MINIMUM_CALLS=10
CRAVES_PROVIDER_RESILIENCE_FAILURE_RATE_THRESHOLD=50.0
CRAVES_PROVIDER_RESILIENCE_OPEN_STATE_SECONDS=30
CRAVES_PROVIDER_RESILIENCE_HALF_OPEN_CALLS=3
CRAVES_PROVIDER_RESILIENCE_MAX_CONCURRENT_CALLS=20
```

Do not change provider priority, routing scores or commercial selection settings as part of resilience activation.

## 11. Test procedure

Local:

```bash
cd services/integration-service
mvn -B -ntp clean verify
```

Unified release gate later:

```text
azure-pipelines-customer-chef-backend-experience-v2-ci.yml
```

Expected sandbox validation with resilience initially disabled:

```text
Cashfree payment create/verify unchanged
Cashfree webhook inbox unchanged
Borzo quote/create/reconcile unchanged
Shiprocket read/mutation semantics unchanged
delivery webhook worker unchanged
tracking reconciliation unchanged
admin investigation endpoints unchanged
new recovery investigation endpoint works with allowed read roles
new replay endpoint rejects read-only support/audit roles
new replay endpoint rejects non-DEAD_LETTER state
```

Then activate only in sandbox and inject controlled provider failures:

```text
HTTP 429
HTTP 5xx
connect/read timeout
provider recovery
```

Confirm:

```text
transient failures increase provider failure metrics
business 4xx/validation does not trip circuit
circuit opens only after minimum sample size and threshold
open circuit rejects before provider I/O
half-open probes occur after wait duration
successful probes close circuit
bulkhead rejects excess concurrent calls without waiting
uncertain delivery create still goes to reconciliation instead of provider fallback
```

## 12. Production sequence later

1. Unified seven-service backend CI green.
2. Normal Integration Service deployment with provider resilience flag false.
3. Health/readiness and existing payment/delivery smoke test.
4. Controlled recovery endpoint smoke using sandbox/non-production dead-letter data.
5. Baseline provider metrics captured.
6. Sandbox resilience activation.
7. Failure-injection regression.
8. Review thresholds based on evidence.
9. Only then consider production flag activation through normal change process.

## 13. Rollback

Circuit/bulkhead:

```text
CRAVES_PROVIDER_RESILIENCE_ENABLED=false
```

No schema rollback is required.

If default HTTP timeout values prove too aggressive for an internal dependency, adjust the two Integration HTTP timeout environment values and create a healthy revision; do not remove all time bounds.

The recovery endpoint itself is additive. If access must be disabled urgently, roll back the Integration Service revision; do not mutate dead-letter tables manually as a substitute.

## 14. Manual steps required

### Azure Portal / Container App

No action is required now because activation is deferred.

Later, after sandbox validation, the Integration Service revision can receive `CRAVES_PROVIDER_RESILIENCE_ENABLED=true`.

### Secrets

No new secret exists.

### Azure Monitor

Alerts are recommended for provider circuit-open duration, webhook dead letters, delivery command dead letters and aged `WAITING_FOR_PROVIDER`. They were not provisioned by this module because Azure Monitor alert rules can be billing-sensitive and thresholds need operations approval/load evidence.

### APIM/admin UI

The backend recovery API is implemented. A dedicated admin-console UI/APIM presentation can be added when the Admin Console module is built; no customer/chef endpoint should expose these recovery controls.

## 15. Remaining risks / next items

1. Resilience activation needs real sandbox failure-injection evidence before production.
2. Cashfree payment mutation remains intentionally outside automatic circuit/fallback behavior; deeper payment reconciliation should precede any such change.
3. Delivery command replay is not implemented. It needs a formal duplicate-create-safe recovery contract first.
4. OpenTelemetry trace export across APIM, Service Bus and provider calls remains a later observability module.
5. Azure Monitor alert thresholds remain operational decisions.
6. Multi-provider execution should be exercised only after each executable adapter has passed its own sandbox contract tests.

## 16. Status wording

**Implemented in source** means code and tests/docs were added to the release branch.

**Validated** means Maven/CI has actually run green at the relevant head.

**Deployed** means the Azure Integration Service revision has been promoted and is healthy.

**Activated** means `CRAVES_PROVIDER_RESILIENCE_ENABLED=true` is running in the target environment.

At handover creation time, only the first status is claimed. The pipeline/deployment/activation steps remain for the project owner to execute later.
