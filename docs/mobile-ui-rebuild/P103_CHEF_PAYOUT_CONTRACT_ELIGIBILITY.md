# P103 — Chef Payout Contract and Eligibility

**Status:** PARTIAL at full Guide/product-contract scope; exact current repository/backend boundary is modeled fail-closed  
**Guide ref:** 50 — Chef Payout History (source page 42 / embedded `image50.jpeg`)  
**Phase start commit:** `8d03d99bb365b3428c84311666fca1aaaa9dae75`  
**Implementation/code end:** `05b3d1cdcfa9de611bed3b0e51f4f12770714a26`  
**GitHub Actions:** not claimed; the user reported the account's monthly Actions capacity is exhausted and explicitly authorized continuing without treating Actions as a phase failure.

## Guide-required payout contract

Reference 50 requires authoritative state/contracts for:

- earnings summary and available balance;
- payout trend/time series;
- payout/transaction history and transaction detail;
- masked bank destination;
- withdrawal eligibility;
- withdrawal initiation with confirmation/idempotency/authentication requirements;
- pending/completed/failed withdrawal states and Dashboard balance reconciliation.

The Guide requires available balance and eligibility to be refreshed immediately before payout and forbids exposing full bank details.

## Exact current contract audit

The current branch contains one Chef-role financial read in Integration Service:

- `GET /api/v1/chef/earnings?limit={1..500}`
- role enforcement: `CHEF`;
- response: `List<EarningResponse>`;
- backend financial fields: `grossAmount`, `commissionAmount`, `taxWithheldAmount`, signed `adjustmentAmount`, `netPayable`, three-character `currency`;
- exact earning statuses from the persisted schema: `DRAFT`, `APPROVED`, `SETTLEMENT_PENDING`, `SETTLED`, `REVERSED`;
- exact order sources: `ON_DEMAND`, `SUBSCRIPTION`.

The Chef read returns allocation-ledger rows only. It does not define aggregate earnings totals, available/withdrawable balance, payout trend buckets, settlement/payment-provider transactions, bank destination, withdrawal eligibility, withdrawal initiation, or transaction-detail semantics.

The financial-ledger module explicitly documents that no API in the module sends money. Settlement creation/status operations are ADMIN-only. The module README also lists APIM exposure as a later manual step; repository search found no approved APIM operation for `/api/v1/chef/earnings` on the current branch. Therefore P103 does **not** add a runnable mobile HTTP call even for the ledger source.

## Implemented boundary

- Added a typed Chef earning-ledger source model matching the exact backend `EarningResponse` financial surface.
- Financial amounts are normalized as canonical two-decimal strings for presentation/reconciliation only; mobile performs no payout/accounting arithmetic.
- The parser validates UUIDs, currency, source/status enums, timestamps, financial value shape, row uniqueness, and the server-supported 1–500 limit boundary.
- `chefIdentityId` is validated from the response contract but not exposed in the mobile-facing ledger entry because the authenticated Chef does not need that identifier for this screen.
- Added a Guide-50 capability model for earnings summary, available balance, payout series, payout transactions, bank destination, withdrawal eligibility/initiation, and transaction detail.
- Every unsupported Guide capability fails closed with `BACKEND_CONTRACT_UNAVAILABLE` and a precise reason.
- The existing earnings read is classified only as a **source-only backend ledger boundary**, not as a payout/balance contract and not as an APIM-authorized runtime mobile client.
- Added `getChefWithdrawEligibilityBoundary()`, which deterministically returns `canWithdraw: false` until exact Chef-role eligibility and initiation contracts exist.
- No bank account/routing/UPI field is modeled or inferred. Any future bank destination contract must provide an approved masked representation.
- No P104 screen/navigation/query/UI work was started.

## Changed mobile files

- `apps/mobile/src/features/chefPayout/api/chefPayoutApi.ts`
- `apps/mobile/src/features/chefPayout/api/chefPayoutApi.test.ts`
- `apps/mobile/src/features/chefPayout/domain/chefPayoutContract.ts`
- `apps/mobile/src/features/chefPayout/domain/chefPayoutContract.test.ts`

Evidence/ledger:

- `docs/mobile-ui-rebuild/P103_CHEF_PAYOUT_CONTRACT_ELIGIBILITY.md`
- `build.md`

## Focused test source

`chefPayoutApi.test.ts` covers:

- exact supported ledger status/financial parsing;
- canonical two-decimal financial representation without recomputation;
- rejection of unsupported statuses, malformed money, negative non-signed financial fields, and duplicate ledger IDs;
- exact 1–500 request-limit boundary.

`chefPayoutContract.test.ts` covers:

- the earnings source remains `source-only`;
- all missing Guide-50 payout capabilities remain fail-closed;
- available balance is not derived from ledger rows;
- withdrawal eligibility cannot become true without an exact contract;
- no fabricated payout/withdraw/bank/settlement Chef endpoint is present.

## Validation / guard state

- `GitHub.compare_commits` from phase-start HEAD `8d03d99bb365b3428c84311666fca1aaaa9dae75` through code end shows five fast-forward P103 code/test commits and exactly the four new `apps/mobile/src/features/chefPayout/**` files.
- The P103 runtime source contains no `httpClient`, Axios, fetch, mutation, navigation, screen, query-cache, package/dependency, backend, APIM, OpenAPI, infrastructure, database, or server-source change.
- Exact backend sources audited: `ChefFinancialController.java`, `ChefFinancialModels.java`, `ChefFinancialService.java`, `ChefFinancialRepository.java`, `V105__chef_financial_ledger.sql`, and the module README.
- Repository-wide exact-path search did not identify an approved APIM operation for the Chef earnings route; the module README itself lists exposing the named APIs through guarded APIM operations as a later manual step.
- Focused Jest test source was added, but Jest execution is not claimed from this connector-only run.
- GitHub Actions are intentionally not used as a P103 pass/fail signal because the account's monthly Actions capacity is exhausted and the user explicitly authorized continuing without it.
- Full workspace dependency install, strict TypeScript, ESLint, Jest execution, production Android bundle, emulator/device behavior, and Reference-50 visual comparison are **not recorded as passing or failing for P103** from this connector-only implementation run.

## Retained blockers instead of fabricated payout behavior

1. No approved APIM mobile exposure for the existing Chef earnings ledger read is present in the current branch.
2. No Chef aggregate earnings-summary contract or period semantics.
3. No authoritative available/withdrawable balance contract.
4. No payout trend/time-series/date-bucket contract.
5. No Chef payout/settlement transaction-history or transaction-detail contract.
6. No Chef bank destination/setup contract and therefore no approved masked-bank response model.
7. No withdrawal eligibility/minimum/verification contract.
8. No Chef withdrawal initiation endpoint, idempotency contract, confirmation/auth rule, or payout-provider flow.
9. No Chef-readable settlement batch contract; current settlement APIs are restricted to finance/admin roles.
10. The current financial-ledger module explicitly performs no money movement.

## Phase boundary

P103 stops at the exact typed financial source and fail-closed eligibility boundary. **P104 — Chef Payout History UI/Withdraw Flow is NOT STARTED.** No payout screen, KPI aggregation, balance, chart, bank row, Withdraw CTA, transaction detail, or mutation was pre-implemented.
