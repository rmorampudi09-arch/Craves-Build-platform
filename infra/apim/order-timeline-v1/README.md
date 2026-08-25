# Customer Order Timeline APIM

This module publishes the additive authenticated `GET /api/v1/orders/{orderId}/timeline` operation onto the existing Order APIM API.

## Safety controls

- Requires exactly one existing API at `api/v1/orders`.
- Refuses to change the API subscription-key setting.
- Refuses to take over the URL template if another operation already owns it.
- Requires the Order Container App latest revision to equal latest ready revision, be Running, and pass health before configuration.
- Reuses the existing customer-order read policy template so Bearer authorization remains required and responses are `no-store`.
- Refuses inherited backend-id policy that cannot safely be overridden.
- Rollback removes only this operation after verifying ownership.
- Creates no Azure resource and no billable infrastructure.

## Static validation

```bash
bash -n scripts/apim/configure-order-timeline-apim.sh
bash -n scripts/apim/rollback-order-timeline-apim.sh
```

Deploy and validate the matching Order Service branch in non-production before executing the APIM script. Required smoke evidence includes unauthenticated 401, caller-owned order 200, another customer/order 404, malformed UUID 400 at the web BFF, and terminal/non-terminal timeline behavior.
