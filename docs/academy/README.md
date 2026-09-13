# Craves Academy v3

Craves Academy is the internal, service-oriented learning workspace at `/admin/academy`. The browser experience lives in the existing Next.js administrator application; Java 21 / Spring Boot `auth-service` owns the Academy catalog, authorization, grading, progress, XP, recommendations, private plans and audited reporting. This is not a second Node.js business backend and it does not own customer, order, payment, delivery or subscription business state.

## Current v3 curriculum

The v3 catalog contains **15 courses, 75 lessons and 175 explained graded questions**. The original nine domain tracks remain and are expanded with deeper engineering material:

- Authentication & identity
- Customers, chefs & people workflows
- Catalog & discovery
- Orders & checkout
- Payments
- Delivery intelligence
- Subscriptions
- Notifications
- Web/BFF/release operations
- Platform engineering
- Java 21 & Spring Boot engineering
- React Native/mobile engineering
- PostgreSQL/PostGIS/Redis/durable-event data engineering
- Private PDF/document engineering
- Cross-service engineering laboratories

The five applied engineering tracks contain practical source walkthroughs, failure analysis, local labs and review exercises. They teach how to locate the owning service, define contracts, build a vertical slice, test security/idempotency/concurrency, prepare release evidence and recover safely. Quiz completion and XP are learning aids only; they do **not** grant production permissions or certify an unreviewed code change.

The reviewed teaching snapshot is pinned to immutable repository revision `9cf4aea069fa6a077fdef111bf2df4eeada696fc`. Lesson text explains that snapshot and clearly distinguishes source capability from current production activation.

## Important product guardrails

Training must not silently create product policy. Pricing, commissions, delivery radius/provider ranking, refunds/cancellation economics, subscription commercial rules, FSSAI/food-safety claims, tax-invoice semantics and provider contracts remain owner-approved decisions. The courses teach engineers to mark those items as pending decisions rather than inventing values in Java, TypeScript, database rows or client constants.

The earlier Node.js backend is not a template for new Craves backend modules. New backend feature work follows the Spring Boot 3 / Java 21 architecture unless an architecture change is explicitly approved.

## Access and privacy

All roles in `InternalAdminRoles.codes()` may learn and read reviewed sources/plans. Only `PLATFORM_ADMIN` may create, edit or delete private plans. `PLATFORM_ADMIN` and `AUDIT_ADMIN` may read the audited team report. Customer, chef, anonymous and invented `ADMIN` identities do not gain Academy access. The actor comes from the verified Craves principal, never request JSON.

The repository is public. Source-controlled lessons, examples and answer keys therefore are not confidential examinations. Public API catalog responses remove answer/explanation fields until an attempt is submitted, but that is a UX/security-hygiene measure rather than tamper-proof exam secrecy. Do not put live credentials, private customer data, unpublished commercial plans or learner records in repository curriculum files.

Activity telemetry remains bounded to Academy events. No key values, browser history, customer payloads, camera or microphone data are collected. Activity time is not proof of attention. The Bayesian practice model is an uncalibrated recommendation aid and must not be used for employment, disciplinary or production-access decisions.

## Assessment and versioning

`AcademyService` grades on the server. A request receipt is fingerprint-bound to content version, course, lesson and answers; same receipt/same payload returns the stored result, while changed answers under the same receipt conflict. XP uses a durable unique ledger so retry or retention cleanup cannot re-award an already earned reward. Writes for one learner are serialized through PostgreSQL row locking.

v3 intentionally changes the content version to `academy-2026-09-13-v3`. Progress records are version-scoped; historical XP remains in the retained XP ledger. The publication does not delete learner data or edit applied migrations.

## Curriculum integrity gates

From the repository root:

```sh
python3 scripts/academy/verify-curriculum.py --git
python3 scripts/academy/test-release-guard.py
mvn -B -f services/auth-service/pom.xml -Dtest=AcademyCoreTest,AcademyPersistenceTest test
cd apps/customer-web-next
node --test --experimental-strip-types src/lib/academy-*.test.ts
npx eslint src/app/admin/academy src/app/api/admin/academy src/lib/academy-route-policy.ts src/lib/academy-ux-state.ts src/components/academy-workspace.tsx --max-warnings=0
npm run typecheck
npm run build
```

`verify-curriculum.py --git` validates the merged catalog, exact v3 counts, unique IDs, prerequisites, source allowlist, existing source-viewer index/byte limits, public catalog size headroom and immutable source existence. The persistence suite runs only when `ACADEMY_TEST_JDBC_URL` explicitly names the disposable `craves_academy_ci` database. Never point that suite at a real database.

