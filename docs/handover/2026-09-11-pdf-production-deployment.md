# PDF production deployment — 2026-09-11

## Deployed source and evidence

- Application source: `6a7517a2371aa64617f5a97f1c72cef498a46292` (merged PR #321).
- Backend deployment succeeded: [Azure run 38845](https://dev.azure.com/ravitejamorampudi7777/Craves/_build/results?buildId=38845&view=results), all four stages green and seven services healthy.
- Customer web deployment succeeded: [Azure run 38846](https://dev.azure.com/ravitejamorampudi7777/Craves/_build/results?buildId=38846&view=results). Image `craves/customer-web-next:38846`; initial ready revision `ca-craves-web-prodlow--0000079`; Razorpay mode remains production and productionEligible=true.
- Notification Flyway logs prove V6 private PDF documents applied successfully at 2026-09-11T11:44:35Z.
- Application test evidence: [GitHub CI 34590751283](https://github.com/rmorampudi09-arch/Craves-Build-platform/actions/runs/34590751283), including required PDF tests without skips.

## Azure configuration completed

- Existing account `stcravesprodlowl3ing6`; new private container `pdf-documents` with public access off.
- Notification has the three source-service HTTPS origins, Blob endpoint and container configured.
- API `craves-documents-v1` has all seven dedicated operations. Unauthenticated capabilities and download requests return 401 with private/no-store cache headers.
- Fixed initial APIM provisioning: structured ResourceNotFound errors, UTF-8 BOM, raw policy XML, and Consumption tier support. Nine offline tests passed after the live JSON-schema correction. Consumption uses bounded backend concurrency; application per-owner quotas remain unchanged.
- Deployment helper fixes are in `9785027924acf1d322ea980a9a4a4260f2f177ab` and its preceding fixes; these do not change application images.

## Approved activation completed

The user explicitly approved the container-scoped Storage Blob Data Contributor grant. It was applied to the system-assigned managed identity of `ca-craves-notification-service-p` (object ID `07a4694c-ce0f-4615-a7b6-15341e1dbced`), scoped only to the `pdf-documents` container in `stcravesprodlowl3ing6`.

- Source adapters enabled and healthy: Order revision `--0000080`, Integration `--0000140`, Subscription `--0000040`.
- Notification generation, worker and email enabled: storage-fix revision `--0000040` is latest and ready, health checks passed.
- Customer web document controls enabled: `ca-craves-web-prodlow--0000080` is latest and ready. Existing Razorpay production readiness remains valid.
- Both web and APIM document capabilities endpoints reject unauthenticated access with HTTP 401 and private/no-store headers.

## Live acceptance and follow-up fixes

The user authorized CAPTCHA completion, SMS login, PDF email activation and one controlled test email. CAPTCHA and secure SMS sign-in completed successfully; no secret codes are recorded here.

Two production-only problems were found and fixed:

1. APIM rejected valid create JSON as an unspecified content type because the operation did not declare a request representation/schema. Commit `ccbb9d185c4c0ac4e35886615a274f9875532658` registers the API schema and binds the JSON representation. It was applied to the existing API. Validation remains enabled, capped at 2 KiB, and rejects additional properties. A valid-shaped request with an intentionally invalid bearer reaches authentication and is denied (403); an unexpected recipient property is rejected (400).
2. The Blob privacy check used Get Container ACL, which requires Data Owner. Commit `cb67cda28712be97456aef0b06045cfeb248b49c` uses Get Container Properties and its public-access indicator, compatible with the already approved Data Contributor role. No permission expansion was needed. Three regression tests cover private upload, rejection of both public access types, and failure of the privacy read.

[Notification deployment 38848](https://dev.azure.com/ravitejamorampudi7777/Craves/_build/results?buildId=38848&view=results) succeeded: Maven build/tests, immutable image build/push, runtime-preserving deployment and health checks. Image `craves/notification-service:38848`, ready revision `ca-craves-notification-service-p--0000040`. Other services retain the successful 38845/38846 deployments.

### Passed

- Generated a payment receipt from an existing owned PAID order through the customer Orders UI; status reached READY. No payment or delivery booking was created.
- Downloaded the saved PDF through the normal signed-in UI. The client reported successful byte-length/SHA-256 integrity verification.
- Inspected the actual download: one A4 page, 13,616 bytes, PDF 1.6, approved logo, legible tables, saved INR 1.00 order total and explicit receipt notice.
- Anonymous downloads of the actual generated receipt returned HTTP 401 with private/no-store headers at both the customer-web proxy and APIM.
- Download SHA-256: `6e237d3709a3df8e01fba2e685c22d428e1c49f4e64097a63973e2749dd18d90`.
- The original pre-fix rendering attempt exhausted its bounded retries and remains FAILED in history. No audit or document records were reset.

### Email verification required

One email request was queued and finished FAILED with `EMAIL_PREFLIGHT_FAILED_OR_UNVERIFIED`. The existing Auth internal endpoint confirmed the same owner is ACTIVE, has no email address, and has `emailVerified=false`. The request stopped in preflight before ACS submission; no test PDF email was sent and no resend was attempted.

Email generation/worker/web flags remain enabled. The owner must supply and complete verification of an account email through the normal verification flow before the approved one-email acceptance test can finish. Never mark an email verified administratively to bypass this condition.

Cross-account signed-in isolation and additional-language/chef statement acceptance were not exercised with a second account. Do not present those as live acceptance results.
