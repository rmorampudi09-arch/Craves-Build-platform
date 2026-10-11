# Subscription and Backoffice APIM Package

This package configures four APIM paths only after explicit confirmation:

```text
api/v1/subscriptions
api/v1/admin/subscription-plans
api/v1/admin/subscriptions
api/v1/backoffice/chef-reviews
```

Public operations:

```text
GET /api/v1/subscriptions/plans
GET /api/v1/subscriptions/plans/{planId}
GET /api/v1/subscriptions/plans/{planId}/image
```

Every customer/admin/backoffice operation requires a Bearer header at APIM and is cryptographically authorized again by the owning service.

The plan image operation is configured only by `scripts/apim/configure-meal-plan-image-apim.sh` (add `--rollback` with `CONFIRM_APIM_ROLLBACK=true` to remove just that operation). It uses `public-image-policy.xml`, which does not override `Cache-Control`, so the backend's one-day cache and `?v=` cache-buster reach clients; `configure-subscription-backoffice-apim.sh` leaves it alone.

## Files

```text
authenticated-policy.xml
public-policy.xml
public-image-policy.xml
scripts/apim/configure-subscription-backoffice-apim.sh
scripts/apim/configure-meal-plan-image-apim.sh
scripts/apim/status-subscription-backoffice-apim.sh
scripts/apim/rollback-subscription-backoffice-apim.sh
```

## Safety

- write/rollback confirmations default false
- Container App readiness and health checks
- exactly one API owner per path
- refuses subscription-key relaxation
- refuses inherited `backend-id`
- operation-scoped policies and rollback
- API containers retained during rollback
- no-store and `nosniff`
- no credentials in source

## Later order

1. Run CI.
2. Deploy User-Chef Service proof-stream code.
3. Deploy Subscription Service ownership/audit code.
4. Run the APIM write pipeline with explicit confirmation.
5. Run the read-only status pipeline.
6. Execute authenticated/non-authenticated smoke tests.
7. Use rollback only for verified gateway faults.
