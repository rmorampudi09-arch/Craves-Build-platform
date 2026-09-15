# Craves customer gateway and secure runtime: verified partial live release

## Current checkpoint — 16 September 2026

Independent read-only run39053 succeeded at `a82175ef9a4834a05610e2062d3b68620bde90e8`: https://dev.azure.com/ravitejamorampudi7777/Craves/_build/results?buildId=39053. Auth latest=ready0000043, UserChef0000049 and Notification0000043; all Single mode with100% latest traffic and unchanged images. Allfive intended key-consumer references are present. Verification, projection worker, transport and local-HTTP flags remain FALSE. Existing Notification general email remains TRUE, ACS reference present and sender configured. Final independent root probes report UP for allthree. No functional email/inbox acceptance is implied. Pipeline122 is left on read-only readiness YAML.

DevOps run39050 succeeded at `6c623022bce24c15259ffb71c3aa3791295732c3` after all40 Linux guard tests passed. It corrected only Notification's unused Redis health indicator and created the approved three dedicated email keys in the existing vault. The log recorded zero compatible keys before creation, followed by verified healthy bindings for Notification, UserChef and Auth. Their existing images and unrelated settings were preserved. All dedicated email verification/transport/projection gates remain FALSE. No secret values were displayed, no roles/resources created, and no emails, migrations or payment/order transactions were run. The independent post-release receipt is recorded above.

This supersedes the historical no-key-created readiness snapshot below. The package now also includes complete email configuration/guard scripts and their generic helper/test dependency. These scripts do not install or activate email verification. Coordinated compatible service code, migration and inbox acceptance remain pending.

This package contains complete scoped gateway and email-runtime source, tests, reusable policies/scripts, and the customer-audit progress report. It is not an APK, full backend replacement, database migration release, or full-platform production certification.

## Built and deployed

Delivery-status read routing was restored in successful DevOps run39037. Five review/support GET operations and the Saved dish batch-read resolver were restored in successful run39041. Existing Auth, Order, Catalog, UserChef and Notification images were not replaced. Current referral work and payment settings remain unchanged.

The repair validates live versions, service health, route ownership, inherited policy compatibility and backend authentication before publishing. Customer read policies retain authentication and prevent response caching. Saved lookup returns public catalog projection only. No customer records, payments, orders, uploads, reviews or support messages were created as tests.

## Source and evidence

- Repository: `rmorampudi09-arch/Craves-Build-platform`.
- Isolated remote branch: `fix/customer-audit-gateway-20260915`.
- Delivery rollout: main `870f5293884888aa28f0c069b91a86d06492c9a2`, https://dev.azure.com/ravitejamorampudi7777/Craves/_build/results?buildId=39037.
- Read-only live image/route inventory: run39038.
- Read-route preflight: run39039.
- Partial attempt39040 stopped while parsing a policy response after the first operation; the failure remains recorded, not concealed.
- Successful corrected release: `b24afe7bc1205154c2619059ac788f11dc7646fc`, https://dev.azure.com/ravitejamorampudi7777/Craves/_build/results?buildId=39041.
- Nine safety tests passed locally and in the successful pipeline. Independent six anonymous GET checks returned401; empty Saved batch returned400 with `MENU_ITEM_IDS_REQUIRED`.
- Later readiness diagnostic source `f74d8a590f9174c7f294664e4b12da6827585ec0` only reports email capability gates and whether secret references exist. It never displays secret values or changes configuration.
- Readiness run39043 succeeded: dedicated email-verification/projection settings and key bindings are UNSET; existing general Notification email is enabled, its ACS secret reference exists and sender is configured. Secure setup approval was requested before changing these bindings. No keys have been created or exposed in this pass.

## How to test locally

From the package root, run `python scripts/apim/test_customer_audit_read_routes.py`. Python standard library is sufficient; this command does not access Azure. Syntax-check the supplied bash scripts with `bash -n` in Linux/WSL. Deployment commands use the existing Azure DevOps connection and are not local unit tests.

The full source-level mobile regression separately passed256 suites/2647 tests, strict TypeScript, lint and Android JavaScript bundling. Catalog passed53 executed tests with3 database skips. Those mobile/Catalog source changes are not included in this gateway-only source package and are not newly installed on the phone.

## Manual steps still required

- Use the existing signed-in app to open My Reviews, an already-owned order review, Support history, Saved dishes and delivery tracking. Verify appropriate real-data or empty states; do not create test records on production.
- Secure key bindings are now verified. Email verification still requires a separate compatible Auth/UserChef/Notification/customer-web release, migration evidence and inbox acceptance. Do not enable a partially configured feature. Never share secrets or verification codes in chat.
- Catalog optional ingredients/allergens still require live migration-version inspection, disposable database rehearsal and a compatible service rollout.
- Current mobile changes, including close-spelling search, still require a newly built artifact and real-device acceptance. No new APK is in this package.
- Real order/payment, Chef operations and upload acceptance remain deferred as requested. Production release, iOS certification and full-scale readiness are not complete.

## Rollback and configuration

See `scripts/apim/README-customer-audit.md` for exact operation/API IDs and the scoped recovery plan. Do not delete shared APIs or replace the current service images with this branch. Keep the successful source revision pinned when reproducing deployment. Pipeline122 was created for this diagnostic/repair work and may point to the read-only email inventory at handoff; choose the required reviewed YAML path and branch deliberately. No CI triggers or paid resources were added.

The included audit report records the broader remaining work and P128 HOLD. The requested extensive final project handoff is still pending; this document does not pretend to be that completed handoff.

