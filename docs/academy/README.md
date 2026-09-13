# Craves Academy - complete engineering curriculum v3

Workspace: `https://admin.craves.in/admin/academy`.

## Status: source publication and live publication are different

This update supplies **15 courses, 75 lessons, 150 graded questions and 25 ungraded reasoning checkpoints**. The courses are classpath resources inside the existing Auth image. A Git merge does not change the catalog served by an older running image.

The actual GitHub Azure read-only preflight, run **34747607434** on September 13, 2026, found the configured OIDC values but failed at Azure login with **No subscriptions found**. Resource inspection was skipped. No image, flag, replica, secret, network, database or provider change was made. Production publication and authenticated routed acceptance remain unverified until the release procedure below is executed successfully. Do not describe CI or a merge as LIVE.

Use the existing authorized Azure DevOps service connection for the remaining Auth-only release. Do not run the seven-service backend pipeline for a curriculum-only update.

## Full learning coverage

| Course ID | Coverage | Lessons |
|---|---|---:|
| auth | Authentication, roles, sessions and secure access | 5 |
| people | Customer, chef, address and administrator workflows | 5 |
| catalog | Ownership, discovery and Catalog extensions | 5 |
| orders | Checkout, snapshots, chef transitions and recovery | 5 |
| payments | Ownership, provider verification and reconciliation | 5 |
| delivery | Intelligence, provider boundaries and outcomes | 5 |
| subscriptions | Plans, schedules, billing and fulfilment | 5 |
| notifications | Messaging, channels and recovery | 5 |
| web | Next.js BFF, browser state and release operations | 5 |
| platform-engineering | Ownership, vertical slices, CI, release and recovery | 5 |
| java-engineering | Java 21, Spring contracts, transactions and capstone | 4 |
| mobile-engineering | React Native, refresh, navigation, restoration and stores | 4 |
| data-engineering | PostgreSQL, PostGIS, Redis, outbox and recovery | 4 |
| document-engineering | Private PDF snapshots, rendering, download and email | 4 |
| service-labs | Nine applied laboratories across all core service tracks | 9 |

Original operational lessons are preserved. Applied lessons include concrete source paths, baseline commands, failure cases, local exercises and peer-review evidence. Each lesson retains two graded questions to match the deployed UI. Extra reasoning checks are guided steps, not extra graded questions. No web deployment is required solely to display these resources.

Study the service orientation, then Platform and Java Engineering, then the relevant service laboratory. Use Mobile, Data and Documents for specialist depth. Prerequisites recommend study order; they do not grant permissions.

Practical competence requires a reproducible implementation, negative/concurrency tests and peer-reviewed recovery evidence. Quiz completion alone is not certification. Hypothetical bookmark, metadata and display-field exercises are explicitly local-only designs, not newly implemented or approved production features. The curriculum does not claim every learner lab or device/provider journey has already been executed.

## Source and architectural boundaries

Content version: `academy-2026-09-13-v3`.

Immutable teaching revision: `9cf4aea069fa6a077fdef111bf2df4eeada696fc`.

The teaching revision differs from the eventual deployment commit. Each course references reviewed files at this fixed snapshot, not arbitrary mutable main. The verifier checks source existence, UTF-8, the 262144-byte source-viewer limit, at most ten sources per course, acyclic prerequisites and a public catalog below 900000 bytes (headroom under the existing one-MiB BFF bound).

The Order teaching corrects its real entry point: **CheckoutController** handles `POST /api/v1/checkout` and calls `OrderService.checkout`; OrderController reads existing orders. Implementation descriptions are not claims about current provider activation.

Before implementing a production module, obtain the approved relevant sections of **CRV-ARCH-HLD-002 v2.0** and **CRV-FUNC-001 v1.0**. This update does not amend them or invent pricing, commissions, radius, refunds, FSSAI, tax-invoice or provider-selection policy. It does not replace the Java backend, change hosting topology or switch the approved payment provider. Cashfree/Razorpay source presence is not runtime activation evidence.

## Exact changed and supporting paths

