# Approved email-verification secure runtime setup

This is a separately approved configuration step, not feature activation. It uses existing Azure Container Apps, their existing Key Vault bindings/managed identities and the existing DevOps service connection. It does not create Azure services, grant roles, replace existing credentials, change service images, send email, or run migrations.

## Files and local tests

- `configure_email_runtime.py`: read-only plan by default; apply requires an exact source SHA and the Linux runner. It reuses only generic Azure/environment/identity/drift helpers from `../finance/configure_bank_runtime.py`; finance configuration and finance secret-generation functions are never called.
- `test_configure_email_runtime.py`: 14 deterministic tests for closed gates, key separation/provenance, existing identity requirements, conflicting bindings, concurrency, temporary file handling, no-op plans, runtime/source guards and mocked full-apply preservation.
- `../../azure-pipelines-email-secure-runtime.yml`: runs both email setup tests and19 existing generic runtime tests, then live preflight; its apply parameter defaults false.

Run `python scripts/email/test_configure_email_runtime.py` from repository root. The new14 tests passed on Windows. The reused19-test suite contains a POSIX0600 test that fails on Windows; do not weaken or skip it in the Linux release pipeline. Linux CI must pass both suites before apply. Source-level tests do not prove that Azure permissions or runtime bindings work.

## Exact secure bindings

| Key Vault secret | Container App secret | Consumers |
| --- | --- | --- |
| craves-email-verification-hmac-v1 | email-verification-hmac | Auth only |
| craves-email-verification-transport-v1 | email-verification-transport | Auth + Notification |
| craves-email-projection-internal-v1 | email-projection-internal | Auth + UserChef |

Each newly missing secret uses independent cryptographic randomness. It is passed through a private0600 temporary file, not a command-line value, and the file is removed after the operation. Existing compatible tagged secrets are reused by exact versioned reference. Existing conflicting/disabled/expiring keys stop setup without rotation. The script does not inspect or display secret values. It rechecks missing names immediately before creation; execute only one release run at a time.

All dedicated gates are explicitly FALSE: `CRAVES_EMAIL_VERIFICATION_ENABLED`, `CRAVES_EMAIL_PROJECTION_WORKER_ENABLED`, `CRAVES_EMAIL_VERIFICATION_TRANSPORT_ENABLED`, `CRAVES_EMAIL_VERIFICATION_ALLOW_LOCAL_HTTP`. It does not change the existing general Notification email flag or ACS credentials. The two Auth destination URLs come from the existing Azure-provided service origins.

## Live procedure and safety

1. Choose the isolated reviewed branch/commit and leave apply false. Verify33 Linux tests and read-only preflight.
2. Only if all preconditions pass, rerun that exact commit with the approved apply parameter true.
3. The script repeats preflight, verifies all target configurations before creating keys, then applies Notification, UserChef and Auth bindings. It checks unchanged unrelated settings/images and waits for healthy ready revisions. Any drift stops the release; do not remove the checks.
4. Record run/revision outcomes in the customer audit ledger. Keep email capability closed until the coordinated referral-compatible backend/customer-web release, migrations, private-call security/connectivity and real inbox acceptance pass.

No new identity access is granted. If a service has no unambiguous existing Key Vault binding, preflight stops for permission/configuration inspection. Never substitute a broad admin, Firebase, payment or ACS credential for one of these dedicated keys.

## Partial failure and recovery

Azure changes are not a distributed transaction. Created keys and applied references may remain after a later step fails. Do not delete or rotate them; inspect the exact failed step and current revisions, then resume against compatible metadata after review. Existing unrelated configuration drift blocks automatic continuation. Do not activate email to test whether a failed setup might work.

This configuration does not install missing email-verification handlers. The live Auth referral image lacks them; the coordinated code release remains separate. See `../../docs/auth/EMAIL_VERIFICATION.md` for the exact API, migration, activation and rollback contract.

