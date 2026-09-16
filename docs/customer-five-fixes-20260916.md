# Customer review, email and checkout repairs

## Scope

## Latest result — 16 September 2026, 16:40 IST

Review39064, checkout39071 and email39073 all succeeded live. Email39073 finished at16:36:53: all three new service images passed health/runtime checks, Notification transport and Auth verification/projection flags were enabled, and four authenticated gateway routes verified. Historical failed preflights below are resolved. Exact-source email image tag is `customer-email-4ad490bea2a7ae0ca2f00628e63d3b0e202f407c`; checkout tag is `customer-checkout-1e365e81d24297a92bb6774f5610cce6158d3f67`.

Final02 mobile APK installed preserving app data at16:17:11;264 suites/2,710 tests, TypeScript and scoped lint pass. Existing paid-order summary and receipt were generated live, saved on the phone and visually inspected successfully. Cart cancellation preserves the existing item. Review form and password setup navigation work. Genuine rating submission, actual email receipt/code verification, password entry and real checkout remain customer-acceptance gates. No fabricated review, credential or real order/payment was submitted. Private downloaded PDFs are not in Git or source ZIP.

The user authorized live repairs for review errors, order PDFs, email verification, password setup/reset and checkout. Mobile source and the acceptance ledger are in `C:/Users/saive/CravesStudio`; this checkout contains backend and release changes only. This document is an in-progress record, not evidence that every customer journey passed.

## Review

`scripts/apim/customer-five-fixes.py` publishes only missing POST/PUT `/{orderId}/review` operations on the existing authenticated Order API. Existing backend ownership and delivered-order rules remain unchanged. Run39064 succeeded. Unauthenticated requests now receive401, not missing-route404. No customer rating has been invented or submitted.

## Email

Pipeline122 action `release-customer-email` repeats Java21 Maven verification for Auth, Notification and UserChef, validates mandatory non-skipped email tests, checks immutable live migration hashes, builds exact-source images and updates only their images before enabling scoped email flags. It never creates keys or prints key values. The pre-existing secure-secret references are preserved. Existing Auth referral classes and V12–V14 were restored from exact live source; email migrations become V15/V16. Notification addsV7, UserChef addsV12. No existing migration is modified or applied out of order.

Files: `pipelines/customer-email-test-steps.yml`, `pipelines/customer-email-release-steps.yml`, `scripts/email/customer-email-release.py`, `scripts/email/customer-email-live-migrations.json`, `scripts/email/verify-live-email-migrations.py` and guard tests. Operations planned: GET `/api/v1/auth/email-verification`; POST `/challenges`, `/verify`, `/resend` beneath that path. Owner authentication, attempt/rate limits, exact destinations and existing policies remain enforced.

39068 and the test stages of39069/39070 passed. 39069/39070 stopped before live writes because Azure desired and ready revision environment representations differ. The second diagnostic identifies six original secret-backed Notification variables, but exposes no values. New read-only `inspect-email-runtime` action emits field shapes and equality booleans only. Do not force deployment until this distinction is understood. Actual email delivery/verification remains unverified.

## Checkout

`CheckoutOperationService`, `CheckoutOperationFingerprint`, `CheckoutOperationController`, `CheckoutOperationDtos` and additive migrationV33 implement owner-scoped durable operation receipts. An exact cart snapshot is checked while locked. The service calls the proxied existing Order checkout path so finance/referral advice remains transactional. Retrying an identical operation returns its original result without consuming a new cart; changing the same operation payload is rejected. Existing pricing, taxation, commission, payment and order rules are not invented or replaced.

`pipelines/customer-checkout-release-steps.yml` runs full Order verification with disposable loopback PostgreSQL and mandatory no-skip evidence before image deployment and publication of POST/GET `/api/v1/checkout/operations/{operationId}`. Runtime-preserving deployment is pinned to previous `device-cart-e1cf04e0537e2eaf32f1c494142dd52a3e3bafa0`; unrelated gateway operations remain unchanged. Source currently released by39071: `1e365e81d24297a92bb6774f5610cce6158d3f67` (status still in progress at this checkpoint).

Local tests: checkout service/fingerprint7 passed; `CheckoutOperationDatabaseTest`18 passed against a disposable database, covering concurrent duplicates, stale/different cart, newer-cart preservation, failure rollback, owner isolation and normal referral/finance behavior. These are not real purchases. The older separate payment15-minute retry implementation is not newly deployed by this scope.

## Documents and password

Existing authenticated Notification document routes and generation capabilities are already deployed. Mobile changes add strict source-bound summary/paid-receipt downloads and Android's save picker with PDF/size/SHA-256 validation. Receipts are explicitly not GST invoices. Password setup requires the server-verified email and links to the same existing Firebase phone identity; it never creates a duplicate or merges identities. Password entry/submission and genuine review submission are user handoffs.

## How to test

Run Python unittest discovery in `scripts/apim/tests` and `scripts/email/tests`, then the two immutable-contract verifier scripts. Run `mvn -B -ntp -f services/order-service/pom.xml verify` with a disposable local `chef_ledger_test` database and the LEDGER_TEST environment described in the pipeline. Never set this to production. The email test pipeline supplies separately guarded disposable databases and fails if its required persistence/security suites skip. Use the manual Azure pipeline actions only with the intended branch and full source commit.

## Manual acceptance and recovery

### Latest deployment evidence

Checkout39071 completed successfully: required tests, exact-image runtime/health verification and both gateway operation readbacks passed. Independent unauthenticated GET/POST probes against the real `api.craves.in` gateway return401; no real order/payment was made. Email39072 read-only inspection proved identical secret references with an empty literal field in the app endpoint and an omitted field in the revision endpoint. Eleven guard tests now cover that exact difference, changed references, ambiguous nonempty literals, real flag drift and duplicate names. Corrected email release39073 is running on `4ad490bea2a7ae0ca2f00628e63d3b0e202f407c`; no completion is yet claimed.

No new resource, paid tier, DNS, Firebase project, provider credentials or store signing is required by this patch. Confirm live service health and scoped route readback after release; stop on failed preflight rather than overriding it. Ask the user to submit their actual rating, receive/enter their own verification code, and enter their own password. Inspect downloaded PDFs against the owned order. Review checkout without completing a financial commitment; hand actual payment to the user. Preserve prior APKs, app data and rollback image identities. Whole-app/store, iOS, scale and physical accessibility certification remain open.
