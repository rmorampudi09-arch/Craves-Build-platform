# Advanced features APIM

One API, `craves-adv-v1`, path `api/v1/advanced`, on `apim-craves-prod-34eefd` (reached at `https://api.craves.in/api/v1/advanced/...`), backend `ca-craves-advanced-prod`. Operations are wildcards (`GET/POST/PUT/PATCH/DELETE /*`), so every current and future advanced module is reachable without another gateway change. Subscription key: not required.

- Policy `api-policy.xml`: inherits the global policy (Front Door id / NAT allow-list), 300 calls a minute per token subject (or per IP without a token), 256 KB bodies, correlation id, `nosniff`. The service decides authentication per route (public routes are listed in each module's `FeatureModule`), roles, ownership and caching headers.
- Contracts for the frontend: `contracts/openapi/advanced/<module>-v1.yaml`, generated from the controllers.
- Publish or update: `bash infra/advanced-features/provision.sh apim`. Roll back: `bash infra/advanced-features/provision.sh apim-remove` (removes only `craves-adv-v1`; backend and data untouched).
