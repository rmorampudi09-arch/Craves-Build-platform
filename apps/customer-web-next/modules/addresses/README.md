# Customer Web Address Management

Adds authenticated address list, create, edit, delete and live-location recommendation to the Next.js customer web.

## Web route

`/addresses`

## Same-origin BFF

- `GET|POST /api/customer/addresses`
- `GET|PUT|DELETE /api/customer/addresses/{addressId}`
- `GET /api/customer/addresses/recommendation`

## Service contract

User/Chef Service remains the address source of truth under `/api/v1/customer/addresses`.

## Security

- HTTP-only Craves access-token cookie only.
- Mutation requests require same-origin browser headers.
- Identity IDs are removed from browser responses.
- Address identifiers and coordinates are validated.
- No address is stored in browser storage.
- No raw upstream errors or tokens are rendered.

## Manual steps later

1. Run `azure-pipelines-customer-web-next-addresses-ci.yml`.
2. Merge only after all parent PRs are merged in order.
3. Run `azure-pipelines-customer-addresses-apim.yml` with confirmation.
4. Smoke-test list/create/update/delete using a non-production test customer.
5. Delete the exact test address after validation.

The APIM script may create the dedicated `craves-customer-profile-v1` API only when no API owns `api/v1/customer`. Creating or modifying APIM is an Azure Portal/billing-sensitive action and is deferred.
