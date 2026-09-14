# Craves finance — connected order source and chef tax treatment

Updated **14 September 2026**, Asia/Kolkata. Repository `rmorampudi09-arch/Craves-Build-platform`, feature branch `feat/chef-ledger-controls-20260913`, PR **340**. Main baseline for this release is `1715746c6d2f3e38c59eef9a8bfe41bdd82529ea`; always refresh it before merging. Exact final-head build evidence is recorded in the PR and release bundle.

This guide supersedes the earlier statement that the normal order source is unimplemented. `CHEF_LEDGER_IMPLEMENTATION.md` is historical foundation documentation, not current completion status.

## Implemented scope and activation status

The current **on-demand, prepaid Razorpay, reviewed Telangana restaurant** path now has a source connection:

**actual checkout transaction -> immutable binding quote -> authoritative delivered-order outbox -> verified local payment capture -> balanced earning journal + earning projection + payout eligibility -> available chef balance -> existing once-daily/manual or 48-hour automatic payout engine.**

The Order Service and Integration Service source code is connected, rather than leaving `recordDeliveredPayable` as an unused hook. The existing chef PDF source now includes new-engine earnings, fee GST, transfers and a journal-based opening/movement/closing reconciliation. Admin tax-profile and runtime-evidence screens have been added.

**Code and CI are not a production activation.** No live Azure revision, APIM operation, merchant account, bank transfer, customer refund or existing payment credential was changed in this development session. Main remains unchanged unless a later recorded release says otherwise. New source and payout switches default off. The requested economic start remains 2026-09-14 00:00 Asia/Kolkata; no claim is made that production orders have been accounted for since that time.

The broader reference also describes subscription financial allocation, dynamic provider-quoted checkout pricing, cumulative refunds/compensation, provider billing and bank close. Those are separate workflows, not automatically completed by the connected on-demand earning path. The exact remaining boundaries appear below; do not label this a completed statutory accounting system or complete public-launch certification.

## GST: what changes for small chefs

### Registration threshold is not the same as tax on a purchased platform service

For the supported Telangana service case, section 22(1) of the Telangana GST Act states a general **20-lakh aggregate annual turnover registration threshold**, subject to compulsory-registration and other applicable provisions. It is not a blanket 10-lakh rule. Aggregate turnover is assessed across the relevant PAN and supplies, not just receipts through Craves.

Official state Act, published on India Code and consolidated through Amendment Act 7 of 2025: https://www.indiacode.nic.in/bitstream/123456789/8685/3/23_of_2017.pdf — sections 2(6), 22–24. This is the published text inspected during research, not a government verification of an individual chef.

For **qualifying restaurant supplies through an e-commerce operator under section 9(5)**, CBIC Circular 167/23/2021-GST clarifies that the operator pays restaurant GST even when the restaurant is unregistered. It also says GST TCS under section 52 is not collected on those restaurant supplies. Therefore:

- Customer restaurant GST is recorded as a **Craves ECO liability**.
- Do **not** deduct that same customer food GST again from chef earnings.
- Do **not** deduct GST TCS on this supported section 9(5) restaurant flow.
- Crossing a turnover threshold creates a registration-review issue, not authority to debit an arbitrary percentage of a chef's food earnings.

CBIC source: https://cbic-gst.gov.in/pdf/Circular-167-17-12-2021-GST.pdf — questions 1, 3–7 and 9.

Cooking and supply by qualifying cloud/central kitchens is clarified as restaurant service at 5% without ITC in Circular 164/20/2021-GST: https://gstcouncil.gov.in/sites/default/files/2024-06/circular_20no._20164_2021_gst.pdf — section 3. This classification is not automatically extended to packaged goods, other supplies or other jurisdictions.

### GST on Craves' 7% service fee is separate

Craves supplies a platform/intermediary service and charges its own fee. The chef's small-business registration threshold does not automatically exempt that purchased service from GST. The code keeps **Craves service-fee revenue** and **GST on that fee** separate from customer restaurant GST and separate from income-tax withholding.

The latest user instruction permits applicable tax deductions in addition to 7%. The supported configured treatment is **EXCLUSIVE** when the accepted chef terms and finance classification establish 7% plus the applicable GST on that fee. It must not be activated merely because a checkbox says the chef is registered. The inclusive option remains available for a different explicitly accepted commercial policy; no existing order is repriced.

