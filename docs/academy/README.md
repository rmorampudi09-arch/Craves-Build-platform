# Craves Academy

Internal, service-oriented learning at `/admin/academy`, integrated into the existing Next.js administrator workspace. The backend is Java 21 / Spring Boot inside `auth-service`; Next.js remains a thin authenticated BFF. No new Node business backend, database instance, customer order behavior or payment behavior is introduced.

## Delivered scope

Nine Craves-specific courses, 18 sections and 36 explained quiz questions cover authentication, customer/chef workflows, catalog, orders, payments, delivery intelligence, subscriptions, notifications and web/release operations. Each section includes a plain-language walkthrough, an example, a safe practice activity, a pitfall, a guided teaching storyboard and a quiz. Source is loaded only after authorization, from an explicit file allowlist at immutable revision `4d042c58c6a8efda97981c66ef885a4eed49922f`, with a SHA-256 fingerprint. The curriculum is a reviewed source snapshot, not a claim about what is deployed today.

The library supports service filters, text search, learning-path/A–Z/duration/progress sorting, resume links, section/course completion, XP, levels and an IST practice streak. No fake learners, fake progress, fake active providers or sample future plans are inserted into runtime data.

## Access and privacy

All nine roles in `InternalAdminRoles.codes()` can learn and read sources/plans. Only `PLATFORM_ADMIN` can publish, edit or delete private plans. `PLATFORM_ADMIN` and `AUDIT_ADMIN` can read the audited team report. A customer, chef, anonymous principal or invented `ADMIN` role does not gain access. The actor is taken from the verified Craves token, never from request JSON. Each backend endpoint checks the role; the frontend menu is not an authorization boundary.

The public repository remains public. Gating the academy does **not** make already-public source, seed curriculum or source-controlled quiz answer keys confidential. These are learning checks, not tamper-proof examinations. Stronger confidentiality requires a separately approved repository-visibility/access decision. Do not put unpublished plans, live credentials or learner records in this repository.

Unpublished plans are stored in `academy_schema.roadmap` inside the existing auth database, not bundled into JavaScript or copied to GitHub. Rendering is plain React text, not executable HTML. Revision checks prevent silent overwrites. Team views use pseudonymous labels; access is audited. Source text is never submitted to an external AI provider. The source guard refuses suspicious secret-bearing files rather than returning altered source as an allegedly exact copy.

Activity records contain actor identity, section/course, event type, receipt ID, server timestamp and bounded active seconds. No key values, browser history, customer payloads, webcam or microphone are recorded. Visible-page interaction only signals a recent activity timestamp; it is not proof of attention. Server-side checks suppress rapid duplicate tabs and cap heartbeat credit at 30 seconds. There is no XP for opening pages or sending heartbeats.

Retention: activity 90 days; quiz request receipts and audit records 365 days. Completion and XP are retained separately until an authorized account-retention decision. A dedicated feature-scoped scheduler runs cleanup after one hour and daily thereafter, with a PostgreSQL advisory lock. Enabling this feature does not enable unrelated auth-service scheduled workers. The streak uses a rolling 90-day activity window.

## Quiz and XP contract

Answers and explanations are omitted from the initial catalog API and disclosed as feedback after an attempt. Each section currently has two questions and requires 80% to pass, therefore both answers must be correct. A first section pass earns 40 XP. Passing every section in a course earns a one-time 120 XP bonus. This curriculum has a maximum 1,800 XP for first-time completion; a new level is reached every 300 XP.

A row lock on the learner serializes writes across replicas. The quiz receipt is unique by `(identity_id, request_id)` and bound to a fingerprint of course, section, content version and answers. Same receipt/same payload returns the stored result; changed payload returns 409. A unique XP ledger prevents replay awards, even after short-lived attempt records are cleaned up. New attempts are limited to one per section per 30 seconds and 200 per learner per day. Old content versions are rejected. Scores, timestamps, mastery and XP are computed by the server, not accepted from clients.

## Learning intelligence

`AcademyLearningModel` implements online Bayesian knowledge tracing with documented fixed priors: initial mastery .25, slip .10, guess .25 and learning transition .12. Correct/incorrect quiz evidence updates the section-level signal. The next-section recommendations explain why revision is suggested. There is no fitted model, accuracy claim or inference about employee aptitude. Repeated exposure to the same two questions is not independent evidence of competence.

Learners can switch personalization off. This resets stored mastery signals and disables recommendations while retaining required progress/XP and audit data. Team reports do not rank staff by the model or display individual mastery scores. The model must not be used for disciplinary, employment or eligibility decisions.

## Guided teaching and future video

Each section includes an AI-authored teaching storyboard with chapter controls and a complete transcript. Optional narration uses only an available local English browser voice (`SpeechSynthesisVoice.localService`); no source is sent to an external voice service. When no local voice is available, the transcript and chapter player remain usable.

These guided lessons are **not rendered AI-avatar videos or hosted MP4s**. No paid video provider has been activated and no generated MP4 is claimed. A future private video pipeline needs an approved provider/data-processing agreement, reviewed scripts with synthetic examples, private storage, authenticated media streaming or short-lived grants, captions/transcripts, editorial approval and cost limits. Do not place confidential videos in `public/` or send the repository wholesale to an external AI service.

## Tests and verification

Run from the repository root:

