# Craves Scheduled Payment Guard — Engineering Handover

Date: 2026-09-11  
Service: Integration Service  
Dependency: Order Service scheduled-order V23 internal eligibility API  
Activation: `CRAVES_SCHEDULED_PAYMENT_GUARD_ENABLED=false` by default

## Outcome

Integration Service now has a fail-closed, independently switchable pre-provider guard for scheduled checkouts. It prevents creation of a new Razorpay/Cashfree payment order when Order Service says a scheduled request is missing, expired, rejected, cancelled, inconsistent or still awaiting required chef confirmation.

## Why this is separate from PaymentService

The existing payment implementation is production-proven and contains provider idempotency, ownership, webhook and reconciliation behavior. This package does not rewrite that code. A small controller-level guard executes before the established `PaymentService.createPaymentOrder` call and remains disabled until the Order dependency is live.

## Ownership and privacy sequence

When enabled and no payment order exists for the checkout:

1. require a syntactically valid customer bearer token;
2. call the existing customer Order endpoint with that bearer;
3. require an exact checkout ID match;
4. call the protected internal schedule-eligibility endpoint with the existing internal key;
5. validate exact checkout ID, known fulfilment mode and safe reason code;
6. continue only when `paymentEligible=true`.

This order prevents an unauthenticated caller from using the internal eligibility API as a checkout-ID oracle.

## Existing-payment recovery

A payment order may already exist when:

- the browser retries after a timeout;
- provider creation succeeded but the response was lost;
- checkout is pending reconciliation;
- a schedule state changes after provider order creation.

The guard first checks for an existing Craves payment-order row. If one exists, it does not block the request; the established PaymentService then performs customer ownership validation and returns/reconciles the existing provider order. This avoids creating a second provider order and avoids stranding a real payment.

## Activation safety

The default is false. Enabling the guard without a configured internal key returns 503 rather than silently bypassing policy. An invalid/malformed Order response returns 502. An explicit not-eligible decision returns 409 before any provider mutation.

The reason reflected to clients is restricted to uppercase machine codes. Arbitrary upstream text is not reflected.

## Files

```text
services/integration-service/src/main/java/in/craves/integration/config/ScheduledPaymentGuardProperties.java
services/integration-service/src/main/java/in/craves/integration/payment/ScheduledPaymentEligibilityGuard.java
services/integration-service/src/main/java/in/craves/integration/web/PaymentController.java
services/integration-service/src/test/java/in/craves/integration/payment/ScheduledPaymentEligibilityGuardTest.java
services/integration-service/modules/scheduled-payment-guard/README.md
.github/workflows/backend-scheduled-payment-guard-ci.yml
```

## Existing environment values reused

```text
CRAVES_ORDER_BASE_URL
CRAVES_ORDER_INTERNAL_BASE_URL
CRAVES_INTERNAL_SERVICE_KEY
```

No Razorpay/Cashfree key, webhook secret or new Azure resource is required.

## Scope boundaries

This package does not:

- define schedule lead/horizon/payment policy;
- create or modify scheduled requests;
- block verification/reconciliation of an existing payment;
- alter Razorpay/Cashfree request bodies;
- change webhook behavior;
- issue refunds or cancellations;
- make a delivery-provider call;
- activate the feature in production.

## Validation

CI runs Integration Service Java 21 `mvn clean verify`, focused response-validation tests and source scans proving the guard is disabled by default, executes before provider creation, preserves existing-payment recovery and does not embed credentials.

## Deployment sequence

1. Order V23 and internal route deployed and smoked.
2. Integration image deployed with guard false.
3. Read-only internal eligibility tested for ASAP and both explicit schedule payment gates.
4. Guard enabled in one controlled Integration revision.
5. Negative test proves no provider order row/provider call for ineligible request.
6. Existing-provider-order recovery test proves the guard does not strand reconciliation.
7. Customer schedule UI remains hidden until the entire backend sequence is accepted.

## Rollback

Set `CRAVES_SCHEDULED_PAYMENT_GUARD_ENABLED=false`. No database rollback or provider change is required.
