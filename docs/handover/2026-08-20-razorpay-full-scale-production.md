# Craves Razorpay Full-Scale Production Engineering Handover

**Document date:** 20 August 2026  
**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Feature branch:** `feature/razorpay-full-scale-production-20260820`  
**Target branch:** `main`  
**Primary payment provider:** Razorpay  
**Optional retained provider:** Cashfree, source-retained but traffic-disabled by default  
**Architecture boundary:** Spring Boot 3 / Java 21 Integration Service, Next.js customer web, PostgreSQL/Flyway, Azure Container Apps/APIM  
**Production status represented by this document:** source engineering and guarded rollout mechanics; not a claim that live production money has already been activated or certified.

---

## Page 1 — Executive outcome

Craves now has a production-oriented Razorpay design that treats the payment provider as a financial dependency rather than a simple checkout button. Razorpay is the default and intended production payment provider. Cashfree remains available in source for a future explicitly approved switch, but additional runtime gates prevent it from receiving customer payment or webhook traffic accidentally.

The implementation separates four states that must not be confused: code present, production credentials configured, production runtime staged, and live money enabled. The new deployment flow can configure live Razorpay credentials and webhook processing while still keeping payment order creation disabled. A separate activation pipeline is required to enable real customer charging.

This handover records the full engineering work, source paths, production decisions, manual steps, validation expectations, remaining evidence requirements and rollback model.

<div style="page-break-after: always;"></div>

## Page 2 — User directive and payment-provider decision

The current product decision is:

```text
Razorpay = primary production payment provider
Cashfree = optional retained implementation
Cashfree production traffic = zero unless explicitly reactivated in a future approved change
```

This is now represented in code rather than existing only as an operational convention. The routing layer defaults to Razorpay and introduces an independent Cashfree traffic gate. Therefore enabling a Cashfree API flag alone is insufficient to move customers to Cashfree.

No automatic payment-provider failover was implemented. A failed Razorpay payment must not silently be retried through Cashfree because that can create customer confusion, duplicate financial attempts and reconciliation ambiguity.

<div style="page-break-after: always;"></div>

## Page 3 — Architecture documents and product-rule boundary

The work preserves the existing Craves architecture and functional-specification boundary represented by `CRV-ARCH-HLD-002 v2.0` and `CRV-FUNC-001 v1.0`.

This payment productionization does not invent:

- menu pricing;
- platform commissions;
- delivery charges;
- tax calculations;
- refund eligibility;
- refund amount calculations;
- chef settlement timing;
- subscription commercial terms;
- promotional economics.

The payment layer consumes authoritative money values from the existing checkout/invoice/refund domains and verifies that Razorpay processes those same values.

<div style="page-break-after: always;"></div>

## Page 4 — Starting state discovered in the repository

Before this productionization pass, Razorpay was already significantly integrated. The repository contained a Razorpay payment client, Razorpay refund client, customer checkout component, subscription payment component, APIM webhook policy, provider-neutral payment database migration and several Razorpay deployment pipelines.

The starting routing configuration already defaulted to Razorpay and defaulted Cashfree API execution to disabled. This was a strong baseline, but it did not independently prevent an operator from making Cashfree the active provider after enabling one API flag.

The webhook path also still performed financial processing inside the public HTTP request rather than using the durable worker pattern already established for Cashfree.

<div style="page-break-after: always;"></div>

## Page 5 — Production gaps identified

The review identified several gaps that matter at production scale:

1. Cashfree required a separate explicit traffic gate.
2. Razorpay webhook processing needed durable asynchronous persistence.
3. Webhook duplicates and out-of-order events needed stronger handling.
4. Browser checkout success needed provider API re-verification before fulfilment.
5. Payment order creation needed uncertain-result reconciliation.
6. Refund idempotency used the wrong Razorpay header name.
7. Refund responses needed stronger payment/money identity validation.
8. Production configuration and live-money activation were too closely coupled.
9. The existing rollback could disable Razorpay API access while Razorpay remained selected, risking startup validation failure and loss of in-flight reconciliation.
10. Production readiness needed an explicit admin-visible snapshot.

These are the main areas closed in this branch.

<div style="page-break-after: always;"></div>

## Page 6 — Payment routing source path

Primary file:

```text
services/integration-service/src/main/java/in/craves/integration/config/PaymentRoutingProperties.java
```

The class now reads:

```text
PAYMENT_PROVIDER_NAME
CASHFREE_API_ENABLED
CASHFREE_TRAFFIC_ALLOWED
RAZORPAY_API_ENABLED
```

Razorpay remains the default selected provider. Cashfree selection now fails startup validation unless both the Cashfree API flag and the new traffic-allowance flag are true.

This makes the optional-provider status explicit and auditable.

<div style="page-break-after: always;"></div>

## Page 7 — Cashfree zero-traffic production state

The intended production values are:

```text
PAYMENT_PROVIDER_NAME=RAZORPAY
RAZORPAY_API_ENABLED=true
CASHFREE_API_ENABLED=false
CASHFREE_TRAFFIC_ALLOWED=false
CRAVES_CASHFREE_WEBHOOK_INGRESS_ENABLED=false
CRAVES_CASHFREE_WEBHOOK_WORKER_ENABLED=false
CRAVES_CASHFREE_PRODUCTION_PAYMENT_EXECUTION_ENABLED=false
```

The Cashfree source is not deleted. Existing Cashfree migrations, classes, safety controls and documentation remain available. The runtime is simply fail-closed against routing customer traffic to it.

