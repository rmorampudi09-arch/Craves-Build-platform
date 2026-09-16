# Customer web: guarded production rollout

## Scope

Complete the compatible web email-verification deployment without changing the existing Razorpay production mode, Firebase identity, service origins, secret bindings, resource sizes or replica limits. This is an image-only update of the existing `ca-craves-web-prodlow` through Azure pipeline 93 (`azure-pipelines-razorpay-customer-web.yml`). No new infrastructure, backend migration or financial transaction is included.

The owner has approved proceeding with necessary fixes and live deployment. That permission does not establish successful inbox delivery, real payment acceptance or all 46 launch findings.

## Changes

- `scripts/release/verify-customer-web-runtime.py`: retain the complete template/configuration/identity fingerprint, require one healthy active serving revision and actual ready replica, and reject unsafe recovery after drift. Adapted selectively from PR348, not a wholesale merge.
- `verify-reviewed-service-source.sh`, `verify-reviewed-service-image.sh`, `resolve-reviewed-service-image.sh`: bind checkout, source label, local image configuration and registry digest; refuse mutable deployment references.
- `verify-web-release-evidence.py`: require the exact current main SHA, successful complete regression workflow, all four successful jobs and current summary artifact. Public checks use only readiness metadata and unauthenticated denials, without reading account bodies or sending OTPs.
- Pipeline 93: manual main-only run; explicit source and regression run; existing production mode only; image-only deployment; preserve a resolved rollback digest before rollout; inspect state before recovery and verify recovery if attempted.
- `scripts/release/tests/test-customer-web-runtime.py`, `test_web_release_evidence.py`, `test_web_release_image.py`: pure fixtures and mocked commands; no Azure writes or production accounts.
- `.github/workflows/launch-regression-ci.yml`: run the new release safeguards alongside full existing backend/web checks.

## Release steps

### First guarded attempt: safe stop before live mutation

Azure39096 ran on merged mainb0cc44f574eb4fff7a31682fd8baaa14f57b2700 with successful full regression35112960978. Its clean install, lint, typecheck, all web tests and production build succeeded. The next step rejected tracked source drift before runtime reads, image publishing or deployment. The pinned Next16.3.5 generator adds the missing `./.next/types/root-params.d.ts` declaration import. The follow-up commits that generated declaration and adds a post-build tracked-source check to the required regression, with a boundary test. The release source guard remains unchanged; no reset, path exclusion or dirty-source bypass is introduced. Run39096 remains failed evidence, not a deployment success.

1. Merge through the existing protected PR route after the candidate's required exact-source regression succeeds.
2. Wait for the full regression on the exact resulting main SHA. A PR-head green is not interchangeable with the merged commit.
3. Run existing pipeline 93 on main, `confirmReplaceCurrentCustomerWeb=true`, `targetEnvironment=production`, `expectedReleaseSha=<exact main SHA>`, `imageTag=<same SHA>`, `regressionRunId=<successful main regression run>`.
4. Existing Firebase variables stay in the pipeline; do not paste them into chat or add private backend keys as Docker build arguments. No variable/secret creation is needed for this change.
5. Record the pipeline receipt, immutable new/previous images, revision health, unchanged settings and both direct/public smoke results.
6. Complete the legitimate chef email-verification flow with an owner-controlled mailbox. Test invalid/expired/reused/replaced-email and cross-account cases using dedicated test identities, not actual customer account mutations.

### Second guarded attempt: configuration comparison safe stop

PR363 merged as `da34ac40ce644b84826cdf29c37d2cdd1a3baad6`; full main regression35115644866 passed. Azure39100 passed the clean-source guard but stopped during initial runtime capture, before publishing or selecting an image: desired and revision templates represented defaults differently. No rollback was needed because there was no deployment.

Read-only Azure39102, source `54800c5f9acfd5b082f7a59a758b98200128695e`, inspected serving revision `ca-craves-web-prodlow--0000086`. It found exactly four representation differences: omitted versus empty probes; desired ephemeralStorage versus omitted revision metadata; desired cooldown300 versus null; desired polling30 versus null. Literal environment settings were not exported. This receipt alone does not prove the storage string is the expected value.

