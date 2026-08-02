# Mobile Customer Address Management

Adds authenticated saved-address list, create, update, delete and coordinate recommendation to the React Native customer app.

## API

- `GET|POST /api/v1/customer/addresses`
- `GET|PUT|DELETE /api/v1/customer/addresses/{addressId}`
- `GET /api/v1/customer/addresses/recommendation`

## Security

The mobile client uses the Keychain/Keystore-backed Craves session. User/Chef Service remains authoritative for customer identity and address ownership. Identity IDs are excluded from app DTOs.

## Native-location boundary

The module accepts precise latitude and longitude and can call the backend recommendation endpoint. Device GPS capture is intentionally deferred until Android/iOS native shells exist and location permission strings, runtime permissions and privacy copy can be reviewed together.

## Pipeline

Run `azure-pipelines-customer-mobile-addresses-ci.yml` later. It blocks unreviewed geolocation dependencies, insecure storage and identity-field rendering.