Illustration at a reviewed 18% fee-GST rate:

| Component | Gross 369.00 | Gross 1000.00 |
|---|---:|---:|
| Chef food gross | 369.00 | 1000.00 |
| Craves fee at 7% | 25.83 | 70.00 |
| GST on that fee | 4.65 | 12.60 |
| Net before separately reviewed withholding | 338.52 | 917.40 |
| Additional deduction of customer food GST | 0.00 | 0.00 |
| GST TCS on the supported restaurant flow | 0.00 | 0.00 |

This is **18% of the 7% fee**, not 18% of the full chef food gross. At 1000.00, the combined fee/tax deduction is 8.26% before other separately applicable items. Exact-paise rounding is part of the frozen calculation.

A tax invoice and statutory returns require the correct Craves registration, service classification, place/time of supply, CGST/SGST or IGST split, invoice numbering, credit notes and return mapping. The operational journal and chef statement do not claim to implement that entire statutory layer. Invoice-component rounding must be reconciled before statutory invoicing; the current journal stores the configured total component tax, not a completed GST-return export.

Income-tax withholding is not GST. Each approved chef profile requires an explicit withholding assessment reference, including when its configured rate is zero. The software does not assert that all chefs below 10 or 20 lakh are exempt from income-tax withholding.

For local delivery, the Ministry of Finance's 16 September 2025 clarification discusses 18% and registration-dependent liability: https://www.pib.gov.in/PressReleasePage.aspx?PRID=2167151 . Provider procurement tax already included in a quote must not be added again. This release preserves the existing customer delivery base and does not turn the dispatch-time provider quote into a pre-payment pricing guarantee.

## Actual source transaction and identifiers

`services/order-service/src/main/java/in/craves/order/finance/FinancialCheckoutTransactionAspect.java` provides an explicit outer database transaction around the existing `OrderService.checkout`. The original checkout joins it. A failed financial quote or ownership/hash check rolls back order creation, checkout totals and cart deletion together. After-commit order notification reloads the bound total so it cannot advertise the prior estimated tax total.

`OrderFinancialBindingService.java` reads the actual kitchen owner and authoritative checkout item prices. It sends explicit chef-base and customer-unit values. The current catalog has one price, so those two unit values are explicitly equal in this supported path; **no uplift or historical chef base is invented**. The return quote must match the checkout, customer, chef order, kitchen, chef, item IDs, quantities, source totals and canonical SHA-256 hash.

The binding quote captures the complete approved finance policy, chef tax-profile version, item values, tax components, fee basis and net payable. Future policy/profile changes do not modify it. Accepted order, checkout, item money/quantity and snapshot records are guarded against mutation.

Canonical IDs remain distinct: checkout ID is the customer aggregate; chef-order ID is `order_schema.customer_order.id`; chef identity is not kitchen ID. The actual delivery event's `orderId` is checkout ID and `chefSubOrderId` is chef-order ID. Multi-chef tests verify two distinct earnings and one capture for one checkout.

Order migrations V24/V25 enqueue BOUND and terminal lifecycle events **inside the transaction that changes the authoritative order**. The existing `DeliveryStatusUpdateService` must accept the delivered transition with accepted timestamp, delivery job and observed delivery time before the financial DELIVERED event exists. A raw provider webhook cannot directly supply an arbitrary earning amount.

`FinanceSourceOutboxService` preserves the original event ID and payload through leases/retries, validates acknowledgement identity/state/journal evidence, retries temporary errors with bounded exponential delay plus jitter, and leaves exhausted/conflicting work visible as DEAD. There is no silent fresh-event-key workaround.

`FinanceSourceClient` sends exact serialized bytes with a dedicated HMAC-SHA256 signature to a configured HTTPS Integration service origin. The receiver limits the raw request to 512 KiB and verifies its signature before parsing. These private endpoints must not be exposed as unauthenticated public APIM operations. No customer or chef API allows posting an arbitrary journal.

## Finalization and money movement

Integration's `OrderFinancialQuoteService` persists the issued quote independently. An orphan issued quote after an Order rollback is **not** accepted customer funds, revenue or a chef payable. Only the authenticated Order binding/lifecycle completes that evidence.

`OrderFinancialFinalizationService` checks the issued snapshot hash and identities, accepted source version and actual local payment evidence. For the supported prepaid path it requires exactly one matching PAID Razorpay payment record, a captured/paid provider status, valid original payment reference, INR, correct customer and exact checkout amount. Existing payment verification owns that record; the financial event's own assertion of payment is insufficient.

