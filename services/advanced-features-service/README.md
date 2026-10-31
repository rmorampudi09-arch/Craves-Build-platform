# advanced-features-service

Java 21 / Spring Boot 3.5 service for the Craves advanced features (handbook of 31 Oct 2026, Part B). It runs as its own
container app (`ca-craves-advanced-prod`, resource group `rg-craves-advanced-prod`), with its own database
(`craves_advanced_db`) and its own APIM APIs, so nothing here can break another Craves service.

## One feature = one isolated module

| Module | Package | Schema | API (via https://api.craves.in) | Contract | Switch |
|---|---|---|---|---|---|
| Food lists (E04) | `foodlists` | `adv_food_lists` | `/api/v1/advanced/food-lists`, `/api/v1/advanced/shared-food-lists` | `contracts/openapi/advanced/food-lists-v1.yaml` | `CRAVES_ADV_FOOD_LISTS_ENABLED` |
| Group orders (E13) | `grouporders` | `adv_group_orders` | `/api/v1/advanced/group-orders` | `group-orders-v1.yaml` | `CRAVES_ADV_GROUP_ORDERS_ENABLED` |
| Food facts (E19) | `foodfacts` | `adv_food_facts` | `/api/v1/advanced/food-facts` | `food-facts-v1.yaml` | `CRAVES_ADV_FOOD_FACTS_ENABLED` |
| Private taste data (E40) | `tastedata` | `adv_taste_data` | `/api/v1/advanced/my-taste-data` | `taste-data-v1.yaml` | `CRAVES_ADV_TASTE_DATA_ENABLED` |
| Feature switches | `platform.module` | – | `/api/v1/advanced/features` (public), `/modules` (staff) | `advanced-v1.yaml` | – |

Each module migrates its own schema with its own Flyway history. If one module's migration fails, or its switch is off,
only that module answers `503 FEATURE_UNAVAILABLE` / `FEATURE_DISABLED`; the rest keep serving (`ModuleRuntime`,
`ModuleGateFilter`, proven by `PlatformIT`). Each module also has its own concurrency budget (`CRAVES_ADV_MODULE_CONCURRENCY`, default 64).

## For the frontend

- Every route lives under `https://api.craves.in/api/v1/advanced/…` (one gateway API, so new modules need no gateway change). Send the user's Craves access token (`Authorization: Bearer …`), the same token the other APIs take; each operation's `x-craves-auth` in the contract says whether it is `public`, `user` or `staff`.
- The OpenAPI files in `contracts/openapi/advanced/` are generated from the code by `ContractsIT`, so they are always current.
- `GET /api/v1/advanced/features` (no sign-in) lists every feature with `enabled`/`available`: hide UI for features that are off.
- Errors: `{timestamp, code, message, details, correlationId}`; send `X-Correlation-ID` to trace a request.
- Create calls accept `Idempotency-Key` (8–128 chars): a retry returns the first response with `Idempotent-Replayed: true`.
- Updates that can race accept `If-Match: "<version>"` and answer `412 VERSION_MISMATCH` when stale.
- Money is integer paise. Times are ISO-8601 UTC.

## Security

RS256 JWTs verified exactly like the other services (issuer, audience, UUID subject, `roles`, `token_version`), staff tokens
re-checked live with Auth (`X-Craves-Admin-Session: verified-v1`), deny-by-default routes, ownership checks in every service
method, no-store responses, share tokens stored only as SHA-256, chef ownership confirmed with Catalog using the chef's own token.

## Build and test

```bash
# disposable PostgreSQL 16 (CI uses a service container)
export ADV_TEST_JDBC_URL=jdbc:postgresql://127.0.0.1:55432/postgres ADV_TEST_DB_USER=postgres ADV_TEST_DB_PASSWORD=...
mvn -B -ntp clean verify                      # unit + integration tests, contract drift check
ADV_WRITE_CONTRACTS=true mvn -B -ntp verify   # after an API change: regenerate contracts + APIM routes, then commit
```

## Deploy

One-time setup (owner, Azure Cloud Shell): `curl -fsSL https://raw.githubusercontent.com/rmorampudi09-arch/Craves-Build-platform/main/infra/advanced-features/setup-once.sh | bash`
(resource group, Key Vault, database, container app, gateway API `craves-adv-v1`, alerts, lock, release pipeline). After that a merge to `main` deploys through
Azure DevOps `release-advanced` (canary, auto-rollback) and the workflow "Advanced features live smoke" checks every route through api.craves.in.