A future switch to Cashfree must be treated as an explicit production change, not automatic fallback behavior.

<div style="page-break-after: always;"></div>

## Page 8 — Razorpay provider configuration hardening

Primary file:

```text
services/integration-service/src/main/java/in/craves/integration/config/RazorpayProviderProperties.java
```

Production validation now requires:

- `RAZORPAY_ENVIRONMENT=PRODUCTION`;
- explicit production activation approval;
- live key ID prefix;
- key ID + key secret together;
- webhook secret;
- HTTPS provider and webhook URLs;
- production API host `api.razorpay.com`;
- production webhook host `api.craves.in`.

This prevents a production deployment from accidentally starting against a test credential or arbitrary provider host.

<div style="page-break-after: always;"></div>

## Page 9 — Production execution is a separate gate

The property:

```text
RAZORPAY_PRODUCTION_PAYMENT_EXECUTION_ENABLED
```

is independent from selecting the production environment.

This allows Craves to stage production credentials, deploy code, receive provider callbacks and verify configuration without immediately allowing customer payment creation. That distinction is essential for controlled financial cutover.

`paymentExecutionAllowed()` remains true automatically for sandbox but requires the explicit production execution switch for production mutation operations.

<div style="page-break-after: always;"></div>

## Page 10 — Razorpay webhook secret rotation

Two runtime values are supported:

```text
RAZORPAY_WEBHOOK_SECRET
RAZORPAY_PREVIOUS_WEBHOOK_SECRET
```

The previous value is optional and exists only for controlled secret rotation. During a provider webhook-secret change, older provider retries can still arrive with a signature generated using the earlier secret.

The application verifies the active secret first and, when configured, the previous secret second. The previous value must differ from the active value. It should be removed after the relevant retry window has safely elapsed.

Secret values must remain in Key Vault/Container App secret references and must never be committed to Git or documentation.

<div style="page-break-after: always;"></div>

## Page 11 — Customer payment creation path

Primary client:

```text
services/integration-service/src/main/java/in/craves/integration/payment/RazorpayPaymentClient.java
```

Craves creates Razorpay Orders on the backend. The client request contains the server-owned checkout amount, currency, deterministic Craves receipt and controlled notes.

The browser does not decide the final charge amount. It receives only the public Razorpay checkout key ID and provider Order ID required to open hosted checkout.

<div style="page-break-after: always;"></div>

## Page 12 — Exact money conversion

Money conversion remains centralized in:

```text
services/integration-service/src/main/java/in/craves/integration/payment/RazorpayRequestSafety.java
```

The implementation converts rupees to subunits exactly and rejects unsupported precision rather than silently rounding. Positive amounts are required.

All provider responses are compared back to the Craves amount and currency before being trusted. This check is reused for payment Orders, fetched payments, paid Orders, captures and refunds.

<div style="page-break-after: always;"></div>

## Page 13 — Deterministic Razorpay receipt

Normal checkout creates a deterministic receipt derived from the Craves checkout identity. Subscription payment Orders similarly use a deterministic invoice-derived receipt.

The client enforces the Razorpay receipt size boundary and verifies that the provider returns the same receipt.

This receipt is important for reconciliation when an Order-create HTTP result is uncertain.

<div style="page-break-after: always;"></div>

## Page 14 — Uncertain create problem

An HTTP timeout does not prove that Razorpay failed to create the payment Order. The provider may have committed the Order and the network may have lost the response.

A naive retry can create another provider Order for the same logical Craves checkout. This increases duplicate-payment risk and breaks clean audit correlation.

The productionized flow therefore treats timeout/appropriate transient outcomes as uncertain rather than immediately retryable mutations.

<div style="page-break-after: always;"></div>

## Page 15 — Order-create reconciliation

For an uncertain Razorpay Order create, the client queries Razorpay Orders using the deterministic Craves receipt.

If an existing provider Order is found, Craves validates:

- provider Order identity;
- receipt;
- amount;
- currency;
- supported provider Order state.

Only a validated matching Order is accepted. If reconciliation cannot prove the provider outcome, Craves fails closed rather than submitting blind duplicate create attempts.

<div style="page-break-after: always;"></div>

## Page 16 — Checkout response validation

A structurally successful Razorpay create response is not enough.

The client requires a valid provider Order ID and validates the returned amount, currency, receipt and supported Order state. Unexpected or conflicting responses are converted into controlled application failures.

This prevents the customer web from receiving a provider Order whose financial identity differs from the authoritative Craves checkout.

<div style="page-break-after: always;"></div>

## Page 17 — Browser Razorpay Checkout

Customer component:

```text
apps/customer-web-next/src/components/checkout/RazorpayPayment.tsx
```

The component loads Razorpay Checkout and passes:

- public checkout key ID;
- amount/currency for display/provider checkout;
- Razorpay Order ID;
- Craves display information.

Sensitive provider credentials are never shipped to the browser. Card number, CVV and UPI PIN collection remains inside the hosted Razorpay flow.

<div style="page-break-after: always;"></div>

## Page 18 — Browser success is not final payment truth

Razorpay Checkout can return:

```text
razorpay_order_id
razorpay_payment_id
razorpay_signature
```

Craves treats these as evidence requiring backend verification. The browser cannot mark an Order paid by itself.

The backend verifies the signature using the server-stored expected Razorpay Order identity and the provider key secret before any paid transition is possible.

<div style="page-break-after: always;"></div>

## Page 19 — Fetched payment verification

