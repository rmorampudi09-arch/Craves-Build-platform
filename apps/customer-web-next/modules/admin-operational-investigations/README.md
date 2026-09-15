# Admin operational investigations

This module adds a read-only administrator workspace for exact-UUID operational evidence.

## Route

```text
/admin/operations
POST /api/admin/operations/investigate
```

## Backend contracts

```text
GET /api/v1/admin/operations/orders/{orderId}
GET /api/v1/admin/operations/payments/{paymentOrderId}
GET /api/v1/admin/operations/refunds/{refundId}
GET /api/v1/admin/operations/delivery-commands/{commandId}
```

The Next.js route converts a same-origin POST into the owning backend GET, sends the mandatory `X-Admin-Reason` header, and creates one UUID `X-Correlation-ID` before the upstream call. That same correlation ID is forwarded to the owning Spring service so the backend audit row and the browser-visible investigation result remain traceable even if an intermediate gateway does not echo the response header. If the backend does echo a different correlation ID, the BFF fails closed with HTTP 502 rather than presenting potentially mis-correlated evidence.

## Privacy and safety

- HTTP-only Craves session only
- exact UUID lookup; no broad customer or transaction search
- audit reason must contain 10–500 characters
- one BFF-generated UUID correlation ID is forwarded end-to-end
- correlation mismatch fails closed
- strict privacy-reduced response parser
- raw provider/webhook payloads are never returned
- no access token, signature, device token or full contact data is rendered
- no browser storage or sensitive logging
- no retry, refund, payment, delivery, account or provider mutation
- no-store responses

## Local verification

```bash
cd apps/customer-web-next
npm install --ignore-scripts
npm run typecheck
npm run test
npm run build
```

Set `CRAVES_API_BASE_URL` to the HTTPS APIM origin. The backend investigation operations must be deployed and separately exposed through the guarded APIM child module before a live lookup can succeed.

## Environment variables

No new frontend secret is introduced. Existing variables remain authoritative:

```text
CRAVES_API_BASE_URL
NEXT_PUBLIC_FIREBASE_*
```

## Deployment

This module does not require an APIM or Spring contract change for the correlation fix because the backend already accepts an optional UUID `X-Correlation-ID`. Deploy the updated Customer Web only after `azure-pipelines-admin-operational-investigations-ci.yml` passes. Then repeat the live read-only lookup and verify HTTP 200 plus the returned `X-Correlation-ID`.