```sh
python3 scripts/academy/verify-curriculum.py --git
mvn -B -f services/auth-service/pom.xml -Dtest=AcademyCoreTest,AcademyPersistenceTest test
cd apps/customer-web-next
node --test --experimental-strip-types src/lib/academy-route-policy.test.ts
npx eslint src/app/admin/academy src/app/api/admin/academy src/lib/academy-route-policy.ts --max-warnings=0
npm run typecheck
npm run build
```

The persistence suite runs only when `ACADEMY_TEST_JDBC_URL` names the disposable `craves_academy_ci` database and the corresponding test credentials are supplied. It drops the academy schema in that CI database. **Never point it at a real database.** The GitHub workflow provisions an ephemeral PostgreSQL 16 service and runs authorization/catalog tests plus replay, concurrent submission, XP-cap, identity-isolation, preferences, heartbeat, plan-concurrency and retention tests. No production credentials are used. Local syntax checks are not a substitute for full Maven/Next compilation or runtime acceptance.

## Activation runbook

1. Review the PR and pass `Craves Academy CI`, existing auth regressions and normal web release gates. Review source examples and wording with service owners. Verify the target PostgreSQL backup/PITR policy and record current healthy auth/web revisions.
2. Deploy auth-service through the existing approved pipeline with `CRAVES_ACADEMY_ENABLED=false` or unset. Flyway adds the isolated `academy_schema` tables to the existing auth database using `V7__craves_academy.sql`. Do not modify an already applied migration.
3. Review the APIM configuration and inherited policies. Use `scripts/academy/provision-apim.sh` with explicit target variables and the final `--apply` argument. It creates only a new `craves-academy-v1` API at `/academy` and refuses to overwrite an existing API ID/path. Backend URL must be the verified HTTPS auth-service origin. Network restrictions must prevent bypassing the gateway. Preserve the real Craves JWT issuer/audience policy where configured; the backend independently verifies tokens and checks every academy role.
4. Configure `CRAVES_ACADEMY_ENABLED=true` in the auth service only after the migration and APIM operations are verified. Do not rotate JWT/payment/delivery credentials. Deploy the existing Next admin image including this route and navigation entry. The BFF uses the existing `CRAVES_API_BASE_URL` and forwards `/academy/*`; no browser-visible secret is required.
5. Verify anonymously and as customer/chef: catalog, source, quiz, plans and analytics must not return internal content (401/403). Verify all nine admin roles can learn; support cannot edit plans or read team reports; audit can read reports but cannot edit plans; platform can edit.
6. With two test admin identities, pass a section, reload from another device, repeat the receipt and verify persisted progress with no additional reward. Pass a course, verify 200 total XP for its two sections, and verify the other learner remains unchanged. Check quiz failures/cooldowns, stale versions, source allowlist denial and no-store headers.
7. Confirm keyboard and mobile layouts, section deep links, transcript fallback, personalized-off behavior, empty analytics, private-plan revision conflicts, source SHA and real APIM/auth logs. Record expected/actual/pass-fail evidence; CI green alone is not production acceptance.

The feature is disabled by default on the backend. No production deployment or APIM provisioning is performed by `Craves Academy CI`.

## Rollback and operational guardrails

Disable `CRAVES_ACADEMY_ENABLED`, revoke/disable the new APIM surface, and route auth/web traffic back to the recorded healthy revisions. Leave the additive academy schema in place for recovery; do not drop learner records during rollback. Older service revisions ignore the new tables. Review inherited response caching, diagnostic body logging, gateway rate limits and maximum request-size policy before activation. Keep auth rate/latency SLOs unchanged and monitor database load because academy shares the auth deployment boundary.

## Maintaining courses

Update `curriculum.json` in a reviewed pull request; verify every source at a new immutable commit, recheck lesson assertions against source/tests and increment the content version for changed assessment semantics. The source viewer deliberately does not fetch arbitrary `main` files. Prerequisites are recommended study order, not privileged operational permissions. Future plans are edited in the protected runtime UI, not in this manifest. Automatic AI course regeneration and repository change detection are not implemented in this release.

## September 12 session-release integration

PR328 supplies secure administrator renewal; PR329 covers Delivery Intelligence and PR330 live downstream revocation. Academy calls `adminFetch`, preserves its in-memory answers and receipt during temporary renewal, hides learning data until verification completes, and removes it on logout. The first Auth deployment must contain both V7 and V8.

Routing was corrected against inspected production configuration: `CRAVES_API_BASE_URL` ends in `/api/v1`, while the approved Academy API is `/academy`. The BFF resolves Academy paths at the same gateway origin and preserves the `/api/v1` base for every other service. Both the default APIM hostname and `api.craves.in` are covered by a regression test.

The new API policy calls the existing Auth verifier with a five-second timeout, requires its validated-family marker, caps authorization and backend concurrency at eight each, limits requests to 600/minute per IP and bodies to 16 KiB, and sets no-store on successes and errors. Operation-specific platform/audit permissions remain in Java. No token or response body is traced or cached. Preflight found no global/Auth API caching policies and zero diagnostic configurations; recheck the new API scope after creation. Official policy contracts: https://learn.microsoft.com/en-us/azure/api-management/send-request-policy and https://learn.microsoft.com/en-us/azure/api-management/limit-concurrency-policy.

Production acceptance, real browser boundary observation and eight-hour soak remain unclaimed until separately recorded.
