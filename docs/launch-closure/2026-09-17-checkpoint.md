# Launch readiness checkpoint - 17 September 2026

## Outcome and boundaries

The live Auth protection is enabled and its bounded response verification passed. This is not public-launch acceptance. No new APK, real order, payment, refund, payout, customer balance, fabricated document or paid test infrastructure was created by this continuation. The owner's final payment/delivery/bank journey remains NOT RUN.

This dated checkpoint supersedes stale present-tense status in older chronological records. Historical failed runs remain failed; later successful checks are separate evidence, not rewrites of those outcomes.

## Auth: source, rollout and live response evidence

- PR367 merged at `2ab2e36d30276a039121529656b8c24e6fecdd64`. Exact-main full regression `35131529167` passed all four required jobs.
- Azure39117 built, source-verified and published immutable Auth image `cravesprodlowacr82121.azurecr.io/craves/auth-service@sha256:58406225368594ac39a606e3fc38d01fc60be53100cef1721c2416b7e2b620e7`. The update was sent, but its first asynchronous settings read still returned the old template. Acceptance stopped. Run39117 remains FAILED.
- Read-only Azure39119 observed healthy ready revision `ca-craves-auth-service-prodlow--0000046`, one replica, the expected immutable image and all ten explicit settings. No customer requests or policy writes occurred during that inspection.
- PR371 corrects the premature checker failure. It tolerates only the exact old template during a bounded wait, then requires the complete candidate and healthy serving revision. Unexpected settings, another image, unrelated drift and regression to the old template remain failures. It also adds a verification-only recovery action with no deployment command.
- All 43 local Auth guard tests passed, including 23 activation/recovery tests. Exact-head full regression `35134327769` passed all four jobs on `07828018bf73ed051495a5c3fc0a28c802f59582`. PR371 merged as `09cf6454b515d37452ae61777a04926fb8180b66`; exact-main full regression `35135326909` subsequently passed all four required jobs.
- Azure39122 used that tested checker to verify the already-running image without a second deployment. At `2026-09-16T18:35:21.514064Z` (17 September, 00:05 IST), both malformed routes returned private 400 responses, ten attempts using one impossible random refresh token returned private 401 responses, and attempt 11 returned private 429 `AUTH_RATE_LIMITED` with Retry-After 44 seconds. Exactly 13 synthetic requests were sent. No Firebase credential, OTP, email or genuine account was used.
- The before/after ready revision and unrelated-settings fingerprint matched. Image/configuration changes, gateway edits and automatic protection disablement did not occur in the verification run.

Original unrelated-settings fingerprint: `cd21b72cfdffc279918efdf98d35dcaec0491ab8d1957377b700f9790d095577`.

The automated protected receipt correctly records `realSignInAccepted=false`: synthetic probes do not prove real sign-in. After this run, the owner separately confirmed: "Yes, sign-in and Profile work" in response to the request to test normal sign-in and Home/Profile. This is owner-reported post-update journey acceptance, not an independently observed refresh/revocation or load test. Shared database failure behavior, edge/gateway enforcement and sustained capacity remain separate tests.

## Email verification

The owner explicitly confirmed receipt of a Craves verification email and successful entry of its code on 16 September. The signed-in chef page also displayed the verified-email state. This closes the missing owner-mailbox observation, not every email requirement.

Azure39098 aggregate health showed no observed pending projection mismatch or failed/unknown delivery receipt in its scoped snapshot. Aggregate counts cannot prove cross-service equality for a particular identity and version. Cross-account cases, email replacement/revocation, sustained delivery and alert ownership remain open. No additional verification email was sent in this continuation.

Draft PR373 adds a private read-only comparison of actual canonical identity, exact email, revision, verification timestamp and customer/chef projection fields. Its 11 new safety tests and all 34 email safety tests passed locally. It rejects empty evidence, same-count/different-identity errors, malformed rows, missing projections and changes between observations. It reports only counts and safe runtime metadata, never addresses, IDs, keyed digests or credentials. Exact-head full regression35136804157 and email-security35136804178 passed on source `a91149d4be4f952ba98e24003be98947e8a73a57`.

