# Craves Customer Web — Next.js Delivery Tracking

This is the clean Next.js migration path for the Craves customer website. It does not extend the temporary Vite application in `apps/customer-web`.

## Scope

Implemented:

- Next.js App Router, TypeScript and Tailwind CSS foundation.
- Customer route `/orders/{orderId}/tracking`.
- Server-side BFF route `/api/orders/{orderId}/delivery-status`.
- Secure forwarding to the APIM Order delivery-status endpoint.
- HTTP-only `craves_access_token` cookie contract.
- Customer-safe response parsing and field allow-listing.
- Current state, progress indicator and chronological history.
- Manual refresh and 30-second visible-page refresh for active deliveries.
- Automatic refresh stop for terminal states.
- HTTPS-only provider tracking links.
- Loading, unauthenticated, forbidden, not-found, timeout and upstream-error states.
- Unit tests and standalone production Docker image.

Not implemented here:

- phone OTP/password sign-in UI or cookie creation;
- order history/details migration;
- browsing, cart, checkout or payment migration;
- mobile UI;
- provider activation;
- delivery pricing or serviceability rules.

## Why a separate app path

The existing `apps/customer-web` package is a temporary Vite shell with manual token entry. The approved Craves stack requires Next.js. This module is isolated under `apps/customer-web-next` so it can be built and tested without replacing the current image.

## Request flow

```text
browser tracking page
  -> Next.js BFF route
  -> HTTP-only craves_access_token cookie
  -> APIM GET /api/v1/orders/{orderId}/delivery-status
  -> Order Service JWT/customer/ownership validation
  -> provider-neutral delivery projection
  -> BFF response allow-list and no-store headers
  -> customer tracking UI
```

The browser never reads or stores the access token.

## Environment

```text
CRAVES_API_BASE_URL=https://apim-craves-prodlow-l3ing6.azure-api.net/api/v1
```

Future authentication must create:

```text
name: craves_access_token
HttpOnly: true
Secure: true
SameSite: Lax
Path: /
Max-Age: no longer than the access-token lifetime
```

Clear the cookie on logout and expiry. Do not use `localStorage`.

## Local setup

```bash
cd apps/customer-web-next
npm install
npm run verify
npm run dev
```

## Pipelines

Build-only CI:

```text
azure-pipelines-customer-web-next-delivery-tracking-ci.yml
```

Guarded replacement deployment:

```text
azure-pipelines-customer-web-next-delivery-tracking.yml
confirmReplaceLegacyCustomerWeb=false
```

Read-only status:

```text
azure-pipelines-customer-web-next-delivery-tracking-status.yml
```

Explicit-image rollback:

```text
azure-pipelines-customer-web-next-delivery-tracking-rollback.yml
confirmRollback=true
previousImage=<exact recorded ACR image>
```

The deployment targets the existing `ca-craves-web-prodlow` app and therefore requires explicit approval before replacing the legacy image.

## Security

- UUID validation at page and BFF boundaries.
- Ten-second upstream timeout.
- Explicit response allow-list.
- Unknown provider fields and raw payloads discarded.
- HTTPS-only tracking URLs.
- `Cache-Control: no-store`.
- `noindex` tracking pages.
- Order Service remains authoritative for role and ownership.
- No token, cookie or upstream body logging.

## Scale

Thirty-second polling occurs only while the tab is visible and the delivery is non-terminal. This is suitable for the current 50–100 concurrent-user environment. Higher scale should introduce SSE/WebSocket delivery updates with polling fallback.

## Pending modules

1. Next.js authentication/session and secure cookie issuance.
2. Customer order history/details with tracking navigation.
3. Browsing, addresses, cart, checkout and Cashfree migration.
4. React Native customer delivery tracking.
5. Chef delivery visibility.
