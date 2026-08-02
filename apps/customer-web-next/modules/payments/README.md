# Customer Web Cashfree Payment

Adds customer-owned payment order creation, hosted Cashfree checkout, status read and backend verification.

## Security fix

Integration Service now requires a Bearer token for payment create, read and verify. Before returning a payment or calling Cashfree verify, it loads the checkout through Order Service with the same token and confirms the checkout customer matches the payment record.

## Customer routes

- `/checkout/{checkoutId}/payment`
- `POST /api/payments/orders`
- `GET /api/payments/orders/{paymentOrderId}`
- `POST /api/payments/orders/{paymentOrderId}/verify`

## Cashfree integration

The browser loads `https://sdk.cashfree.com/js/v3/cashfree.js` directly, creates the SDK in an explicit `sandbox` or `production` mode and opens hosted checkout with the backend-issued `paymentSessionId`. Cashfree client ID and secret remain only in Integration Service configuration.

## Pipelines

- `azure-pipelines-customer-payments-ci.yml`
- `azure-pipelines-customer-payments-apim.yml`
- existing guarded customer-web deployment pipeline with `cashfreeMode`

## Manual steps later

- Run combined Java/web CI.
- Deploy Integration Service ownership fix before exposing APIM read/verify.
- Configure APIM customer payment operations.
- Keep Cashfree mode `sandbox` until controlled tests pass.
- Whitelist the final web domain in Cashfree.
- Register and verify the webhook separately.
- Do not paste Cashfree secrets into chat or repository.

No payment was created and no Cashfree API was called during development.
