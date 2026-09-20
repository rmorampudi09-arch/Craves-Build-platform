# Preserve known order progress on web

## Reproduction and scope

The owner signed in successfully to the live customer website on16September2026. Read-only navigation to an existing order showed a Ready For Pickup timeline entry but a Waiting for delivery updates headline. The delivery endpoint returned a valid object whose status was null; the UI tested object presence rather than status presence. No order, cart, payment or delivery state was changed.

## Implementation

`apps/customer-web-next/src/lib/tracking-presentation.ts` selects actual delivery progress when a status is present and otherwise preserves the known order status with customer-facing explanations. `src/screens/OrderTracking/OrderTracking.tsx` consumes this tested presentation. Its background is white; technical references to projections, jobs, backend responses and polling have been replaced by plain language. Order history no longer claims a checkout can contain multiple kitchens; its copy refers to kitchen updates and order documents. The tracking summary says Total, not Backend total. Prices and order records are unchanged.

## Verification

Four Node regression cases cover a valid empty delivery response, all13 supported order statuses, actual delivery progress and screen wiring. A rendered screen test mocks an owned synthetic order and valid empty delivery response, then asserts the Ready For Pickup headline and Total label. Existing delivery and order integration tests remain enabled. Focused13 Node tests and the rendered screen test pass; typecheck passes. Full exact-source CI and live post-deployment browser verification are still required.

React checklist: status is derived directly from current state rather than another effect; no new dependency, request, listener or user-data cache; parallel order/delivery reads, ownership validation, HTTPS link checks and existing refresh behavior are retained. No financial action or database write is added.

## Delivery and manual steps

Deploy only through the guarded customer-web pipeline after exact-source required checks and merged-main checks pass. No secrets, DNS, mobile signing or infrastructure changes. Revisit the same owned ready-for-pickup order after deployment and confirm the headline and timeline agree. This web-only correction does not claim Android/iOS/device acceptance or a completed real delivery.
