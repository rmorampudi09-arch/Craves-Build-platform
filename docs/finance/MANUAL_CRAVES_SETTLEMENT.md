# Manual Craves settlement release mode

This is the owner-requested launch mode while RazorpayX and Fund Account Validation are unavailable. It adds a separate `CRAVES_MANUAL` channel to the existing immutable payable, allocation and journal system. It does not fabricate a provider beneficiary, bank verification, transfer ID, tax assessment or consent. No API or button in this module sends money.

## Activation prerequisites

Use one reviewed release SHA and the normal review, merge and environment approvals. Validate applied Integration migrations through V133 before applying additive V134; never replace an applied SQL file or force Flyway repair. Keep the existing one-replica maximum. This release does not enable itself through a migration.

Before source checkout opens, configure the compatible Integration finalizer and ledger, activate a reviewed finance policy, and verify authenticated source routes. The policy must use actual approved classification and accepted fee treatment. The owner has specified 7% service fee with applicable fee GST separately; that instruction does not supply missing Craves tax classification or individual chef consent, turnover, financial-year declaration or withholding assessment. Preserve customer restaurant GST without deducting it again from chef earnings. Catalog selling eligibility and Order quote eligibility must share those actual finance requirements; neither requires RazorpayX approval in manual mode.

For new manual reservations, `CRAVES_MANUAL_SETTLEMENT_ENABLED=true`, an active policy with `ledgerEnabled=true` and `manualWithdrawalsEnabled=true` are required. Keep `automaticPayoutsEnabled=false` and the RazorpayX production/worker gates off during this mode. Do not reinterpret the chef-triggered historical `mode=MANUAL` as an external Craves payment: only the new `payout_channel=CRAVES_MANUAL` denotes this channel. Existing rows retain `RAZORPAYX`, their beneficiary, provider evidence, allocations and journals.

Bank enrollment is available only when encryption, the approved validation provider, worker and both administrative submission/validation switches are ready. Otherwise status reports `automaticActivation=false`, the chef form is hidden, and direct submissions fail before collecting or saving details. Historical validation evidence is preserved. Keep bank provider and validation switches off until separately approved; this module does not initiate FAV calls.

## Operator procedure

1. Select a saved approved chef in Admin → Finance → Manual Craves chef payments. Review the actual payable and independent financial holds. The displayed amount comes from captured, delivered, finalized, unallocated source earnings, never an administrator-entered earning.
2. Reserve the exact full available amount with a stable request UUID and a reason. Chef withdrawals and administrator reservations share the same chef lock, active-allocation uniqueness and one accepted request per Asia/Kolkata calendar day. Cancellation does not restore the daily quota.
3. Verify the real destination and ownership using an approved secured business record. Record that reference with `AUTHORIZE_TRANSFER` before external bank execution. Do not put account numbers, credentials or bank documents into reference fields. This records `SUBMITTING`; it sends nothing.
4. Execute only the separately authorized actual transfer from the approved Craves bank account. If no transfer occurs, cancel only an unsent `RESERVED` instruction. After authorization, uncertain outcomes retain their reservation. Do not make a second transfer to test whether the first succeeded.
5. Record actual exact-paise amount, actual bank payment timestamp, secured outcome evidence reference and UTR/bank reference when available. `CONFIRM_PAID` posts one `CHEF_PAYABLE` debit / `BANK` credit and records `PAID`. It cannot mark an unsubmitted reservation paid. Nonempty bank references are unique across manual payment instructions.
6. For an uncertain sent attempt, use `MARK_UNKNOWN`; resolve with actual evidence. `CONFIRM_NOT_SENT` requires definitive no-debit evidence before releasing the allocation. Actual returned funds use `CONFIRM_REVERSED`, creating a full linked reversing journal and retaining the original paid evidence. Neither action automatically releases an independent operational hold.