After callback signature verification, Integration Service fetches the payment from Razorpay.

The fetched provider object must match:

- expected payment ID;
- expected Razorpay Order ID;
- Craves amount;
- Craves currency.

A mismatch produces a conflict rather than being normalized into success.

<div style="page-break-after: always;"></div>

## Page 20 — Authorized vs captured payment

An authorized payment is not treated as fulfilment-ready.

When `RAZORPAY_AUTO_CAPTURE=true` and production execution is allowed, Craves can invoke the provider capture endpoint for an authorized payment. The returned payment is then validated again for identity, money and `captured` status.

If capture is disabled or does not produce the expected state, Craves does not mark the order paid.

<div style="page-break-after: always;"></div>

## Page 21 — Paid Order verification

Even a captured payment is followed by a Razorpay Order fetch before Craves finalizes payment state.

The provider Order must be `paid`, and its amount/currency must match Craves. `amount_paid` must equal the expected Craves amount and `amount_due` must be zero.

This creates a stronger final financial confirmation boundary than trusting a single callback field.

<div style="page-break-after: always;"></div>

## Page 22 — Idempotent local paid transition

`PaymentService` already uses a conditional database update when converting a Razorpay payment Order to `PAID`.

Only the first successful transition invokes the downstream Order Service paid notification. A repeated browser verification or duplicated webhook therefore cannot intentionally produce repeated paid side effects through the normal guarded path.

Provider-event uniqueness supplies an additional idempotency layer for asynchronous callbacks.

<div style="page-break-after: always;"></div>

## Page 23 — Public webhook route

Public backend operation:

```text
POST /api/v1/payments/webhooks/razorpay
```

Controller:

```text
services/integration-service/src/main/java/in/craves/integration/web/PaymentController.java
```

The route does not require a customer Firebase bearer token because the caller is Razorpay. Provider authentication occurs using the Razorpay webhook HMAC signature.

<div style="page-break-after: always;"></div>

## Page 24 — Razorpay webhook ingress change

Before this branch, the controller called `PaymentService.handleRazorpayWebhook(...)` directly inside the HTTP request.

The branch changes the controller to call:

```text
RazorpayWebhookInboxService.accept(...)
```

The HTTP path now verifies the provider signature, deduplicates the event, persists a durable delivery row and can acknowledge the provider without waiting for downstream financial processing.

This is more resilient under downstream latency and webhook bursts.

<div style="page-break-after: always;"></div>

## Page 25 — Durable Razorpay webhook migration

Migration:

```text
services/integration-service/src/main/resources/db/migration/V112__razorpay_webhook_delivery_guard.sql
```

New table:

```text
payment_schema.razorpay_webhook_delivery
```

The table stores event identity, provider signature, exact raw payload, processing state, lock ownership, attempts, retry scheduling, timestamps and bounded error evidence.

Schema migration alone does not enable the worker or live money.

<div style="page-break-after: always;"></div>

## Page 26 — Webhook HMAC and raw body

Ingress validates the Razorpay signature against the exact raw body supplied by the HTTP request.

The APIM policy must not parse and re-serialize the body before Integration Service performs this verification because byte-level changes can invalidate the HMAC.

The signature value is not used as event identity. The provider event ID or a deterministic body hash provides deduplication identity.

<div style="page-break-after: always;"></div>

## Page 27 — Webhook event identity

Preferred event identity:

```text
X-Razorpay-Event-Id
```

If this header is not available, Craves derives:

```text
SHA-256(exact raw payload)
```

A repeated identity with the same payload is accepted as a duplicate delivery. Reusing the same identity with different content is rejected as a conflict.

This avoids treating normal provider retry delivery as a new financial event.

<div style="page-break-after: always;"></div>

## Page 28 — Webhook payload limits

Razorpay webhook ingress rejects empty payloads and caps the accepted raw payload at 1 MiB.

This is an application-level defensive boundary in addition to infrastructure ingress limits. It prevents an unexpectedly large callback from consuming unbounded memory or database storage through the payment endpoint.

The chosen limit is not a commercial provider rule; it is a Craves defensive maximum for this callback implementation.

<div style="page-break-after: always;"></div>

## Page 29 — Multi-replica webhook claims

Worker claim logic uses PostgreSQL:

```text
FOR UPDATE SKIP LOCKED
```

This allows multiple Integration Service replicas to claim different webhook rows concurrently. One slow or locked row does not serialize the entire worker fleet.

A per-claim lock token is stored and checked on completion/failure so one replica cannot complete another replica’s active claim accidentally.

<div style="page-break-after: always;"></div>

## Page 30 — Stale lock recovery

If a worker process dies after claiming a row, the record can remain `PROCESSING`.

The inbox considers old processing claims stale after the configured stale window. A future worker can reclaim the row and continue processing.

Default stale-lock window is five minutes and is configurable through the Razorpay webhook worker properties.

<div style="page-break-after: always;"></div>

## Page 31 — Retry and dead-letter model

Worker failures move the durable delivery into retry state with exponential backoff. Retry delay is capped to prevent unbounded intervals.

The default maximum is twelve attempts. Once exhausted, the delivery becomes:

```text
DEAD_LETTER
```

The Razorpay production-readiness service blocks a clean readiness state while any Razorpay webhook dead letter exists.

<div style="page-break-after: always;"></div>

## Page 32 — Supported webhook events

The worker currently processes the Razorpay payment/order event families required by Craves:

```text
payment.authorized
payment.captured
payment.failed
order.paid
```

