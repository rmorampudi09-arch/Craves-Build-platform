# Scheduled Payment Eligibility Guard

## Purpose

Before Integration Service creates a new Razorpay or Cashfree payment order, this optional guard asks Order Service whether the checkout is currently eligible for payment under its scheduled-order policy.

The guard is disabled by default:

```text
CRAVES_SCHEDULED_PAYMENT_GUARD_ENABLED=false
```

It must remain false until Order Service V23 and the protected internal eligibility operation are deployed and verified.

## Flow

```text
customer payment create request
  -> existing payment execution gate
  -> existing-payment lookup
  -> authenticated checkout ownership verification
  -> protected Order Service schedule-payment-eligibility read
  -> fail closed if ineligible/invalid/unavailable
  -> existing PaymentService provider creation
```

Existing payment orders bypass the new-schedule gate so payment recovery, verification and idempotent replay cannot be stranded after a later schedule-state change. PaymentService still performs its existing checkout/customer ownership validation before returning that order.

## Existing configuration reused

```text
CRAVES_ORDER_BASE_URL
CRAVES_ORDER_INTERNAL_BASE_URL
CRAVES_INTERNAL_SERVICE_KEY
```

No provider key or new secret is introduced.

## Failure behavior

- Missing/invalid bearer: 401.
- Unowned/missing checkout: 404/401 through existing ownership contract.
- Internal key missing while guard enabled: 503.
- Invalid/unavailable Order response: 502.
- Valid but ineligible schedule: 409 with a safe machine reason.
- Guard disabled: current payment behavior unchanged.

The guard applies only before creating a *new* provider order. It does not block payment verification/webhook reconciliation for an already-created provider order.

## Local test

```bash
cd services/integration-service
mvn -B -ntp clean verify
```

## Rollout order

1. Deploy Order Service V23 and internal eligibility operation.
2. Test both configured payment gates without contacting a live payment provider.
3. Deploy Integration Service with guard still false.
4. Enable `CRAVES_SCHEDULED_PAYMENT_GUARD_ENABLED=true` in a controlled revision.
5. Prove ASAP, pending scheduled, confirmed scheduled and existing-payment recovery cases.
6. Publish scheduled-order frontend only after accepted evidence.

## Rollback

Set `CRAVES_SCHEDULED_PAYMENT_GUARD_ENABLED=false`. Existing PaymentService/provider/webhook code remains unchanged.