| Current state | Accepted action | Result |
| --- | --- | --- |
| RESERVED | AUTHORIZE_TRANSFER / CANCEL_RESERVATION | SUBMITTING / CANCELLED |
| SUBMITTING | MARK_UNKNOWN | UNKNOWN |
| SUBMITTING, UNKNOWN, REVIEW_REQUIRED | CONFIRM_PAID / CONFIRM_NOT_SENT | PAID / FAILED |
| PAID | CONFIRM_REVERSED | REVERSED |

Every action has an immutable operator identity, reason, request hash, evidence, prior/result state and version. Repeating the same action UUID with the same context returns the current instruction; changed context or stale version fails. The database requires the action and instruction transition to commit together. Immutable financial context, exact allocations and prior journals remain guarded.

## Routes and privacy

Integration prefixes the following routes with `/api/v1`; APIM must use the actual deployed origin and correct rewrite. The web BFF exposes the corresponding `/api/admin/finance/...` leaf route. Bank configuration scripts do not publish these routes automatically.

| Method | Backend operation | Authorization |
| --- | --- | --- |
| GET | `/admin/finance/manual-settlements` | Platform/Payments/Audit admin |
| GET | `/admin/finance/chefs/{chef}/manual-settlement` | Platform/Payments/Audit admin |
| POST | `/admin/finance/chefs/{chef}/manual-settlements` | Platform/Payments admin |
| POST | `/admin/finance/manual-settlements/{id}/actions` | Platform/Payments admin |
| GET / POST | Existing `/chef/finance/balance`, `/chef/finance/withdrawals` | Chef; canonical token identity only |

POST payloads are strict JSON, limited to 16 KiB; the BFF limits actual input read time, bounds successful responses to 128 KiB, checks same origin and binds result identity to the requested owner/instruction. Errors are generic and no-store. Test authenticated success, audit-only denial, wrong role, wrong owner and privacy at both direct service and APIM/BFF boundaries. Anonymous 401 alone is insufficient.

Statements and PDF document source show the manual payment channel, actual paid time, UTR when supplied and journal-reconciled liability. They retain legacy and new engine history. A generated statement is not bank reconciliation, a tax invoice or a statutory export.

## Holds, rollback and acceptance evidence

The manual channel distinguishes the original system-only beneficiary requirement from operational holds. It does not change the stored hold flag or beneficiary verification. An explicit operator hold, source exception, missing/mismatched source binding or any refund state other than definitive FAILED/CANCELLED blocks new reservation/authorization. DEAD_LETTER is unresolved. Existing sent transfers may still be truthfully reconciled after a later hold, without clearing that hold.

To pause new manual work, disable manual withdrawals in a reviewed policy; leave the release code, ledger posting and keys available to reconcile already-sent work. Turning off the manual flag also prevents new manual reservations; outcome recording remains independent of that flag. Do not revert to an old binary that cannot interpret V134 manual rows once such rows exist. Roll forward a correction while retaining encryption keys, database history and the last healthy compatible revision as the rollback reference.

`Chef Ledger CI` requires disposable PostgreSQL and zero skips for 29 manual source-to-settlement cases, two V133 upgrade cases, seven manual API security cases and bank capability tests. This includes concurrent reservations/confirmations, real source earning, exact BANK journal, replay/content conflict, daily quota, refund/source holds, uncertain recovery, linked return, cross-owner isolation, provider-worker exclusion, statement totals, disabled-work reconciliation and immutable SQL evidence. Tests use synthetic identities and no provider network calls. Local compile or mocked tests do not establish database, APIM, runtime, bank or payment acceptance.

Record the exact SHA/run IDs, V134 checksum, actual image digest/revision/traffic, effective source/manual/bank/provider flags, policy revision, authenticated route results, masked order/earning/reservation/journal/statement identifiers and actual activation/first covered checkout times. Requested economic start remains separate; never manufacture earlier snapshots, delivery dates or payouts. Subscription finance, cumulative compensation/refunds, provider close, bank close and statutory exports remain separate deliverables.