Other valid Razorpay events can reach the same provider endpoint but are acknowledged and ignored by this payment-state worker rather than generating permanent retries for event types Craves does not consume.

Adding future event types must be deliberate and accompanied by state-mapping tests.

<div style="page-break-after: always;"></div>

## Page 33 — Provider re-verification for successful webhooks

For `payment.captured` and `order.paid`, the webhook payload alone is not sufficient to transition Craves financial state.

The worker extracts the payment/order identity and money context and then calls the Razorpay API to verify current captured payment and paid Order state.

This protects the downstream state change with independent provider truth before dispatching the event into the existing Craves payment/subscription state logic.

<div style="page-break-after: always;"></div>

## Page 34 — Out-of-order webhook protection

Webhook delivery order cannot safely be assumed to equal business event order.

For non-terminal or failure events, the worker fetches the current Razorpay Order. If the provider Order is already paid, a delayed `authorized` or `failed` event is treated as stale and ignored.

This prevents a late delivery from regressing a financial state that the provider now confirms as paid.

<div style="page-break-after: always;"></div>

## Page 35 — Existing payment-event audit remains

After durable worker validation, the current `PaymentService.handleRazorpayWebhook(...)` logic still writes the existing Craves payment-event and payment-attempt audit records and applies customer/subscription state transitions.

This means the new inbox does not replace the existing financial audit trail. It adds a durable delivery-processing layer before it.

A later cleanup can separate the already-verified business-event apply method from the legacy webhook-ingress audit method to remove one redundant internal signature check/database audit insert. That refactor is not required for safe operation of this branch and should be performed separately to reduce change risk.

<div style="page-break-after: always;"></div>

## Page 36 — Subscription payment parity

Primary service:

```text
services/integration-service/src/main/java/in/craves/integration/subscription/SubscriptionPaymentService.java
```

Subscription Razorpay Orders use the same hardened `RazorpayPaymentClient`. They therefore inherit deterministic receipts, exact money checks, uncertain-create reconciliation, checkout signature verification, provider payment fetch and paid Order verification.

The durable webhook worker dispatches Razorpay payment events into the subscription payment service when the provider Order belongs to a subscription intent.

<div style="page-break-after: always;"></div>

## Page 37 — Refund production defect corrected

Primary file:

```text
services/integration-service/src/main/java/in/craves/integration/refund/RazorpayRefundClient.java
```

The previous code sent:

```text
X-Razorpay-Idempotency-Key
```

The productionized implementation uses:

```text
X-Refund-Idempotency
```

The correction matters because refund mutation retries need the provider-supported idempotency contract rather than an unrecognized header.

<div style="page-break-after: always;"></div>

## Page 38 — Refund request validation

Before attempting a provider refund, Craves validates the refund work item:

- refund identity exists;
- idempotency key exists and has valid format;
- Craves refund reference exists;
- provider payment identity exists and has the expected Razorpay form;
- amount is positive;
- currency exists.

These are engineering-validity checks only. They do not decide whether the customer is entitled to a refund.

<div style="page-break-after: always;"></div>

## Page 39 — Refund response reconciliation

Razorpay refund responses are validated for:

- `rfnd_` identity;
- provider refund status;
- provider `payment_id` equals the Craves payment;
- refund amount equals the Craves refund amount;
- provider currency equals the Craves currency;
- returned receipt, when present, matches the Craves refund reference.

A mismatch is non-retryable because repeating an inconsistent financial mutation is unsafe.

<div style="page-break-after: always;"></div>

## Page 40 — Refund retry classification

The adapter distinguishes transient provider/network-class HTTP outcomes from non-retryable failures.

The retryable set includes timeout/conflict/rate-limit/provider-server error classes used by the existing refund workflow. Other provider rejection classes are treated as non-retryable.

The provider-neutral refund worker remains responsible for claim ownership, retry scheduling, reconciliation and final status publication.

<div style="page-break-after: always;"></div>

## Page 41 — Production readiness service

New service:

```text
services/integration-service/src/main/java/in/craves/integration/payment/RazorpayProductionReadinessService.java
```

The readiness snapshot reports non-secret operational facts including:

- active provider;
- Razorpay API gate;
- Cashfree API gate;
- Cashfree traffic gate;
- Razorpay environment;
- production approval/execution flags;
- credential-presence booleans;
- webhook-secret presence;
- webhook-worker state;
- webhook backlog count;
- webhook dead-letter count;
- exact blocker codes.

<div style="page-break-after: always;"></div>

## Page 42 — Admin readiness endpoint

New controller:

```text
services/integration-service/src/main/java/in/craves/integration/admin/AdminRazorpayProductionReadinessController.java
```

Endpoint:

```text
GET /api/v1/admin/operations/payments/razorpay/readiness
```

The response uses `Cache-Control: no-store` and is covered by the existing `/api/v1/admin/**` authorization policy. It does not expose key IDs, key secrets, webhook secrets or provider credential values.

<div style="page-break-after: always;"></div>

## Page 43 — Customer-web readiness endpoint

Existing customer-web route:

```text
apps/customer-web-next/src/app/api/readiness/razorpay/route.ts
```

The endpoint reports non-secret Razorpay web mode and merchant/contact prerequisites. The live activation pipeline requires the public site to report Razorpay production mode and production eligibility before enabling live payment execution.

This prevents backend live-money activation while the public merchant surface is still knowingly incomplete.

<div style="page-break-after: always;"></div>

## Page 44 — APIM webhook policy

