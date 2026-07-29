# Native Customer Delivery Tracking

## Purpose

Expose the provider-neutral Order Service delivery projection inside the React Native customer application.

```text
secure mobile session
  -> APIM GET /api/v1/orders/{orderId}/delivery-status
  -> Order Service ownership check
  -> strict mobile response parser
  -> current status, progress and timeline
```

## Main files

```text
src/delivery/contracts.ts
src/delivery/contracts.test.ts
src/delivery/delivery-api.ts
src/screens/TrackingLookupScreen.tsx
src/screens/DeliveryTrackingScreen.tsx
src/navigation/RootNavigator.tsx
src/screens/HomeScreen.tsx
```

## Runtime behavior

- validates the chef-specific order UUID;
- forwards the secure access token only in the Authorization header;
- times out after ten seconds;
- distinguishes expired session, unowned/missing order and temporary upstream failure;
- sanitises the complete response before rendering;
- permits only HTTPS tracking links;
- polls every thirty seconds only while the app is active;
- stops polling for `DELIVERED`, `CANCELLED`, `RETURNED` and `FAILED`;
- supports pull-to-refresh;
- signs the user out when the backend returns 401.

## Privacy

The mobile contract excludes provider delivery IDs, raw webhook bodies, internal inbox/outbox data, retry metadata, provider credentials and chef-private pickup information.

## CI

```text
azure-pipelines-customer-mobile-delivery-tracking-ci.yml
```

## Dependencies

This module depends on:

- Order delivery-status consumer code;
- the APIM delivery-status operation;
- the React Native auth foundation;
- the manually generated native shells and Firebase application registrations.

## Manual testing later

1. Complete Android/iOS Firebase setup with test phone numbers.
2. Sign in on a real or configured test device.
3. Enter a customer-owned chef-specific order UUID.
4. Verify pre-delivery null state, active state, history and terminal-state behavior.
5. Confirm an unowned order returns a customer-safe not-found message.
6. Confirm HTTP/non-HTTPS provider links are never opened.
7. Move the app to the background and verify automatic polling pauses.

## Scope exclusions

- provider activation and webhook registration;
- push notifications;
- delivery map rendering;
- courier location coordinates;
- ETA/SLA calculation;
- pricing, compensation, cancellation and refund decisions;
- order-list integration, which should replace manual UUID entry in a later mobile orders module.
