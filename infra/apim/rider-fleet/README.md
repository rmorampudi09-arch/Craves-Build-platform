# Rider and admin fleet APIM

Two APIs on the mobile gateway `apim-craves-prodlow-kmqgfy` (`https://api.craves.in`), both routed to integration-service (`ca-craves-integration-service-pr`):

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
| `upload-policy.xml` | `POST /shift/start`, `/documents`, `/trips/{tripId}/{action}` | As JSON, without the body cap (multipart photos up to 10 MB are checked by the backend), 2 uploads in flight per rider, 60 s |
| `location-policy.xml` | `POST /locations`, `/devices` | Bearer header **or** `X-Craves-Shift-Credential` (the phone's online service sends only the credential; a 401 there ends the rider's shift), credential passed through, 16 KB cap, 2 calls in flight per shift, 20 s |
| `admin-policy.xml` | every admin fleet route | The existing admin protections (`admin-operational-investigations`): Bearer header, correlation id, `no-store`, `nosniff`, `X-Frame-Options: DENY`; shift credential dropped |

Nothing is cached: every response is `no-store`, and no policy has `cache-lookup`. The backend stays authoritative for the JWT, roles, ownership and the shift credential (valid only on `/locations` and `/devices`).

**Rate limits.** The Consumption gateway does not support `rate-limit-by-key`, and `rate-limit` needs a subscription key these routes do not use (see `docs/admin/explorer/README.md`). So the gateway bounds calls in flight per caller with `limit-concurrency` (key: the token's subject, or the first 12 characters of the shift credential, never the whole secret). The phone sends one location batch every 10–20 s, one call at a time, so 2 in flight leaves room for a retry; anything over the limit gets 429 and the phone retries on its next tick.

## Safety controls in the configure script

- `DRY_RUN=true` prints the table and calls nothing; a write needs `CONFIRM_APIM_WRITE=true`.
- Checks the Azure subscription and tenant, the integration Container App (ready, health `UP`) and inherited `backend-id` policies before writing anything.
- Creates an API only when no API owns its path; refuses a path another API id owns, a subscription-key API, or a parent API (`api/v1`, `api/v1/admin`) that already serves routes under the new prefix (the new API would hide them).
- Declarative: each run writes every listed operation and policy and removes operations `routes.txt` no longer lists, from these two APIs only.
- Reads every policy back (backend, Bearer, no-store, nosniff, shift credential dropped or kept as listed) and probes every route unauthenticated through `api.craves.in` for 401.

## Pipelines (manual, write pipelines from `main` only)

```text
azure-pipelines-rider-fleet-apim-ci.yml        validation: syntax, XML, asset gate, route-table test, dry run
azure-pipelines-rider-fleet-apim.yml           configure (confirmProductionChange=true)
azure-pipelines-rider-fleet-apim-status.yml    read-only status
azure-pipelines-rider-fleet-apim-rollback.yml  remove both APIs (confirmApimRollback=true)
```

They use the `Craves-RMORAMPUDI09-Service-Connection` service connection, as `azure-pipelines-chef-app-routes-apim.yml` does.

## Deploy

1. Merge to `main`. Deploy the integration-service image that carries the rider and admin fleet controllers first (flags may stay off).
2. Run the CI pipeline on `main`.
3. Run `azure-pipelines-rider-fleet-apim.yml` on `main` once without the confirm box (dry run), read the table, then again with `confirmProductionChange` ticked.
4. Run the status pipeline. It must end with `SUCCESS: Rider fleet APIM status is healthy.`

## Roll back

- To remove both APIs (the gateway as before the first configure): run `azure-pipelines-rider-fleet-apim-rollback.yml` on `main` with `confirmApimRollback` ticked. The rider app and the ops console then get 404 from the gateway; backends, flags and data are untouched.
- To go back to an earlier version: run `azure-pipelines-rider-fleet-apim.yml` at that earlier `main` commit (Run pipeline, Commit field). The configure script makes both APIs match that commit's `routes.txt` and policies exactly.
