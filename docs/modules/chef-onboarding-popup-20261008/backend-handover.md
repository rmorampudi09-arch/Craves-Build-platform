# Chef onboarding backend and release contract

Updated 8 October 2026 for initial Chef onboarding while RazorpayX is pending. This file describes implemented source. Production completion must be established by the exact release receipts; a merged change or successful frontend build alone does not prove deployment.

## Implemented frontend-to-backend coverage

| Feature | Authoritative backend contract |
| --- | --- |
| Partial Basic save / resume | PATCH `/api/v1/chef/onboarding`; nullable incomplete details, field limits, owner and `expectedVersion`. No application creation or email-verification bypass. |
| Completed section save | PUT `/api/v1/chef/onboarding`; verified Auth email and complete Basic fields; saves an application when kitchen details are complete. |
| Current state and next action | GET `/api/v1/chef/onboarding`; draft/version, application, documents and additive review progress. |
| Two kitchen photos and selected proof | Existing POST proof-files; two photo slots and front/back requirements for the selected identity type. Historical evidence remains separate. |
| Saved proof preview | GET `/api/v1/chef/onboarding/documents/{id}/preview`; owner check and private short-lived Blob SAS. |
| Saved proof removal | DELETE `/api/v1/chef/onboarding/documents/{id}` with expected version; logical removal, history snapshot, approved/submitted locks. |
| Number-only FSSAI | Fourteen-digit number, no mandatory certificate upload. Final approval still requires an administrator's review of the current number with recorded evidence. |
| Review / corrections | POST `/api/v1/backoffice/chef-onboarding/applications/{id}/review`; START_REVIEW, REQUEST_INFORMATION, VERIFY_FSSAI. Corrections clear submitted state and require resubmission. Reopening rejection preserves its prior application snapshot. |
| IFSC bank / branch | GET `/api/v1/chef-onboarding/bank/ifsc/{ifsc}`; authenticated, bounded per-identity lookup against the fixed official Razorpay IFSC origin; exact response-code validation. |
| Bank enrollment | Existing GET/POST `/api/v1/chef-onboarding/bank`; encrypted account handling and masked read model, server-derived bank/branch, fresh saved-holder matching. |
| Final submit | POST `/api/v1/chef/onboarding/submit`; current Terms, expected version and completed evidence. Initial onboarding defers bank enrollment, records that explicitly and allows admin review/approval. If the server's bank requirement is explicitly enabled later, matching current-holder enrollment is again mandatory. Retry of the same saved submission is idempotent. |
| Callback / learning | Existing authenticated help and content/playback APIs; real support case reference, language-specific published content and private playback. Missing video keeps text/help available. |
| Kitchen handoff | Completed reviewed onboarding can prefill a new kitchen. Existing approved applications and historical evidence retain approval and address; operational publishing guards remain. |

The browser uses the existing authenticated same-origin BFF. Upstream `/api/v1` is supplied by the established API base. New PATCH, preview/remove, review-action and IFSC operations are allowlisted in the BFF and gateway publication helpers.

## Additive migrations and compatibility

- User/Chef V16 adds review progress, Terms/bank references, FSSAI review evidence, action/document history and logical evidence removal.
- Integration V149 adds bank and branch labels to existing encrypted bank enrollment records.
- No prior migration checksum changes. Release preflight requires all previous migrations to match, allows only these latest migrations to be pending, and checks backup metadata.
- Existing mobile, customer login, financial encryption, bank consent/idempotency, payout holds and provider controls remain in place. Existing approved Chef evidence is not reset to pending.

## Production bank dependency

The inspected production Integration runtime has `CRAVES_BANK_PROVIDER_ENABLED=false`. These bindings are missing:

- `CRAVES_RAZORPAYX_KEY_ID`
- `CRAVES_RAZORPAYX_KEY_SECRET`
- `CRAVES_RAZORPAYX_ACCOUNT_NUMBER`

An entitled RazorpayX account, its correct existing secret bindings, provider enablement and authoritative submission/validation controls are required for actual bank processing. Do not substitute checkout credentials, fabricate verification, or change financial controls to make onboarding appear complete. IFSC branch lookup is separate from bank-account verification. Initial Chef onboarding deliberately does not require bank setup. `CRAVES_CHEF_ONBOARDING_BANK_REQUIRED` defaults to `false`; GET state publishes `bankEnrollmentRequired=false`, the web skips bank loading/entry, and submission records `BANK_ENROLLMENT_DEFERRED` without fabricating a verified account. Existing saved bank references remain. Documents, verified email, FSSAI review, Terms, ownership/version checks and admin approval remain mandatory. Keep RazorpayX disabled until the owner explicitly confirms readiness. `allowBankUnavailable=true` allows the guarded Chef release; it does not enable provider execution or payouts. An explicit future server setting `CRAVES_CHEF_ONBOARDING_BANK_REQUIRED=true` restores the enrollment requirement, independently of provider enablement. Old or malformed web contracts never implicitly skip bank requirements.

## Exact release process

The scoped Azure DevOps release bridge is **definition #14, Craves (14)**, in **rmorampudi09 / Craves**, on isolated Azure Repos branch `chef-onboarding-readiness-20261008`, file `azure-pipelines-chef-onboarding-production-preflight.yml`. Its reviewed canonical YAML is `azure-pipelines-chef-onboarding-release.yml` in this repository. Existing production pipelines are not replaced.

1. Complete protected exact-source regression and merge PR #442 normally.
2. Wait for successful complete regression on that merged main SHA.
3. Queue #14 with `releaseSha` and matching `regressionRunId`: preflight, backend, apim, web, then activate. Write operations require `confirmDeploy=true`.
4. Backend releases Integration then User/Chef to immutable source-labeled images and verifies V149/V16. APIM publishes only Chef onboarding and the dedicated authenticated IFSC leaf. Web releases `apps/customer-web-next` and records the real build SHA.
5. Activate the matching Chef/web runtime flags and the Integration service origin after image and migration readbacks. If bank credentials remain absent, use `allowBankUnavailable=true` and report that limitation precisely.
6. Verify healthy revisions, exact image/source, the visible Chef page, unsigned API denial, and authenticated application flows with an authorized test identity. Do not claim live OTP, private uploads, Terms consent or provider processing from unsigned smoke checks.

Target: `rg-craves-prodlow-centralindia`; service connection `Craves-RMORAMPUDI09-Service-Connection`; apps `ca-craves-integration-service-pr`, `ca-craves-user-chef-service-prod`, `ca-craves-web-prodlow`; APIM `apim-craves-prodlow-kmqgfy`; ACR `cravesrm09prodlow6bf632`.

Source/runtime/secret/rollback checks remain mandatory. No DNS, unrelated admin redesign, mobile changes, bank execution or payout-policy changes are part of this release.

