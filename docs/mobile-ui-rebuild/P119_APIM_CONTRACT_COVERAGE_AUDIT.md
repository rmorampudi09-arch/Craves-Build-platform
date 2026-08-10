# P119 — APIM Contract-Coverage Audit

**Branch:** `mobile-ui-rebuild-from-scratch`  
**Starting HEAD:** `24211308454854e32a962b65fdc6f8704f6886a9`  
**Scope:** P119 only. P120 was not started.

## Status

**DONE at authorized code/audit scope.** Runtime/CI execution is not claimed from this connector-only run because the repository cannot be checked out in the execution sandbox and the project ledger already records exhausted GitHub Actions capacity.

## Contract boundary established

P119 publishes the production mobile action inventory at:

- `api/apim-api/contracts/mobile-production.v1.json`

The manifest records, per production HTTP action:

- source module/action identity;
- HTTP method;
- APIM `/api/v1/**` path;
- public-vs-bearer transport mode;
- request model;
- response model;
- request validation/guard ownership;
- response validation/contract-check ownership.

The manifest is intentionally mobile/APIM-facing. It does not authorize direct service hosts and does not fabricate capabilities that are not exposed through APIM.

## Coverage gate

Added:

- `apps/mobile/scripts/p119-apim-contract-coverage-check.mjs`
- `apps/mobile/package.json` script: `npm run check:p119`

The check fails deterministically when:

1. a production `httpClient`/`publicApiClient` call is added, removed, or changes HTTP method without a matching manifest action;
2. a manifest action is missing method/path/auth/request-model/response-model/request-validator/response-validator metadata;
3. a manifest path is outside `/api/v1/**` or is an absolute URL;
4. production code imports Axios outside the centralized `core/http` transport;
5. production source contains direct Azure backend hosts, `x-functions-key`, or an APIM subscription-key literal;
6. a quarantined route is reintroduced as a production HTTP action.

This preserves the existing centralized token/retry/correlation behavior rather than adding a second transport stack.

## Invented/unapproved route removed from production transport

The audit found one concrete violation:

- `GET /api/v1/chef/earnings`

`apps/mobile/src/features/chefPayout/api/chefPayoutApi.ts` already states that the backend path exists but there is **no approved APIM mobile operation** for it. `chefDashboardApi` nevertheless called it through production transport.

P119 removes that HTTP call and makes `chefDashboardApi.listEarnings()` fail closed with `ChefDashboardContractUnavailableError`. The parser/types remain intact for future reconciliation once an approved APIM operation is published. The route is also recorded under the manifest `quarantined` section so the static coverage gate rejects accidental reintroduction.

No fake earnings data, direct backend fallback, guessed APIM route, or new payout contract was introduced.

## Audited production action families

The published manifest covers the current production calls across:

- auth exchange/me/logout/refresh;
- customer profile and Chef application onboarding;
- customer addresses;
- discovery menu items and kitchens;
- public catalog kitchen/menu-item reads;
- cart;
- checkout;
- payment order create/read/verify;
- customer orders and delivery tracking;
- customer profile hub;
- in-app notifications;
- Chef menu CRUD/availability/image upload boundary;
- Chef operational order list;
- Chef order detail accept/reject/ready actions;
- Chef kitchen profile read/replace;
- Chef business-verification read.

After quarantining Chef earnings, the manifest contains **49 production mobile HTTP actions**.

## Request and response validation audit

P119 records the existing local guard/parser ownership next to every action rather than inventing a second DTO shape. Important fail-closed examples include UUID/range validation, cart/checkout/payment identity reconciliation, Zod-backed discovery/order parsing, exact Chef menu request validation, Chef order mutation guards, customer-address response validation, and notification ID validation.

Where validation is intentionally owned by a form/domain contract before the API call, the manifest names that owner. A future transport addition without equivalent validator metadata causes the P119 gate to fail its manifest completeness check.

## Trust boundary

Production mobile calls remain routed through the centralized runtime base URL and HTTP transport. The P119 gate rejects direct Azure service-host literals and internal/gateway credential literals in production mobile source. Public auth credential exchange/refresh/logout remain explicitly classified as `publicApiClient` actions; bearer-required actions remain `httpClient` actions.

## Validation performed in this run

Performed through repository inspection after the implementation commits:

- re-read the P119 phase definition and project control docs;
- audited the production mobile API modules and centralized transport;
- verified the existing Chef payout module's explicit APIM-unavailable boundary before removing the dashboard earnings call;
- re-read the updated branch HEAD and changed-file contents through GitHub;
- manually reconciled the manifest action counts/methods against the audited production API modules.

Not claimed:

- local `npm run check:p119` execution;
- Jest/TypeScript/ESLint execution;
- GitHub Actions execution;
- device/network runtime validation.

Those were not runnable from the connector-only environment, and P119 does not mislabel them as passing.

## Changed files

- `api/apim-api/contracts/mobile-production.v1.json`
- `apps/mobile/scripts/p119-apim-contract-coverage-check.mjs`
- `apps/mobile/src/features/chefDashboard/api/chefDashboardApi.ts`
- `apps/mobile/package.json`
- `docs/mobile-ui-rebuild/P119_APIM_CONTRACT_COVERAGE_AUDIT.md`

## Phase boundary

P119 stops here. **P120 — Backend/API/Dashboard Parity Recheck was not started or modified.**
