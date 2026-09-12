# Academy and administrator session release evidence

Status: source verified and merged; production deployment/acceptance in progress. Do not interpret queued runs or fixtures as release completion.

## Source

Repository: https://github.com/rmorampudi09-arch/Craves-Build-platform

| Change | PR | Reviewed head | Merge commit |
|---|---|---|---|
| Secure admin sessions | 328 | d5e7b3b3dec9de024a45e38c7790124f13617f3e | cae0e9345c0abebe63264ad9caf6b8cccdc5b1a9 |
| Delivery Intelligence adapter | 329 | 1483ac49361fae72c0d31231c4a5576ff9144da4 | 8695f3aac3e4037978781917686b7719ffcdb778 |
| Downstream live revocation | 330 | 18503a0a8f632629669b383bc42772d86dcb5c9b | b3ef1ae8b2de94e091b14253f60148284b91a40c |
| Academy and combined release | 326 | 9c67fa5d55c5b054819fd1495d8b1fd234f16387 | 6691aa2ff663e51a257407b9b1f4b5b7b4ba87d5 |
| Consumption gateway policy compatibility | 331 | d74ce2537d50c0c866a3722a413aecb189d6f066 | e8a9869dfdc951af1865f94766da9aebc9d5f124 |

The reviewed combined head and release main have identical Git tree `088a2da6857366bf4f425f2022e775788034c19a`.

## Verified tests

| Expected | Actual | Result | Evidence |
|---|---|---|---|
| Original 8h boundary, rotation/replay/logout races, invalid signature | Actual PostgreSQL session tests plus controlled-clock signed-JWT tests pass | PASS, simulated time | Session CI 34723742649, Auth job 103634121367 |
| Customer/mobile policy preserved for staff identity | Ordinary refresh still returns 900s access / 30d refresh with consumer roles; me cannot elevate roles | PASS | ConsumerSessionRegressionTest, 2 tests |
| Both migrations coexist | Disposable PostgreSQL applied eight migrations through V8 | PASS in CI only | Auth job 103634121367 |
| Production migrations applied | V7 succeeded at 23:36:21.645165 UTC; V8 succeeded at 23:36:22.547553 UTC on September 12; seven Academy tables, one admin-family table and the refresh-family column exist | PASS | Read-only production Flyway/information_schema queries through existing Auth secret references |
| Live Auth capability and health | Session policy returns HTTP 200, ADMIN_SESSION_V1, 28,800s absolute / 900s access and no-store; health UP; latest revision equals ready revision 0000036, replicas 1/1 | PASS | Auth image sha256:ffdeb9a3fabc532a4b0bcd6baeff36b5b11188a036d7e353f5a7317150606070 |
| Quiz receipts, duplicate XP, concurrency, identity isolation, preferences, private plan conflicts, retention | 6 actual PostgreSQL tests plus 5 core/authorization tests passed without skips | PASS | Academy CI 34723742791, job 103634121777 |
| Full combined web/session source builds | All four exact-revision workflows green | PASS | Backend 34723742648; session 34723742649; admin 34723742661; Academy 34723742791 |
| Existing Azure backend release validation | 539 discovered; 491 passed, 0 failed, 48 not executed; Java 21 Maven clean verify succeeded | PASS, skips explicitly retained | Azure run 38896 Tests and Maven stages, release commit 6691aa2 |
| Gateway path preserves existing APIs | Both APIM hostnames resolve /academy at origin and retain /api/v1 for other APIs | PASS unit test | api-target.test.ts |
| Real 15-minute browser boundary | Not yet observed | PENDING | Requires deployed app and interactive admin sign-in |
| Real 8-hour browser soak | Not observed or scheduled in background | PENDING | Controlled-clock tests are separate evidence |

The Auth suite reports 35 tests / 6 skips because Academy persistence uses a separate disposable database. Those same six persistence tests actually passed in the dedicated Academy job; none are claimed as production tests.

## Deployment and rollback

Existing Azure DevOps project: https://dev.azure.com/ravitejamorampudi7777/Craves
Existing service connection: Craves-Dev-Service-Connection. Definition 31 uses its locked, already-correct value; no queue-time override or permission change was made.
Backend run 38896 was queued on exact release commit 6691aa2. Its ordered deployment is Auth first, then notification, user/chef, catalog, integration, subscription and order; existing script preserves runtime/provider settings and provides full release rollback.
The source-contract, Maven and seven-image build stages succeeded. Auth is deployed and healthy; remaining fleet deployment is in progress at this checkpoint. The Azure run's skipped tests are not claimed as executed; the critical session and Academy PostgreSQL suites have separate passing GitHub evidence above.
Admin pipeline 33 run 38897 was queued on main with explicit commit and image tag 6691aa2ff663e51a257407b9b1f4b5b7b4ba87d5, after live Auth policy and production migration verification. Existing pipeline variables include the exact approved service connection and Firebase/build settings; their secret values were not printed.

