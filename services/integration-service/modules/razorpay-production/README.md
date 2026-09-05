# Craves Razorpay Production Module

## Purpose

Razorpay is the primary payment gateway for Craves. Cashfree remains in the repository as an optional provider implementation, but the production routing model is fail-closed so Cashfree receives no payment or webhook traffic unless a future, explicit reactivation is approved and configured.

This module documents the source-controlled production architecture for Razorpay checkout, subscription payments, payment verification, asynchronous webhook processing, refunds, reconciliation, deployment safety and rollback.

The module does not define pricing, commissions, tax rules, refund eligibility, settlement timing or any other Craves business rule. Those rules remain owned by their existing domains and by CRV-ARCH-HLD-002 v2.0 / CRV-FUNC-001 v1.0.

## Architecture summary

```text
Customer Web
   |
   | authenticated Craves checkout
   v
Integration Service
   |
   | create Razorpay Order
   | receipt = deterministic Craves reference
   v
Razorpay Checkout
   |
   | payment result: order_id + payment_id + signature
   v
Integration Service verification
   |
   | verify HMAC
   | fetch payment from Razorpay
   | require payment=captured
   | fetch order from Razorpay
   | require order=paid
   | require amount/currency/order/payment identities match
   v
Order Service paid transition
```

Webhook processing is deliberately asynchronous:

```text
Razorpay
   |
   | POST /api/v1/payments/webhooks/razorpay
   v
APIM
   |
   | presence check only; raw body not rewritten
   v
Integration Service HTTP ingress
   |
   | verify HMAC over exact raw body
   | deduplicate event identity
   | persist durable inbox row
   | return 2xx quickly
   v
razorpay_webhook_delivery
   |
   | FOR UPDATE SKIP LOCKED
   | retries + stale-lock recovery + dead letter
   v
RazorpayWebhookWorker
   |
   | success event -> provider API re-verification
   | stale/out-of-order non-terminal event -> ignore if order already paid
   v
existing Craves payment/subscription state transition
```

## Primary provider and Cashfree safety boundary

Source:

`services/integration-service/src/main/java/in/craves/integration/config/PaymentRoutingProperties.java`

Production intent:

```text
PAYMENT_PROVIDER_NAME=RAZORPAY
RAZORPAY_API_ENABLED=true
CASHFREE_API_ENABLED=false
CASHFREE_TRAFFIC_ALLOWED=false
CRAVES_CASHFREE_WEBHOOK_INGRESS_ENABLED=false
CRAVES_CASHFREE_WEBHOOK_WORKER_ENABLED=false
```

Cashfree code remains available for a future approved provider switch, but selecting Cashfree requires both its API and the independent `CASHFREE_TRAFFIC_ALLOWED` gate. This prevents an accidental environment-variable change from silently routing live customers to Cashfree.

Cashfree is not an automatic failover provider. A Razorpay incident stops new payment mutation; it does not silently redirect customers to Cashfree.

## Key backend files

### Routing and provider configuration

- `services/integration-service/src/main/java/in/craves/integration/config/PaymentRoutingProperties.java`
- `services/integration-service/src/main/java/in/craves/integration/config/RazorpayProviderProperties.java`
- `services/integration-service/src/main/java/in/craves/integration/config/PaymentApiProperties.java`

### Payment execution and verification

- `services/integration-service/src/main/java/in/craves/integration/payment/RazorpayPaymentClient.java`
- `services/integration-service/src/main/java/in/craves/integration/payment/RazorpayRequestSafety.java`
- `services/integration-service/src/main/java/in/craves/integration/service/PaymentService.java`
- `services/integration-service/src/main/java/in/craves/integration/web/PaymentController.java`

### Durable webhook processing

- `services/integration-service/src/main/java/in/craves/integration/payment/RazorpayWebhookInboxService.java`
- `services/integration-service/src/main/java/in/craves/integration/payment/RazorpayWebhookProperties.java`
- `services/integration-service/src/main/java/in/craves/integration/payment/RazorpayWebhookSchedulingConfiguration.java`
- `services/integration-service/src/main/java/in/craves/integration/payment/RazorpayWebhookWorker.java`
- `services/integration-service/src/main/resources/db/migration/V115__razorpay_webhook_delivery_guard.sql`

### Refunds