Relevant files:

```text
infra/apim/customer-payments/razorpay-webhook-policy.xml
scripts/apim/configure-razorpay-webhook-apim.sh
azure-pipelines-razorpay-webhook-apim.yml
```

The APIM operation checks for the Razorpay signature header and forwards the callback to Integration Service. It intentionally does not apply the customer JWT policy.

The body must remain untouched so backend HMAC validation operates on the provider-signed raw bytes.

<div style="page-break-after: always;"></div>

## Page 45 — Environment staging pipeline

Modified pipeline:

```text
azure-pipelines-razorpay-environment.yml
```

It supports SANDBOX and PRODUCTION. PRODUCTION requires exact operator confirmation:

```text
CONFIGURE_RAZORPAY_PRODUCTION
```

The pipeline binds production secret references and enables Razorpay webhook ingestion/worker but leaves new production payment execution disabled. Cashfree API, traffic, webhook ingress and webhook worker remain disabled.

<div style="page-break-after: always;"></div>

## Page 46 — Production staging does not charge customers

When the environment pipeline stages PRODUCTION, it deliberately sets:

```text
RAZORPAY_PRODUCTION_PAYMENT_EXECUTION_ENABLED=false
CRAVES_PAYMENT_ORDER_API_ENABLED=false
```

Refund execution/reconciliation mutation gates also remain disabled.

This means production credentials and webhook handling can be validated without making the deployment immediately capable of creating real customer payment Orders.

<div style="page-break-after: always;"></div>

## Page 47 — Dedicated live-money activation pipeline

New pipeline:

```text
azure-pipelines-razorpay-production-activation.yml
```

Required exact confirmation:

```text
ACTIVATE_RAZORPAY_LIVE_MONEY
```

The activation performs source/runtime preflight before enabling financial mutation. It is intentionally separate from ordinary deployment and environment configuration.

<div style="page-break-after: always;"></div>

## Page 48 — Live activation preflight gates

Before enabling live money, the activation pipeline verifies the staged runtime is still safe:

- Razorpay is selected;
- Razorpay API is enabled;
- environment is PRODUCTION;
- production configuration is approved;
- live execution is still false before the gate;
- Cashfree API is false;
- Cashfree traffic is false;
- Cashfree webhook ingress/worker are false;
- Razorpay webhook ingress/worker are true;
- key ID/key secret/webhook secret are secret references;
- Integration Service is healthy.

A failed gate aborts activation.

<div style="page-break-after: always;"></div>

## Page 49 — Public web and webhook preflight

The activation pipeline checks the public customer-web Razorpay readiness endpoint and requires production mode plus the existing merchant identity/legal readiness conditions.

It also performs a negative probe against the public Razorpay webhook route. An unsigned test body must be rejected as unauthenticated/bad input rather than returning a missing-route or upstream failure.

This verifies that the public provider route exists without fabricating a valid Razorpay signature.

<div style="page-break-after: always;"></div>

## Page 50 — Activation failure rollback

The live activation pipeline installs an error trap. If activation fails after beginning runtime mutation, it attempts to restore the fail-closed financial flags:

```text
CRAVES_PAYMENT_ORDER_API_ENABLED=false
RAZORPAY_PRODUCTION_PAYMENT_EXECUTION_ENABLED=false
CRAVES_REFUND_PROVIDER_EXECUTION_ENABLED=false
CRAVES_REFUND_RECONCILIATION_ENABLED=false
```

The rollback does not switch to Cashfree.

This makes the default failure response “stop creating new financial mutations,” not “send money to another provider.”

<div style="page-break-after: always;"></div>

## Page 51 — Production kill-switch correction

Modified pipeline:

```text
azure-pipelines-razorpay-production-rollback.yml
```

Required confirmation:

```text
STOP_RAZORPAY_LIVE_MONEY
```

A material issue in the old rollback was corrected. It previously disabled `RAZORPAY_API_ENABLED` while keeping Razorpay selected. With stricter startup validation this could prevent a healthy restart and would also remove provider API access needed to reconcile transactions already in flight.

<div style="page-break-after: always;"></div>

## Page 52 — Transaction-safe rollback behavior

The corrected kill switch disables:

- new customer payment Order creation;
- production payment mutation execution;
- new refund execution;
- refund reconciliation mutation approvals.

It deliberately keeps:

```text
PAYMENT_PROVIDER_NAME=RAZORPAY
RAZORPAY_API_ENABLED=true
CRAVES_RAZORPAY_WEBHOOK_INGRESS_ENABLED=true
CRAVES_RAZORPAY_WEBHOOK_WORKER_ENABLED=true
```

This allows already-created payments to continue arriving through webhooks and provider API verification after the kill switch.

<div style="page-break-after: always;"></div>

## Page 53 — Cashfree behavior during rollback

Rollback does not re-enable the optional Cashfree provider.

It retains:

```text
CASHFREE_API_ENABLED=false
CASHFREE_TRAFFIC_ALLOWED=false
CRAVES_CASHFREE_WEBHOOK_INGRESS_ENABLED=false
CRAVES_CASHFREE_WEBHOOK_WORKER_ENABLED=false
```

Therefore a Razorpay incident does not automatically become a Cashfree cutover. Any future provider switch requires its own controlled engineering and operational decision.

<div style="page-break-after: always;"></div>

## Page 54 — CI pipeline expansion

Modified pipeline:

```text
azure-pipelines-razorpay-production-ci.yml
```

The pipeline runs:

