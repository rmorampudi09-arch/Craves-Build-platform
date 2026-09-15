# Chef ledger implementation milestone

Source: **Craves Ledger Development Reference v1.0, 13 September 2026**. Reviewed repository baseline: `1715746c6d2f3e38c59eef9a8bfe41bdd82529ea`. Development branch: `feat/chef-ledger-controls-20260913`; pull request: **#340**.

## Release status

This is a tested financial foundation and legacy-settlement safety milestone, not the entire 23-section target module. It is not a production activation. The document's **Existing / Local only / Target / Open** distinctions remain important.

New journal posting defaults **OFF** through `craves.ledger.posting-enabled=false`. There is no new provider payout executor, refund executor, delivery booking, automated earning consumer or deployment in this change. Existing manual allocation requests are not silently changed to 7%. No customer uplift, platform charge, delivery subsidy, compensation, tax or subscription policy is activated.

## Implemented code

| Component | Implemented behavior | Boundary |
|---|---|---|
| `LedgerMoney` | Exact-paise INR validation, decimal-string conversion, deterministic largest-remainder allocation with lexical tie-breaks | Other currencies are rejected, not silently rounded as INR |
| `TieredPricingPolicy` | Immutable resolved policies; progressive and explicit whole-amount bands; optional ceiling; flat 7% helper; SHA-256 policy snapshot | Order-time storage, effective-date registry and live selection are not connected |
| Customer ceiling helper | Separate per-unit 8/6/5/4 marginal proposal with a 50-rupee cap; prices above the ceiling rejected | Simulation only, not catalog or checkout activation |
| Chef preview API | `POST /api/v1/admin/chef-fee-policies/preview`, finance roles only, decimal-string results, `simulation=true`, `activated=false` | Backend route and OpenAPI exist; no APIM deployment or admin UI is claimed |
| `LedgerJournal` | Typed, balanced economic content, canonical identifiers and explicit debit/credit dimensions | An internal contract, not a customer/chef posting endpoint |
| `LedgerPostingService` | Transactional journal, event inbox and outbox; advisory locking; business-key replay; persisted content conflicts; exact linked full reversals | Callers must verify authoritative financial eligibility before invoking it; no such production consumer is added yet |
| V121 | Accounts, journal, inbox/outbox and conflict tables; exact paise and currency checks; deferred balance checks; immutable committed lines | No historical balances are synthesized |
| V122 | Paid earning and audit protection; historical settlement membership; active reservation uniqueness; release on definitive terminal state; one chef per legacy batch | New per-beneficiary payout instruction/attempt workflows remain a later step |
| V123 | Posting without UPDATE permission on immutable journal headers | Migration owner, application writer and reporter grants must still be established in the deployed database |
| Conflict advice | Database state conflicts return 409 without SQL/account details; unrelated database errors remain generic 500 | No claim that another chef's record exists is exposed |

### Correctness examples

The calculator produces 25.83 on a chef gross of 369.00 and an estimated 343.17 before separate tax, withholding or adjustments. Two units at 369.00 produce a chef-order gross of 738.00 and fee 51.66. A 1.50 base produces 0.11 using HALF_UP once.

The reference's customer 369.00 example has a progressive ceiling of 26.14; 395.00 is allowed and 399.00 is rejected by the simulation helper. These numbers do not approve a customer price change.

A stored journal for the worked 434.00 fulfillment fixture balances customer funds against chef payable 343.17, chef fee revenue 25.83, uplift revenue 26.00 and delivery revenue 39.00. The test is a fixture, not a recorded Craves order or tax determination.

## Settlement compatibility and safety

V105 is unchanged. V122 replaces its global `earning_entry_id` uniqueness with a partial unique active reservation while retaining the original `(batch_id, earning_entry_id)` historical identity. Failed, cancelled and settled historical memberships are backfilled inactive. New active membership is permitted only for the matching approved earning, chef, amount and currency.

The existing repository can still perform its manual workflow. When a batch reaches FAILED, CANCELLED or SETTLED, its reservation is released transactionally without deleting membership. Concurrent new batches cannot reserve the same earning. A failed/cancelled batch may be followed by a new one without recalculating the original commission.

