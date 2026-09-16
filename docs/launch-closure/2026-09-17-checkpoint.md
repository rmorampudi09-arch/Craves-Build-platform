# Launch readiness checkpoint - 17 September 2026

## Outcome and boundaries

The live Auth protection is enabled and its bounded response verification passed. This is not public-launch acceptance. No new APK, real order, payment, refund, payout, customer balance, fabricated document or paid test infrastructure was created by this continuation. The owner's final payment/delivery/bank journey remains NOT RUN.

This dated checkpoint supersedes stale present-tense status in older chronological records. Historical failed runs remain failed; later successful checks are separate evidence, not rewrites of those outcomes.

## Auth: source, rollout and live response evidence

- PR367 merged at `2ab2e36d30276a039121529656b8c24e6fecdd64`. Exact-main full regression `35131529167` passed all four required jobs.
- Azure39117 built, source-verified and published immutable Auth image `cravesprodlowacr82121.azurecr.io/craves/auth-service@sha256:58406225368594ac39a606e3fc38d01fc60be53100cef1721c2416b7e2b620e7`. The update was sent, but its first asynchronous settings read still returned the old template. Acceptance stopped. Run39117 remains FAILED.
- Read-only Azure39119 observed healthy ready revision `ca-craves-auth-service-prodlow--0000046`, one replica, the expected immutable image and all ten explicit settings. No customer requests or policy writes occurred during that inspection.
- PR371 corrects the premature checker failure. It tolerates only the exact old template during a bounded wait, then requires the complete candidate and healthy serving revision. Unexpected settings, another image, unrelated drift and regression to the old template remain failures. It also adds a verification-only recovery action with no deployment command.
- All43 local Auth guard tests passed, including23 activation/recovery tests. Exact-head full regression `35134327769` passed all four jobs on `07828018bf73ed051495a5c3fc0a28c802f59582`. PR371 merged as `09cf6454b515d37452ae61777a04926fb8180b66`.
- Azure39122 used that tested checker to verify the already-running image without a second deployment. At `2026-09-16T18:35:21.514064Z` (17 September, 00:05 IST), both malformed routes returned private400 responses, ten attempts using one impossible random refresh token returned private401 responses, and attempt11 returned private429 `AUTH_RATE_LIMITED` with Retry-After44 seconds. Exactly13 synthetic requests were sent. No Firebase credential, OTP, email or genuine account was used.
- The before/after ready revision and unrelated-settings fingerprint matched. Image/configuration changes, gateway edits and automatic protection disablement did not occur in the verification run.

Original unrelated-settings fingerprint: `cd21b72cfdffc279918efdf98d35dcaec0491ab8d1957377b700f9790d095577`.

The automated protected receipt correctly records `realSignInAccepted=false`: synthetic probes do not prove real sign-in. After this run, the owner separately confirmed: "Yes, sign-in and Profile work" in response to the request to test normal sign-in and Home/Profile. This is owner-reported post-update journey acceptance, not an independently observed refresh/revocation or load test. Shared database failure behavior, edge/gateway enforcement and sustained capacity remain separate tests.

## Email verification

The owner explicitly confirmed receipt of a Craves verification email and successful entry of its code on16 September. The signed-in chef page also displayed the verified-email state. This closes the missing owner-mailbox observation, not every email requirement.

Azure39098 aggregate health showed no observed pending projection mismatch or failed/unknown delivery receipt in its scoped snapshot. Aggregate counts cannot prove cross-service equality for a particular identity and version. Cross-account cases, email replacement/revocation, sustained delivery and alert ownership remain open. No additional verification email was sent in this continuation.

## Chef application screens

PR368 merged as `541ef4e9d6777b43310281f74af1f3068aea2453` after exact-head full regression `35131582675` passed. The fix adds explicit bounded loading/error/retry, cancellation on navigation, manual refresh and truthful approved-but-incomplete document history. It removes endless polling and impossible upload prompts for locked approved applications. Upload type/size validation, timeout cleanup, reduced-motion behavior and the existing white/red brand are retained.

Nine rendered screen tests passed locally, alongside lint and types. These changes are merged but have not yet been recorded as deployed/accepted in this checkpoint. The source-specific web release must pass exact-main regression, immutable-image rollout and browser acceptance first. An existing approved chef with missing historical document rows is not evidence of a successfully completed new chef application; genuine uploads and authoritative approval remain required.