- Integration Service Maven verification;
- Order Service Maven verification;
- customer web npm install/lint/typecheck/test/build;
- source invariants for Cashfree fail-closed routing;
- durable Razorpay webhook migration/worker checks;
- provider re-verification checks;
- uncertain-create receipt reconciliation checks;
- refund idempotency-header checks;
- APIM policy checks;
- rollback safety checks;
- `git diff --check` source hygiene.

<div style="page-break-after: always;"></div>

## Page 55 — New unit/regression tests

New tests include:

```text
services/integration-service/src/test/java/in/craves/integration/config/PaymentRoutingPropertiesTest.java
services/integration-service/src/test/java/in/craves/integration/config/RazorpayProviderPropertiesTest.java
services/integration-service/src/test/java/in/craves/integration/payment/RazorpayRequestSafetyTest.java
services/integration-service/src/test/java/in/craves/integration/payment/RazorpayWebhookSignatureTest.java
services/integration-service/src/test/java/in/craves/integration/payment/RazorpayWebhookInboxServiceCompatibilityTest.java
```

They cover routing fail-closed behavior, production key/host gates, webhook-secret rotation validation, money conversion, HMAC secret rotation and deterministic fallback webhook identity.

<div style="page-break-after: always;"></div>

## Page 56 — Build/test evidence boundary

This session could not execute a local Maven build from the connected container because the container runtime could not resolve GitHub over the network when attempting to clone the branch.

Therefore this handover does **not** claim a successful local `mvn clean verify` or Azure DevOps run. The branch contains the production CI pipeline required to perform those checks in the normal CI environment.

The source must not be merged/activated solely because the files were written successfully through the GitHub connector. CI success is a release gate.

<div style="page-break-after: always;"></div>

## Page 57 — No Azure production mutation performed in this source session

The GitHub work performed here created and modified source files and deployment pipeline definitions on an isolated feature branch.

No Azure Container App environment value was changed by these GitHub commits. No Key Vault secret was created. No Razorpay API key was generated. No provider webhook was registered. No production payment was initiated.

The deployment/activation YAML files are manual pipelines and remain execution instructions until run by an authorized operator through Azure DevOps.

<div style="page-break-after: always;"></div>

## Page 58 — Razorpay Dashboard manual steps

An authorized Razorpay operator must complete or verify:

- merchant/KYC live enablement;
- production API key generation;
- production webhook endpoint registration;
- webhook secret configuration;
- required payment/order event subscriptions;
- merchant/domain information required for production operation.

The webhook URL expected by Craves is:

```text
https://api.craves.in/api/v1/payments/webhooks/razorpay
```

Never paste live credentials into chat, Git, documentation or ordinary pipeline variables.

<div style="page-break-after: always;"></div>

## Page 59 — Azure secret manual steps

The current environment pipeline expects Container App secret references named:

```text
razorpay-production-key-id
razorpay-production-key-secret
razorpay-production-webhook-secret
```

The secret values should be backed by the existing approved Key Vault/Container Apps secret-management pattern.

If a webhook-secret rotation is performed, create/bind a temporary previous-secret reference to:

```text
RAZORPAY_PREVIOUS_WEBHOOK_SECRET
```

and remove it after the controlled rotation period.

<div style="page-break-after: always;"></div>

## Page 60 — Azure DevOps manual pipeline sequence

Recommended registration/execution sequence:

1. `azure-pipelines-razorpay-production-ci.yml`
2. `azure-pipelines-razorpay-webhook-apim.yml`
3. `azure-pipelines-razorpay-customer-web.yml`
4. `azure-pipelines-razorpay-environment.yml`
5. `azure-pipelines-razorpay-production-activation.yml`
6. `azure-pipelines-razorpay-production-rollback.yml` — register and retain as the kill switch; do not run unless needed.

Production configuration and live activation must remain separate runs.

<div style="page-break-after: always;"></div>

## Page 61 — Controlled live-payment certification

Before broad customer traffic, execute one authorized low-value live payment and capture evidence for:

- Craves checkout amount/currency;
- provider Order identity;
- Razorpay hosted checkout completion;
- valid backend signature verification;
- fetched captured payment;
- fetched paid Order;
- Craves payment Order PAID transition;
- Order Service paid transition;
- Razorpay webhook event ID;
- durable webhook row completed;
- no duplicate side effect.

Do not publish sensitive customer/provider information in the evidence pack.

<div style="page-break-after: always;"></div>

## Page 62 — Controlled refund certification

After the live-payment proof, execute one approved controlled refund through the normal Craves refund workflow.

Evidence should show:

- Craves refund reference;
- stable refund idempotency key exists;
- Razorpay refund identity returned;
- provider payment identity matches;
- refund amount/currency match;
- provider status reaches expected final state;
- Craves reconciliation reflects the provider state;
- no duplicate refund was created when reconciliation/retry paths are exercised.

Refund eligibility itself must come from the existing product/business decision flow.

<div style="page-break-after: always;"></div>

## Page 63 — Webhook certification cases

Production-like validation should include sanitized/test-mode coverage for:

- valid captured webhook;
- duplicated same event ID;
- same event ID with changed content rejected;
- invalid signature rejected;
- missing signature rejected;
- previous-secret retry during rotation;
- out-of-order authorized after paid;
- out-of-order failed after paid;
- unsupported event safely ignored;
- temporary database/provider failure followed by successful retry;
- dead-letter after maximum attempts.

These cases are essential before claiming the webhook subsystem production-certified.

