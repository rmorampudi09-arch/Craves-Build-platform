# Automatic chef bank onboarding

> Current owner-requested launch mode: [Manual Craves settlement](MANUAL_CRAVES_SETTLEMENT.md). Finance earning/ledger readiness is separate from RazorpayX and Fund Account Validation. The automatic bank form remains unavailable unless all effective bank gates are ready; manual settlement never asserts automatic bank verification. Historical instructions below describe the separately gated provider mode.

Release guide, 14 September 2026, Asia/Kolkata. Repository `rmorampudi09-arch/Craves-Build-platform`, branch `feat/chef-ledger-controls-20260913`, draft PR **340**. Bank work starts from `bee739db325f89910656c2da4943b0a5708fd861`; final exact-head evidence is recorded in the PR and delivery bundle.

## Decision and scope

The user explicitly removed routine human bank verification. **No administrator has to type a Contact ID, Fund Account ID, inspect each bank account or approve each successful bank result in the new flow.** Registration collects the bank details and consent once. Razorpay performs account validation. Matching success automatically creates the beneficiary version used by the existing payout engine.

This guide supersedes the earlier manual-bank-binding instructions for chefs enrolled through this flow. It does not remove chef-business approval, financial holds, fee terms, tax classification or merchant-account activation. A provider bank result is not a determination of GST status, aggregate turnover, food-business compliance or the legitimacy of every future order.

The implementation is complete in the branch for the supported personal-chef bank-enrollment flow. It has not been merged, deployed or tested against the Craves merchant account. No real bank details, validation transaction, live payout, new Azure service or scaling change was used during development. Tests use explicit synthetic identities and bank fixtures.

## The flow a chef uses

1. Submit the existing chef application. Its canonical identity, saved name, email and phone remain owned by User/Chef Service.
2. In the new payout section on the same registration page, enter account number, confirmation, IFSC and consent. The account-holder name is taken from the saved application, not an independently supplied beneficiary identity.
3. The backend validates the request, stores encrypted bank details and creates a durable request before any provider call. The UI displays only the last four digits and status after submission.
4. The worker requests Razorpay composite validation, which can create the recipient Contact and bank Fund Account in the same API call.
5. Completed validation must match the exact enrollment reference, chef, account, IFSC and bank-returned name. A merely created or active Fund Account does not qualify as completed bank validation.
6. With successful validation and an approved chef application, Craves binds the provider-backed beneficiary automatically. A pending chef application waits for the ordinary chef-business approval, not an additional bank approval.
7. Delivered, captured and finalized earnings become available subject to existing financial gates. The earlier once-per-India-day manual withdrawal and delivery-plus-48-hour automatic payout engine uses this beneficiary.

The bank form is also available in `/chef/finance`. The current form is a second step alongside the existing application submit; it is not a silent scrape of documents and is not a single atomic application-plus-bank POST. Existing chefs without structured bank details must supply them once and consent; the system does not invent or extract bank numbers from an old upload.

## Public provider research versus implemented behavior

Official Razorpay documentation was inspected on 14 September 2026:

- Composite bank validation: `POST /v1/fund_accounts/validations` creates a Contact, Fund Account and validation request. https://razorpay.com/docs/api/x/composite-account-validation/bank-account/
- Known validation read: `GET /v1/fund_accounts/validations/{id}`. https://razorpay.com/docs/api/x/composite-account-validation/fetch-transactions-with-id/
- Collection lookup: `GET /v1/fund_accounts/validations`, with source account, time and pagination. https://razorpay.com/docs/api/x/composite-account-validation/fetch-all-transactions/
- Product FAQs cover entitlement, fees, timing and the absence of Fund Account Validation test mode. https://razorpay.com/docs/x/fund-accounts/faqs/

These are API capabilities, not evidence of Craves' account approval. The selected default is **penniless** validation: no bank-credit transaction is requested by that mode, but provider validation service fees may still apply. `optimized` can choose a transaction and `pennydrop` requests one; they are explicit runtime modes, not silent fallbacks. The release scripts do not enable any of them or call Razorpay.

Fund Account Validation is not assumed to inherit the separate payout API's idempotency contract. A persisted submission intent permits one create POST; an uncertain response is reconciled using GET rather than another POST. The implementation does not claim a fabricated provider sandbox mode. Provider-contract tests use mocked HTTP responses and synthetic credentials; account acceptance still requires an authorized controlled validation after release preparation.

## Automatic eligibility, not manual review

