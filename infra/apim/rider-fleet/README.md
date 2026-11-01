# Rider and admin fleet APIM

Two APIs on the mobile gateway `apim-craves-prod-34eefd` (`https://api.craves.in`), both routed to integration-service (`ca-craves-integration-prod`):

```text
craves-rider-v1        api/v1/rider         the rider app (contracts/openapi/rider-v1.yaml)
craves-admin-fleet-v1  api/v1/admin/fleet   the ops console BFF (contracts/openapi/admin-fleet-v1.yaml)
Subscription key: not required
Gateway path = backend path; operation policies set the backend with base-url
```

`routes.txt` lists both APIs and every operation with its policy. `scripts/apim/tests/test_rider_fleet_apim.py` fails when it differs from the two contracts, so a contract change is published by updating `routes.txt` in the same PR.

## Policies

| Policy | Used by | What it does |
|---|---|---|
| `json-policy.xml` | rider JSON routes | Bearer header required (401), shift credential header dropped, 64 KB body cap, at most 4 calls in flight per rider, 30 s backend timeout |
| `upload-policy.xml` | `POST /shift/start`, `/documents` | As JSON, without the body cap (multipart photos up to 10 MB are checked by the backend), 2 uploads in flight per rider, 60 s |
| `trip-policy.xml` | `POST /trips/{tripId}/{action}` | Bearer header **or** `X-Craves-Shift-Credential` (P2-01: the phone's native outbox; the backend accepts the credential only once `CRAVES_FLEET_TRIP_SHIFT_CREDENTIAL_ENABLED` is on, and only for that rider's own trip), credential passed through, JSON or a multipart photo without a body cap (the backend checks 10 MB), 2 calls in flight per rider (shared with uploads) or per shift, 60 s |
| `location-policy.xml` | `POST /locations`, `/devices` | Bearer header **or** `X-Craves-Shift-Credential` (the phone's online service sends only the credential; a 401 there ends the rider's shift), credential passed through, 16 KB cap, 2 calls in flight per shift, 20 s |
| `admin-policy.xml` | every admin fleet route | The existing admin protections (`admin-operational-investigations`): Bearer header, correlation id, `no-store`, `nosniff`, `X-Frame-Options: DENY`; shift credential dropped |

Nothing is cached: every response is `no-store`, and no policy has `cache-lookup`. The backend stays authoritative for the JWT, roles, ownership and the shift credential (valid only on `/locations` and `/devices`, and on trip steps once switched on).

**Rate limits.** The Consumption gateway does not support `rate-limit-by-key`, and `rate-limit` needs a subscription key these routes do not use (see `docs/admin/explorer/README.md`). So the gateway bounds calls in flight per caller with `limit-concurrency` (key: the token's subject, or the first 12 characters of the shift credential, never the whole secret). The phone sends one location batch every 10–20 s, one call at a time, so 2 in flight leaves room for a retry; anything over the limit gets 429 and the phone retries on its next tick.

## Safety controls in the configure script

- `DRY_RUN=true` prints the table and calls nothing; a write needs `CONFIRM_APIM_WRITE=true`.
- Checks the Azure subscription and tenant (34eefd95), the integration Container App (running its latest revision, which is `Healthy`; its ingress refuses direct calls) and inherited `backend-id` policies before writing anything.
- Creates an API only when no API owns its path; refuses a path another API id owns, a subscription-key API, or a parent API (`api/v1`, `api/v1/admin`) that already serves routes under the new prefix (the new API would hide them).
- Declarative: each run writes every listed operation and policy and removes operations `routes.txt` no longer lists, from these two APIs only.
- Reads every policy back (backend, Bearer, no-store, nosniff, shift credential dropped or kept as listed) and probes every route unauthenticated through `api.craves.in` for 401.

## Release

The release pipelines publish service images only, and no pipeline identity has rights on API Management. So after a merge that changes this folder, and once that merge's integration-service revision is live, a subscription owner runs the configure script from `main` in Azure Cloud Shell:

```bash
D=$(mktemp -d) && git clone -q --depth 1 https://github.com/rmorampudi09-arch/Craves-Build-platform "$D" && az account set -s 34eefd95-1a19-416f-b9df-92b326500615 && CONFIRM_APIM_WRITE=true bash "$D/scripts/apim/configure-rider-fleet-apim.sh"
```

It ends with `SUCCESS` after probing every route. Read-only check: the same line with `bash "$D/scripts/apim/status-rider-fleet-apim.sh"`, which must end with `SUCCESS: Rider fleet APIM status is healthy.`

The `azure-pipelines-rider-fleet-apim*.yml` files in the repo root were for the old subscription 721906c9; their writes now stop at the subscription check.

## Roll back

- To undo a route change: revert it on `main`, then run the configure line again. It makes both APIs match `routes.txt` and removes what it no longer lists.
- To remove both APIs (the gateway as before the first configure): the same line with `CONFIRM_APIM_ROLLBACK=true bash "$D/scripts/apim/rollback-rider-fleet-apim.sh"`. The rider app and the ops console then get 404 from the gateway; backends, flags and data are untouched.
