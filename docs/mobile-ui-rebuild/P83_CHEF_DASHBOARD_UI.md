# P83 — Chef Dashboard UI

## Status

**DONE at authorized code/CI scope.**

P83 implements only the Guide Reference 38 Chef Dashboard UI on `mobile-ui-rebuild-from-scratch`. P84 Chef Order Detail Contract and all later Chef phases remain unimplemented.

## Authorization and baseline

- Phase authorized by the user: **P83 only**.
- P83 start/control commit: `9e9eafd2d6aa76d229619cde966a9890a470cf0d`.
- P82 was already **DONE at authorized code/CI scope** before P83 started.
- P82 data boundary is reused; P83 does not introduce new backend/APIM/infrastructure contracts.

## Implemented UI boundary

The Dashboard tab now renders a real Chef dashboard instead of the P80 structural placeholder:

- shared Chef header and notification behavior from P81;
- time-of-day greeting using the authenticated Chef display name;
- wallet card with explicit unavailable balance and disabled Withdraw because P82 proved the required payout eligibility/initiation contract is absent;
- four order KPI cards backed by the authoritative P82 order model: new, active, ready, and total;
- sales overview surface with a working local 7/30/90-day selector and an explicit unavailable state instead of invented chart values;
- quick actions that route only to already registered Chef tabs: Orders, Menu, Analytics, Profile;
- active-order loading, error/retry, empty, and populated states backed by the existing Chef operational order source;
- recent-reviews unavailable state because no approved Chef reviews read model exists;
- business-insight unavailable state because no approved insight contract exists;
- pull-to-refresh across the existing P82 dashboard sources;
- existing Chef bottom navigation retained; no Customer cart chrome is introduced.

## Navigation / no-fabrication boundary

P83 does not create P84 order-detail ownership. Active-order cards route to the existing Orders workspace rather than inventing an order-detail route or contract before P84.

The following Reference-38 capabilities remain explicit contract gaps and are not represented with fake data or fake mutations:

- authoritative wallet/withdrawable balance;
- payout eligibility, destination, or withdrawal initiation;
- sales analytics aggregate/time series;
- Chef recent reviews read model;
- Chef business insights.

## Files changed

- `apps/mobile/src/features/chefDashboard/screens/ChefDashboardScreen.tsx`
- `apps/mobile/src/features/chefDashboard/domain/chefDashboardPresentation.ts`
- `apps/mobile/src/features/chefDashboard/domain/chefDashboardPresentation.test.ts`
- `apps/mobile/src/features/chefDashboard/domain/chefDashboardModel.ts`
- `apps/mobile/src/features/chefDashboard/domain/chefDashboardModel.test.ts`
- `apps/mobile/src/app/navigation/ChefRootNavigator.tsx`

## Validation

**Validated P83 mobile code head:** `36d5650cb7648f3f8eaf899ce796615da832e88b`.

**GitHub Actions:** workflow run `31304732867`, job `93223151270` — **SUCCESS**.

Passed gates:

- dependency install from lockfile;
- TypeScript strict check;
- ESLint;
- Jest;
- production Android JavaScript bundle;
- backend/APIM/infrastructure source guard.

An earlier P83 implementation commit exposed one React Native style typing mismatch during TypeScript validation. It was corrected inside P83; run `31304732867` is the replacement authoritative green validation.

No per-phase APK/AAB was built, consistent with project policy. Physical Android/reference-image certification remains a later visual-QA gate; this evidence does not claim pixel-perfect device certification.

## Handoff

- Current completed phase: **P83 — Chef Dashboard UI — DONE at authorized code/CI scope**.
- Next phase in sequence: **P84 — Chef Order Detail Contract — NOT STARTED**.
- Next phase authorization: **NONE**.
- Required action: **stop after P83; do not pre-implement P84 without explicit user direction.**
