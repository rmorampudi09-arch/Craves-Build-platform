# Cashfree production hardening

This module separates production configuration, webhook processing and payment execution so one deployment cannot accidentally activate real customer charges.

## Durable webhook path

```text
Cashfree HTTPS callback
→ version/timestamp/idempotency/signature validation
→ durable payment_schema.cashfree_webhook_delivery inbox
→ multi-replica-safe claim
→ SUCCESS callbacks re-verified against Cashfree Get Payment by ID API
→ checkout or subscription payment processing
→ completed, retry, or local dead-letter state
```

The signature check uses the exact raw request body and timestamp. Payload size is capped at 1 MiB. Idempotency-key reuse with different content is rejected. A signed `SUCCESS` webhook is not sufficient by itself to finalize money state: the worker calls Cashfree `GET /pg/orders/{orderId}/payments/{cfPaymentId}` and requires matching order ID, payment ID, `SUCCESS` status, payment/order amount and payment/order currency before dispatching the event to either checkout or subscription payment logic.

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

## Production closure checklist

### Code and Azure deployment gates

- run `azure-pipelines-cashfree-production-ci.yml` successfully on current `main`;
- confirm the Integration Service contains Container App secrets `cashfree-client-id` and `cashfree-client-key` and only secret references are bound to runtime environment variables;
- run `azure-pipelines-cashfree-production-activation.yml` with `activationStage=webhook`, `confirmCashfreeProductionActivation=true`, API version `2025-01-01`, and the final HTTPS APIM webhook URL;
- confirm `/internal/v1/payment-provider-readiness` returns `configurationReady=true`, `webhookDeadLetterCount=0`, expected pending count, and payment execution still disabled;
- only after the Cashfree merchant-side checks below pass, run the activation pipeline with `activationStage=payment_execution`;
- confirm the customer web production build uses `NEXT_PUBLIC_CASHFREE_MODE=production`;
- keep `azure-pipelines-cashfree-production-rollback.yml` available and tested as the financial kill switch.

### Cashfree Merchant Dashboard gates

- merchant KYC, bank verification and Payment Gateway production activation are complete;
- production API credentials are generated and the active credentials match the Azure secret references;
- `https://craves.in` (and any other real checkout origin actually used) is approved under Payment Gateway > Developers > Whitelisting;
- the final production webhook URL is registered under Payment Gateway > Developers > Webhooks with the supported webhook version;
- required payment methods (for example UPI/cards/net banking, according to the Craves product decision) are enabled;
- API/success-rate alerts are enabled;
- checkout branding, contact page, terms, refund/cancellation policy, product/service listing and INR pricing satisfy the Cashfree website review requirements.

### Final live-money proof

Use an explicitly approved low-value real transaction. Never use a fake or synthetic production payment.

1. create one real Craves checkout and pay through the production Cashfree hosted checkout;
2. confirm Cashfree Dashboard shows the successful payment;
3. confirm Integration DB records the provider order/payment identifiers and the durable webhook delivery completes without dead-lettering;
4. confirm the Craves order transitions to paid exactly once and customer-visible order state is correct;
5. initiate an approved low-value refund through the Craves refund path;
6. confirm Cashfree refund status, Integration DB refund state, Order state and customer notification agree;
7. capture the transaction IDs, timestamps and screenshots/log references as production-readiness evidence without recording secrets, card data, CVV or UPI PIN.

## Known closure blocker found on 2026-08-15

The current customer-web source does not yet publish the legal/support pages required for Cashfree website whitelisting:

- `apps/customer-web-next/src/screens/public/Terms/README.md` says the Terms page folder is empty and still needs a page component/route;
- `apps/customer-web-next/src/screens/public/Contact/README.md` says the Contact page folder is empty and still needs a page component/route;
- `apps/customer-web-next/src/components/sections/FooterSection.tsx` renders Privacy policy, Terms of service, Refund policy and Security as non-clickable planned items rather than published legal pages;
- no dedicated customer-facing Refund/Cancellation policy page was found in the current source audit.

Do not fabricate refund/cancellation or legal terms in engineering code. Publish business/legal-approved content before submitting or re-submitting the production domain for Cashfree whitelisting.

Cashfree production readiness is closed only after all three groups above pass. Code completion alone must not be recorded as live-payment approval.