Files: `apps/customer-web-next/src/components/chef-application-document-panel.tsx`, `chef-application-evidence-uploader.tsx`, `chef-application-workspace.tsx`, and `apps/customer-web-next/src/lib/chef-document-states.vitest.ts`.

## Chef referrals: confirmed rules and unfinished integration

Owner-confirmed rules: chef food subtotal strictly aboveINR250; total4% in2%,1.2%,0.8% levels; INR1500 monthly cap per receiving chef; India posting calendar month; paid-and-delivered24-hour hold followed by first eligible9AM India run; reversals restore the original posting month's allowance; nearest-paise rounding with combined excess trimmed; funding from Craves commission without reducing selling-chef earnings.

Draft PR369 head `8c1f182bbf635d5049cc877e1908dd278e6cfadf` contains the new pure `ChefReferralPolicy` calculation and schedule tests. All17 targeted tests and all38 local referral unit tests passed. Exact-source full regression35133598283 and referral integration workflow35133598240 passed for this draft. Those checks test the candidate as written; they do not establish missing worker/earnings integration.

The policy is NOT yet connected to authoritative chef eligibility, automatic enrolment, the reward worker, serialized monthly accounting or the existing chef earnings ledger. The legacy customer bonus/discount and14-day/INR800 policy must remain disabled. No live reward or payout has been enabled.

Pending owner decision: if a chef has receivedINR1490 this month and the next reward isINR20, should the excessINR10 expire or carry forward? Neither behavior has been invented. The cap is not a chef participation ceiling and does not apply to ordinary sale earnings. Historical migrations remain immutable; future integration must use additive changes and immutable financial evidence.

The draft referral source is deliberately not part of the merged-main source overlay delivered with this checkpoint. Its commit and pull request are identified above so tested-but-unreleased work cannot be mistaken for production code.

## Manual steps and next acceptance

1. Completed owner acceptance: normal sign-in and Profile work after Auth protection. Preserve this evidence separately from synthetic verification; refresh/revocation and abnormal-network checks remain distinct.
2. Engineering: release merged chef screens only after exact-main full regression; retain existing Firebase bindings, Razorpay production mode, secret references, sizes and rollback image. Verify approved history and interrupted-load retry in the browser.
3. Owner: resolve monthly-cap overflow. Engineering then connects referral policy to authoritative events and chef earnings with concurrency, idempotency, refunds and month-boundary tests before any activation.
4. Owner/business: provide genuine finance/tax/terms and chef evidence, support and incident ownership, and signing/store inputs where required. Existing financial maker-checker controls have not been removed by the separate GitHub sole-owner approval.
5. Restore/load: no paid test budget exists. Do not provision chargeable resources or perform disruptive production load tests. Document the safe isolated environment, cost ceiling, expiry and cleanup before an authorized rehearsal.
6. Complete the remaining46-finding acceptance register and final owner-controlled payment/delivery/bank journey. A deployed image or passing unit test must never substitute for these.

## Reproduce checks safely

From the repository with Python3: `python -m unittest discover -s scripts/release/tests -p 'test_auth*.py' -v`. These tests mock cloud operations. For the chef screens, run the committed Vitest suite, lint, types and production build in `apps/customer-web-next`. Full release CI uses disposable PostgreSQL/PostGIS and verifies all seven Java services plus the web application and connected synthetic evidence. Never point test fixtures at production databases.

The existing Azure inspection pipeline122 offers `inspect-auth-protection` and `verify-auth-protection`; the latter accepts the immutable image and original unrelated-settings fingerprint, not credentials. Pipeline93 is the guarded existing production web release. No new DNS, secret, app-store or paid resource setup is required for these two scoped changes.

## Evidence links

- Auth inspection: https://dev.azure.com/ravitejamorampudi7777/Craves/_build/results?buildId=39119
- Auth bounded verification: https://dev.azure.com/ravitejamorampudi7777/Craves/_build/results?buildId=39122
- Auth checker: https://github.com/rmorampudi09-arch/Craves-Build-platform/pull/371
- Chef screens: https://github.com/rmorampudi09-arch/Craves-Build-platform/pull/368
- Referral draft: https://github.com/rmorampudi09-arch/Craves-Build-platform/pull/369

This is a documented decision/outcome record, not a claim to contain an unavailable full verbatim history of every earlier task.
