# Craves finance automation — current implementation and release gate

Updated 14 September 2026, Asia/Kolkata. Repository: `rmorampudi09-arch/Craves-Build-platform`. Development branch: `feat/chef-ledger-controls-20260913`, draft PR **#340**. Main baseline: `1715746c6d2f3e38c59eef9a8bfe41bdd82529ea`.

This is the current guide. `CHEF_LEDGER_IMPLEMENTATION.md` records the earlier foundation milestone; its old test counts and descriptions of missing UI/payout classes are historical, not the current implementation inventory.

## Plain-language release status

The branch contains a working, tested **policy/admin/payout engine**. It is **not a production-activated end-to-end ledger**. A payout instruction is a reserved obligation, not a bank confirmation. A policy switch is configuration, not proof that an upstream order was paid and delivered. The worker cannot use arbitrary administrator-entered earnings as available money.

The missing accepted-order snapshot and authoritative captured-payment/delivered-order producer remain an engineering release blocker. `recordDeliveredPayable` is an internal integration hook and is exercised with database fixtures; no live order consumer calls it yet. Existing production chef earnings therefore do not automatically appear in the new balance screen. Do not make a manual INSERT or turn a certification flag on to bypass this dependency.

No production payout, refund, delivery booking, Azure deployment, replica change, resource creation or secret rotation was performed. The separate local-only fee worktree was not imported: the repository implementation remains the chosen development path. There is no need to ask the operator to locate that worktree merely to continue development. A deployment must still check whether a different V121 was ever applied to the actual database.

## User decisions now represented

| Decision | Implemented interpretation | Runtime boundary |
|---|---|---|
| Ledger starts today | Requested economic start is **2026-09-14 00:00:00 Asia/Kolkata**, equivalent to **2026-09-13T18:30:00Z**. The first activated start date is immutable even through off/on policy changes. | This does not assert that production records have been posted since midnight. Capture-only scope, historic outstanding liabilities and missing snapshots cannot be fabricated. |
| Automatic settlement in 48 hours | A delivered payable snapshots its due time as **delivery time + 48 elapsed hours**. A worker reserves matured unpaid amounts per chef and submits an instruction when configured and certified. | This is submission eligibility, not a guarantee of bank credit within exactly 48 hours, nor a gateway T+2 settlement setting. |
| Chef may request available balance once daily | The chef requests the full eligible, unreserved balance. Default manual availability delay is zero after successful delivery. One accepted manual request per chef per **India calendar day**. Automatic payouts do not consume that quota. | Capture, delivery, beneficiary verification, holds and source certification still apply. A definitive failure does not erase the day's accepted manual request. |
| Admin numbers and switches | Versioned finance policies, exact hash/revision activation, fee/tax fields, payout hours, cancellation seconds, subscription quote switch, beneficiary binding/hold controls and payout recovery screens. | Runtime certification and provider credentials are independent of UI switches. There is no claim of effective-dated city/chef overrides or a completed statutory accounting engine. |
| One-minute customer cancellation and full refund for eligible system cancellations | Pure rule helper allows customer cancellation for elapsed seconds **0 through 59**, not at 60. Authoritative chef rejection/acceptance timeout or final provider-caused order cancellation qualifies for the remaining full captured amount. | Existing order cancellation and refund execution have not been connected to this helper. A failed provider booking with safe fallback is not automatically final cancellation of the customer's order. |
| Subscription chef quotes and inclusive total | Preview uses explicit occurrence IDs and chef food bases, customer food prices, delivery estimates, component taxes and a platform fee allocated once across the purchase. | It is a simulation. Provider quote acquisition, accepted purchase persistence, occurrence allocation, consumption/refund handling and live subscription earning creation remain to be wired. |

The user approved full **customer refunds** for eligible cancellations. This must not silently be interpreted as approval to pay a chef a separate 50% or 100% cancellation compensation amount. Any chef compensation path remains separate from customer refund execution and the normal delivered earning.

## Tax verification, separated from product decisions

Public sources reviewed on 14 September 2026:

