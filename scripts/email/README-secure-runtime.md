# Approved email-verification secure runtime setup

## Verified application — 16 September 2026

Run39050 succeeded at `6c623022bce24c15259ffb71c3aa3791295732c3`: https://dev.azure.com/ravitejamorampudi7777/Craves/_build/results?buildId=39050. All40 Linux tests passed. The health-alignment stage succeeded, then the secure setup reported zero existing compatible keys, created three approved dedicated keys and verified healthy Notification, UserChef and Auth bindings with existing images/unrelated settings preserved. Email verification remains disabled and is not functionally certified. No key values were exposed. Earlier stopped attempts below remain historical evidence, not the current deployment state.

This is a separately approved configuration step, not feature activation. It uses existing Azure Container Apps, their existing Key Vault bindings/managed identities and the existing DevOps service connection. It does not create Azure services, grant roles, replace existing credentials, change service images, send email, or run migrations.

## Files and local tests

- `configure_email_runtime.py`: read-only plan by default; apply requires an exact source SHA and the Linux runner. It reuses only generic Azure/environment/identity/drift helpers from `../finance/configure_bank_runtime.py`; finance configuration and finance secret-generation functions are never called.
- `test_configure_email_runtime.py`: 14 deterministic tests for closed gates, key separation/provenance, existing identity requirements, conflicting bindings, concurrency, temporary file handling, no-op plans, runtime/source guards and mocked full-apply preservation.
- `../../azure-pipelines-email-secure-runtime.yml`: runs both email setup tests and19 existing generic runtime tests, then live preflight; its apply parameter defaults false.
- `repair_notification_health.py` and its7 guard tests: optional, separate correction for the unused Redis health indicator. It requires the exact inspected Notification image, existing explicit `CRAVES_TOKEN_REVOCATION_ENABLED=false`, no Redis connection/configuration overrides and healthy lifecycle probes. It never changes the revocation flag, authentication, credentials or image. A configured/enabled dependency fails closed instead of being hidden.

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

1. Choose the isolated reviewed branch/commit. The final pipeline runs40 Linux tests (14 email setup,7 health-alignment,19 reused runtime guards). Both apply parameters default false.
2. Only if all preconditions pass, rerun that exact commit with the approved apply parameter true.
3. The script repeats preflight, verifies all target configurations before creating keys, then applies Notification, UserChef and Auth bindings. It checks unchanged unrelated settings/images and waits for healthy ready revisions. Any drift stops the release; do not remove the checks.
4. Record run/revision outcomes in the customer audit ledger. Keep email capability closed until the coordinated referral-compatible backend/customer-web release, migrations, private-call security/connectivity and real inbox acceptance pass.

No new identity access is granted. If a service has no unambiguous existing Key Vault binding, preflight stops for permission/configuration inspection. Never substitute a broad admin, Firebase, payment or ACS credential for one of these dedicated keys.

## Partial failure and recovery

Azure changes are not a distributed transaction. Created keys and applied references may remain after a later step fails. Do not delete or rotate them; inspect the exact failed step and current revisions, then resume against compatible metadata after review. Existing unrelated configuration drift blocks automatic continuation. Do not activate email to test whether a failed setup might work.

This configuration does not install missing email-verification handlers. The live Auth referral image lacks them; the coordinated code release remains separate. See `../../docs/auth/EMAIL_VERIFICATION.md` for the exact API, migration, activation and rollback contract.

## Why the optional health alignment exists

Read-only run39044 passed its31 tests but stopped on Notification root health503 before any writes. Run39046 resolved the deployed Notification image to source6691aa2ff663e51a257407b9b1f4b5b7b4ba87d5. Its Redis source consumer is only the optional revocation interceptor. Runtime explicitly disables that feature and has no Redis connection configuration, but its default library health check repeatedly attempts loopback:6379. Auth already has the corresponding unused Redis health indicator disabled. The narrowly guarded alignment changes only `MANAGEMENT_HEALTH_REDIS_ENABLED=false` in Notification and requires root health200 afterward; it does not suppress a configured Redis dependency or disable a security feature.

If the optional health-alignment parameter is true, its read-only guard and scoped correction run before email preflight. A failed health correction prevents key setup. Before changing either setting again, inspect current service image/configuration and retained run evidence; do not assume this diagnosis remains true after a future feature activation. Enabling Redis-based revocation later requires configuring its real connection and re-enabling its dependency health monitoring in that release.

Run39047 passed40 tests but stopped before writes because the first guard rejected all profile overrides. Read-only39048 then confirmed the only override is `SPRING_PROFILES_ACTIVE=prod`. Exact source6691aa2 contains only application.yml, no profile-specific resource and no @Profile beans. The corrected guard at6c623022bce24c15259ffb71c3aa3791295732c3 permits only that inspected literal prod profile; arbitrary profiles/imports/JSON/extra groups still fail. This is a evidence-based guard refinement, not bypassing an unknown configuration.

