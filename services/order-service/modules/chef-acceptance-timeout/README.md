# Chef Acceptance Timeout and Razorpay Auto-Refund Module

This module protects customers when a paid chef-specific Craves order is not accepted by the kitchen within the existing 30-minute acceptance window.

## Production behavior

```text
Verified Razorpay payment
        |
        v
CHEF_ACCEPTANCE_PENDING
        |
        +-- T+0  initial chef notification
        +-- T+10 reminder
        +-- T+20 urgent reminder
        |
        v
T+30 and still not accepted
        |
        v
Distributed timeout claim
        |
        v
CHEF_REJECTED / CHEF_ACCEPTANCE_TIMEOUT
        |
        v
Transactional REFUND_REQUESTED outbox event
        |
        v
Azure Service Bus
        |
        v
Integration Service refund inbox/ledger
        |
        v
Razorpay refund only
        |
        v
Razorpay reconciliation
        |
        v
REFUND_STATUS_CHANGED
        |
        v
Order REFUND_PENDING / REFUNDED / REFUND_FAILED
```

The timeout refund amount remains the existing chef-specific `grand_total`. No new pricing, commission, deduction, compensation or refund-eligibility rule is introduced by this hardening.

## Razorpay-only invariant

Automatic refunds created by this flow are allowed only when:

```text
PAYMENT_PROVIDER_NAME=RAZORPAY
RAZORPAY_API_ENABLED=true
```

Integration Service verifies that the paid checkout itself belongs to Razorpay and has both a Razorpay Order ID and captured Payment ID. New refund ledger rows produced by this workflow are stored with:

```text
provider=RAZORPAY
cashfree_order_id=NULL
```

The refund executor claims only rows matching the currently active payment provider. Cashfree source remains present elsewhere in the repository for a future separately reviewed activation, but this automatic timeout-refund flow does not route to it.

## Distributed timeout claims

Flyway migration:

```text
services/order-service/src/main/resources/db/migration/V20__chef_acceptance_timeout_distributed_claim.sql
```

adds:

```text
chef_acceptance_timeout_claim_token
chef_acceptance_timeout_claimed_at
chef_acceptance_timeout_attempt_count
chef_acceptance_timeout_last_error
```

`ChefAcceptanceWorkRepository.claimExpiredOrderIds(...)` uses:

```sql
FOR UPDATE SKIP LOCKED
```

and atomically stamps a claim token before returning work. This lets multiple Order Service replicas divide expired orders rather than repeatedly selecting the same first batch.

`ChefAcceptanceResolutionService.timeoutExpiredOrder(...)` accepts the timeout only when the row is still pending, the deadline has passed and the worker still owns the matching claim token.

If a worker fails before completing the order transition, its claim is released for retry. If a worker process dies before releasing it, the claim becomes reclaimable after:

```text
CRAVES_CHEF_ACCEPTANCE_TIMEOUT_CLAIM_STALE_SECONDS=300
```

No finite timeout-attempt dead-letter is used at this producer boundary. A customer refund intent must continue to be retried until the business state is resolved or an operator intervenes. Operational metrics expose repeated attempts and overdue age.

## Transaction safety

The timeout resolution remains one PostgreSQL transaction that:

1. locks the chef-specific order;
2. verifies `CHEF_ACCEPTANCE_PENDING` and expiry;
3. verifies timeout claim ownership;
4. moves the order to `CHEF_REJECTED`;
5. stores `CHEF_ACCEPTANCE_TIMEOUT`;
6. copies `grand_total` into `refund_requested_amount`;
7. creates the `REFUND_REQUESTED` domain event using the transactional outbox;
8. records the customer refund notification outbox event;
9. clears the timeout claim.

A competing chef accept/reject request and the timeout worker therefore resolve through the same row-lock/state boundary rather than creating two financial decisions.

## Refund idempotency and financial bounds

Integration Service:

- deduplicates `REFUND_REQUESTED` by immutable event ID;
- permits only one refund row for a chef-specific order;
- locks the paid payment order before reserving refund amount;
- requires payment status `PAID`;
- requires payment provider `RAZORPAY`;
- requires Razorpay `order_...` and captured `pay_...` identifiers;
- requires refund currency to match payment currency;
- rejects non-positive refunds;
- rejects a single refund above captured payment amount;
- rejects cumulative refunds above captured payment amount;
- creates a deterministic idempotency key from the chef-specific order ID.

Razorpay refund requests use:

```text
X-Refund-Idempotency
```

with the deterministic Craves idempotency key. Provider responses are validated for refund identity, payment identity, amount and currency before being accepted.

## Multi-replica refund execution

`RefundRepository.claimBatch(...)` uses a provider-scoped `FOR UPDATE SKIP LOCKED` claim with lock tokens, stale-lock recovery, retries and dead-letter handling.

When Razorpay is the active provider, the worker claims only:

```text
provider=RAZORPAY
```

rows. It does not claim dormant Cashfree refunds.

## Production metrics

`AutoRefundMetrics` exports Micrometer/Prometheus gauges:

```text
craves_auto_refund_timeout_expired_backlog
craves_auto_refund_timeout_claimed_backlog
craves_auto_refund_timeout_stale_claims
craves_auto_refund_timeout_max_attempts
craves_auto_refund_timeout_oldest_overdue_seconds
craves_auto_refund_request_outbox_backlog
```

The Java meter names use dotted notation and Prometheus exposes normalized underscore names.

Alerting should treat a growing expired backlog, non-zero stale claims, rising maximum attempts, growing outbox backlog or increasing oldest-overdue age as an auto-refund incident.

## Runtime defaults