1. **CBIC Circular 167/23/2021-GST**, 17 December 2021: restaurant supplies through an e-commerce operator are addressed under section 9(5), including supplies by unregistered restaurants. It distinguishes the operator's own commission services and states that the operator issues the restaurant-service invoice. It does not make every component of an order subject to one tax rate. Source: https://cbic-gst.gov.in/pdf/Circular-167-17-12-2021-GST.pdf
2. **Ministry of Finance FAQ, 16 September 2025**, questions 15–17: local delivery is stated as taxable at 18%; who pays depends on the supplier/ECO relationship and registration status. Source: https://www.pib.gov.in/PressReleasePage.aspx?PRID=2167151
3. **CBIC Circular 164/20/2021-GST**, cloud/central kitchen clarification: cooking and supplying food through those models is treated as restaurant service at 5% without ITC. The published classification must be matched to the actual Craves supply; packaged goods or different supplies cannot inherit it automatically.

The draft's 5% restaurant and 18% service-component values are **candidate configuration**, not a statutory determination that all Craves contracts use those classifications. An actual delivery quote may already include provider tax. Never add that same procurement tax twice, confuse procurement cost with the customer delivery charge, or silently make provider tax part of chef commission.

Customer food GST and GST on Craves' fee to a chef are different components. The instruction that GST is collected separately from the customer does not establish whether the advertised **7% chef fee** includes its own GST. Both paths are implemented and tested, and neither is silently activated:

- Illustration at 18% fee tax, chef gross 369.00, **7% inclusive**: fee revenue 21.89, fee tax 3.94, total deduction 25.83, payable 343.17.
- Same illustration, **7% exclusive**: base fee 25.83, fee tax 4.65, payable 338.52.

These are exact arithmetic examples, not authorization to deduct either amount from real chefs. Finance must confirm classification, invoice ownership, whether the chef fee is inclusive/exclusive, CGST/SGST versus IGST, and applicable withholding. The current calculator does not implement a complete withholding or GST-return engine.

The requested customer experience can emphasize one tax-inclusive total on subscription cards. Retain the constituent prices and tax amounts in the accepted quote and show a transparent pre-payment detail/invoice view. The current admin simulation displays the total with an expandable breakdown; the actual customer subscription checkout remains unchanged.

## Razorpay verification and boundaries

The adapter targets RazorpayX bank payouts, not customer payment collection:

- `POST https://api.razorpay.com/v1/payouts` with a persisted instruction UUID in `X-Payout-Idempotency`, INR integer paise, the merchant's source account and a verified fund account.
- `GET https://api.razorpay.com/v1/payouts/{id}` for original-payout reconciliation.
- `GET https://api.razorpay.com/v1/fund_accounts/{id}` for provider identity/active-state checks. Active fund-account status is **not** proof of bank ownership or chef KYC.
- Signed payout webhook receiver: backend **`/api/v1/webhooks/razorpayx/payouts`**. APIM/public registration has not been deployed.

Official references: https://razorpay.com/docs/api/x/payouts ; https://razorpay.com/docs/api/x/payout-idempotency ; https://www.postman.com/razorpaydev/razorpay-public-workspace/request/mxsn0rr/create-payout-bank-account

Razorpay's current indexed API documentation requires payout idempotency and IP allowlisting. Public documentation establishes API capability, not permission on **Craves' merchant account**. No connected Razorpay account or Azure execution tool was available to inspect or activate those merchant/runtime settings in this session; plugin discovery returned no matching connector. Existing customer LIVE payment success is not evidence of RazorpayX activation, funding or permission for marketplace chef disbursements.

Razorpay Route linked-account settlements are a different flow from RazorpayX payouts. This release does not create Route transfers or debit both products for the same earning. Confirm that the merchant's approved payout/funding arrangement supports the Craves marketplace use case before activating the existing adapter. No new checkout payment key, key rotation or live payment test is required merely to inspect that arrangement.

## What the code actually does

### Policy and tax arithmetic

`services/integration-service/src/main/java/in/craves/integration/finance/FinancePolicy.java` validates complete settings, supplies the requested launch draft, and derives IST cutover/manual availability/automatic due times.

