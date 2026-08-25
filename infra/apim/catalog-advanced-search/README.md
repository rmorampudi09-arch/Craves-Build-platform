# Catalog Advanced Search APIM

This module publishes only the additive public `GET /api/v1/discovery/search` operation onto the existing Craves Catalog Discovery APIM API.

## Safety model

- Refuses to create a second discovery API.
- Refuses to change subscription-key behavior.
- Refuses to take ownership of `/search` when another operation already owns that template.
- Requires the current Catalog Container App revision to be ready/running and healthy first.
- Adds `Cache-Control: no-store` and `X-Content-Type-Options: nosniff` at operation scope.
- Rollback deletes only the owned operation id after confirming its expected URL template.
- Does not create any billable Azure resource.

## Validation

```bash
bash -n scripts/apim/configure-catalog-advanced-search-apim.sh
bash -n scripts/apim/rollback-catalog-advanced-search-apim.sh
```

After a non-production deployment of the matching Catalog branch, run the configure script with the target environment variables and smoke `GET /api/v1/discovery/search` using valid location/query parameters. Empty results are valid; invented catalog data is not.

Do not execute this production configuration merely because the source branch exists. Service CI/build, APIM review, and smoke evidence are release prerequisites.