- `services/integration-service/src/main/java/in/craves/integration/refund/RazorpayRefundClient.java`
- existing provider-neutral refund worker, reconciliation and status-publisher modules remain authoritative for workflow execution.

### Subscription payments

- `services/integration-service/src/main/java/in/craves/integration/subscription/SubscriptionPaymentService.java`
- existing subscription payment repository/outbox infrastructure remains provider-neutral.

### Readiness

- `services/integration-service/src/main/java/in/craves/integration/payment/RazorpayProductionReadinessService.java`
- `services/integration-service/src/main/java/in/craves/integration/admin/AdminRazorpayProductionReadinessController.java`

Admin endpoint:

```text
GET /api/v1/admin/operations/payments/razorpay/readiness
```

The endpoint is covered by the existing `/api/v1/admin/**` security boundary and returns no credential values.

## Database migration

`V115__razorpay_webhook_delivery_guard.sql` creates:

```text
payment_schema.razorpay_webhook_delivery
```

Important properties:

- unique provider event identity;
- durable raw payload storage;
- processing state;
- lock token and processing-start time;
- next-attempt time;
- attempt count;
- first/last seen timestamps;
- completion timestamp;
- bounded last error;
- claim index;
- explicit `DEAD_LETTER` state.

The worker uses PostgreSQL `FOR UPDATE SKIP LOCKED`, allowing multiple Integration Service replicas to claim separate webhook deliveries without serializing all workers onto one row.

## Payment creation safety

Craves creates Razorpay Orders on the backend. The browser never supplies the final server-owned checkout amount.

The order request uses the amount converted to Razorpay subunits exactly, checkout currency, a deterministic Craves receipt and Craves checkout/customer references in notes.

The response is rejected unless the Razorpay order identity is present and returned amount, currency and receipt match Craves. Unsupported provider states fail closed.

### Uncertain create reconciliation

A network timeout does not prove that Razorpay failed to create the Order. Blindly repeating the create can introduce an additional provider Order for the same Craves checkout.

For transient/uncertain create outcomes, Craves queries Razorpay Orders by the deterministic `receipt`. A matching provider Order is accepted only after identity and money validation. If provider state cannot be proven, the request fails closed instead of guessing.

## Browser callback verification

The Razorpay Checkout success callback is evidence, not final payment truth.

Craves requires:

1. expected server-stored Razorpay Order ID;
2. provider payment ID;
3. checkout signature;
4. valid HMAC signature;
5. fetched provider payment identity equals the callback payment ID;
6. fetched payment belongs to the expected Order;
7. payment amount/currency match Craves;
8. payment is `captured`;
9. fetched provider Order is `paid`;
10. Order amount/currency match Craves;
11. `amount_paid` equals the Craves amount;
12. `amount_due` is zero.

Only then can Craves mark the payment paid and trigger the existing idempotent downstream Order Service paid transition.

## Capture behavior

`RAZORPAY_AUTO_CAPTURE=true` is supported as a fallback when the fetched payment is still `authorized` and Craves is allowed to execute payments. The capture response is validated again for identity, amount, currency and `captured` status.

The application does not treat an `authorized` payment as fulfilled.

## Webhook authentication

Public route:

```text
POST /api/v1/payments/webhooks/razorpay
```

Authentication is Razorpay HMAC over the exact raw request body. APIM must not parse/re-serialize the body before Integration Service verifies it.

Primary event identity is `X-Razorpay-Event-Id`. If the header is unavailable, Craves derives a SHA-256 identity from the exact raw body so repeated identical delivery remains idempotent.

Maximum accepted payload is 1 MiB.

## Webhook secret rotation

Runtime supports:

```text
RAZORPAY_WEBHOOK_SECRET
RAZORPAY_PREVIOUS_WEBHOOK_SECRET
```

The previous secret is optional and exists only to allow already-generated provider retries to complete during a controlled webhook-secret rotation. It must differ from the active secret and should be removed after the provider retry window has safely elapsed.

Never commit either value to Git or paste it into chat.

## Out-of-order event protection

Supported payment events for state processing are:

```text
payment.authorized
payment.captured
payment.failed
order.paid
```

Unknown Razorpay events delivered to the endpoint are acknowledged and ignored instead of filling the dead-letter queue.