`FinancePolicyService.java` persists immutable versions, hashes content, serializes activation by revision and records actor/reason. Source certification, journal enablement and payout account certification are checked separately. V127 also preserves the original start date across disabling/re-enabling.

`FinanceCalculations.java` calculates separate chef service-fee tax, per-occurrence subscription components, deterministic checkout-level platform/tax allocation, cancellation eligibility and full remaining refundable amount. These functions do not themselves cancel orders, call payment/refund APIs or prove an actual provider quote.

### Payouts and recovery

`payout/ChefPayoutService.java` owns delivered-payable registration, owner-scoped balances, holds, per-day withdrawal quota, immutable beneficiary versions, concurrent reservations and worker leases. Its payable must match an immutable `CHEF_ORDER_EARNING` journal. Original money cannot be manually adjusted in place.

`payout/RazorpayXPayoutClient.java` uses Basic authentication only server-side, exact paise, a stable idempotency key, fixed Razorpay host, bounded timeouts and no HTTP redirects. Responses must match instruction reference, fund account, amount, currency and allowed state.

`payout/ChefPayoutWorker.java` is default-off. It reserves due chef balances and submits/reconciles in bounded passes. No network call occurs inside the reservation transaction. A lost response without a known provider ID remains `REVIEW_REQUIRED`; it is never resent using a fresh instruction. Known provider IDs can be polled. Low-balance queuing is currently false, IMPS is the current rail, and worker cadence is 30 seconds; those are implementation choices, not a throughput or bank-availability guarantee.

`payout/RazorpayXPayoutWebhookService.java` checks HMAC-SHA256 over raw bytes and event replay/content integrity. A verified callback can attach the original provider ID and enqueue GET reconciliation. A callback alone does not directly clear chef liability. Old intermediate notifications cannot regress PAID. A conflicting terminal event holds the chef and retains evidence.

`payout/FinancePayoutReconciliationService.java` adds finance-admin recovery using an **existing** payout ID. It makes a provider GET, rechecks state/identity under locks, refuses to override an active lease, and never contains a provider POST path. Confirmed success clears liability once. A confirmed post-payment reversal creates the exact linked inverse journal, preserves the original settlement reference, restores the outstanding liability and leaves the chef on hold before another payout.

### Database migration inventory

All migrations are additive relative to main V120. Never edit a migration already applied to any real environment.

| Migration | Purpose |
|---|---|
| V121 | Immutable balanced financial journal, accounts, inbox/outbox and conflicts. |
| V122 | Legacy settled-history protection, single-beneficiary batch guard and historical reservation release. |
| V123 | INSERT/SELECT-only journal writer compatibility. |
| V124 | Immutable policy versions and activation audit. |
| V125 | Beneficiary versions, payables, instructions, allocations, daily manual quota and audit. |
| V126 | Signed webhook inbox, deferred instruction-allocation balance and legacy/new-engine overlap guard. |
| V127 | Persistent cutover date, journal-backed payable validation, beneficiary ownership and payout state/proof guards. |
| V128 | Explicit null-safe failure evidence and consistent settlement/reversal proof fields. |

### Screens and API paths

- Admin entry: `apps/customer-web-next/src/app/admin/finance/page.tsx`, linked from `/admin`.
- Main controls: `src/components/finance-control-center.tsx`.
- Safe recovery: `src/components/finance-reconciliation-panel.tsx`.
- Chef balance: `src/app/chef/finance/page.tsx`, linked from `/chef/earnings`.
- Withdrawal panel: `src/components/chef-withdrawal-panel.tsx`.
- Existing BFF allowlist: `src/lib/finance-contract.ts` and `finance-bff.ts`.
- Recovery BFF: `src/app/api/admin/finance/payouts/[id]/reconcile/route.ts` and `src/lib/finance-reconciliation-contract.ts`.

Backend reads/writes exist under `/api/v1/admin/finance/settings`, `/policies`, `/policies/{id}/activate`, `/subscription-preview`, `/payouts`, `/chefs/{chef}/beneficiary`, `/chefs/{chef}/hold`, `/payouts/{id}/reconcile`, `/api/v1/chef/finance/balance` and `/withdrawals`. See controllers for method/DTO contracts. BFF mutations require same-origin JSON, bound request sizes, authenticated upstream access and validated responses. Money stays in decimal strings.