```text
services/auth-service/src/main/resources/academy/
  curriculum.json                   Existing operational lessons (unchanged)
  engineering/
    index.json                      v3 registration and immutable teaching pin
    auth.json                       Existing Auth engineering extension
    people.json                     Existing people engineering extension
    catalog.json                    Existing Catalog engineering extension
    orders.json                     Corrected checkout/order walkthrough
    payments.json                   Existing payment engineering extension
    delivery.json                   Existing delivery engineering extension
    subscriptions.json              Existing subscription engineering extension
    notifications.json              Existing notification engineering extension
    web.json                        Existing web engineering extension
    platform.json                   Existing platform engineering course
    java-engineering.json           Four detailed Java/Spring lessons
    mobile-engineering.json         Four detailed React Native lessons
    data-engineering.json           Four detailed data-platform lessons
    document-engineering.json       Four detailed private-document lessons
    service-labs.json                Nine end-to-end service laboratories
services/auth-service/src/test/java/in/craves/auth/academy/
  AcademyCoreTest.java               v3 size/catalog/privacy/role regressions
  AcademyPersistenceTest.java        Existing disposable PostgreSQL regressions
scripts/academy/
  verify-curriculum.py               Merge, counts, provenance, DAG and size
  release-guard.py                   Read-only narrow release checks
  test-release-guard.py              Pure fixture tests; no Azure access
.github/workflows/craves-academy-ci.yml
                                    CI and immutable delivery artifact
azure-pipelines-auth-service.yml    Existing Auth-only pipeline, optional guard
scripts/release/deploy-single-service-preserve-runtime.sh
                                    Existing deployment/health/rollback helper
```

Existing Java AcademyCatalog merges the catalog. AcademyController, AcademyService and AcademySources retain the established API, grading, persistence and source security. No domain-service implementation, auth roles, migrations, web UI, payment/delivery binding or production value is changed by this curriculum PR. The Auth pipeline remains manually triggered; academyPublication defaults false. Temporary editorial/source-export workflows are removed from the final release.

## Local tests

From a full Git checkout at the reviewed release revision:

```sh
python3 scripts/academy/verify-curriculum.py --git
python3 scripts/academy/test-release-guard.py
python3 scripts/academy/release-guard.py source
mvn -B -f services/auth-service/pom.xml -Dtest=AcademyCoreTest,AcademyPersistenceTest test
```

An extracted ZIP has no Git history: omit --git for structural checks only and use the accompanying CI report for actual pinned-source verification. Never claim archive-only checks verified Git provenance.

AcademyPersistenceTest requires `ACADEMY_TEST_JDBC_URL`, `ACADEMY_TEST_DB_USER` and `ACADEMY_TEST_DB_PASSWORD` for the explicitly disposable `craves_academy_ci` PostgreSQL database. It drops/truncates its Academy schema. **Never target a shared/business database, even if its name matches.** Keep credentials local; do not paste them into chat. The dedicated CI job automatically supplies an ephemeral PostgreSQL service.

From `apps/customer-web-next`, run existing compatibility gates:

```sh
npm ci
node --test --experimental-strip-types src/lib/academy-*.test.ts
npx eslint src/app/admin/academy src/app/api/admin/academy src/lib/academy-route-policy.ts src/lib/academy-ux-state.ts src/components/academy-workspace.tsx --max-warnings=0
npm run typecheck
npm run build
```

Report passed, failed and skipped coverage separately. Helper tests, actual HTTP tests, disposable-database tests, device tests and live acceptance are different evidence. CI does not send real payments, book riders, email customers, deploy Azure or provision resources.

## Manual steps required: publish only Auth

Existing Azure DevOps project: `https://dev.azure.com/ravitejamorampudi7777/Craves`.

1. Open the pipeline backed by **azure-pipelines-auth-service.yml**, not azure-pipelines-backend-completion.yml. Select the exact reviewed merged v3 commit after final PR checks pass. Set **academyPublication=true** and **expectedReleaseSha** to that full 40-character commit. The guard rejects a different checkout. In this mode the image tag automatically uses the exact source SHA.
2. Keep the existing targets: `resourceGroupName=rg-craves-prodlow-centralindia`, `acrName=cravesprodlowacr82121`, `containerAppName=ca-craves-auth-service-prodlow`. Preserve the existing pipeline variable **AZURE_SERVICE_CONNECTION=Craves-Dev-Service-Connection**. No new credentials should be pasted into YAML, parameters or chat.
3. Guard defaults use the last recorded accepted Auth baseline: **academyBaselineSourceSha=6691aa2ff663e51a257407b9b1f4b5b7b4ba87d5** and **academyExpectedCurrentImage=cravesprodlowacr82121.azurecr.io/craves/auth-service@sha256:ffdeb9a3fabc532a4b0bcd6baeff36b5b11188a036d7e353f5a7317150606070**. These are historical, not fresh runtime evidence. The guard refuses an unexpectedly newer image; review its actual source/image linkage before updating these values. Do not override blindly.
4. Queue the Auth pipeline and review **academy-release-evidence**. It checks source scope, current healthy Auth image, enabled Academy flag, Single mode, min/max one replica and existing PostgreSQL backup configuration. It builds only Auth, resolves its immutable digest and calls the existing runtime-preserving helper. Normal build/registry usage can incur charges; no new resource or replica is provisioned.
5. Verify Auth non-image configuration and the other observed app specifications are unchanged. Evidence contains hashes, not environment values. A concurrent unrelated change fails acceptance rather than authorizing rollback of someone else's app. The existing helper retains health checks and its guarded Auth rollback behaviour.
6. Perform the signed-in catalog/assessment acceptance below. Healthy deployment alone does not prove the new content is visible through the real route.