| State | Meaning and next action |
|---|---|
| NOT_SUBMITTED | No structured bank enrollment. Chef enters their details once. |
| QUEUED | Securely saved, awaiting the worker. An identity lookup outage before the provider POST remains retryable here. |
| SUBMITTING | Durable provider intent exists; a request may have reached Razorpay. Never issue a replacement blindly. |
| VALIDATING | Razorpay validation is not completed, or a required status recheck is overdue. |
| UNKNOWN | Submission outcome is unconfirmed. GET reconciliation is scheduled without a fresh validation POST. |
| WAITING_APPROVAL | Bank validation passed; ordinary chef application approval is pending. No bank reviewer is needed. |
| VERIFIED | Matching provider evidence and eligible chef application established; independent money-movement gates still apply. |
| VALIDATION_FAILED | Provider could not validate the account; chef corrects or explicitly resubmits within the rate limit. |
| NAME_MISMATCH | Bank-returned name differs from the saved applicant. No fuzzy or guessed approval occurs. |
| APPLICANT_ACTION_REQUIRED | Saved applicant identity or eligibility changed; chef must correct their application/enrollment. |
| SUPERSEDED | Historical version; late responses cannot activate it again. |

The normal matching rule is normalized exact personal name matching. Whitespace, selected punctuation and Unicode normalization are handled, but initials, joint accounts or a separate business-name account are not guessed to match. Those cases require corrected canonical information or a separately designed business-beneficiary flow, not an admin checkbox claiming bank verification.

A successful historical validation is queried periodically along with current applicant information. This is **GET reconciliation of the original provider record**, not a newly charged bank validation every six hours or a guarantee that the bank has rechecked ownership at that moment. The implementation conservatively pauses new dispatch if its eligibility observation is more than 24 hours old. Existing sent payouts continue reconciliation even when bank eligibility is later blocked.

## Financial protections retained

Bank eligibility is an independent database condition. Releasing a general admin hold cannot make an unvalidated current enrollment payable. A bank change creates another immutable version, and is rejected while a payout is reserved, submitting, processing, unknown or awaiting resolution. Previously confirmed transfers keep their original beneficiary and journal references.

A new automatic success clears only the old system-created initial missing-beneficiary hold when there is no prior beneficiary. It does not clear a refund, source conflict, payout failure or deliberately applied operational hold. Outstanding chef earnings remain owed while held; the available-to-request display becomes zero until the applicable gates pass.

Legacy manually bound beneficiaries without a new enrollment are preserved for compatibility, not silently declared Razorpay-validated. Once a chef has entered the automatic flow, the legacy manual beneficiary replacement API refuses overrides. The main Finance Center no longer presents manual Contact/Fund Account entry or a bank-approval button.

## Sensitive-data handling

Integration owns the secure bank registry. User/Chef receives no bank number; it exposes only a private, signed read of the saved applicant identity. The browser does not persist bank values in localStorage or sessionStorage. The current pending submission lives in component memory only and is cleared after confirmed receipt.

AES-256-GCM encrypts bank details using a random nonce and authenticated chef/request identity. A versioned key ring supports reading earlier encrypted records after adding a new key. Keyed fingerprints avoid a plain enumerable hash of account details. Database audit/evidence stores references, result and hashes rather than unrestricted provider payloads. Public read models return masked bank data; logs and error responses are generic.

The UI uses same-origin checks through an authenticated BFF, bounded streaming request reads and strict input/output contracts. Direct backend requests are bounded too. The applicant route has its own exact-match Spring Security chain and requires authentication even before the CHEF role is granted. Existing delivery, admin and payment security configuration was not weakened.

Private identity messages sign method, exact path, timestamp and raw JSON. Stale, future, altered or cross-path signatures are rejected. The dedicated internal key is not a customer token or a Razorpay key.

Encrypted history is retained by the operational application and cannot be arbitrarily deleted. A separately governed retention/erasure policy and key-destruction process remains necessary for real personal data; this module does not assert legal retention periods or provide an indiscriminate delete button. Keep wire/body logging and developer traces disabled for bank routes at every deployed proxy, app and provider client.

## Code paths

