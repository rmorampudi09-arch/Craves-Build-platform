# Centralized MSG91 phone OTP

This patch extends the existing Spring Boot auth service and preserves its live
runtime, account authority and legacy widget verification. Both current clients
send/verify through Craves. The MSG91 server authkey stays in the existing Azure
Key Vault secret, never in web JavaScript, the APK, source archives or receipts.

## Sources

- `auth/Fetch-Baseline.ps1`: fetch the exact immutable live auth runtime.
- `auth/Build-Patch.ps1`: compile Java 21 additions; verify every baseline entry.
- `auth/src/main/java/in/craves/auth/centralotp`: provider, database lease/store,
  consumed-proof identity bridge, controller and request bounds.
- `auth/src/main/resources/db/migration/V19__centralized_phone_otp.sql`: two
  isolated auth tables; no alteration to customer identities or orders.
- `auth/src/test/java/in/craves/auth/centralotp`: real PostgreSQL concurrency,
  replay, budget and identity tests plus synthetic HTTP provider contracts.
- `Prepare-Web.ps1`: restore exact live web source `e828209dc127085b8c1ffff84387a974b9eeef56`
  and apply the web-only transport overlay. The baseline Git object must exist.
- `web`: complete replacement transport and same-origin bounded BFF routes/tests.

## Contract

POST `/api/v1/auth/otp/send`: `{ "phoneNumber": "9876543210", "countryCode": "91" }`.
Resend includes the previous opaque `challengeId`. Response:
`{ "challengeId": "43-character opaque ID", "expiresAt": 1790928900000, "resendAvailableAt": 1790928030000 }`.
Times are UTC epoch milliseconds, not local-time strings. No provider request ID
or credentials are returned. India-only validation matches existing product policy.

POST `/api/v1/auth/otp/verify`: `{ "challengeId": "opaque ID", "otp": "six digits" }`.
Response `{ "firebaseCustomToken": "one-use-compatible custom token" }` feeds the
existing Firebase identity compatibility layer and Craves token exchange. This
is not Firebase SMS and is not a new independent user/session database.
Web uses same-origin `/api/auth/otp/send` and `/api/auth/otp/verify` BFF routes.

## Settings

Existing backend `MSG91_AUTHKEY` secret reference and `CRAVES_MSG91_ENABLED=true`
are reused. New backend `CRAVES_MSG91_OTP_TEMPLATE_ID=6abe727541deb95f6d0b7192`
and `CRAVES_CENTRAL_OTP_ENABLED=true`. Web adds only the latter flag.
No new frontend credential or APK environment variable is needed. Do not send
keys or OTPs in chat. Do not log provider query strings: official Verify OTP
uses GET with the code, while the authkey is a header. Provider exceptions and
diagnostics are not returned or logged by this patch.

## Local verification

Use Java 21 and Maven 3.9.9. Fetch and build the baseline to a fresh artifact folder.
Start an isolated PostgreSQL 16 server on `127.0.0.1:55447` with a test-only
`postgres` user; tests create `central_otp_test`. Never point these destructive
test fixtures at production. Run Maven `test` with `-Dbaseline.jar=` set to the
generated `baseline-classes.jar`. No test calls MSG91 or sends real SMS.
For web run `Prepare-Web.ps1`, `npm ci`, TypeScript, Vitest, Node tests and build.
For mobile run `npm ci`, TypeScript and Jest with `backend-patches` excluded,
then the existing release APK script. Build/install without clearing app data.

## Production rollout and rollback

Build immutable ACR images, deploy auth first with the additive migration, verify
health and request validation, then web and Android. Keep legacy widget settings
and routes unchanged for older clients. APIM operations add only the two new
POST routes, per-IP burst bounds, body size and exact Craves CORS origins.
Existing gateway role and authentication policies are not removed.
Restore the previous web/auth images if a real acceptance check fails. The additive
tables may remain; never undo unrelated migrations or change user identities.
Previous Android tag `KUSHIRAVI-app-v1.22` is untouched. Android cannot normally
replace a higher versionCode with a lower one; a compatible rollback build is
preferable to uninstalling and losing local data.

## User-only acceptance and limits

User requests and enters real OTPs on web/phone. Verify the existing account IDs,
Customer/Chef access, refresh and reopening. Testing invalid input is not proof of
SMS delivery, account login or shared-wallet billing. A newer challenge for the
same phone replaces the older pending challenge; signed-in sessions on both
platforms remain independent and can coexist. Different phones can verify in parallel.
The same Key Vault authkey/template account provides one wallet; confirm accepted
requests and debits in that account's OTP logs, never infer carrier delivery from
HTTP success. Existing DLT-approved template/sender is reused, not re-created.

Conservative launch limits are 5 sends per phone/hour and 100 sends across clients
per minute. This is abuse protection, not capacity for 1M simultaneous sign-ins.
PostgreSQL serializes only the short reservation/finalization transactions; provider
HTTP calls never hold database locks. Larger scale needs measured capacity and
approved configurable budgets/edge bot protection, not removal of safeguards.
The pinned existing Spring Boot 3.3.7 runtime is old; updating it is a separate
security-maintenance task, not silently bundled into this login migration.

Official contracts: https://docs.msg91.com/otp/sendotp and
https://docs.msg91.com/otp/verify-otp . Actual live receipt is recorded separately
in `C:/mscratch/apps/mobile/docs/msg91-centralized-live-20261002.md`.