The follow-up uses a separate running-template comparison, leaving the desired-configuration fingerprint unchanged. It resolves absent/null timers to documented300/30, absent/null probes to an empty list, and absent temporary-storage metadata to the documented CPU-derived value ONLY for one container without init containers. Explicit non-default storage, timer changes, resource changes, nonempty probes and unknown fields continue to fail. The live release must still pass this comparison; no blanket field deletion is allowed. Ten runtime tests and four audit tests pass locally, including rejection fixtures and unchanged desired-fingerprint behavior. Fresh exact-source full CI and live release acceptance remain required.

Sources: [Azure scaling defaults](https://learn.microsoft.com/en-us/rest/api/resource-manager/containerapps/container-apps/get?view=rest-resource-manager-containerapps-2025-07-01), [CPU-derived ephemeral allocation](https://learn.microsoft.com/en-us/azure/container-apps/storage-mounts), [redacted Azure39102 receipt](https://dev.azure.com/ravitejamorampudi7777/ac93a324-7998-45b3-9ab4-e0b590996fcb/_apis/build/builds/39102/logs/7).

## Local verification

### Successful production rollout39106

At16:24:46UTC (21:54IST), pipeline93/run39106 verified merged main `48d0941b3a8210e7754073b99584d19d48bc5c9a`, backed by complete main regression35120102748 and aggregate artifact10457745125. Serving revision is `ca-craves-web-prodlow--0000087`, one healthy active revision, one ready/started replica and100% traffic. The complete desired non-image runtime fingerprint and production Razorpay mode were preserved. New digest and pre-resolved rollback digest are in `evidence/web-release-39106.json`. No recovery ran.

All four email-verification routes returned401 with private/no-store/max-age0 at BOTH the direct app origin and craves.in; merchant readiness stayed production-eligible. These deliberately anonymous probes did not send email. After a fresh owner sign-in, the updated profile showed a verified email and Refresh verification status retained it. The owner explicitly confirmed receiving and successfully entering a Craves code today. The existing owned Ready For Pickup order now shows matching headline and timeline, appropriate delivery-update text and the Total label. These subsequent browser and owner confirmations are separate from anonymous rollout probes. No additional code was sent; no password, cart, order or payment was changed by the agent. No new APK or full launch readiness is claimed.

Python 3 and PyYAML 6.0.2; Bash/Git available on PATH:

```text
python scripts/release/tests/test-customer-web-runtime.py
python -m unittest discover -s scripts/release/tests -p 'test_web_release_*.py' -v
```

The complete GitHub regression additionally runs all seven Java services against disposable PostgreSQL/PostGIS, the whole web suite and connected synthetic finance checks. Never run the database fixtures against a production connection.

During continuation, separate main run35108176803 exposed a resend-countdown UI test timing failure while the full main regression35108176936 passed. The failed receipt is retained, not dismissed. The test previously advanced fake time after a DOM query that could resolve before React installed the interval effect. It now flushes the fetched state and timer effect before advancing, requires an installed timer, checks disabled at59 seconds and enabled at60, and retains the no-early-request and challenge-ownership assertions. All16 email UI tests passed in five consecutive local runs after this test-only correction. Fresh exact-source CI must pass before release; no application timer logic was weakened.

## Manual steps / remaining inputs

- Azure: use the existing authenticated portal and pipeline service connection; no new paid resources or permissions.
- Mailbox: the owner authorized the existing profile inbox and confirmed successful receipt/code verification on16 September; fresh browser verified-state checks also passed. No further verification email is needed for this observation.
- Credentials: retain existing Firebase and Azure bindings; never print or export secret values.
- No DNS, signing certificate, app-store or APK change in this web-only package.

## Recovery boundaries

On a rollout failure, re-read the live desired state. Recover to the pre-resolved prior image only when the requested new image is still selected and all non-image settings still match. Otherwise stop automatic writes and inspect concurrent changes. Do not overwrite somebody else's newer release, restore mutable tags, disable email checks or alter payment settings to obtain a passing check. Successful unauthenticated route checks do not prove inbox delivery or canonical email projection.

## References

- https://learn.microsoft.com/en-us/cli/azure/containerapp#az-containerapp-update (image-only update)
- https://nextjs.org/docs/app/guides/self-hosting (standalone output and build-time public configuration)