Azure39125 SUCCEEDED at 2026-09-16T18:58:30Z: two canonical verified rows, two projection rows, zero missing/orphaned projections, zero version/timestamp/email mismatches, zero customer or chef application mismatches. Both observations and runtime revisions were stable; observedRowsMatch=true. These are read-only observations, not a distributed atomic snapshot or replacement/revocation acceptance. Auth revision46 and User/Chef revision50 were observed. This diagnostic draft is not merged or included in the main-source overlay. No account repair or new secret was created.

## Chef application screens

PR368 merged as `541ef4e9d6777b43310281f74af1f3068aea2453` after exact-head full regression `35131582675` passed. The fix adds explicit bounded loading/error/retry, cancellation on navigation, manual refresh and truthful approved-but-incomplete document history. It removes endless polling and impossible upload prompts for locked approved applications. Upload type/size validation, timeout cleanup, reduced-motion behavior and the existing white/red brand are retained.

Nine rendered screen tests passed locally, alongside lint and types. Exact-main full regression35135326909 passed on the combined source09cf6454. Azure39124 SUCCEEDED through guarded pipeline93: ready web revision89 serves 100% traffic, immutable image `sha256:898b3c88ffbf666205c40f42774fb4eb8cae13200ebda783aa50564265c8a043`, source `09cf6454b515d37452ae61777a04926fb8180b66`. Production payment mode and runtime were preserved. Both public and direct origins passed anonymous private-401 email checks. The retained rollback digest is `sha256:e62b8bcfb7c2e088e6357736b69841a99502a4ae6ec5f7e6777c383c7b657493`.

The live browser check found a further session timing defect: email recovered and displayed verified, but application/document reads had already received sign-in errors. A document retry succeeded without a new login and correctly showed approved-but-incomplete historical records. The main form remained blank with Loading and an enabled submit button. The new session-recovery fix is under validation; this observation prevents declaring full chef-page acceptance. Automatic bank enrollment is explicitly unavailable in the current live policy. An existing approved chef with missing historical document rows is not evidence of a successfully completed new chef application; genuine uploads and authoritative approval remain required.

Files: `apps/customer-web-next/src/components/chef-application-document-panel.tsx`, `chef-application-evidence-uploader.tsx`, `chef-application-workspace.tsx`, and `apps/customer-web-next/src/lib/chef-document-states.vitest.ts`.

Follow-up PR374 (`fix/chef-application-session-20260917`, head `28cdc6f009b816eddb1b816a784b2ffd4eab6181`) gates application sections on existing sign-in recovery before issuing private reads. It permits active CUSTOMER applicants before CHEF approval, resets private children on account/session changes, retains same-owner email edits, exposes a bounded retry/sign-in state, and locks failed/unloaded application forms. Pending forms remain editable when their read succeeds. Files: `apps/customer-web-next/src/components/chef-application-session-boundary.tsx`, application `page.tsx`, `chef-application-workspace.tsx`, `chef-application-session.vitest.ts`, and `signed-in-integration.test.ts`. No backend authorization or financial policy was changed.

Local evidence on the correction: all342 component tests across29 files, all297 Node contract tests, zero skips; typecheck and scoped lint passed. Ten recovery/form tests plus nine document and sixteen profile/session tests passed together. The first concurrent local runner could not start workers; a resource-constrained serial attempt timed out once before an unchanged-code rerun passed. Full CI35139198708 then correctly failed an old source-contract assertion that expected the former lock expression. The assertion was updated to require unloaded/failure protection, backed by a new rendered pending-editability test. That superseded run was cancelled after its failing web result was preserved; queued35139286585 was superseded automatically. Exact-head full regression35139754729 passed all four required jobs, including all seven Java services and full web verification. All 24 observed head checks passed. PR374 merged as `d91b44d7e8b841d7301b52914e41b46f63aaee53`, preserving main's independent landing sign-in PR370 (`a522fa0a`). Exact-main full regression35140839374 then passed; aggregate artifact10465351588 is available. The correction is included in this source overlay. Its guarded live rollout has been requested, but acceptance remains pending; release39124 does not contain it.

