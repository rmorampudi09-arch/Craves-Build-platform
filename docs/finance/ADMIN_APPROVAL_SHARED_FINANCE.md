# Finance access after admin chef approval

Admin approval of the existing documented chef application is the common finance
access decision. Newly approved and already approved chefs use the activated
platform finance policy without creating or approving a second finance profile.
No frontend, document-upload flow, fee percentage, tax treatment, provider gate,
bank validation, or existing accepted order is changed by this release.

## Authority and shared terms

User/Chef exposes the private, read-only
`POST /internal/v1/chef-finance/approvals` operation. It returns only approved
application identities, jurisdiction and approval timestamps. Pending/rejected
applications are absent. Existing admin document and verified-email checks still
run before application approval. Finance uses the existing
`CRAVES_BANK_USER_CHEF_BASE_URL` and `CRAVES_BANK_INTERNAL_KEY` bindings solely for
signed source reads; this does not depend on bank-provider or RazorpayX readiness.
Keep the operation outside public APIM products. Request and response HMACs bind
the exact path, direction, timestamp and bytes. Freshness, strict JSON, identity,
response-size and complete-list checks fail closed. There is no approval cache.

V147 adds one immutable shared-withholding version and a global head. Upgrade
promotes only an existing, unanimous, current-year reviewed withholding rate and
preserves the original profile references. An absent or conflicting global basis
is an explicit rollout blocker, never a guessed tax rate. This is one common
platform configuration, not an approval task for each new chef.

Finance resolves each approved chef against that common basis. Individual
registration, turnover, declaration date and financial year remain **not
recorded** unless a genuine individual tax profile exists. They are not filled
with zero turnover or fabricated declarations. A current recorded individual
withholding assessment and explicit registration exception retain their existing
effect. A prior-year profile is historical evidence; it does not force repeat
common finance activation for an approved chef.

Catalog and checkout use the same resolver. The catalog fingerprint includes the
approval-bound finance version, so removing an approval changes cache authority.
Multi-chef checkout makes one bounded source read. Shared-basis order snapshots
record an approval reference and shared-withholding reference rather than
claiming a nonexistent individual tax-profile ID. Existing snapshots, accepted
quotes, captured funds, journals, earnings and payout reservations remain frozen.

## Release and verification

1. Confirm the active common policy, existing unanimous withholding basis and
   existing source URL/Key Vault credential references through read-only checks.
2. Run exact-commit User/Chef, Catalog, Order and Integration regression, V147
   upgrade/replay, approval/signature tests and the signed financial round trip.
   The new acceptance suites must have no failures, errors or skipped cases.
3. Deploy User/Chef first, using the runtime-preserving image deployment. Verify
   the signed approval read and denial of unsigned/expired requests.
4. Deploy Integration with the same checked source SHA, preserving runtime and
   payout/bank flags. Verify the common terms head, signed catalog authority,
   actual approved-chef inclusion and healthy revision/traffic.
5. Check public discovery/privacy and existing chef finance reads. No real order,
   bank validation or money transfer is required for these smoke checks. Preserve
   the previous healthy revisions for rollback; never repair or rewrite applied
   migrations or immutable financial history.

Required new tests: `ChefFinanceApprovalControllerTest`,
`ChefFinanceApprovalSourceTest`, `SharedChefFinanceDatabaseTest` and
`SharedChefFinanceMigrationDatabaseTest`. They cover newly approved chefs with no
individual finance record, missing/revoked approval, jurisdiction, outage,
bounded signed authority, immutable terms, differing real withholding,
registration exceptions, quote replay and captured/delivered earning idempotency.
