# Mobile Customer Orders

Adds authenticated order history, order details and direct delivery tracking navigation to the React Native customer application.

## API

- `GET /api/v1/orders`
- `GET /api/v1/orders/{orderId}`

## Security

The client uses the Keychain/Keystore-backed Craves session. Order Service remains authoritative for CUSTOMER role and ownership. The mobile DTO excludes customer identity IDs, kitchen pickup snapshots and provider payloads.

## Screens

- `OrdersScreen`
- `OrderDetailsScreen`

## Testing

Run `azure-pipelines-customer-mobile-orders-ci.yml`. Native Android/iOS compilation remains gated by the reviewed native-shell amendment and Firebase/signing setup.