### Final live result of the session correction

Azure39132 SUCCEEDED on exact merged source `d91b44d7e8b841d7301b52914e41b46f63aaee53` at `2026-09-16T19:44:59.0425258Z` (17 September, 01:14 IST). Ready revision91 serves100% traffic with immutable image `sha256:6d1212662c63ecabab68e851c88f58478381900c6ff62a5e322b76ceafe1b317`. Both public/direct origins passed private anonymous email denial checks; production payment mode and runtime were preserved. Rollback image `sha256:8d50c5c31f9b3252936be03db97fadea1f2cf94a839073b003e168d38b165f8b` was retained by the guard. See `evidence/web-release-39132.json`.

After deployment, the existing signed-in browser was reloaded directly on `/chef/application`. It displayed the new sign-in-check loading state, then APPROVED with saved details locked, the verified email and the truthful approved-but-incomplete document history together. No new sign-in or manual document retry was needed; the earlier blank form/sign-in error did not recur. Visual inspection confirmed the white/red application surface. This supersedes the earlier rollout-pending note above and closes the reproduced initial-session display defect for this browser journey. It is not proof of genuine new-applicant uploads, bank enrollment, every network/device case or full public-launch readiness. Bank enrollment remains explicitly unavailable; no financial control was activated.

## Chef referrals: confirmed rules and unfinished integration

Owner-confirmed rules: chef food subtotal strictly above INR 250; total 4% in 2%, 1.2%, 0.8% levels; INR 1,500 monthly cap per receiving chef; India posting calendar month; paid-and-delivered 24-hour hold followed by the first eligible 9 AM India run; reversals restore the original posting month's allowance; nearest-paise rounding with combined excess trimmed; funding from Craves commission without reducing selling-chef earnings.

Draft PR369 head `8c1f182bbf635d5049cc877e1908dd278e6cfadf` contains the new pure `ChefReferralPolicy` calculation and schedule tests. All 17 targeted tests and all 38 local referral unit tests passed. Exact-source full regression35133598283 and referral integration workflow35133598240 passed for this draft. Those checks test the candidate as written; they do not establish missing worker/earnings integration.

The policy is NOT yet connected to authoritative chef eligibility, automatic enrolment, the reward worker, serialized monthly accounting or the existing chef earnings ledger. The legacy customer bonus/discount and14-day/INR800 policy must remain disabled. No live reward or payout has been enabled.

Pending owner decision: if a chef has received INR 1,490 this month and the next reward is INR 20, should the excess INR 10 expire or carry forward? Neither behavior has been invented. The cap is not a chef participation ceiling and does not apply to ordinary sale earnings. Historical migrations remain immutable; future integration must use additive changes and immutable financial evidence.

The draft referral source is deliberately not part of the merged-main source overlay delivered with this checkpoint. Its commit and pull request are identified above so tested-but-unreleased work cannot be mistaken for production code.

## Manual steps and next acceptance

1. Completed owner acceptance: normal sign-in and Profile work after Auth protection. Preserve this evidence separately from synthetic verification; refresh/revocation and abnormal-network checks remain distinct.
2. Completed engineering acceptance: initial chef screen release39124 and session-recovery release39132 passed their guards; live direct reload recovered without new sign-in. Genuine new-applicant uploads and bank enrollment remain separate. Existing Firebase bindings, Razorpay mode, sizes and secret references were preserved.
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
- Chef session correction: https://github.com/rmorampudi09-arch/Craves-Build-platform/pull/374
- Verified live chef-session release: https://dev.azure.com/ravitejamorampudi7777/Craves/_build/results?buildId=39132
- Read-only canonical email comparison: https://dev.azure.com/ravitejamorampudi7777/Craves/_build/results?buildId=39125
- Referral draft: https://github.com/rmorampudi09-arch/Craves-Build-platform/pull/369

This is a documented decision/outcome record, not a claim to contain an unavailable full verbatim history of every earlier task.
