# Temporary email verification test bypass

This corrects the misunderstood test request: three exact test email/phone pairs can verify with the private code already used for the temporary phone OTP tests. Notification/ACS delivery is skipped only for those pairs. All other emails use the original transport.

The helper is disabled by default. Enable with CRAVES_EMAIL_TEST_ENABLED=true and CRAVES_EMAIL_TEST_WHITELIST_JSON referencing a private secret containing exactly three lowercase email-to-phone mappings. Each phone must already occur in the existing 210-phone registry with a CHEF-E2E label. The label does not grant CHEF authority. The helper reuses CRAVES_OTP_TEST_ENABLED, CRAVES_OTP_TEST_CODE and CRAVES_OTP_TEST_EXPIRES_AT; it never extends the existing expiry. Do not put actual emails, phones, OTP values or runtime secret files in Git or reports.

The service verifies the signed account phone against its current database phone before issuing or accepting a test challenge. It retains canonical identity status/token-version checks, MAC storage, five wrong-code attempts, ten-minute challenge expiry, one-minute email resend cooldown, hourly send limits, request idempotency, owner isolation, replay rejection, audit and canonical email projection. Expired or disabled test pairs fail closed rather than being sent through ACS. A verified email can remain verified after bypass expiry; expiry disables new test verification, not historical account state.

Changed source:

- services/auth-service/src/main/java/in/craves/auth/email/EmailVerificationTestBypass.java: validates exact pairs, shared phone-test settings and expiry.
- services/auth-service/src/main/java/in/craves/auth/email/EmailVerificationService.java: selects a test code only for an active matching pair and skips its transport; keeps all original verification rules.
- services/auth-service/src/test/java/in/craves/auth/email/EmailVerificationTestBypassTest.java: disabled/expired/foreign-account/invalid-config and normal-email cases.
- services/auth-service/src/test/java/in/craves/auth/email/EmailVerificationPersistenceTest.java: four added disposable-PostgreSQL cases covering canonical writes, wrong attempts, current phone ownership, expiry, resend/replay and normal transport.

Local validation: Java 21 and Maven 3.9.9; run mvn -B -f services/auth-service/pom.xml test. Database cases require the existing explicitly disposable CI PostgreSQL service; their local skips must be reported. Existing .github/workflows/email-verification-ci.yml runs the real migration/transaction/concurrency cases in CI without production database access.

Production packaging uses the verified currently running Auth JAR as its baseline. Original EmailVerificationService source method bytecode is checked against that JAR before patching. Repack only the changed service/helper classes; preserve all other JAR entries, the existing phone OTP bypass and the exact baseline container image. Do not rebuild unrelated newer main Auth changes into this release.

Activation must preserve all existing Auth environment values, ingress, identities, scaling, secrets and the phone-test expiry. Add only the new enable flag and a secret reference for the three email pairs. Compare all other Container App images/configuration before and after. Store only sanitized deployment/build receipts in the handover.

Manual steps: no new Azure resources, DNS, Firebase or payment setup. The release uses the existing registry/build service and may consume existing paid build minutes. No code is deployed until its local and disposable-PostgreSQL checks pass. Keep the integration PR draft until review and release-manifest reconciliation.

Rollback: restore the captured prior Auth image and remove the two CRAVES_EMAIL_TEST_* environment entries. Existing phone-test settings and expiry remain unchanged. Remove the dedicated email-pairs secret only after no revision references it. Do not delete or rewrite canonical/audit records; rollback does not undo test account verification. Disabling CRAVES_EMAIL_TEST_ENABLED stops new verification for listed emails, while other emails continue normally.

Browser validation must use the shared private test code from the workbook, not an invented email OTP. Use fresh designated test phones, verify wrong then correct code, reload canonical state, reject cross-account pair use and replay, and check normal email still routes through the existing transport. Upload marked test graphics only to the designated account. No order/payment requests, privilege grants or public dish publication are implied by these tests.
