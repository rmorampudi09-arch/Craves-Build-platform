# Craves Integration Service - Cashfree Sandbox V1

This service owns provider integrations for the MVP. This V1 implements Cashfree sandbox payment order creation, payment order storage, webhook inbox persistence, webhook signature verification, payment attempts, and a temporary callback to Order Service.

## APIs

```http
POST /api/v1/payments/orders
GET  /api/v1/payments/orders/{paymentOrderId}
POST /api/v1/payments/orders/{paymentOrderId}/verify
POST /api/v1/payments/webhooks/cashfree
```

## Create payment order request

```json
{
  "checkoutId": "checkout-uuid",
  "customerName": "Ravi Teja",
  "customerEmail": "sandbox@craves.in",
  "customerPhone": "8019166645",
  "returnUrl": "https://craves.in/payment/return"
}
```

The amount is not trusted from the client. Integration Service calls Order Service with the user's Craves access token and reads the checkout grand total.

## Runtime variables

Configure database connection, Cashfree sandbox credentials, Order Service URLs, and the internal service key in Azure DevOps or Container App environment values. Do not put provider credentials in source code or chat.

## Temporary V1 note

For this sandbox V1, Integration Service calls an internal Order Service endpoint after a verified SUCCESS webhook or explicit verify call. Later we should replace that direct callback with the HLD's Service Bus `PAYMENT_SUCCEEDED` event path.

## Production blockers still pending

- Cashfree Integration LLD approval.
- Refund policy by cancellation/order stage.
- Reconciliation report and finance review.
- Production webhook URL registration.
- APIM JWT policy and service-to-service private ingress hardening.