Registry prefix for images below: `cravesprodlowacr82121.azurecr.io/craves/`.

| App suffix | Previous healthy image | Previous revision suffix | Replica evidence |
|---|---|---|---|
| auth-service-prodlow | auth-service@sha256:d3729d7873c2586c6500e212b2e4a16c667ccebc4f91d3066098998e128dae61 | 0000035 | 1/1 |
| notification-service-p | notification-service:38848 | 0000040 | 1/1 |
| order-service-prodlow | order-service@sha256:8ec5b0a6c6a6e688ea8cef3ac85bf4232039a50ca8af64c94aecd2f16c5f8927 | 0000080 | 1/1 |
| user-chef-service-prod | user-chef-service@sha256:0e49bc579dfcef3d5a8ea711f7a7f1f82f25dd4be4adf634acad4c8f2c02106b | 0000041 | 1/1 |
| catalog-service-prodlo | catalog-service@sha256:8e8bd144f25526009429386efc178e930e87b1af4f5226ff3ba0ed0c92598eeb | 0000039 | 1/1 |
| integration-service-pr | integration-service:38880 | 0000148 | 1/1, Pidge/feedback preserved |
| subscription-service-p | subscription-service@sha256:000f46cb4ccae746bd3d1010c73d6a9865f9d6c625b0d13be8a776d40b4ba1af | 0000040 | Cap corrected from 1/2 to 1/1; same image healthy as 0000041 |
| admin-web-prodlow | admin-web:36288 | 0000007 | Prior configuration 0/10; update pipeline pins 1/1 |
| delivery-intel-prodlow | delivery-intelligence-admin:36501 | 0000002 | Prior configuration 0/3; maintenance pipeline pins 1/1 |

Each app name is `ca-craves-` plus the suffix; each revision appends `--` plus its revision suffix. Preserve all existing secret references and payment/delivery activation flags. Restore known healthy images if needed while retaining the one-replica constraint; disable Academy and retain additive learning/session data on failed acceptance.

PostgreSQL pg-craves-prodlow-l3ing6 was Ready with 7-day backup retention and earliest restore 2026-09-06T14:00:10.298552Z. No additional app or database was created; the backend replica limits are now one. Existing deployment guards CRAVES_DISCOVERY_CACHE_ENABLED and CRAVES_SCHEDULED_PAYMENT_GUARD_ENABLED were absent (source defaults false).

## Gateway preflight

No Academy API existed at initial inspection. Global and Auth API policies contained no cache/trace/logger policies; each scope had zero diagnostics. The first import created craves-academy-v1 revision 1 at /academy with ten expected operations and the verified Auth /api/v1/admin/academy backend. Azure then rejected its policy because rate-limit-by-key is unavailable in the existing Consumption tier. Academy remained disabled. PR331 retains supported concurrency, body size, authorization, timeout and no-store controls, and removes the inapplicable per-IP rate-limit claim. The subscription rate-limit policy would not cover this JWT-only API; no gateway key or tier upgrade was introduced.

PR331 passed Academy CI 34726105121 and was merged. The API's expected path, Auth backend and ten operations were inspected; policy GET returned ResourceNotFound, confirming no existing policy would be overwritten. Azure accepted creation of the corrected policy from e8a9869dfdc951af1865f94766da9aebc9d5f124, with conditional If-None-Match. Reviewed source policy SHA-256: 11a9758498f93af8334e3247d6e32fa8e19b14cc934904cd40d4a7bc3296dc12. Runtime denial/readback checks and feature activation remain pending at this checkpoint.

Auth operations /firebase/exchange, /me, /logout and /refresh inherit the no-cache API policy. Front Door craves-admin-route uses /* and craves-delivery-intel-route uses /delivery-intelligence and /delivery-intelligence/*; each has caching disabled. Root /api/auth therefore goes to the same-host main admin BFF.

## Figma

Destination: https://www.figma.com/design/Sg1YujvyQsWbPMsdeLxo3F
The connector was rechecked and rejected the page-list request due to the Starter MCP tool-call limit. No import or canvas acceptance is claimed and no plan/seat was upgraded.

Minimum desktop action: extract the supplied Figma import ZIP; open the destination with edit access in Figma Desktop; Plugins → Development → Import plugin from manifest → select manifest.json. Run Craves Academy - Editable UI import, select design.json inside the plugin, then Import editable screens. Review the new Academy page, twelve screens, editable layers, font wrapping and prototype destinations. The JSON is not a .fig file. Preserve existing pages and permissions.