Admin recovery cannot mark money paid just by typing a reference: it must fetch matching provider evidence and produce the correct journal. No public generic journal-write endpoint was added. Existing chef historical earning and PDF-statement paths remain separate; they do not magically become new-engine statements after this change.

## Tests and evidence

Tests execute in GitHub Actions against an isolated PostgreSQL 16 container, Java 21 and Maven. Local container network restrictions prevented a separate Maven dependency download here; do not describe CI execution as a local or production test.

The earlier saved interruption head `f9f08e9d7ae208a2d6783bbb92a1ef72440aeaf4` had **309 Integration tests, 296 passing, no failures/errors and 13 existing skips**. Its 106 finance tests all passed. The recovery continuation adds ten database tests plus six web proxy tests. The exact final-head counts and workflow IDs belong in the PR and downloaded evidence, not in an invented success claim.

`Chef Ledger CI` now fails if any required finance class is missing or skipped, including signed-webhook recovery, new payout recovery and property tests. Two property methods exercise 10,000 distinct fee bases in both fee-GST modes and 10,000 deterministic allocation examples. Those are data cases inside two methods, not 20,000 separately executed test methods.

Coverage includes manual/automatic reservation races, stale client balances, ownership denial, one accepted request/day, failed/unknown/crashed payouts, raw webhook signature tampering, wrong amount/beneficiary/reference, late and out-of-order callbacks, unchanged paid history, linked reversals, restricted-role journal writes, whole migration chains, historical failed-batch upgrade, and off/on attempts to move the cutover date.

Not covered by these passing checks: merchant-authorized live payout execution, real bank/gateway statements, production APIM ingress, authenticated live browser acceptance, sustained load/chaos across the full platform, authoritative source wiring, actual customer cancellations/refunds or actual subscription checkout. No finite test suite proves zero possible future errors.

## Local verification — isolated test database only

Requirements: Java 21, Maven, Node 24, npm and a local Docker engine. Start a disposable database:

```bash
docker run --rm -d --name craves-finance-test -p 127.0.0.1:55432:5432 -e POSTGRES_DB=chef_ledger_test -e POSTGRES_USER=ledger_ci -e POSTGRES_PASSWORD=ledger_ci_local_only postgres:16
```

PowerShell from the repository root:

```powershell
$env:LEDGER_TEST_JDBC_URL = 'jdbc:postgresql://localhost:55432/chef_ledger_test'
$env:LEDGER_TEST_DB_USER = 'ledger_ci'
$env:LEDGER_TEST_DB_PASSWORD = 'ledger_ci_local_only'
mvn --batch-mode --no-transfer-progress -f services/integration-service/pom.xml verify
```

Tests deliberately DROP and recreate schemas in **this disposable database**. The URL guard refuses other host/database patterns. Do not point this at a tunnel to production, even with an allowed-looking localhost URL. The displayed password is a non-secret local fixture, not an Azure credential.

For web checks:

```powershell
Set-Location apps/customer-web-next
npm ci --ignore-scripts --no-audit --no-fund
npm run lint
npm run typecheck
npm run test
$env:CRAVES_API_BASE_URL = 'https://example.invalid/api/v1'
npm run build
```

The example build URL does not support an interactive finance session. A local interactive session needs the repository's existing auth and approved local service configuration. Do not paste API secrets into chat or commit them. After tests, stop only the disposable container: `docker rm -f craves-finance-test`.

## Manual steps required before a future release

### Finance and merchant account

- Confirm the actual GST/invoice classifications and inclusive/exclusive treatment of the 7% chef fee. Confirm applicable withholding; the code does not assume it is zero by law.
- Verify RazorpayX account entitlement for Craves chef payouts, source-account funding, transaction limits/fees, beneficiary bank ownership and the account's approval workflow. A provider dashboard may require the account owner to perform KYC/activation.
- Confirm approved outbound IPs before configuring Razorpay allowlisting. Do not replace working network/allowlist settings without checking the existing customer-payment traffic.