<div style="page-break-after: always;"></div>

## Page 64 — Horizontal-scale validation

The durable worker architecture is compatible with multiple Integration Service replicas because it uses database locking with `SKIP LOCKED`.

Architecture compatibility is not the same as measured capacity. A load test must determine practical batch size, worker delay, database connection usage and provider API pressure.

At minimum test multiple replicas processing a large webhook backlog while ensuring every provider event is applied once logically and no claim is lost after worker termination.

<div style="page-break-after: always;"></div>

## Page 65 — Payment load testing boundary

Do not create large volumes of real-money payments merely to test application scale.

Use provider-approved test mode and controlled synthetic/stubbed provider boundaries where appropriate to measure Craves service capacity. Separate Craves application load limits from Razorpay account/API rate limits.

Record p50/p95/p99 latency, error rate, DB pool utilization, worker backlog, retry count, CPU/memory/GC and downstream Order Service behavior.

<div style="page-break-after: always;"></div>

## Page 66 — Failure injection scenarios

Recommended resilience tests include:

- provider API timeout during Order create;
- provider returns 429;
- provider returns 5xx;
- response lost after provider Order creation;
- Integration Service restart during webhook processing;
- database connection interruption;
- duplicate callback burst;
- webhook worker replica termination after claim;
- public APIM unavailable temporarily;
- Razorpay webhook delivery delayed;
- live-money kill switch while an authorized payment is in flight.

Each test needs expected state, evidence and recovery criteria.

<div style="page-break-after: always;"></div>

## Page 67 — Database and index considerations

The new durable table has a unique event-identity constraint and a claim index across processing status, next-attempt time and first-seen time.

At high webhook volume, monitor:

- table growth;
- dead tuples/autovacuum behavior;
- index size;
- claim query latency;
- lock waits;
- connection-pool saturation;
- retention requirements for completed raw payloads.

No retention period was invented in this work. Financial/audit retention must be decided against Craves legal/accounting/security requirements.

<div style="page-break-after: always;"></div>

## Page 68 — Observability requirements

The readiness endpoint supplies operational counts, but full production observability should additionally monitor:

- Razorpay Order-create error rate;
- provider latency;
- verification failures;
- captured-payment vs paid-Order conflicts;
- webhook ingress rate;
- duplicate webhook rate;
- webhook backlog age;
- failed/retry/dead-letter counts;
- refund execution and reconciliation failures;
- payment-to-Order-Service notification failures.

Alert thresholds must be based on measured traffic/SLO decisions rather than invented in this source change.

<div style="page-break-after: always;"></div>

## Page 69 — Security model

The customer payment API remains authenticated through Craves customer identity controls.

The Razorpay provider webhook is public by necessity but authenticated using the provider HMAC secret. It does not inherit a customer JWT requirement.

Provider key secrets and webhook secrets remain backend-only. The only Razorpay credential exposed to the customer browser is the public checkout key ID required by Razorpay Checkout.

Logs and readiness responses must never expose secret values.

<div style="page-break-after: always;"></div>

## Page 70 — PCI-sensitive data boundary

Craves uses Razorpay hosted checkout rather than asking the Craves web application to collect raw card security values or UPI PINs.

The application stores provider references, verified statuses, amounts, currencies and audit/reconciliation data necessary to operate the marketplace.

This handover is not a formal PCI-DSS certification. Any compliance scope determination must be performed using the actual deployed payment flow and organizational responsibilities.

<div style="page-break-after: always;"></div>

## Page 71 — Rate limiting and provider limits

The integration must respect provider account/API rate limits. The application already treats HTTP 429 as a transient provider condition for the relevant reconciliation/refund paths rather than as financial success.

Webhook worker concurrency should not be increased merely because database claims can scale horizontally. Successful webhook processing can trigger Razorpay API re-verification, so worker throughput also creates outbound provider API load.

Scale settings must be tuned with measurements and provider limits.

<div style="page-break-after: always;"></div>

## Page 72 — Why no automatic Cashfree failover exists

Automatic cross-provider retry for payments is deliberately absent.

If Razorpay Order creation becomes uncertain, Craves reconciles the Razorpay result rather than starting a Cashfree payment. If Razorpay is unavailable, the safe default is to fail payment initiation visibly and recover the provider path.

A future manual provider cutover would require a controlled policy for already-open checkouts, outstanding Razorpay Orders, refunds and webhook reconciliation before changing production routing.

<div style="page-break-after: always;"></div>

## Page 73 — Local developer validation

Integration Service:

```bash
cd services/integration-service
mvn -B -ntp clean verify
```

Customer web:

```bash
cd apps/customer-web-next
npm ci --no-audit --no-fund
npm run lint
npm run typecheck
npm run test
npm run build
```

Do not put live Razorpay credentials into a developer `.env` file that can be committed. Use sandbox/test credentials only through an approved local secret mechanism when an integration test genuinely requires provider access.

<div style="page-break-after: always;"></div>

## Page 74 — Source branch safety

All work described here was performed on:

```text
feature/razorpay-full-scale-production-20260820
```

The branch was created from the current `main` head at the start of the productionization work and remained ahead of `main` without being merged during implementation.

This isolates the financial changes until CI and review are complete.

<div style="page-break-after: always;"></div>

## Page 75 — Files added in this productionization

New production files include:

