# P104 — Chef Payout History UI / Withdraw Flow

**Branch:** `mobile-ui-rebuild-from-scratch`  
**Phase status:** **PARTIAL at full CRAVES Master Implementation Guide Reference-50 scope; exact authorized mobile UI boundary implemented**  
**Phase start HEAD:** `3c1981f7d5185d241d0d2b9b0d85a5d6edc753d3`  
**Implementation/code end:** `9c8f1780590e0004199694d1128a6b924d911544`

## Authorization and scope

The user explicitly authorized exactly the next phase after P103 and instructed that GitHub Actions capacity is exhausted. Per `plan.md`, `phases.md`, `agent.md`, `build.md`, and the 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, that phase is **P104 — Chef Payout History UI/Withdraw Flow**. No P105 subscription work is included.

Guide Reference 50 requires the Chef Payout History experience with Earnings Overview/Transactions tabs, earnings/payout/balance KPIs, recent payout, payout trend/date filters, transaction history, help, and a Withdraw Now action. It also requires authoritative balance/eligibility revalidation before withdrawal, idempotency, confirmation/authentication rules, clear mutation states, masked bank data, and reconciliation with the dashboard wallet.

P103 established that the current repository does **not** contain the exact approved Chef/APIM contracts needed for those server-owned payout capabilities. P104 therefore implements the real routed UI and interaction boundary while keeping every unsupported financial capability fail-closed. It does not fabricate values, routes, bank data, eligibility, or a money-movement success path.

## Authoritative inputs re-read

- `plan.md`
- `phases.md`
- `agent.md`
- `build.md`
- `docs/mobile-ui-rebuild/P103_CHEF_PAYOUT_CONTRACT_ELIGIBILITY.md`
- Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, Guide Reference 50 / source page 42 (`image50.jpeg`)
- `apps/mobile/src/features/chefPayout/domain/chefPayoutContract.ts`
- `apps/mobile/src/features/chefPayout/api/chefPayoutApi.ts`
- Existing Chef root/profile/header/navigation and design-token implementations

## Exact P103 contract boundary preserved

The following P103 facts remain authoritative in P104:

1. The backend Chef earnings ledger read is source-only for mobile because there is no approved APIM operation in this branch.
2. There is no Chef aggregate earnings-summary contract or period semantics.
3. There is no authoritative available/withdrawable balance contract.
4. There is no payout trend/time-series/date-bucket contract.
5. There is no Chef payout/settlement transaction-history or transaction-detail contract.
6. There is no Chef bank-destination/setup contract or approved masked-bank response model.
7. There is no Chef withdrawal eligibility/minimum/verification contract.
8. There is no Chef withdrawal-initiation endpoint, idempotency contract, confirmation/auth rule, or provider flow.
9. Current settlement operations are finance/admin-only; there is no Chef-readable settlement batch contract.
10. The current financial-ledger module explicitly performs no money movement.

## Implemented P104 boundary

### 1. Typed, registered route

- Added `ChefPayoutHistory: undefined` to `ChefProfileStackParamList`.
- Registered `ChefPayoutHistoryScreen` in the existing `ChefProfileNavigator` rather than creating a parallel navigator.
- Kept the standard Chef bottom tabs because Guide Reference 50 is a normal Chef subroute, not an immersive payment-execution surface.

### 2. Real navigation entry points

- Existing Chef Profile `Payouts` row now navigates to `ChefPayoutHistory`.
- Shared Chef menu exposes `Payout history`, allowing Dashboard -> Chef menu -> Payout History as an additional Reference-50 entry path.
- Back navigation returns through the existing Profile stack.
- No customer cart or customer navigation state is introduced into the Chef experience.

### 3. Reference-50 payout-history surface

Added a real screen containing the currently safe Reference-50 structure:

- Chef shared header and notification behavior.
- Back navigation.
- `Earnings Overview` and `Transactions` tabs with real local selected-tab state.
- Available-balance hero area.
- Earnings / Paid out / Balance KPI cards.
- Recent payout section.
- Payout-trend section.
- Date-range control with a real explanatory handler rather than invented date semantics.
- Transaction-history state.
- Protected financial-boundary banner.
- Payout help action.
- Refresh-payout-data explanatory action.
- `Withdraw Now` CTA rendered disabled with a clear reason.

No fake currency value, transaction row, chart point, payout status, bank account, payout reference, or locally calculated balance is rendered.

### 4. Explicit fail-closed presentation model

Added `chefPayoutHistoryBoundary.ts` to model the exact current UI state:

- `selectedTab` is real local UI state.
- `dateRange` is `null` until the server contract defines supported semantics.
- `earningsSummary` is `null`.
- `availableBalance` is `null`.
- `payoutSeries` is empty and not synthetic.
- `transactionsPage` is `null`.
- `withdrawEligibility` comes directly from the P103 fail-closed eligibility boundary.
- `withdrawState` is `blocked`.

