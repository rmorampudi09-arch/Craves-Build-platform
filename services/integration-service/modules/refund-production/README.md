# Refund Production Readiness — Razorpay Primary

Craves production refunds now use Razorpay as the active financial provider. The durable refund workflow remains provider-aware internally so dormant Cashfree source can be retained, but production refund creation is fail-closed to the active provider and the 30-minute automatic refund workflow creates Razorpay refund rows only.

## Current production provider rule

```text
PAYMENT_PROVIDER_NAME=RAZORPAY
RAZORPAY_API_ENABLED=true
CASHFREE_API_ENABLED=false
CASHFREE_TRAFFIC_ALLOWED=false
```

`RefundRequestService` additionally requires the paid checkout itself to have `provider=RAZORPAY`, a Razorpay `order_...` identifier and a captured `pay_...` identifier before a refund row can be created.

The refund ledger worker claims only rows whose `provider` equals the active payment provider. It therefore cannot pick up dormant Cashfree rows while Razorpay is active.

## Durable workflow

```text
REFUND_REQUESTED
  -> refund_request_inbox
  -> payment_schema.refund
  -> provider-scoped SKIP LOCKED worker claim
  -> Razorpay refund
  -> provider reconciliation
  -> refund_status_outbox
  -> REFUND_STATUS_CHANGED
  -> Order Service refund state
```

The workflow is at-least-once safe through inbox deduplication, deterministic refund idempotency, database claim tokens, stale-lock recovery and idempotent status publication.

## Separate production approvals

```text
CRAVES_REFUND_PRODUCTION_RECONCILIATION_APPROVED=false
CRAVES_REFUND_PRODUCTION_PROVIDER_EXECUTION_APPROVED=false
CRAVES_REFUND_RECONCILIATION_ENABLED=false
CRAVES_REFUND_PROVIDER_EXECUTION_ENABLED=false
```

In production, runtime worker flags cannot execute without their matching approval. Startup fails when production execution/reconciliation is enabled without its corresponding approval.

## Razorpay idempotency

Refund creation uses:

```text
X-Refund-Idempotency: <deterministic Craves key>
```

The same chef-specific order always generates the same Craves idempotency key. Provider responses are checked for refund ID, payment ID, amount and currency before Craves accepts them.

## Internal readiness API

```text
GET /internal/v1/refund-production-readiness
X-Craves-Internal-Secret: <shared internal secret>
```

It reports executable, reconcilable, processing and dead-letter refund counts; status-outbox backlog; request-inbox failures; downstream state and blocker codes. It does not return credential values.

## Production activation

For the current Razorpay architecture, use the Razorpay production gates rather than the older Cashfree production activation flow:

```text
azure-pipelines-razorpay-production-activation.yml
azure-pipelines-razorpay-auto-refund-production.yml
```

The payment activation opens Razorpay live execution. The auto-refund activation separately enables refund consumer/reconciliation/provider execution and then enables the Order Service 30-minute timeout producer only after downstream readiness is verified.

Exact auto-refund confirmation:

```text
ACTIVATE_RAZORPAY_AUTO_REFUND
```

## Rollback

For timeout-generation problems:

```text
azure-pipelines-razorpay-auto-refund-rollback.yml
STOP_RAZORPAY_AUTO_REFUND
```

This stops new timeout refund generation while preserving downstream processing/reconciliation for refund intents already created.

For provider/payment safety problems, use the separate Razorpay live-money rollback. Cashfree is not an automatic failover route.

## Automated validation

`.github/workflows/backend-completion-ci.yml` contains:

```text
Razorpay auto-refund smoke — 10x
```

The job compiles Order and Integration services and runs the focused timeout/refund tests ten consecutive times. The normal Maven matrix also runs full `clean verify` on both services.

## Manual work before broad production use

- require green full Maven CI and the 10x auto-refund smoke job on the exact reviewed commit;
- deploy the Order Service migration containing the distributed timeout claim fields;
- deploy the matching Integration Service Razorpay refund implementation;
- complete the controlled Razorpay live payment/refund certification;
- activate the Razorpay auto-refund gate only after current executable/reconcilable/processing counts are deliberately supplied;
- run one paid order through the complete 30-minute non-acceptance path;
- verify one and only one Razorpay refund is created and reconciled;
- verify no Cashfree request is emitted;
- verify timeout/outbox/refund dead-letter metrics remain healthy;
- run burst, restart, stale-claim, Service Bus outage, database transient failure and Razorpay timeout/rate-limit resilience tests before making a very-high-concurrency claim.

This module does not define new refund eligibility, deductions, compensation, commission impact, settlement policy or customer SLA.
