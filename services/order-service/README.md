# Craves Order Service

Order Service owns customer cart, checkout, chef-specific orders, order items, order status transitions and admin-managed charge policies.

## Current V1 scope

- Customer cart CRUD.
- Cart validation against Catalog Service active menu item APIs.
- Checkout that groups cart items by kitchen and creates chef-specific orders.
- V1 zero-fee charge policy seeded by default.
- Admin can activate new charge policies for platform fee, tax and delivery fee.
- Chef can list/access their orders, accept/reject and mark ready for pickup.

## V1 charge model

Default seeded policy:

```text
food_subtotal = sum(item price * quantity)
platform_fee = 0
tax_amount = 0
delivery_fee = 0
grand_total = food_subtotal
```

Admin can later change active policy through:

```http
GET  /api/v1/admin/charge-policy/current
POST /api/v1/admin/charge-policy
```

Request example:

```json
{
  "policyName": "HYDERABAD_STANDARD_V1",
  "platformFeePercent": 5.00,
  "platformFeeFlat": 0.00,
  "taxPercent": 0.00,
  "deliveryFeeFlat": 30.00
}
```

These values are not hard-coded into checkout. Checkout always reads the active policy from `order_schema.charge_policy`.

## Main endpoints

### Customer cart

```http
GET    /api/v1/cart
POST   /api/v1/cart/items
PUT    /api/v1/cart/items/{cartItemId}
DELETE /api/v1/cart/items/{cartItemId}
DELETE /api/v1/cart
POST   /api/v1/cart/validate
```

### Checkout and orders

```http
POST /api/v1/checkout
GET  /api/v1/checkout/{checkoutId}
GET  /api/v1/orders
GET  /api/v1/orders/{orderId}
```

### Chef orders

```http
GET  /api/v1/chef/orders
GET  /api/v1/chef/orders/{orderId}
POST /api/v1/chef/orders/{orderId}/accept
POST /api/v1/chef/orders/{orderId}/reject
POST /api/v1/chef/orders/{orderId}/ready-for-pickup
```

## Environment variables

```text
SPRING_DATASOURCE_URL
SPRING_DATASOURCE_USERNAME
SPRING_DATASOURCE_PASSWORD
CRAVES_JWT_VERIFICATION_PEM_BASE64
CRAVES_JWT_ISSUER
CRAVES_JWT_AUDIENCE
CRAVES_CATALOG_BASE_URL
```

For Azure dev, `CRAVES_CATALOG_BASE_URL` can be:

```text
https://apim-craves-prodlow-l3ing6.azure-api.net/api/v1/catalog
```

## Local run

```bash
cd services/order-service
mvn spring-boot:run -Dspring-boot.run.profiles=local
```

## Important production notes

- Cashfree payment intent creation is not implemented in this V1. Checkout creates orders in `PAYMENT_PENDING` state.
- Delivery creation is not implemented here. Delivery must be scheduled after chef acceptance in the Integration/Delivery flow.
- Fee/tax/commission/legal policy is configurable, but final finance rules still need Product/Finance/Legal approval before production.