```text
azure-pipelines-razorpay-production-activation.yml
services/integration-service/src/main/java/in/craves/integration/admin/AdminRazorpayProductionReadinessController.java
services/integration-service/src/main/java/in/craves/integration/payment/RazorpayProductionReadinessService.java
services/integration-service/src/main/java/in/craves/integration/payment/RazorpayWebhookInboxService.java
services/integration-service/src/main/java/in/craves/integration/payment/RazorpayWebhookProperties.java
services/integration-service/src/main/java/in/craves/integration/payment/RazorpayWebhookSchedulingConfiguration.java
services/integration-service/src/main/java/in/craves/integration/payment/RazorpayWebhookWorker.java
services/integration-service/src/main/resources/db/migration/V112__razorpay_webhook_delivery_guard.sql
services/integration-service/modules/razorpay-production/README.md
```

Test files and this handover are also newly added.

<div style="page-break-after: always;"></div>

## Page 76 — Files materially modified

Important modified files include:

```text
azure-pipelines-razorpay-environment.yml
azure-pipelines-razorpay-production-ci.yml
azure-pipelines-razorpay-production-rollback.yml
services/integration-service/src/main/java/in/craves/integration/config/PaymentRoutingProperties.java
services/integration-service/src/main/java/in/craves/integration/config/RazorpayProviderProperties.java
services/integration-service/src/main/java/in/craves/integration/payment/RazorpayPaymentClient.java
services/integration-service/src/main/java/in/craves/integration/refund/RazorpayRefundClient.java
services/integration-service/src/main/java/in/craves/integration/web/PaymentController.java
```

Each modification is described in the relevant earlier pages.

<div style="page-break-after: always;"></div>

## Page 77 — Tests added in this productionization

New tests:

```text
services/integration-service/src/test/java/in/craves/integration/config/PaymentRoutingPropertiesTest.java
services/integration-service/src/test/java/in/craves/integration/config/RazorpayProviderPropertiesTest.java
services/integration-service/src/test/java/in/craves/integration/payment/RazorpayRequestSafetyTest.java
services/integration-service/src/test/java/in/craves/integration/payment/RazorpayWebhookInboxServiceCompatibilityTest.java
services/integration-service/src/test/java/in/craves/integration/payment/RazorpayWebhookSignatureTest.java
```

CI must run these together with the complete Integration Service test suite so constructor/configuration changes are validated against existing tests.

<div style="page-break-after: always;"></div>

## Page 78 — Manual intervention checklist

### Razorpay Dashboard

- [ ] KYC/live mode enabled.
- [ ] Live API key generated.
- [ ] Production webhook created.
- [ ] Webhook secret created.
- [ ] Required payment/order events selected.

### Azure / secrets

- [ ] Live key ID stored through approved secret management.
- [ ] Live key secret stored through approved secret management.
- [ ] Webhook secret stored through approved secret management.
- [ ] Container App references verified.

### Azure DevOps

- [ ] Production CI registered/run.
- [ ] APIM webhook pipeline run.
- [ ] Customer web production pipeline run.
- [ ] Production environment staged.
- [ ] Controlled transaction evidence approved.
- [ ] Live activation run only after gates pass.

<div style="page-break-after: always;"></div>

## Page 79 — Go-live PASS criteria

Craves should not call Razorpay production-certified until all of the following are evidenced:

- source review complete;
- Integration Service CI green;
- Order Service CI green;
- customer web CI green;
- V112 migrated successfully;
- production credentials bound by secret reference;
- public webhook route reachable and authentication enforced;
- customer web Razorpay production readiness green;
- one controlled live payment succeeds end-to-end;
- one controlled refund succeeds/reconciles;
- duplicate/out-of-order webhook handling tested;
- webhook DLQ is zero;
- rollback/kill-switch tested;
- operational monitoring accepted.

<div style="page-break-after: always;"></div>

## Page 80 — Current pending items at handover

At the time this source handover was written, the following remain pending operational evidence rather than source implementation:

1. Azure DevOps CI execution on this feature branch.
2. Code review/PR approval and merge.
3. Deployment of the Integration Service build containing V112.
4. Razorpay live credential generation/binding.
5. Razorpay Dashboard webhook registration.
6. APIM runtime verification.
7. Customer web production deployment verification.
8. Controlled live payment.
9. Controlled refund.
10. Webhook retry/out-of-order runtime tests.
11. Scale/load/resilience certification.
12. Live activation after all gates pass.

No one should convert these pending items into “completed” status without runtime evidence.

<div style="page-break-after: always;"></div>

## Page 81 — Recommended immediate next action

The immediate engineering action after this feature branch is complete is to run:

```text
azure-pipelines-razorpay-production-ci.yml
```

against the exact reviewed feature-branch head.

If CI fails, repair the branch and rerun. Do not bypass Maven/web tests simply to reach production configuration.

Once CI is green, review the PR, merge, deploy with live execution disabled and follow the staged production sequence in this handover.

<div style="page-break-after: always;"></div>

## Page 82 — Final handover statement

The Razorpay work has been upgraded from a functional payment integration into a guarded production payment architecture with provider-primary routing, Cashfree no-traffic protection, server-side final verification, uncertain-create reconciliation, durable multi-replica webhooks, duplicate/out-of-order protection, refund idempotency/reconciliation, production readiness reporting, staged configuration, explicit live-money activation and transaction-safe rollback.

The remaining boundary is deliberate: financial production readiness is not proven by source code alone. CI, deployment, provider configuration, controlled live payment/refund evidence, webhook resilience testing and scale certification must pass before Craves treats this payment rail as broadly production-certified.

**End of Razorpay full-scale production engineering handover.**
