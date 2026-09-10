# Razorpay Production Handover Addendum — Authoritative Execution and Rollback Sequence

**Date:** 20 August 2026  
**Applies to:** `docs/handover/2026-08-20-razorpay-full-scale-production.md`  
**Status:** This addendum is authoritative where execution-order or rollback wording differs from the earlier handover pages.

## Why this addendum exists

The main 82-page handover was written while the production run sequence was still being tightened. A final safety review identified two operational clarifications that must be explicit:

1. production environment staging intentionally disables payment creation, so the controlled **live** transaction cannot occur before the live-money activation gate is opened; and
2. a payment kill switch should stop new refund mutations but should not strand a refund that was already submitted to Razorpay and still requires read-only reconciliation.

The implementation and module README were updated accordingly. This addendum records the final authoritative order without rewriting historical descriptions of how the design evolved.

## Authoritative production execution order

1. Run `azure-pipelines-razorpay-production-ci.yml` against the exact reviewed branch/commit and require a successful result.
2. Review and merge the Razorpay source only after CI passes.
3. Deploy the Integration Service build containing Flyway V112 and the durable Razorpay worker while production payment execution remains disabled.
4. Run `azure-pipelines-razorpay-webhook-apim.yml` and verify the public unsigned webhook probe is rejected by the expected authentication/input boundary rather than a missing route.
5. Configure the Razorpay Dashboard production webhook and its secret.
6. Deploy customer web with `NEXT_PUBLIC_RAZORPAY_MODE=production` and verify `/api/readiness/razorpay`.
7. Run `azure-pipelines-razorpay-environment.yml` with `targetEnvironment=PRODUCTION` and exact confirmation `CONFIGURE_RAZORPAY_PRODUCTION`.
8. Verify Razorpay is selected, Cashfree API/traffic/webhooks remain disabled, live execution remains false, the Integration Service is healthy and only the expected live-execution blocker remains in Razorpay readiness.
9. Run `azure-pipelines-razorpay-production-activation.yml` with exact confirmation `ACTIVATE_RAZORPAY_LIVE_MONEY`. This opens a **controlled live-test window**. It is not approval for broad customer traffic.
10. Immediately perform one authorized low-value live customer payment. Confirm the provider payment is captured, the Razorpay Order is paid, amount/currency/identities match, webhook delivery is persisted and completed, Craves reaches PAID once and Order Service receives the paid transition once.
11. Perform one approved controlled refund and confirm the provider refund identity, idempotency behavior, amount/currency and Craves reconciliation.
12. Confirm Razorpay webhook dead-letter count is zero and review logs/readiness/monitoring evidence.
13. If any controlled certification step fails, run `azure-pipelines-razorpay-production-rollback.yml` with `STOP_RAZORPAY_LIVE_MONEY` immediately.
14. Only after the controlled payment/refund certification passes should customer traffic be increased gradually.

## Authoritative kill-switch state

The final rollback behavior is:

```text
PAYMENT_PROVIDER_NAME=RAZORPAY
RAZORPAY_API_ENABLED=true
RAZORPAY_PRODUCTION_PAYMENT_EXECUTION_ENABLED=false
CRAVES_PAYMENT_ORDER_API_ENABLED=false
CRAVES_RAZORPAY_WEBHOOK_INGRESS_ENABLED=true
CRAVES_RAZORPAY_WEBHOOK_WORKER_ENABLED=true

CASHFREE_API_ENABLED=false
CASHFREE_TRAFFIC_ALLOWED=false
CRAVES_CASHFREE_WEBHOOK_INGRESS_ENABLED=false
CRAVES_CASHFREE_WEBHOOK_WORKER_ENABLED=false

CRAVES_REFUND_PROVIDER_EXECUTION_ENABLED=false
CRAVES_REFUND_PRODUCTION_PROVIDER_EXECUTION_APPROVED=false
CRAVES_REFUND_RECONCILIATION_ENABLED=true
CRAVES_REFUND_PRODUCTION_RECONCILIATION_APPROVED=true
```

This state prevents creation of new Razorpay payment Orders and new provider refund mutations while preserving:

- Razorpay API credentials for provider reads;
- Razorpay webhook ingestion;
- durable webhook processing;
- provider verification of already-created payments;
- read-only reconciliation of refunds already submitted before the kill switch.

`RazorpayRefundClient.createRefund(...)` requires payment mutation execution. `RazorpayRefundClient.getRefund(...)` requires provider credentials but not live payment mutation permission, allowing the refund worker to reconcile an existing `providerRefundId` after the kill switch.

## Cashfree rule remains unchanged

The kill switch never routes customers to Cashfree. Cashfree remains code-retained and traffic-disabled. A future Cashfree activation must be a separate explicitly reviewed production change.

## Broad-launch rule

`ACTIVATE_RAZORPAY_LIVE_MONEY` means **open the controlled live validation window**. It does not mean “send all customers to production payment traffic immediately.” Broad traffic begins only after the controlled payment/refund proof, zero critical backlog/dead-letter evidence and operational review pass.
