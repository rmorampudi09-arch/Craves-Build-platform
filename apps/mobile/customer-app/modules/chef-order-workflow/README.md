# Craves React Native Chef Order Workflow

## Scope

Replaces the ChefOrders placeholder with owned Order Service list, detail and supported chef actions.

## Routes

```text
GET  /api/v1/chef/orders
GET  /api/v1/chef/orders/{orderId}
POST /api/v1/chef/orders/{orderId}/accept
POST /api/v1/chef/orders/{orderId}/reject
POST /api/v1/chef/orders/{orderId}/ready-for-pickup
```

## Safety

- Secure Keychain/Keystore session bearer.
- Order Service validates CHEF role, kitchen ownership, state and acceptance deadline.
- Customer identity, checkout, kitchen and pickup fields are excluded.
- Recipient contact/address is retained only for fulfillment.
- Accept/reject send the order UUID as correlation ID and deterministic idempotency keys.
- Only accept, reject and ready-for-pickup are exposed.
- No cancel, refund, delivery-provider or payment transition is added.

## Pipeline

`azure-pipelines-chef-mobile-order-workflow-ci.yml`
