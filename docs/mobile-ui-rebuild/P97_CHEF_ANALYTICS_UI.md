# P97 — Chef Analytics UI

**Status:** PARTIAL at full Guide completion scope; the real Analytics tab UI is implemented fail-closed at the exact P96 backend-contract boundary  
**Guide ref:** 46 — Chef Analytics (source page 38 / embedded `image46.jpeg`)  
**Phase start commit:** `5efa20a775bee8c379eee099027cfb7b301d4c03`  
**Implementation/code end:** `334cf163ff935ee4bbcc192e2679a5b8297a2852`  
**GitHub Actions:** not claimed; the user reported the account's monthly Actions capacity is exhausted and explicitly authorized continuing without treating Actions as a phase failure.

## Guide requirement reviewed

Reference 46 requires the Chef Analytics experience to provide:

- the Chef header/menu, title/subtitle, notification access, and existing Chef bottom navigation;
- preset/custom date-range controls;
- KPI cards for earnings, orders, items sold, average order value, new customers, and rating;
- earnings series/chart presentation;
- order-status breakdown/donut presentation;
- top-selling item ranking;
- detailed report/export or drill-down where supported;
- consistent date range, timezone, currency, and comparison semantics across all analytics surfaces;
- explicit loading/empty/error/offline behavior and accessible chart summaries;
- non-blocking chart/date transitions that respect reduced motion.

The reference production prompt identifies the visual reference state as **this week** and explicitly forbids inventing missing backend contracts or fabricated data.

## P96 boundary retained

P96 proved that the current branch has no approved Chef analytics summary, date-filter, time-series, status-aggregate, item-performance, customer, rating, comparison, or report-detail/export contract.

P97 therefore does **not**:

- synthesize KPI totals from raw Chef Orders/Earnings/Menu reads;
- infer average order value, customer counts, ratings, top-item rank, status percentages, or comparison trends;
- create a fake `/analytics` URL or query model;
- assign guessed server date boundaries, timezone semantics, range validation, or comparison periods;
- render zero values or decorative chart points that could be mistaken for real analytics.

## Implemented UI boundary

- Replaced the generic Analytics route boundary with a real `ChefAnalyticsScreen` on the existing typed Chef `Analytics` tab.
- Reused `ChefHeader`, design tokens, existing icons, safe-area handling, and the stable Chef bottom-tab shell rather than creating a parallel route/navigation layer.
- Added the six Guide-required KPI positions: Earnings, Orders, Items sold, Average order value, New customers, and Rating.
- KPI values and trends remain explicitly unavailable (`—` plus an explanation) rather than displaying fabricated zeroes or estimates.
- Added reference-only `This week` and `Custom` range chips. They intentionally contain no request value/date bounds/timezone/comparison semantics and are disabled while the date-range contract is unavailable.
- Added earnings-chart, order-status, top-selling-items, and detailed-report sections using explicit unavailable states. No fake series, percentages, item ranking, or export action is produced.
- The detailed-report control is visibly disabled with an accessibility hint/reason rather than an empty handler.
- Added screen-reader summaries for unavailable KPI/chart/list states; visual placeholders are excluded from accessibility where they contain no data.
- The blocked screen has no chart/KPI animation. This avoids blocking motion and is inherently reduced-motion safe until an authoritative series exists.
- The existing Chef tab policy keeps Analytics mounted across tab changes, preserving its local reference-state/scroll state under the current navigation architecture.

## Presentation model

`chefAnalyticsPresentation.ts` separates Guide presentation slots from transport/business semantics:

- all six KPI values and trends are typed as `null` at the current boundary;
- earnings series, order-status breakdown, top items, comparison period, and detailed report availability remain absent;
- the selected `this-week` value is explicitly a reference-state presentation label, not a backend query enum;
- `dateRangeInteractionAvailable` remains false while the P96 contract is blocked;
- inaccessible dash-only states are supplemented with meaningful screen-reader explanations.

## Changed mobile code files

- `apps/mobile/src/features/chefAnalytics/domain/chefAnalyticsPresentation.ts`
- `apps/mobile/src/features/chefAnalytics/domain/chefAnalyticsPresentation.test.ts`
- `apps/mobile/src/features/chefAnalytics/screens/ChefAnalyticsScreen.tsx`
- `apps/mobile/src/app/navigation/ChefRootNavigator.tsx`

Evidence/ledger:

- `docs/mobile-ui-rebuild/P97_CHEF_ANALYTICS_UI.md`
- `build.md`

## Focused test source

`chefAnalyticsPresentation.test.ts` covers:

- all six Guide KPI slots remain present while numeric values/trends stay absent;
- no `value: 0` fallback is manufactured;
- earnings series, status breakdown, top items, comparison period, and report availability remain unavailable;
- range labels carry no `from`, `toDate`, `timezone`, or `comparison` request semantics;
- date-range interaction remains disabled;
- unavailable KPI states expose an accessible explanation.

## Validation / guard state

- `GitHub.compare_commits` confirms implementation/code end `334cf163ff935ee4bbcc192e2679a5b8297a2852` is six fast-forward commits ahead of the P96 ledger HEAD `5efa20a775bee8c379eee099027cfb7b301d4c03` and changes only the four P97 mobile files listed above.
- No `services/`, `openapi/`, `infra/`, APIM, backend/controller, deployment, workflow, package/dependency, customer, or P98+ Chef source changed in the implementation diff.
- Local TypeScript 5.8.3 `transpileModule` parse checks emitted zero diagnostics for the P97 presentation source, focused test source, and `ChefAnalyticsScreen.tsx` source.
- A local strict TypeScript check of the P97 presentation model against the P96 contract shape emitted zero diagnostics.
- Focused Jest source exists, but project Jest execution is not claimed from the connector-only repository environment.
- GitHub Actions are intentionally not used as a P97 pass/fail signal because the account's monthly Actions capacity is exhausted and the user explicitly authorized continuing without it.
- Full workspace dependency installation, project TypeScript 6.0.3 strict build, ESLint, Jest execution, Android bundle/build, emulator/device behavior, and pixel-level Screen-46 visual comparison are **not recorded as passing or failing for P97**.

## Why full P97 remains PARTIAL

The Guide's populated/interactive Analytics acceptance cannot be truthfully completed until the backend defines:

1. authoritative Chef analytics KPI aggregates and formulas;
2. preset/custom range request semantics, timezone, validation, and comparison logic;
3. earnings time-series buckets;
4. date-ranged order-status metrics;
5. item-performance/top-items ranking;
6. new/returning-customer metrics;
7. Chef rating/review metrics;
8. comparison-period deltas/trends;
9. report detail/export/drill-down contracts.

Because no analytics request can currently be issued, range-change cancellation/deduplication has no real request path to exercise. The controls stay disabled instead of pretending that a request occurred. Because no authoritative series exists, chart-draw/KPI-number animation is not started; the blocked UI introduces no animation and therefore does not violate reduced-motion requirements.

## Phase boundary

P97 stops at the exact truthful Chef Analytics UI boundary. **P98 — Chef Account Profile is NOT STARTED.** No Profile/account/business/payout/subscription work is pre-implemented.