The current Auth pipeline definition ID has not been inspected and is not invented here. If its YAML has not been registered in this project, an authorized owner must select the existing repository/YAML and existing connection. No new service principal is necessary merely to register the existing YAML.

No new secrets, DNS, Firebase providers, payment keys, mobile signing, app-store or resource-creation steps are required for this curriculum release. Preserve the already accepted Academy flag and routes. V7/V8 and the gateway were previously released: do not rerun new-API provisioning against the existing Academy API or alter applied migration history. Do not deploy customer web or other backend services for this update.

## Verify the actual signed-in live catalog

Open `https://admin.craves.in/admin/academy` with an authorized administrator session. This same-origin browser-console read uses existing cookies without extracting credentials:

```javascript
const response = await fetch('/api/admin/academy/catalog', {
  credentials: 'same-origin', cache: 'no-store'
});
if (!response.ok) throw new Error(`Academy catalog HTTP ${response.status}`);
const catalog = await response.json();
const lessons = catalog.courses.flatMap(course => course.lessons);
console.table({
  version: catalog.version,
  sourceRevision: catalog.sourceRevision,
  courses: catalog.courses.length,
  lessons: lessons.length,
  gradedQuestions: lessons.reduce((n, lesson) => n + lesson.questions.length, 0)
});
```

Expected: `academy-2026-09-13-v3`, teaching revision `9cf4aea069fa6a077fdef111bf2df4eeada696fc`, **15/75/150**. Read a new specialist lesson, its lab, a reasoning checkpoint and an allowlisted source. Confirm search, filters, section navigation and no graded answer keys in the initial catalog.

Check anonymous/customer/chef denial separately. With an approved test administrator, verify one assessment, persisted reload and receipt replay without another award. Record expected/actual status, source/CI/image/revision, routing and no-store headers. A signed-out 401 proves protection, not authenticated content visibility. Do not create orders, charges, deliveries or real email to accept Academy.

## Progress, access and truthful training outcomes

Two questions per lesson and the existing 80% threshold require both answers correct. First pass per lesson/version earns 40 XP; completing a course/version adds 120 XP once. First v3 completion totals **4800 XP**; reasoning checkpoints add no XP. Existing 300-XP level increments remain.

No progress or XP is deleted. Displayed current progress is content-version scoped, so old completions do not automatically count as v3 assessments; historical XP remains in its durable ledger. Preserve the existing learner-row lock, request fingerprints, replay conflicts, unique reward keys, cooldown and daily attempt limits.

All nine explicit internal roles can learn. Private-plan changes remain PLATFORM_ADMIN-only; team reports remain PLATFORM_ADMIN/AUDIT_ADMIN-only. Course access does not grant operational authority. The public repository already contains source-controlled answer keys; these are learning checks, not confidential certification examinations.

Existing bounded/pseudonymous activity telemetry and retention remain: activity 90 days, attempt/audit receipts 365 days, progress and XP separately retained. Do not reuse learning retention for financial records. The fixed-prior Bayesian practice signal is not calibrated employee performance and must not drive employment or disciplinary decisions. Personalization can be disabled without deleting XP.

Guided narration uses an available local English browser voice. No hosted video, MP4/avatar course, paid voice provider or external AI source upload is claimed.

## Recovery, pending gates and maintenance

On a failed release use the recorded prior healthy Auth image through the existing recovery procedure. Keep additive schema, learner records and XP. The guard itself makes no Azure writes. Do not rotate working keys, clear queues, change providers, increase replicas or roll back unrelated apps. Academy shares Auth's deployment, so monitor authentication errors and latency during a separately authorized release.

One replica remains the approved operating constraint. No million-user load certification, complete accessibility audit, actual eight-hour browser soak or provider production test is claimed by this curriculum update.

Remaining gates until actually observed: authorized Auth pipeline execution, digest/revision and unchanged-settings evidence, authenticated routed v3 content and assessment acceptance. Historical records remain in `docs/runbooks/2026-09-12-academy-admin-production-acceptance.md` and `docs/runbooks/2026-09-13-admin-portal-repair.md`; retain their dates and limitations.

Maintain one service curriculum at a time. Recheck claims against source and tests, pin a new immutable teaching revision when needed and version changed assessments deliberately. Run source/size/prerequisite/regression gates. Automatic course regeneration, private video production and peer-review certification systems are not implemented by this release.