## Why a Git merge is not enough to make courses live

The Academy catalog and lesson resources are packaged inside the Auth service artifact. Merging source to `main` does not hot-reload the running `auth-service`. A live publication therefore has distinct milestones:

1. Reviewed v3 source merged to `main`.
2. Craves Academy CI and related Auth regressions pass for that exact source.
3. The existing Auth-only Azure DevOps pipeline builds an immutable Auth image from the exact merged SHA.
4. The pipeline deploys only `ca-craves-auth-service-prodlow`, preserving its existing non-image runtime configuration and owner-approved one-replica setting.
5. The routed authenticated `/academy/catalog` response reports `academy-2026-09-13-v3` and the expected 15-course / 75-lesson catalog.
6. Negative access and persisted-progress/idempotency checks remain correct.

Do not call the curriculum live until step 5 is observed.

## Isolated Auth-only publication guard

`azure-pipelines-auth-service.yml` has a guarded `academyPublication` mode. It is designed for this curriculum case so an Academy content release does not unnecessarily deploy Catalog, Order, Integration, Notification, Subscription, User-Chef, customer web, Delivery Intelligence or provider configuration.

When Academy publication mode is selected, the pipeline verifies:

- the exact reviewed source SHA;
- only Academy-scoped Auth paths changed relative to the accepted Auth baseline;
- curriculum provenance and source bounds;
- Java tests;
- current Auth feature flag remains explicitly enabled;
- current Auth revision is ready/healthy;
- current PostgreSQL backup/PITR evidence exists;
- current Auth remains Single revision mode with min/max replicas 1/1;
- the expected existing Auth image has not already been superseded by an unreviewed release;
- deployment uses the existing single-service runtime-preserving helper;
- post-deployment Auth non-image configuration hashes match preflight; and
- other Container App specifications have not been modified by this Academy release.

The guard does not rotate secrets, alter ingress, enable unrelated workers, change payment/delivery settings, modify APIM, scale services or provision Azure resources.

## Current Azure access limitation recorded during v3 work

A read-only GitHub-to-Azure OIDC preflight was attempted after the owner asked for live publication. Existing GitHub Azure secrets were present, but Azure login returned `No subscriptions found` for that service principal. The run made no Azure mutation. The established production deployment path therefore remains the existing Azure DevOps service connection, not the failing GitHub OIDC path.

This is an access/path limitation, not a reason to redeploy all services, rotate credentials or change IAM without review.

## Production acceptance checklist

Before declaring v3 published:

- `main` contains the reviewed v3 merge commit.
- Academy CI backend and web jobs are green for that commit.
- Backend/Auth regression CI is green.
- Current PostgreSQL backup/PITR evidence is verified.
- Auth-only pipeline is queued from the exact merged commit with `academyPublication=true` and the explicit expected source SHA.
- The immutable image digest is recorded.
- Auth latest revision equals latest ready revision and is healthy/running.
- Auth still has `CRAVES_ACADEMY_ENABLED=true`, Single mode and min/max 1/1.
- Other existing service specifications remain unchanged by the Academy release.
- An anonymous/customer/chef request does not receive Academy content.
- An authorized administrator receives catalog version `academy-2026-09-13-v3` with 15 courses and 75 lessons.
- A quiz attempt persists correctly, replay does not duplicate XP, and another learner remains isolated.
- Source viewing remains pinned/allowlisted and responses remain no-store.

## Rollback

Rollback is application-first and evidence-preserving. If the new Auth revision is unhealthy or Academy acceptance fails, return Auth to the recorded known-good image/revision using the existing runtime-preserving release path. Do not drop `academy_schema`, delete learner progress/XP, edit Flyway history, rotate unrelated credentials or touch payment/delivery providers. The v3 catalog introduces no new database migration, so data rollback is not part of this curriculum publication.

## Maintaining the Academy

For a future course update:

1. inspect the current repository and relevant architecture/functional specification;
2. update only the owning course or add a reviewed modular course file;
3. pin sources to a reviewed immutable commit and keep every source inside the explicit allowlist/size bounds;
4. change the Academy content version when assessment semantics change;
5. run curriculum, Java, PostgreSQL and web gates;
6. merge through review; and
7. publish through the narrow Auth-only path when only packaged Academy resources changed.

Do not interpret course text, CI green, or a successful image build as production acceptance. Runtime acceptance must remain separately recorded.