A captured-but-undelivered order posts gateway clearing against customer funds only. Delivery before capture remains waiting; the worker finishes it when verified capture arrives. Successful fulfillment posts the chef net, service fee, fee GST, separately approved withholding, customer tax and other customer components in one balanced transaction. The earning projection and payout eligibility are committed atomically with it.

Duplicate delivery messages, new transport IDs carrying identical economics, crash/replay and late BOUND events cannot create another earning. Reusing an event/version with changed content records an exception. Review state holds the chef and is not hidden by replaying an earlier success.

The existing payout engine receives the real finalized net. It freezes delivery +48 elapsed hours for automatic eligibility; a manually requested available balance uses the configured manual delay and one accepted request per India calendar day. Every transfer reserves eligible money before the provider call. Unknown, already-paid and actively reserved amounts cannot be paid again by a competing manual/automatic path.

Active refunds or contradictory order evidence hold payout exposure. Releasing a general admin hold alone cannot bypass the database's source/refund dispatch check. That guard is not a replacement for a full approved post-payment refund-responsibility adjustment workflow.

RazorpayX submission, signed callbacks, original-payout GET recovery and linked confirmed reversal are implemented in the earlier payout engine. Public API support does not establish Craves' merchant entitlement, approved marketplace funding arrangement, available funds or verified beneficiaries. No live payout was executed by these tests.

## Admin and chef surfaces

- `/admin/finance`: existing versioned numbers/switches and payout controls, plus **Chef tax classification and fee terms** and **Order-to-ledger runtime evidence**.
- A chef profile records GST registration/GSTIN where applicable, declared aggregate turnover, dated financial year, supply regime, fee-terms evidence and separate withholding evidence. New quotes require a current-year reviewed profile. Historical order snapshots retain their original version.
- An unregistered Telangana profile over the general 20-lakh threshold is flagged for review; the system does not invent a GST debit or treat the declaration as government validation.
- `/chef/finance`: available balance, withdrawal requests and dated earnings/settlement statements.
- `/chef/statements`: existing PDF generation and email flow now consumes the enhanced authenticated Integration statement source. New-engine entries are separated from legacy manual allocations.
- New statement lines show gross, service fee, GST on that fee, withholding, net, posting date and fee rate. Payout history shows original amount/status and bank/journal evidence. Liability opening + credits - debits = closing is computed from immutable journals, not a mutable available-balance field.
- Only the authenticated chef's rows are returned. The customer identity and provider procurement costs are not exposed. Combined document size above 1000 rows is rejected with a reduce-period instruction instead of silently omitting rows.

Backend/BFF contracts:

| Method and backend path | Access / behavior |
|---|---|
| POST `/internal/v1/finance/quotes` | Dedicated internal signature; immutable quote request |
| POST `/internal/v1/finance/events` | Dedicated internal signature; authoritative lifecycle |
| GET/POST `/api/v1/admin/finance/chefs/{chef}/tax-profile` | Finance role; read or create immutable reviewed version |
| GET `/api/v1/admin/finance/source-status` | Finance/audit read; actual source counters and recent exceptions |
| GET `/api/v1/document-sources/chef/earnings` | Chef-owned dated source, including new journal earnings |
| GET `/api/v1/document-sources/chef/settlements` | Chef-owned dated payout source and liability reconciliation |
| GET `/api/chef/finance/statement` | Same-session web BFF; bounded India-time period, validated source response |

The older finance policy, payout, beneficiary, hold and recovery APIs remain in place. New web writes use same-origin checks and bounded JSON; responses retain decimal-string money and no-store headers.

## Code and migration map