Capability messages are sourced from the P103 contract model where possible so the UI does not maintain a contradictory second set of payout assumptions.

### 5. Withdrawal safety

P104 deliberately does **not** implement a withdrawal mutation because doing so would require inventing a financial contract. `Withdraw Now` remains disabled because:

- balance cannot be authoritatively refreshed,
- eligibility cannot be authoritatively refreshed,
- minimum/verification rules are undefined,
- there is no Chef initiation endpoint,
- idempotency semantics are undefined,
- confirmation/re-authentication rules are undefined,
- provider/money-movement outcomes are undefined.

This is the required safe behavior for the current repository boundary. No optimistic payout state or mock `pending/completed/failed` success path is created.

## Changed code files

- `apps/mobile/src/app/navigation/ChefRootNavigator.tsx`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/features/chefPayout/domain/chefPayoutHistoryBoundary.ts`
- `apps/mobile/src/features/chefPayout/domain/chefPayoutHistoryBoundary.test.ts`
- `apps/mobile/src/features/chefPayout/screens/ChefPayoutHistoryScreen.tsx`
- `apps/mobile/src/features/chefProfile/screens/ChefProfileScreen.tsx`
- `apps/mobile/src/features/chefShell/components/ChefHeader.tsx`

Evidence / ledger:

- `docs/mobile-ui-rebuild/P104_CHEF_PAYOUT_HISTORY_UI_WITHDRAW_FLOW.md`
- `build.md`

## Focused test source added

`chefPayoutHistoryBoundary.test.ts` verifies that:

- the screen model starts with no invented financial totals, balance, series, transactions, or date-range semantics;
- withdrawal remains `canWithdraw: false` / `blocked`;
- Overview/Transactions tab selection changes only local presentation state;
- server-owned payout fields remain unavailable after tab changes;
- UI explanations retain the approved-APIM boundary;
- no fabricated `/api/v1/chef/payout`, `/api/v1/chef/withdraw`, or `/api/v1/chef/bank` route is introduced through the P104 boundary.

## Validation / guard state

- `GitHub.compare_commits` from phase-start HEAD `3c1981f7d5185d241d0d2b9b0d85a5d6edc753d3` through code end `9c8f1780590e0004199694d1128a6b924d911544` is fast-forward and shows only the seven P104 code/test files listed above.
- The dedicated Profile follow-up commit diff was reviewed and contains only the Payouts-row copy update, `ChefPayoutHistory` navigation branch, and final newline normalization; existing profile, logout, role-switch, business information, metrics, and settings logic is unchanged.
- No dependency, customer-screen, backend, APIM, OpenAPI, database, infrastructure, secret, payout-provider, or settlement-admin change was made.
- No runtime call was added for the source-only Chef earnings route.
- No payout arithmetic or financial aggregation was added.
- Focused Jest test **source** was added, but Jest execution is not claimed from this connector-only implementation run.
- GitHub Actions are intentionally not used as a P104 pass/fail signal because the user states the account's monthly Actions capacity is exhausted and explicitly authorized continuing without it.
- Full dependency installation, strict TypeScript execution, ESLint execution, Jest execution, Android production build, emulator/device behavior, and performance profiling are **not recorded as passing or failing** for this connector-only P104 run.

## Visual verification limitation

The authoritative 183-page guide was available and Guide Reference 50 was read. The File Library representation identified source page 42 / `image50.jpeg`, but the direct source-document image could not be surfaced for page 42 through the available multimodal file view in this run. Therefore exact pixel-to-image validation is **not claimed**. The implementation follows the Reference-50 component hierarchy and the existing Craves shared tokens/shell patterns without inventing visual financial data.

## Why P104 remains PARTIAL

P104 cannot honestly satisfy the full Guide completion gate until the exact production contracts exist for:

1. approved APIM exposure/read path;
2. earnings/payout summary and period semantics;
3. available/withdrawable balance;
4. payout trend/date buckets;
5. payout transaction history and detail;
6. masked bank destination;
7. withdrawal eligibility/minimum/verification;
8. withdrawal initiation and idempotency;
9. confirmation/re-authentication/provider state machine;
10. dashboard-wallet reconciliation of authoritative payout mutations;
11. complete loading/refresh/pagination/offline lifecycle backed by those APIs;
12. direct Reference-50 pixel verification and Android runtime verification.

Until then, displaying fabricated money or enabling Withdraw would violate the master guide, repository precedence rules, and financial safety requirements.

## Phase boundary

**P104 is the only phase implemented in this run.**

**Next phase in sequence:** **P105 — Chef Subscription Contract — NOT STARTED**.  
**Next phase authorization:** **NONE**.  
**Required action:** Stop after P104. Do not pre-implement P105 without explicit user direction.