| Component | Path |
|---|---|
| Bank contracts, encryption, applicant source, Razorpay adapter, service and worker | `services/integration-service/src/main/java/in/craves/integration/payout/bank/` |
| Applicant-only authenticated route | `services/integration-service/src/main/java/in/craves/integration/config/BankOnboardingSecurityConfiguration.java` |
| Bank read/write/admin controls and safe errors | `services/integration-service/src/main/java/in/craves/integration/web/BankOnboardingController.java` and `BankOnboardingAdvice.java` |
| Payout eligibility integration | `services/integration-service/src/main/java/in/craves/integration/payout/ChefPayoutService.java` |
| Private canonical applicant lookup | `services/user-chef-service/src/main/java/in/craves/userchef/web/InternalBankApplicantController.java` |
| User/Chef exact private-route exception | `services/user-chef-service/src/main/java/in/craves/userchef/config/SecurityConfig.java` |
| Bank request, beneficiary evidence and guards | Integration migrations `V131__automatic_bank_onboarding.sql`, `V132__bank_automation_controls.sql`, `V133__bank_validation_recheck_guards.sql` |
| Registration and finance bank form | `apps/customer-web-next/src/components/chef-bank-onboarding-panel.tsx` |
| Admin global automation controls | `apps/customer-web-next/src/components/bank-automation-admin-panel.tsx` |
| Bank BFF and contracts | `apps/customer-web-next/src/lib/bank-onboarding-bff.ts` and `bank-onboarding-contract.ts` |
| Public web routes | `src/app/api/chef-onboarding/bank/route.ts` and `src/app/api/admin/finance/bank-onboarding/route.ts` |
| Runtime references and privacy-gated API publication | `scripts/finance/configure_bank_runtime.py` and `configure_bank_apim.py` |
| Existing-resource configuration pipeline | `azure-pipelines-chef-bank-configuration.yml` |
| Verification pipeline | `.github/workflows/chef-bank-onboarding-ci.yml` |

## Admin control settings

`/admin/finance` now includes Automatic chef bank onboarding. Operators can turn submissions or validation processing on/off and set a rolling 24-hour new-bank-version limit from 1 to 10; default is 3. Control changes require finance permission, current revision and a reason. These controls manage the service, not individual bank approval.

Readiness distinguishes encryption configured, provider adapter configured and worker deployed. None of those labels claims a completed merchant validation. The latest 100 enrollment outcomes are masked and observable. The worker is bounded to ten items per pass, with durable leases and retry delay/jitter. The unknown-response GET search is deliberately bounded to 1,000 provider records; exhaustion remains a visible exception, not permission to send another POST. This is not a tested million-user throughput claim.

## One-time release configuration — automated values, no secrets in chat

The new pipeline reuses **`Craves-Dev-Service-Connection`**. Defaults are read-only planning. It reads existing resource addresses and identities and can create missing internal secrets securely without asking the user to invent their values.

Known existing targets:

- Resource group: `rg-craves-prodlow-centralindia`
- Integration: `ca-craves-integration-service-pr`
- User/Chef: `ca-craves-user-chef-service-prod`
- Order: `ca-craves-order-service-prodlow`
- APIM: `apim-craves-prodlow-l3ing6`

The helper discovers an unambiguous existing Key Vault and existing managed identities. It does not create resources, add role assignments, grant itself access or scale applications. A missing/ambiguous resource or insufficient permission stops the run with a safe error. A pre-existing different secret/env binding is not overwritten. Cloud changes are not a cross-resource transaction; run one controlled release at a time and retain its plan/check evidence.

Automatically generated/reused Key Vault entries:

| Secret entry | Runtime references |
|---|---|
| `craves-bank-onboarding-internal-v1` | `CRAVES_BANK_INTERNAL_KEY` in Integration and User/Chef |
| `craves-bank-onboarding-keyring-v1` | `CRAVES_BANK_DATA_KEYS_JSON`; active key ID `CRAVES_BANK_DATA_ACTIVE_KEY_ID=bank-v1` |
| `craves-finance-source-internal-v1` | `CRAVES_FINANCE_INTERNAL_KEY` in Order and Integration when missing and compatible |

The helper discovers `CRAVES_BANK_USER_CHEF_BASE_URL` and the existing `CRAVES_FINANCE_INTEGRATION_BASE_URL` from Azure, not a guessed hostname. Secrets are generated through restricted temporary files and referenced by pinned Key Vault secret versions. No secret values are printed or published as pipeline artifacts. Key Vault configuration documentation: https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets

The script can set `CRAVES_BANK_WORKER_ENABLED=true`, but it does **not** enable `CRAVES_BANK_PROVIDER_ENABLED`, finance source/posting flags or payout flags. The provider adapter and persisted validation switch remain default-off, so starting a worker alone does not create chargeable requests.