| Area | Exact location |
|---|---|
| Order binding, signing, outbox and checkout transaction | `services/order-service/src/main/java/in/craves/order/finance/` |
| Order immutable snapshots and source events | `services/order-service/src/main/resources/db/migration/V24__financial_snapshot_source_outbox.sql` and `V25__financial_source_immutability_guards.sql` |
| Integration quote, chef tax review, source validation and finalization | `services/integration-service/src/main/java/in/craves/integration/finance/source/` |
| Integration source/tax/projection/hold migrations | `V129__order_financial_source.sql` and `V130__source_replay_and_payout_holds.sql` under Integration migration resources |
| Enhanced existing PDF statement source | `services/integration-service/src/main/java/in/craves/integration/web/ChefDocumentSourceController.java` and `LedgerStatementTables.java` |
| Tax/source admin controls | `apps/customer-web-next/src/components/chef-tax-profile-panel.tsx` |
| Chef statement panel | `apps/customer-web-next/src/components/chef-ledger-statement-panel.tsx` |
| Typed web source contracts and tests | `apps/customer-web-next/src/lib/finance-source-contract.ts` and `finance-source.vitest.ts` |
| Connected two-service acceptance harness | `tests/finance/FinanceSourceRoundTrip.java` and `scripts/finance/test-source-roundtrip.sh` |

V121–V128 from the earlier branch are retained. No applied migration has been edited. The read-only preflight must inspect actual Flyway histories; never overwrite a separately applied local V121 or force repair to disguise different SQL.

## Verification and how to reproduce

The dedicated GitHub workflow runs Java21/Maven Integration verification and Order verification against disposable PostgreSQL16, explicitly refusing missing/skipped required finance suites. The new suites cover actual checkout rollback, actual delivery consumer output, immutable items, two-chef allocation, capture mismatch, policy change, duplicate/concurrent finalization, source aliases, refund holds, owner-isolated statements and administrative source counters.

A connected acceptance harness runs both actual domain implementations with real PostgreSQL and signed serialized request/event bytes across **separate transactions**. It takes an actual checkout through the authoritative delivery consumer, real finalizer, actual available-balance reservation and payout worker. It uses controlled Catalog/address, notification, initial capture and Razorpay network fixtures. It is not a bank, APIM or Azure deployment test. Its JSON report explicitly states those boundaries.

From the repository root, using only an isolated disposable local database:

```bash
export LEDGER_TEST_JDBC_URL=jdbc:postgresql://localhost:55432/chef_ledger_test
export LEDGER_TEST_DB_USER=ledger_ci
export LEDGER_TEST_DB_PASSWORD=ledger_ci_local_only
mvn -B -ntp -f services/integration-service/pom.xml verify
mvn -B -ntp -f services/order-service/pom.xml verify
bash scripts/finance/test-source-roundtrip.sh
```

Provision that **local** disposable container with `docker run --rm -d --name craves-finance-test -p 127.0.0.1:55432:5432 -e POSTGRES_DB=chef_ledger_test -e POSTGRES_USER=ledger_ci -e POSTGRES_PASSWORD=ledger_ci_local_only postgres:16`. The displayed password is a non-secret test value. These tests DROP schemas. Never point an allowed-looking localhost tunnel at production.

Web: inside `apps/customer-web-next`, run `npm ci --ignore-scripts --no-audit --no-fund`, `npm run lint`, `npm run typecheck`, `npm run test` and `npm run build` using the existing build environment. Test counts and exact run IDs are reported from final artifacts, not inferred from files or a previous green revision.

## Manual release steps and safe order

### Before enabling any source or money movement

1. Review the exact PR head and CI evidence; verify Integration and Order database histories and active legacy settlements. Keep the original financial history. Agree the treatment of any order already created without a binding snapshot; do not invent its historic policy.
2. Record the actual Craves GST classification/registration and the chef's accepted 7%-plus-applicable-fee-GST terms and withholding assessment in the admin configuration. This is a classification/recording task, not a new arbitrary chef GST charge.
3. Verify RazorpayX's merchant permission, funding/source account, bank ownership, payout limits/fees and outbound IP allowlisting. This cannot be inferred from customer checkout success.
4. Wire the service-to-service key and approved Integration origin, private routing and the public finance/document-source APIM operations. Keep the `/internal/v1/finance/*` endpoints out of public API products. An existing Azure login in another tool does not establish access in this session.
5. Deploy **Integration, then Order, then the changed Next.js web**, retaining existing one-replica targets and `Craves-Dev-Service-Connection`. The existing service pipelines are `azure-pipelines-integration-service.yml` and `azure-pipelines-order-service.yml`; they preserve non-image runtime configuration. Their runs alone do not enable the new flags or wire APIM. Use the reviewed existing web release pipeline for the actual target.
6. Verify authenticated read/denial behavior, quote totals, one captured-undelivered record, one delivered earning, journal/projection equality, statement isolation and source replay in an approved non-production acceptance environment. Enable production payout execution only after merchant and financial acceptance evidence.