The unsafe multi-beneficiary legacy settlement shortcut is rejected. New legacy batches must contain one chef. Preexisting multi-chef DRAFT batches require reviewed cancellation and separate grouping; submitted batches must first reconcile real transfer outcomes. Do not relabel UNKNOWN as FAILED to bypass a hold. This guard is not a substitute for the later per-beneficiary instruction model with partial batch outcomes.

Settled earning records, original money/ownership fields and audit evidence cannot be rewritten through ordinary DML. A future adjustment/recovery workflow must create new journaled entries rather than changing paid history. That workflow is not yet implemented here.

## Posting contract and transaction boundary

`LedgerPostingService.post` must run inside its Spring transaction. It performs no provider network calls. The economic hash deliberately excludes a transport event ID and retrying actor; a new message carrying the same economic context resolves to the same journal. Line sequence, source, amount, ownership dimensions, source time and evidence are part of the economic context.

A repeated business key with changed content returns `CONFLICT` after recording a conflict. Consumers must **commit that result, create no projection or payout, and stop processing that event**. Throwing after receiving CONFLICT inside an enclosing transaction would roll back the conflict evidence. A normal POSTED result must be combined with any future earning projection and payout-eligibility outbox writes in the same local transaction.

The database verifies that a journal is nonempty and balanced at commit. It forbids changing or deleting posted lines and prevents inserting additional lines after the header's creation transaction has committed. V122 stamps the transaction marker itself. V123 removes an unnecessary row lock so INSERT/SELECT-only posting credentials can work without UPDATE rights on immutable headers.

The outbox currently stores durable posting notifications but has no publisher worker. Its existence is not evidence that an external event was delivered. No balances, company profit, bank settlement or chef statement should be inferred from empty or partially populated journal tables.

## Verification and evidence

The isolated `Chef Ledger CI` uses Java 21, Maven and PostgreSQL 16. Its database URL must match `jdbc:postgresql://localhost:<port>/chef_ledger_test`; the destructive database fixtures refuse other targets. The test database and role are disposable CI-only resources, not production credentials.

The suite explicitly requires every new finance test class to execute without skips. It runs the entire Integration Service regression suite as well. Existing document/delivery-feedback database tests may still skip when their separate database environment variables are not configured; those skips are reported, not described as passes.

Verified intermediate run `34772340443`, commit `dc885aebf92d694f781b9a3520d7c112f81395dd`: **243 tests, 230 passed, 0 failures, 0 errors, 13 existing skips; all 40 new finance tests passed**. Later commits add application-role, migration-upgrade and safe-error tests. Use the final head-SHA CI artifact for final counts; do not reuse an earlier green run to approve a newer revision.

Reports include:
- `LedgerMoneyAndPolicyTest`: calculator, boundaries, caps, immutable value snapshots, rounding, allocation and balanced fixture.
- `FinancialPostingDatabaseTest`: repeated/concurrent events, conflicting keys, commit constraints, immutable history, reversal and disabled-writer behavior.
- `ChefSettlementHistoryDatabaseTest`: failure/cancellation reuse, paid-history protection, one-beneficiary guard, concurrent reservation and terminal history.
- `FinancialFullMigrationDatabaseTest`: complete Flyway chain in the configured `payment_schema`, validation/re-run, and upgrade from V120 with a real historical failed-batch fixture.
- `FinancialPostingPrivilegesDatabaseTest`: insert-only non-superuser posting/replay, denied history mutations and database-owned transaction marker.
- `ChefFeePreviewServiceTest` and `ChefFinancialConflictAdviceTest`: finance role checks, string amounts, bad inputs and safe HTTP conflicts.

## Reference acceptance coverage, without overclaiming

The reference's T01-T44 matrix describes a completed system. The number of automated test methods in this PR is **not** a claim that all 44 reference scenarios are complete.

