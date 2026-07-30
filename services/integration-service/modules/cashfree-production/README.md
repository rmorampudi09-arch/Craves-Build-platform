# Cashfree production hardening

This module separates production configuration, webhook processing and payment execution so one deployment cannot accidentally activate real customer charges.

## Durable webhook path

```text
Cashfree HTTPS callback
→ version/timestamp/idempotency/signature validation
→ durable payment_schema.cashfree_webhook_delivery inbox
→ multi-replica-safe claim
→ existing PaymentService processing
→ completed, retry, or local dead-letter state
```

The signature check uses the exact raw request body and timestamp. Payload size is capped at 1 MiB. Idempotency-key reuse with different content is rejected.

## Internal readiness API

```text
GET /internal/v1/payment-provider-readiness
X-Craves-Internal-Secret: <shared internal secret>
```

It reports configuration readiness, execution state, webhook backlog/dead-letter counts and blocker codes. Credential values and payment payloads are never returned.

## Financial switches

```text
CRAVES_CASHFREE_PRODUCTION_ACTIVATION_APPROVED=false
CRAVES_CASHFREE_PRODUCTION_PAYMENT_EXECUTION_ENABLED=false
CRAVES_CASHFREE_WEBHOOK_WORKER_ENABLED=false
```

Production payment creation and verification are rejected until the second switch is true. Sandbox remains usable for controlled testing.

## Staged activation

```text
azure-pipelines-cashfree-production-activation.yml
```

1. `webhook`: binds production credentials by secret reference, registers production metadata, enables only the durable webhook worker, and leaves payment execution false.
2. `payment_execution`: reads real readiness/backlog counts and enables real payment creation only when configuration is ready and the webhook dead-letter count is zero.

The pipeline requires the secret variable `CRAVES_INTERNAL_SMOKE_SECRET`; do not commit or paste it into chat.

## Rollback

`azure-pipelines-cashfree-production-rollback.yml` disables payment execution, webhook processing and refund provider workers. It never deletes payments, webhooks, refunds or audit evidence.

## Manual work later

- complete Cashfree merchant KYC and production enablement;
- create/rotate `cashfree-client-id` and `cashfree-client-key` in the Container App/Key Vault flow;
- register the final APIM webhook URL in Cashfree;
- verify the provider webhook version list;
- run one approved low-value production payment and refund;
- reconcile Cashfree dashboard, Integration database, Order state and notifications.