For `payment.captured` and `order.paid`, Craves independently fetches current provider state before applying success.

For non-terminal/failed events, the worker fetches the current provider Order. If the Order is already `paid`, the event is treated as stale and ignored. This prevents a delayed event from regressing a successful payment.

## Retry and dead-letter behavior

Default worker configuration:

```text
CRAVES_RAZORPAY_WEBHOOK_WORKER_ENABLED=false
CRAVES_RAZORPAY_WEBHOOK_BATCH_SIZE=40
CRAVES_RAZORPAY_WEBHOOK_FIXED_DELAY_MS=1000
CRAVES_RAZORPAY_WEBHOOK_MAX_ATTEMPTS=12
CRAVES_RAZORPAY_WEBHOOK_STALE_MINUTES=5
CRAVES_RAZORPAY_WEBHOOK_RETRY_BASE_SECONDS=5
```

Production configuration pipeline enables the worker. Source defaults remain off so an arbitrary local or newly provisioned environment does not unexpectedly process financial callbacks.

Failures use exponential backoff capped by the inbox service. Work that exceeds the configured maximum becomes `DEAD_LETTER`. Production readiness is blocked while Razorpay webhook dead letters exist.

## Refund safety

Razorpay refunds are executed by the existing provider-neutral refund workflow through:

`services/integration-service/src/main/java/in/craves/integration/refund/RazorpayRefundClient.java`

Important controls:

- provider payment ID must be valid;
- refund amount must be positive;
- currency must be present;
- stable idempotency key is required;
- request uses `X-Refund-Idempotency`;
- response refund ID must be valid;
- provider `payment_id` must match Craves;
- amount/currency must match Craves;
- response receipt, when returned, must match Craves;
- transient vs non-retryable HTTP failures are separated;
- reconciliation uses provider refund ID.

Refund eligibility and refund amount are not decided in this adapter. They come from the existing Craves refund domain.

## Subscription-payment parity

Subscription payments use the same `RazorpayPaymentClient`, so they inherit backend Order creation, money validation, deterministic receipt, uncertain-create reconciliation, checkout HMAC verification, captured-payment verification, paid-order verification and the asynchronous Razorpay webhook path.

Subscription-specific business state remains in the existing subscription-payment module.

## Production readiness endpoint

The readiness snapshot checks, among other things:

- Razorpay is the active provider;
- Razorpay API gate is enabled;
- Cashfree API is disabled;
- Cashfree traffic gate is disabled;
- Razorpay environment is PRODUCTION;
- production configuration is approved;
- live payment execution is enabled;
- Razorpay credentials are configured;
- Razorpay webhook secret is configured;
- Razorpay durable worker is enabled;
- no Razorpay webhook dead letters exist.

Before live activation, `productionReady` is expected to remain false specifically because live payment execution is intentionally disabled. Use the blocker list to verify that no unexpected blocker exists before opening the controlled live test window.

## Customer web

Primary checkout component:

`apps/customer-web-next/src/components/checkout/RazorpayPayment.tsx`

Subscription component:

`apps/customer-web-next/src/components/subscription-razorpay-payment.tsx`

Public non-secret readiness endpoint:

```text
GET /api/readiness/razorpay
```

The web readiness gate requires `NEXT_PUBLIC_RAZORPAY_MODE=production` plus the existing merchant/contact prerequisites before the dedicated live activation pipeline can proceed.

## APIM

Files:

- `infra/apim/customer-payments/razorpay-webhook-policy.xml`
- `scripts/apim/configure-razorpay-webhook-apim.sh`
- `azure-pipelines-razorpay-webhook-apim.yml`

The provider webhook does not use a customer Firebase JWT because Razorpay is the caller. The backend authenticates the exact raw callback using the provider HMAC secret.

The APIM policy performs edge header hygiene and forwards the untouched body to Integration Service.

## CI and deployment pipelines

### Source/CI

`azure-pipelines-razorpay-production-ci.yml`

Runs Integration Service Maven verify, Order Service Maven verify, customer web install/lint/typecheck/test/build and static checks for fail-closed routing, durable webhook queue invariants, refund idempotency, APIM policy safety, rollback safety and source hygiene.

### Environment staging

`azure-pipelines-razorpay-environment.yml`

Production configuration requires exact confirmation:

```text
CONFIGURE_RAZORPAY_PRODUCTION
```