### Secrets and runtime configuration

Only once the release is approved, use existing Azure Key Vault/runtime secret references for these exact **new** keys:

| Key | Value source |
|---|---|
| `CRAVES_RAZORPAYX_KEY_ID` | Authorized merchant payout API key ID. Do not assume a working checkout key proves payout authorization. |
| `CRAVES_RAZORPAYX_KEY_SECRET` | Matching payout secret in approved secret storage. |
| `CRAVES_RAZORPAYX_ACCOUNT_NUMBER` | Merchant funding/source account reference, not a chef bank number. |
| `CRAVES_RAZORPAYX_WEBHOOK_SECRET` | Secret for the payout webhook registration. |

Current safe flags remain `CRAVES_FINANCE_AUTHORITATIVE_SOURCE_READY=false`, `CRAVES_LEDGER_POSTING_ENABLED=false`, `CRAVES_RAZORPAYX_PRODUCTION_APPROVED=false`, and `CRAVES_RAZORPAYX_WORKER_ENABLED=false`. Flipping a flag is not a substitute for implementing/certifying the source path. `CRAVES_RAZORPAYX_POLL_INTERVAL_MS` defaults to 30000.

### Azure, APIM and GitHub release

Use the existing `Craves-Dev-Service-Connection`; do not recreate it. Keep the existing one-replica/resource targets. No new Azure resources or scaling scripts are part of this change. A future container build/registry/deployment can incur normal usage charges; this continuation provisioned nothing.

Review and merge only after completing the engineering release blockers. Run the read-only `scripts/finance/chef-ledger-preflight.sql`, check actual Flyway checksums through V128 and resolve any separately applied local V121. Review active multi-chef legacy batches against actual transfer outcomes. Never label UNKNOWN as FAILED just to make a migration pass.

Register the new finance API operations in the existing APIM with existing finance/chef authorization rules and the exact raw-byte payout webhook route. Do not register or claim a working public webhook URL until deployed ingress has been verified. Then deploy only the reviewed services whose source changed, under the existing release controls; no seven-service blanket deployment is requested here.

No DNS/domain, Firebase provider, mobile app-store, signing-certificate or paid Azure resource action is required for this branch milestone.

## Engineering work still required — not manual work assigned to the user

1. Binding order-time financial snapshots containing separate chef/customer food prices, tax ownership, full approved policy and canonical chef identity.
2. An authoritative Order Service finalization producer/consumer verifying payment capture and delivered state, atomically posting the normal journal and payout eligibility. Current `recordDeliveredPayable` fixtures are not that producer.
3. A canonical opening-scope/cutover/replay process and complete new-engine chef statements that reconcile to journals; no invented historical revenue or payable.
4. Hook the new cancellation decision into the actual order workflow and cumulative refund reservation/provider execution. Add separately approved compensation, chargeback/refund holds, adjustments and recovery offsets.
5. Wire validated chef subscription quotes and provider delivery estimates into accepted customer purchases, actual occurrences, skips/credits/refunds and finalization. Preserve a total-led customer experience with transparent component evidence.
6. Provider/gateway/bank statement reconciliation, funded payout clearing, transaction-fee/tax recognition, operating exception monitoring and accounting/export mapping. A successful payout API response is not an end-of-day bank reconciliation.
7. Scope the environment/merchant release, validate APIM/authenticated browser behavior and run controlled provider sandbox acceptance before authorizing production disbursements. The adapter's current safety gate only permits certified live-key configuration; a dedicated safe provider-sandbox mode remains to be added before that sandbox exercise.

## Rollback and interruption recovery

Resume from the actual branch head and exact CI artifacts, not from a previous green SHA. Compare main before updating the branch; do not force-push over other work. Download source and reports promptly while artifact retention applies.

Rollback stops new source producers/submission workers while continuing controlled reconciliation for money already sent. Preserve journals, audit, beneficiary versions, original payout instructions, successful settlements, linked reversals and historical allocations. Never delete financial records, restore the old global batch-item uniqueness after rebatching, or reissue an uncertain transfer with a fresh key.