| Reference area | Current coverage |
|---|---|
| T01-T03, T05-T07 | Fee calculation/validation covered; automatic earning creation remains pending |
| T04 | Immutable policy value tested; accepted-order persistence and policy changes over a real order lifecycle are pending |
| T08-T10 | Existing manual amount path remains; largest-remainder helper exists, but canonical multi-chef finalization/capture wiring is pending |
| T11-T13 | Posting-core replay, concurrent duplicate and conflict handling tested against PostgreSQL; authoritative delivery consumer still pending |
| T14-T15 | Database balance/currency/immutability and restricted application-role posting covered |
| T16-T17 | Legacy settlement history-preserving reuse and concurrent reservation covered; future instruction allocation model pending |
| T18-T20 | Unknown transfer reconciliation and partial multi-beneficiary outcomes pending; unsafe legacy multi-beneficiary shortcut is blocked |
| T21-T35 | Delivery attempt/cost, partial refund, claims, compensation and bank/gateway workflows remain unimplemented in this milestone |
| T36 | Pure customer-price ceiling validation covered; catalog publication/checkout integration pending |
| T37-T42 | Add-more, campaigns, checkout fee allocation, subscription allocation and new chef statement ownership tests pending |
| T43 | Existing failed-batch history survives migration with no invented journal entries; approved opening-balance import/replay remains pending |
| T44 | Projection reconstruction and full account/statement reconciliation pending |

## Required next implementation work

1. Add canonical accepted-order financial snapshots with separate chef/customer item prices, complete policy resolution and immutable acceptance hash. Preserve null historical snapshots. Integrate the 7% calculator at binding order pricing, not the manual DRAFT creation time.
2. Add an authoritative Order Service financial-eligibility outbox event after successful delivered transition. Verify captured payment, source order/checkout identity, chef ownership, currency, snapshot/hash and event version. Atomically post the normal earning, update the compatibility projection and enqueue payout eligibility.
3. Add beneficiary-versioned payout instructions, allocation reservations, attempts, UNKNOWN reconciliation and confirmed settlement postings. Build chef statements from journal movements and approved opening balances. Do not enable automatic money movement merely because this foundation builds.
4. Implement commercial delivery attempt identities, ambiguous Borzo failure handling, provider invoice/charge matching, incremental variance posting and wallet settlement evidence. Existing operational retries must not be treated as commercial attempts.
5. Implement cumulative partial-refund reservation, responsibility allocations, paid-order adjustments, compensation and partner claims; connect gateway/bank statement reconciliation without double-counting refunded money or recoveries.
6. Complete validated catalog/checkout uplift and quote/subsidy pricing, same-chef benefits, funded promotions, APIM contracts and UI. Keep subscriptions PENDING_POLICY until their allocation policy is approved.

These are implementation gaps, not all external blockers. The document additionally leaves O01-O12 open (tax/withholding, customer pricing, reserves/operating assumptions, delivery floor/cap, compensation, payout contract, provider invoice/offset rights, tolerance/aging/write-offs, refund components, subscription allocation and statutory export mapping). Record explicit approvals without silently converting examples into live settings.

## Release and rollback guardrails

Before merging or deployment, refresh main, review the PR diff and final CI, and run `scripts/finance/chef-ledger-preflight.sql` using a read-only approved database session. Confirm the actual Integration database, Flyway history, outstanding legacy batches and database role grants. A green CI run proves neither production migration nor bank reconciliation.

The uploaded reference mentions an **uncommitted local migration also named V121**. That diff has not been imported. If it has since been applied anywhere, stop: compare checksums and create a reviewed forward migration. Never replace an applied V121 or force Flyway repair to make unrelated SQL appear compatible. If it is still uncommitted/unapplied, rebase and renumber that local change when integrating it.

Do not enable journal posting for real economic events until the authoritative producers, projections, opening scope and financial policies are complete. The preview endpoint requires a reviewed APIM operation and finance-role-preserving routing before gateway exposure; this PR does not change APIM.

Rollback disables new producers/workers and retains tables, journal entries, audits, historical batch membership and successful transfers. Do not drop ledger tables, re-add the old global settlement-item uniqueness after rebatching, reactivate released historical reservations, reverse paid statuses or replay settled payouts. Once V122 is applied, legacy batches are intentionally single-beneficiary; an older application image must tolerate that guard or be held from finance writes.