No new Azure resource or replica is required by this module. A build/registry/deployment can incur normal existing-service usage charges; this development session provisioned no paid resources. No DNS, Firebase provider, mobile signing or app-store action is needed for the web/backend change.

### Exact runtime settings

| Service / key | Purpose and safe default |
|---|---|
| Both: `CRAVES_FINANCE_INTERNAL_KEY` | Dedicated random secret of at least32characters; store in existing Key Vault/runtime references, not source/chat |
| Order: `CRAVES_FINANCE_INTEGRATION_BASE_URL` | Approved HTTPS origin of the existing Integration service, no path, query or credentials |
| Order: `CRAVES_FINANCE_SOURCE_ENABLED` | Enables binding checkout transaction; default false |
| Order: `CRAVES_FINANCE_SOURCE_DISPATCH_ENABLED` | Runs durable Order source delivery; default false |
| Integration: `CRAVES_FINANCE_FINALIZATION_ENABLED` | Enables authenticated financial event processing and late-capture finalizer; default false |
| Integration: `CRAVES_FINANCE_AUTHORITATIVE_SOURCE_READY` | Existing release certification gate, default false; set only after this actual connection is validated |
| Integration: `CRAVES_LEDGER_POSTING_ENABLED` | Existing journal write gate, default false |
| Integration: `CRAVES_DOCUMENTS_SOURCES_ENABLED` | Existing authenticated PDF/statement source flag; retain its reviewed current value |
| Integration: `CRAVES_RAZORPAYX_PRODUCTION_APPROVED` | Merchant/account acceptance gate, default false |
| Integration: `CRAVES_RAZORPAYX_WORKER_ENABLED` | New payout submissions/reconciliation worker, default false |
| Integration: `CRAVES_RAZORPAYX_KEY_ID`, `CRAVES_RAZORPAYX_KEY_SECRET`, `CRAVES_RAZORPAYX_ACCOUNT_NUMBER`, `CRAVES_RAZORPAYX_WEBHOOK_SECRET` | Existing branch payout credentials; do not rotate or replace customer payment keys |

Default source/finalization polling is5seconds; payout polling is30seconds. These internal application worker intervals are unrelated to ChatGPT scheduled tasks. Do not enable source checkout before reviewed policies/profiles/private connectivity exist: the intended failure behavior is to block and roll back an unpriceable checkout, not create unaccountable earnings.

## Deliberate remaining boundaries

The highlighted **normal on-demand source connection is implemented**. The following are not claimed complete by it:

- Subscription financial quote acceptance, funded discounts/occurrence accounting, skip/refund allocations and automatic subscription earnings. The earlier subscription calculator remains a preview; `PENDING_POLICY` legacy occurrences are not reclassified as normal orders.
- Live one-minute customer cancellation wiring and a comprehensive cumulative refund, chef compensation/adjustment and bank-settlement accounting workflow. Existing operational refund clients remain; new source holds protect affected earnings, not synthesize responsibility decisions.
- Dynamic provider-quoted customer delivery pricing, separate catalog uplift publication, promotion budgets and provider invoice/charge matching. Current supported source freezes existing catalog/customer-delivery base values explicitly.
- Statutory tax invoice/return/export, automatic all-channel turnover monitoring and automatic income-tax withholding eligibility. A dated reviewed profile is not real-time government registration verification.
- Historical opening balances/import/replay for orders with no binding snapshot, and general accounting period close/bank reconciliation.
- Provider sandbox/live merchant acceptance, deployed APIM/private networking, authenticated browser acceptance, sustained load/chaos testing and production activation. No finite test suite proves no future defect; the synchronous quote call inside checkout is bounded but still needs production traffic/latency evaluation before higher-volume promises.

## Rollback

Stop new source creation and new payout submissions in a controlled maintenance window; retain the ability to reconcile transfers already sent. Disabling binding for new orders means those new legacy orders are outside this source path, so do not silently keep sales open and later fabricate snapshots. Preserve Order snapshots/outbox payloads, Integration receipts, capture and earning journals, beneficiary versions, confirmed transfers and linked reversals.

Never delete committed money records, change historical taxes/fees in place, relabel unknown transfers as failed, restore the old globally unique legacy batch membership after legitimate rebatching, or resend a payout under a fresh key merely to make it succeed. Source replay retains the original event and economic key; an actual conflict requires reviewed resolution, not a new event ID.
