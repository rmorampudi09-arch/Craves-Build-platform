# Advanced features APIM

One APIM API per path prefix of `advanced-features-service` (`ca-craves-advanced-prod`) on `apim-craves-prod-34eefd`, reached at `https://api.craves.in`. Gateway path = backend path. Subscription key: not required.

- `routes.txt` is **generated** by `ContractsIT` from the controllers (with the OpenAPI contracts in `contracts/openapi/advanced/`). Never edit it by hand: change the code, run `ADV_WRITE_CONTRACTS=true mvn verify`, commit both.
- Policies: `user-policy.xml` (Bearer required, 120/min per token subject, 256 KB bodies), `admin-policy.xml` (staff routes, 300/min), `public-policy.xml` (no sign-in, 60/min per IP). The service stays authoritative for JWT, roles, ownership and the admin session.
- Publish: `bash infra/advanced-features/apim-publish.sh` in Azure Cloud Shell (directory ravitejamm6gmail). Declarative: creates/updates each API and operation, sets policies, deletes operations no longer listed. `DRY_RUN=true` prints the plan.
- Roll back: `bash infra/advanced-features/apim-publish.sh --remove <api-id>` removes one API (the backend, data and other APIs are untouched).