In PRODUCTION mode this pipeline configures production secret references and the webhook worker but deliberately leaves:

```text
RAZORPAY_PRODUCTION_PAYMENT_EXECUTION_ENABLED=false
CRAVES_PAYMENT_ORDER_API_ENABLED=false
```

Therefore staging production configuration does not enable live charging.

### Customer web

`azure-pipelines-razorpay-customer-web.yml` deploys customer web with:

```text
NEXT_PUBLIC_RAZORPAY_MODE=production
```

and validates the public readiness endpoint.

### Live activation / controlled live-test window

`azure-pipelines-razorpay-production-activation.yml`

Exact confirmation:

```text
ACTIVATE_RAZORPAY_LIVE_MONEY
```

The pipeline refuses activation unless the staged environment, secret references, Cashfree-off state, Razorpay webhook worker, Integration Service health, public web readiness and public webhook negative probe pass.

The activation opens the controlled live-money window by enabling new payment orders and Razorpay production execution. **Do not expose broad customer traffic immediately.** First execute the controlled low-value live payment/refund certification described below. If certification fails, run the kill switch immediately.

### Kill switch / rollback

`azure-pipelines-razorpay-production-rollback.yml`

Exact confirmation:

```text
STOP_RAZORPAY_LIVE_MONEY
```

Rollback disables new payment orders, new payment mutation and refund mutation, while deliberately keeping Razorpay API access, webhook ingress and webhook worker active so transactions already in flight can still reconcile. Cashfree remains disabled.

## Local validation

From repository root:

```bash
cd services/integration-service
mvn -B -ntp clean verify

cd ../../apps/customer-web-next
npm ci --no-audit --no-fund
npm run lint
npm run typecheck
npm run test
npm run build
```

No provider credential is required for unit tests that do not call Razorpay. Do not place live keys in `.env` files that can be committed.

## Environment variables

### Routing

```text
PAYMENT_PROVIDER_NAME=RAZORPAY
RAZORPAY_API_ENABLED=true
CASHFREE_API_ENABLED=false
CASHFREE_TRAFFIC_ALLOWED=false
```

### Razorpay provider

```text
RAZORPAY_ENVIRONMENT=SANDBOX|PRODUCTION
RAZORPAY_PRODUCTION_ACTIVATION_APPROVED=false|true
RAZORPAY_PRODUCTION_PAYMENT_EXECUTION_ENABLED=false|true
RAZORPAY_KEY_ID=<secret reference>
RAZORPAY_KEY_SECRET=<secret reference>
RAZORPAY_WEBHOOK_SECRET=<secret reference>
RAZORPAY_PREVIOUS_WEBHOOK_SECRET=<optional secret reference during rotation>
RAZORPAY_BASE_URL=https://api.razorpay.com
RAZORPAY_WEBHOOK_URL=https://api.craves.in/api/v1/payments/webhooks/razorpay
RAZORPAY_AUTO_CAPTURE=true
```

### Razorpay webhook worker

```text
CRAVES_RAZORPAY_WEBHOOK_INGRESS_ENABLED=true
CRAVES_RAZORPAY_WEBHOOK_WORKER_ENABLED=true
CRAVES_RAZORPAY_WEBHOOK_BATCH_SIZE=40
CRAVES_RAZORPAY_WEBHOOK_FIXED_DELAY_MS=1000
CRAVES_RAZORPAY_WEBHOOK_MAX_ATTEMPTS=12
CRAVES_RAZORPAY_WEBHOOK_STALE_MINUTES=5
CRAVES_RAZORPAY_WEBHOOK_RETRY_BASE_SECONDS=5
```

### Cashfree retained but traffic-disabled

```text
CASHFREE_API_ENABLED=false
CASHFREE_TRAFFIC_ALLOWED=false
CRAVES_CASHFREE_WEBHOOK_INGRESS_ENABLED=false
CRAVES_CASHFREE_WEBHOOK_WORKER_ENABLED=false
CRAVES_CASHFREE_PRODUCTION_PAYMENT_EXECUTION_ENABLED=false
```

## Manual steps required

### Razorpay Dashboard