Existing merchant payout credentials required by the adapter remain `CRAVES_RAZORPAYX_KEY_ID`, `CRAVES_RAZORPAYX_KEY_SECRET`, `CRAVES_RAZORPAYX_ACCOUNT_NUMBER`. They must come from the authorized merchant configuration; the helper does not invent or rotate them, and a working checkout payment key does not establish validation entitlement. Configure `CRAVES_BANK_VALIDATION_TYPE=penniless` unless a different chargeable mode is explicitly selected for the merchant.

### Safe release sequence

1. Verify exact branch SHA, CI, migration histories and existing resources. Confirm account-validation entitlement/funding and the approved live-validation mode through the merchant account. This is one merchant setup, not per-chef manual verification.
2. Run `azure-pipelines-chef-bank-configuration.yml` with defaults. Inspect the non-secret runtime and APIM plans. It requires the existing Azure service connection to be authorized for the pipeline and appropriate existing identity access to the vault.
3. Run reviewed configuration with `applyConfiguration=true`, `expectedReleaseSha=<exact reviewed SHA>`, `publishBankRoutes=false`. Normal Key Vault/app revision usage can incur charges. No new Azure tier/resource is provisioned.
4. Deploy the reviewed User/Chef, Integration and changed web images through the existing single-service pipelines, retaining one replica and existing runtime settings. Do not run a blanket all-service deployment. Source code and migrations must be present before public route acceptance.
5. Run the configuration pipeline with `publishBankRoutes=true` only after deployed bank authentication is available. The helper creates/reuses two exact leaf APIs, checks ownership, refuses body/credential diagnostics and unreviewed inherited logging/fragment policies, and verifies anonymous rejection. It does not publish private identity or financial posting endpoints. Existing parent API routing and data-plane reachability must be reviewed during acceptance; a plan or anonymous 401 is not proof of every authenticated operation.
6. After merchant prerequisites and a controlled authorized acceptance test pass, enable the provider runtime flag and the admin automation controls. Previously queued requests may then trigger provider validation fees. This release did not execute that activation.

`--apply` checks the exact local Git SHA, not an inferred production image. Secret/env and APIM scripts are tested with mocked Azure interfaces; no actual Azure subscription run is claimed. They intentionally fail rather than bypass inherited policy, role, route, key or one-replica discrepancies.

## Verification and reproduction

Run the dedicated bank workflow on the exact feature SHA. It executes all Integration and User/Chef tests plus every required bank suite without skips. The existing Chef Ledger workflow also retains its actual checkout-to-earning/payout round trip. Web lint, TypeScript and tests run in Admin Dashboard CI. Final counts come from downloaded reports, not inferred file counts or older green revisions.

Bank suites cover encrypted storage/nonces/AAD, key rotation, owner-only access, real Spring authentication, provider response dimensions, no manual approval, pending business approval, rate limits, duplicate/stale submissions, concurrent workers, source outage before POST, lost response after POST, GET recovery, bank-change versus payout safety, initial state forgery, operational hold preservation and known-payout reconciliation after eligibility changes.

For local development use the existing README's **disposable** PostgreSQL setup and Java21/Maven commands. `LEDGER_TEST_JDBC_URL` must target `jdbc:postgresql://localhost:<port>/chef_ledger_test`; fixtures DROP schemas. Never use an allowed-looking local tunnel to production.

```bash
mvn -B -ntp -f services/integration-service/pom.xml verify
mvn -B -ntp -f services/user-chef-service/pom.xml verify
python3 -m unittest discover -s scripts/finance -p 'test_configure_bank_*.py' -v
# From apps/customer-web-next:
npm run lint
npm run typecheck
npm run test
npm run build
```

For configuration plans only, from the repository with authorized Azure CLI:

```bash
python3 scripts/finance/configure_bank_runtime.py --output bank-runtime-plan.json
python3 scripts/finance/configure_bank_apim.py --output bank-apim-plan.json
```

No real bank data or provider calls are needed for the automated tests. They do not prove account eligibility, real banking latency, production private routing, browser acceptance or sustained load.

## Rollback, limitations and remaining wider work

Pause new submissions/validation through the admin controls before a bank-worker release rollback; preserve encrypted history, key versions, provider references, consent and audit. Never delete keys needed to read retained records, clear unrelated holds, roll back successful transfer journals or resend unknown provider creates with fresh references. Reconcile already-sent payouts independently from bank onboarding processing.

This release removes routine manual bank verification. It does not remove the merchant's account activation responsibilities, statutory finance classification, chef-business approval or exceptional identity corrections. It does not implement the wider pending subscription financial lifecycle, complete cumulative refunds/compensation, provider-invoice/bank close or statutory GST exports. Those are not silently marked complete by this bank module.