The module remains fail-closed in source defaults:

```text
CRAVES_CHEF_ACCEPTANCE_WORKER_ENABLED=false
CRAVES_DOMAIN_EVENT_OUTBOX_ENABLED=false
CRAVES_DOMAIN_EVENT_SERVICE_BUS_ENABLED=false
CRAVES_REFUND_STATUS_CONSUMER_ENABLED=false
```

Deployment alone therefore does not start timeout refunds.

## Production activation

Use:

```text
azure-pipelines-razorpay-auto-refund-production.yml
```

Exact confirmation:

```text
ACTIVATE_RAZORPAY_AUTO_REFUND
```

The pipeline requires Razorpay production/live-money configuration to already be active, verifies Cashfree is disabled, verifies Razorpay credentials are secret references, checks refund readiness/dead-letter counts, enables the Integration Service refund chain first, enables Order Service outbox/Service Bus/refund-status consumption second, and enables the 30-minute timeout worker last.

Production values explicitly applied by the pipeline include:

```text
CRAVES_CHEF_ACCEPTANCE_TIMEOUT_MINUTES=30
CRAVES_CHEF_ACCEPTANCE_FIRST_REMINDER_MINUTES=10
CRAVES_CHEF_ACCEPTANCE_SECOND_REMINDER_MINUTES=20
CRAVES_CHEF_ACCEPTANCE_TIMEOUT_CLAIM_STALE_SECONDS=300
```

The activation preserves existing Order domain event types and adds `REFUND_REQUESTED` rather than replacing the allow-list with a smaller list.

## Rollback

Use:

```text
azure-pipelines-razorpay-auto-refund-rollback.yml
```

Exact confirmation:

```text
STOP_RAZORPAY_AUTO_REFUND
```

This rollback stops the timeout producer first:

```text
CRAVES_CHEF_ACCEPTANCE_WORKER_ENABLED=false
```

It intentionally leaves downstream refund-event consumption and Razorpay reconciliation active so refund intents already created before the stop can finish.

If Razorpay itself is unsafe, use the separate Razorpay live-money kill switch instead. The auto-refund rollback is not a substitute for the provider-level financial kill switch.

## Smoke testing

PR CI contains the dedicated job:

```text
Razorpay auto-refund smoke — 10x
```

It first compiles Order Service and Integration Service, then executes the focused Order + Integration auto-refund tests ten consecutive times with fail-fast behavior.

The smoke suite covers:

- 30/10/20 acceptance timing defaults;
- timeout claim stale-window bounds;
- distributed `SKIP LOCKED` claim invariants;
- timeout claim ownership;
- timeout refund amount/outbox invariants;
- Razorpay-only refund intake;
- provider-scoped refund ledger claiming;
- deterministic refund idempotency;
- Razorpay request money safety;
- payment routing defaults.

A green `10x` job means all ten focused iterations passed on that exact PR head. It does not replace a controlled deployed end-to-end test with a real Razorpay payment/refund.

## Local verification

```bash
cd services/order-service
mvn -B -ntp clean verify

cd ../integration-service
mvn -B -ntp clean verify
```

Focused tests:

```bash
cd services/order-service
mvn -B -ntp -Dtest=ChefAcceptanceWindowPropertiesTest,ChefAcceptancePolicyTest,ChefAcceptanceDistributedClaimCompatibilityTest test

cd ../integration-service
mvn -B -ntp -Dtest=RefundRequestServiceTest,RazorpayAutoRefundRoutingCompatibilityTest,RazorpayRequestSafetyTest,PaymentRoutingPropertiesTest test
```

## Manual steps required

### Azure DevOps

Register/run, after source CI is green:

```text
azure-pipelines-order-service.yml
azure-pipelines-integration-service.yml
azure-pipelines-razorpay-auto-refund-production.yml
azure-pipelines-razorpay-auto-refund-rollback.yml
```

Do not activate the auto-refund pipeline before Razorpay's controlled live payment/refund certification has passed.

`CRAVES_INTERNAL_SMOKE_SECRET` must exist as a secret Azure DevOps variable for the guarded readiness call. Do not paste its value into chat or source control.

### Azure runtime

No new paid Azure resource is created by this code. Existing Container Apps, PostgreSQL and Azure Service Bus are used.

Before activation, confirm the deployed Order Service has applied Flyway V16 and both Order/Integration revisions are healthy.

### Razorpay

No new Razorpay credential is required specifically for the timeout scheduler. It uses the production Razorpay credentials already bound to Integration Service.

The production Razorpay refund path must already be enabled and certified before automatic timeout generation is opened.

## Production certification still required

Source engineering and CI do not prove a live financial workflow. Before broad customer use, execute a controlled production certification using an authorized low-value paid order:

1. pay successfully through Razorpay;
2. leave the chef-specific order unaccepted;
3. verify the 30-minute acceptance deadline is recorded;
4. verify reminders at the expected stages;
5. verify one timeout worker claims the order at/after T+30;
6. verify exactly one `REFUND_REQUESTED` event is produced;
7. verify Integration Service creates exactly one Razorpay refund row;
8. verify exactly one provider refund request is made with the deterministic idempotency key;
9. verify provider status is reconciled;
10. verify Order Service reaches the expected refund state and customer notification is produced;
11. verify no Cashfree request is emitted;
12. verify timeout/refund/outbox/DLQ metrics are healthy afterward.

Also test service restart, replica termination, Service Bus outage, PostgreSQL transient failure, Razorpay timeout/409/429/5xx behavior, duplicate event delivery, stale timeout claims and a burst of simultaneous expirations before claiming very-high-concurrency production readiness.