- Complete/retain merchant KYC and live-mode enablement.
- Generate the production key ID/key secret.
- Configure `https://api.craves.in/api/v1/payments/webhooks/razorpay` as the production webhook.
- Configure the webhook secret.
- Subscribe the endpoint to the payment/order events required by this module.
- Confirm provider production account/domain requirements.
- Never paste live key material into chat or Git.

### Azure Key Vault / Container Apps

Store live credentials using the established secret-management pattern. The environment pipeline expects Container App secret references named:

```text
razorpay-production-key-id
razorpay-production-key-secret
razorpay-production-webhook-secret
```

If rotating the webhook secret, add a Key Vault-backed secret reference for the previous value and bind it to `RAZORPAY_PREVIOUS_WEBHOOK_SECRET` temporarily. Remove it after the safe retry window.

### Azure DevOps

Register the following YAML files if not already registered:

1. `azure-pipelines-razorpay-production-ci.yml`
2. `azure-pipelines-razorpay-webhook-apim.yml`
3. `azure-pipelines-razorpay-customer-web.yml`
4. `azure-pipelines-razorpay-environment.yml`
5. `azure-pipelines-razorpay-production-activation.yml`
6. `azure-pipelines-razorpay-production-rollback.yml`

The activation pipeline is not a substitute for a successful CI run or Razorpay Dashboard configuration.

## Authoritative production execution order

1. Run `azure-pipelines-razorpay-production-ci.yml` against the exact reviewed branch/commit and require success.
2. Merge the reviewed source only after CI succeeds.
3. Deploy the Integration Service build containing V112 and the Razorpay worker while live payment execution remains disabled.
4. Run the Razorpay webhook APIM pipeline and verify the public negative-authentication probe.
5. Configure the Razorpay Dashboard production webhook and secret.
6. Deploy customer web in Razorpay production mode.
7. Run `azure-pipelines-razorpay-environment.yml` with `targetEnvironment=PRODUCTION` and exact confirmation `CONFIGURE_RAZORPAY_PRODUCTION`.
8. Verify Integration Service health, Cashfree-off state, secret references, web readiness and the admin readiness blockers. At this stage live payment execution should still be the expected blocker.
9. Run `azure-pipelines-razorpay-production-activation.yml` with `ACTIVATE_RAZORPAY_LIVE_MONEY`. This opens a **controlled live-test window**, not broad launch traffic.
10. Immediately perform one authorized low-value production payment and confirm checkout, captured payment, paid Razorpay Order, webhook persistence/completion, one Craves PAID transition and one Order Service paid transition.
11. Perform one approved controlled refund and confirm Razorpay + Craves reconciliation/idempotency.
12. Confirm the Razorpay webhook dead-letter count is zero and review monitoring/log evidence.
13. If any certification step fails, run `azure-pipelines-razorpay-production-rollback.yml` with `STOP_RAZORPAY_LIVE_MONEY` and investigate while webhook reconciliation remains active.
14. Only after the controlled payment/refund evidence passes should customer traffic be increased gradually.

## Production scale validation still required

Source engineering alone does not prove a concurrency target. Before claiming very high production scale, execute load/resilience tests against a controlled environment covering concurrent payment-order creation, provider latency/timeouts, uncertain-create reconciliation, webhook bursts, duplicate/out-of-order events, multiple Integration Service replicas, DB pool/lock contention, refund bursts, provider 429/5xx behavior, kill-switch behavior, PostgreSQL disruption and queue backlog recovery.

Do not generate real high-volume Razorpay charges merely to load-test the application. Provider-facing performance testing must follow the provider’s permitted test environment and rate-limit guidance.

## Risks and operational notes

- The application cannot guarantee Razorpay availability; provider failures remain fail-closed.
- Browser callback and webhook can race; transitions are idempotent and provider-reverified.
- Rollback must preserve webhook reconciliation for already-created transactions.
- Webhook-secret rotation must account for provider retries signed with the earlier secret.
- The durable queue is horizontally compatible, but PostgreSQL capacity, worker batch size and Razorpay API limits must be measured before aggressive concurrency increases.
- Cashfree is not automatic failover; switching providers requires a separate explicit operational change.

## Current source-completion boundary

This module establishes full-scale Razorpay **source engineering and guarded deployment mechanics**. It intentionally does not claim live production certification until CI, deployment, Dashboard configuration, controlled live payment/refund evidence, webhook resilience testing and operational validation actually pass.
