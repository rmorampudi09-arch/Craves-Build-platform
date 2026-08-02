# Mobile Customer Cart

Adds authenticated cart list, quantity update, removal, clear and validation to the React Native customer application.

## API

- `GET|DELETE /api/v1/cart`
- `POST /api/v1/cart/items`
- `PUT|DELETE /api/v1/cart/items/{cartItemId}`
- `POST /api/v1/cart/validate`

## Pricing boundary

Order Service owns item price, currency, line totals and food subtotal. The mobile client never calculates platform fee, tax or delivery fee.

## Future discovery handoff

The `Cart` navigation route accepts an optional validated `menuItemId` and quantity. A future mobile discovery screen can navigate to the cart with that typed selection. Customers are not shown a developer UUID-entry field.

## Stack safety

PR #42 includes a real checkout-preparation screen so it remains runnable before the final checkout/payment child PR replaces that route.

Run `azure-pipelines-customer-mobile-cart-ci.yml` later.