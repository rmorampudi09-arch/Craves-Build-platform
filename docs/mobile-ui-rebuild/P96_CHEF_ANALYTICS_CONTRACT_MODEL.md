# P96 — Chef Analytics Contract Model

**Status:** PARTIAL at full Guide/product-contract scope; exact current repository/backend boundary is modeled fail-closed  
**Guide ref:** 46 — Chef Analytics (source page 38 / embedded `image46.jpeg`)  
**Phase start commit:** `c201245e6bfb41087818274e63ff616fad582906`  
**Implementation/code end:** `45716f0ec0384ba061f64c1cddef74673a9afa74`  
**GitHub Actions:** not claimed; the user reported the account's monthly Actions capacity is exhausted and explicitly authorized continuing without treating Actions as a phase failure.

## Guide-required analytics contract

Reference 46 requires one consistent date-range/timezone/comparison model across:

- earnings and earnings time series;
- orders and order-status breakdown;
- items sold and top-item performance;
- average order value;
- new-customer metrics;
- rating metrics;
- comparison-period trends;
- detailed report/export or drill-down where supported.

The Guide explicitly requires empty/partial ranges to remain distinguishable from real zero values and requires Analytics definitions to reconcile with Dashboard and Payout data.

## Exact current contract audit

No approved Chef analytics summary, series, date-range, item-performance, customer-metric, rating-metric, comparison-period, or report/export endpoint exists in the current branch contract surface.

The existing Chef reads that can be used only as reconciliation sources are:

1. `GET /api/v1/chef/orders`
   - Current Order Service contract is an operational Chef order list/read surface.
   - It defines no analytics date-range query, KPI formulas, comparison period, or monetary aggregate semantics.
2. `GET /api/v1/chef/earnings?limit={n}`
   - `ChefFinancialController` exposes only the `limit` query parameter for the Chef read.
   - `ChefFinancialService` bounds the limit to 1–500.
   - `EarningResponse` is a financial ledger row, not a date-bucketed analytics response.
3. `GET /api/v1/kitchens/me/menu-items`
   - This is the canonical P92 menu ownership/configuration source.
   - It contains no sales count, revenue, conversion, rank, or date-ranged item-performance fields.

Admin dashboard/finance routes are not Chef-role analytics contracts and are not reused as a shortcut.

## Implemented boundary

P96 adds one typed Chef Analytics contract model and intentionally adds no analytics network wrapper because there is no exact analytics endpoint to call.

- Added explicit Guide-46 capability keys for summary KPIs, date-range filtering, earnings series, order-status metrics, item performance, customer metrics, rating metrics, comparison period, and report detail/export.
- Every unsupported capability is represented as `availability: 'unavailable'` with `code: 'BACKEND_CONTRACT_UNAVAILABLE'` and a precise reason.
- Existing Chef Orders, Earnings, and Menu reads are classified as `source-only` reconciliation inputs with their exact method/path/query surface and documented limitations.
- Raw operational or ledger rows are **not** promoted into average-order-value, top-item, new-customer, rating, trend, or date-bucket metrics without approved business definitions.
- `CHEF_ANALYTICS_CONTRACT_MODEL.status` remains `blocked` and `hasCompleteChefAnalyticsContract()` returns false while any required capability lacks a backend contract.
- P97 presentation/charts/date chips were not started. No placeholder KPI values, fake zero charts, guessed range enums, or synthetic `/analytics` route were added.

## Changed mobile files

- `apps/mobile/src/features/chefAnalytics/domain/chefAnalyticsContract.ts`
- `apps/mobile/src/features/chefAnalytics/domain/chefAnalyticsContract.test.ts`

Evidence/ledger:

- `docs/mobile-ui-rebuild/P96_CHEF_ANALYTICS_CONTRACT_MODEL.md`
- `build.md`

## Focused test source

`chefAnalyticsContract.test.ts` covers:

- all Guide-46 analytics capabilities fail closed as unavailable;
- the overall contract cannot report production-ready while those gaps exist;
- the three exact existing Chef read routes remain `source-only` reconciliation inputs;
- the earnings source exposes only `limit` as a supported query parameter;
- the contract model does not expose a fabricated `/analytics` endpoint or synthetic `averageOrderValue` / `topItems` response fields.

## Validation / guard state

- `GitHub.compare_commits` confirms implementation commit `45716f0ec0384ba061f64c1cddef74673a9afa74` is exactly one fast-forward commit ahead of the P95 ledger HEAD and changes only the two P96 mobile domain/test files.
- No `services/`, `openapi/`, `infra/`, APIM, backend/controller, deployment, pipeline, navigation, screen, or package/dependency source changed.
- The production contract source was checked with local TypeScript 5.8.3 using `tsc --noEmit --noResolve --target es2022 --module esnext`; it emitted zero diagnostics.
- An isolated parse of the test source reached only the expected missing Jest ambient-name diagnostics (`describe`/`it`/`expect`) because the private repository dependency environment is not mounted; no project Jest pass is claimed.
- GitHub Actions are intentionally not used as a P96 pass/fail signal because the account Actions capacity is exhausted.
- Full workspace dependency install, strict TypeScript, ESLint, Jest execution, production Android bundle, emulator/device behavior, and Screen-46 visual comparison are **not recorded as passing or failing for P96**.

## Retained blockers instead of fabricated analytics

1. No approved Chef analytics aggregate/KPI endpoint.
2. No approved preset/custom date-range request semantics, timezone contract, or validation rules.
3. No backend-defined earnings time-series/bucket contract.
4. No authoritative date-ranged order-status metrics aggregate.
5. No item-performance/top-items contract or ranking semantics.
6. No new/returning-customer analytics contract.
7. No Chef rating/review analytics contract.
8. No prior-period comparison/delta/trend contract.
9. No report-detail/export analytics endpoint.
10. Existing orders/earnings/menu reads cannot truthfully substitute for these missing definitions.

## Phase boundary

P96 stops at the exact typed contract boundary. **P97 — Chef Analytics UI is NOT STARTED.** No chart UI, date-range controls, metric cards, drill-down routes, export action, or guessed analytics data is pre-implemented.
