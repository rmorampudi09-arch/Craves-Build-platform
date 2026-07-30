# Delivery provider production readiness

This module completes the code and operational controls required to move the existing Borzo adapter from sandbox configuration to a controlled production rollout. It does not choose Borzo as the business provider and does not activate it automatically.

## Internal readiness API

```text
GET /internal/v1/delivery-provider-readiness
X-Craves-Internal-Secret: <shared internal secret>
```

The response contains only booleans and blocker codes. Credential values, callback secrets and provider payloads are never returned.

## Production configuration guards

Production configuration requires:

- `BORZO_API_ENVIRONMENT=PRODUCTION`
- `BORZO_PRODUCTION_ACTIVATION_APPROVED=true`
- a non-test HTTPS provider base URL
- an HTTPS callback URL
- provider auth and callback secrets
- Service Bus configuration
- webhook processing, tracking reconciliation and delivery-status publication

Provider create additionally requires both:

```text
BORZO_API_ENABLED=true
CRAVES_DELIVERY_COMMAND_ENABLED=true
```

Both remain false by default.

## Pipelines

```text
azure-pipelines-delivery-provider-production-ci.yml
azure-pipelines-delivery-provider-production-activation.yml
azure-pipelines-delivery-provider-production-rollback.yml
```

Activation has two required runs:

1. `downstream`: configure production metadata and enable reconciliation/webhook/tracking/status publication while provider create remains disabled.
2. `provider_create`: enable Borzo and delivery commands only after downstream state and Service Bus queue counts are verified.

Rollback disables every execution switch and leaves delivery intelligence enabled.

## Manual work later

- confirm the selected delivery provider contract and commercial terms;
- create/rotate production credentials in Key Vault/Container Apps;
- register the final APIM callback URL in the provider portal;
- validate one quote, one booking, one callback, tracking and cancellation with an approved test order;
- keep exact operational evidence and return to fail-closed state after testing.
