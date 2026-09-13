# Academy and administrator session release evidence

Historical checkpoint: the interrupted-access status below is superseded by [the September 13 portal repair and authenticated acceptance record](2026-09-13-admin-portal-repair.md). Retain this document for the original migration, gateway, backend and rollback evidence.

Status: backend and main admin deployed and verified; Delivery Intelligence run 38899 was queued, but its final deployment result is unverified after the cloud session expired. Academy remains disabled pending authenticated acceptance. The secure Craves sign-in request was interrupted; a fresh browser check still showed signed-out access. Azure Portal and Azure DevOps now require account sign-in. Do not interpret queued runs, public health or fixtures as full release completion.

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
| Production gateway controls | 20 anonymous operation denials plus four invalid-credential/body-size checks pass across both gateway hostnames | PASS live | Policy from PR331; raw XML readback matched; diagnostics zero |
| Main admin production deployment | All run 38897 stages succeeded; dedicated admin image, latest=ready revision 0000008, replicas 1/1 | PASS live | Azure timeline and Container App inventory before sign-in interruption |
| Public portal/auth protections | Seven signed-out/origin/cookie checks passed through admin.craves.in | PASS live | Sanitized HTTP statuses and cookie attributes; detailed matrix below |
| Existing Pidge delivery feedback | PRODUCTION ready and active, feedback enabled and capture enabled, no blockers, queue/dead letters zero, poll advanced | PASS read-only | verify-delivery-feedback-production.py --phase postflight after backend release |
| Delivery Intelligence deployment | Run 38899 accepted; final deployment metadata inaccessible after Azure sign-in expired | UNVERIFIED | Inspect existing run before any retry |
| Authenticated Academy journeys | No authenticated administrator session obtained; feature left disabled | BLOCKED | Secure sign-in interrupted, fresh page still signed out |
| Real 15-minute browser boundary | Not observed | PENDING | Requires interactive admin sign-in |
| Real 8-hour browser soak | Not observed or scheduled in background | PENDING | Controlled-clock tests are separate evidence |

The Auth suite reports 35 tests / 6 skips because Academy persistence uses a separate disposable database. Those same six persistence tests actually passed in the dedicated Academy job; none are claimed as production tests.

## Deployment and rollback

Existing Azure DevOps project: https://dev.azure.com/ravitejamorampudi7777/Craves
Existing service connection: Craves-Dev-Service-Connection. Definition 31 uses its locked, already-correct value; no queue-time override or permission change was made.
Backend run 38896 was queued on exact release commit 6691aa2. Its ordered deployment is Auth first, then notification, user/chef, catalog, integration, subscription and order; existing script preserves runtime/provider settings and provides full release rollback.
Backend run 38896 completed successfully. All seven backend apps were inspected with latest revision equal to ready revision, Single revision mode and minimum/maximum replicas 1/1. The Azure run's skipped tests are not claimed as executed; the critical session and Academy PostgreSQL suites have separate passing GitHub evidence above.
Admin pipeline 33 run 38897 completed successfully on main with explicit source and image tag 6691aa2ff663e51a257407b9b1f4b5b7b4ba87d5. Validate, dedicated admin-image build and Container App deployment stages all succeeded. The existing environment approval was assigned to the owner account with update permission; it was approved under the owner's release authorization without altering approvers or bypassing checks. The deployed admin-web:6691aa2ff663e51a257407b9b1f4b5b7b4ba87d5 image is healthy as revision 0000008, Single mode, replicas 1/1. Its ACR digest was not separately captured before access expired. Existing pipeline variables and secret references were preserved.

Delivery Intelligence definition 119 was queued as run 38899 with --branch main, --commit-id 6691aa2ff663e51a257407b9b1f4b5b7b4ba87d5 and confirmProductionDeploy=true. The queue returned run ID 38899. Its initial response contained null source/status fields; final run metadata, image digest and replica readback remain unverified. Do not requeue it before inspecting the existing run. The reviewed maintenance YAML validates the source and live Auth policy, updates only the existing app with min/max 1/1 and restores the previous image on deployment/health failure. The older default feature branch was not selected.

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
| admin-web-prodlow | admin-web:36288 | 0000007 | Prior configuration 0/10; deployed revision 0000008 verified 1/1 |
| delivery-intel-prodlow | delivery-intelligence-admin:36501 | 0000002 | Prior configuration 0/3; maintenance pipeline pins 1/1 |

Each app name is `ca-craves-` plus the suffix; each revision appends `--` plus its revision suffix. Preserve all existing secret references and payment/delivery activation flags. Restore known healthy images if needed while retaining the one-replica constraint; disable Academy and retain additive learning/session data on failed acceptance.

PostgreSQL pg-craves-prodlow-l3ing6 was Ready with 7-day backup retention and earliest restore 2026-09-06T14:00:10.298552Z. No additional app or database was created; the backend replica limits are now one. Existing deployment guards CRAVES_DISCOVERY_CACHE_ENABLED and CRAVES_SCHEDULED_PAYMENT_GUARD_ENABLED were absent (source defaults false).

## Gateway preflight

No Academy API existed at initial inspection. Global and Auth API policies contained no cache/trace/logger policies; each scope had zero diagnostics. The first import created craves-academy-v1 revision 1 at /academy with ten expected operations and the verified Auth /api/v1/admin/academy backend. Azure then rejected its policy because rate-limit-by-key is unavailable in the existing Consumption tier. Academy remained disabled. PR331 retains supported concurrency, body size, authorization, timeout and no-store controls, and removes the inapplicable per-IP rate-limit claim. The subscription rate-limit policy would not cover this JWT-only API; no gateway key or tier upgrade was introduced.

PR331 passed Academy CI 34726105121 and was merged. The API's expected path, Auth backend and ten operations were inspected; policy GET returned ResourceNotFound, confirming no existing policy would be overwritten. Azure accepted creation of the corrected policy from e8a9869dfdc951af1865f94766da9aebc9d5f124, with conditional If-None-Match. Reviewed source policy SHA-256: 11a9758498f93af8334e3247d6e32fa8e19b14cc934904cd40d4a7bc3296dc12. Readback using format=rawxml matches the reviewed policy structurally. Default XML export encodes expressions an additional time; this is not a runtime policy difference. Rendered/exported policy SHA-256: 5e9139afda0c2ef2695dcc1aceb98403153dcce95e0389be0c8d8d77ecd38339. New API diagnostics count is zero, both concurrency limits are eight and the body limit is 16,384 bytes. All 24 live denial/body-limit checks passed: all ten operations returned 401/no-store anonymously on both gateway hostnames, invalid credentials returned 401 and oversized bodies returned 400/no-store on both. No authenticated mutation was executed. Feature activation remains pending.

Auth operations /firebase/exchange, /me, /logout and /refresh inherit the no-cache API policy. Front Door craves-admin-route uses /* and craves-delivery-intel-route uses /delivery-intelligence and /delivery-intelligence/*; each has caching disabled. Root /api/auth therefore goes to the same-host main admin BFF.

## Figma

Destination: https://www.figma.com/design/Sg1YujvyQsWbPMsdeLxo3F
The connector was rechecked and rejected the page-list request due to the Starter MCP tool-call limit. No import or canvas acceptance is claimed and no plan/seat was upgraded.

Minimum desktop action: extract the supplied Figma import ZIP; open the destination with edit access in Figma Desktop; Plugins → Development → Import plugin from manifest → select manifest.json. Run Craves Academy - Editable UI import, select design.json inside the plugin, then Import editable screens. Review the new Academy page, twelve screens, editable layers, font wrapping and prototype destinations. The JSON is not a .fig file. Preserve existing pages and permissions.


## Effective behavior and exact source paths

The effective admin policy is an eight-hour absolute family lifetime (28,800 seconds), measured from the original verified interactive Firebase auth_time, with access tokens no longer than 900 seconds and shortened at the absolute deadline. Renewal never resets the deadline. Consumer/chef/mobile sessions retain their ordinary 900-second access and 30-day refresh policy. Staff using a consumer flow receive consumer roles, not internal administration privileges. Previously issued internal-role credentials without an admin family require one fresh interactive sign-in after this upgrade.

| Area | Main paths | Result |
|---|---|---|
| Authoritative Java session families | services/auth-service/src/main/java/in/craves/auth/service/AdminSessionService.java; services/auth-service/src/main/java/in/craves/auth/service/AuthService.java; services/auth-service/src/main/java/in/craves/auth/security/CravesJwtService.java; services/auth-service/src/main/resources/db/migration/V8__admin_session_families.sql | Rotation, replay protection, original deadline, live revocation and refresh/logout race handling |
| Main admin renewal and protected cookies | apps/customer-web-next/src/lib/admin-renewal.ts; apps/customer-web-next/src/lib/admin-session.ts; apps/customer-web-next/src/lib/auth-cookies.ts; apps/customer-web-next/src/lib/refresh-server.ts; apps/customer-web-next/src/app/api/auth/refresh/route.ts | Coordinated renewal, safe-read retry once, transient failure recovery, HttpOnly/Secure host-only cookies and same-host auth route |
| Delivery Intelligence | apps/delivery-intelligence-admin/src/lib/admin-renewal.ts; apps/delivery-intelligence-admin/src/lib/server-api.ts; apps/delivery-intelligence-admin/src/app/api/admin/me/route.ts; apps/delivery-intelligence-admin/src/components/delivery-intelligence-app.tsx; azure-pipelines-delivery-intelligence-admin.yml | Shared root auth renewal, live role/family checks, hidden protected UI while authorization is unresolved; deployment confirmation remains pending |
| Academy | apps/customer-web-next/src/app/admin/academy/AcademyDashboard.tsx; apps/customer-web-next/src/lib/api-target.ts; services/auth-service/src/main/resources/db/migration/V7__craves_academy.sql; scripts/academy/apim-policy.xml; docs/academy/README.md | Receipt-based progress/XP, private-plan revision checks, branded UI and correct /academy gateway target |
| Downstream authorization | Six exact configuration paths listed below | Live Auth verification for internal-role API requests; exact paths are listed in PR330 |

Exact downstream configuration paths from the merged tree:
- services/integration-service/src/main/java/in/craves/integration/security/AdminSessionRevocationWebConfiguration.java
- services/user-chef-service/src/main/java/in/craves/userchef/security/AdminSessionRevocationWebConfiguration.java
- services/order-service/src/main/java/in/craves/order/security/AdminSessionRevocationWebConfiguration.java
- services/catalog-service/src/main/java/in/craves/catalog/security/AdminSessionRevocationWebConfiguration.java
- services/subscription-service/src/main/java/in/craves/subscription/security/AdminSessionRevocationWebConfiguration.java
- services/notification-service/src/main/java/in/craves/notification/security/AdminSessionRevocationWebConfiguration.java

Browser coordination uses Web Locks, an in-flight renewal promise and metadata-only BroadcastChannel messages. It does not expose raw credentials to browser storage or cross-tab messages. Safe reads retry once after successful renewal; uncertain mutations are not automatically replayed. Generation guards prevent late refresh/identity responses from restoring cleared UI after logout. Recoverable 429/5xx, offline, timeout and malformed upstream responses preserve a potentially valid session; role revocation and genuine terminal authentication failures end it.

Verified fixture evidence includes 20 concurrent refreshes on eight threads, 40 browser requests and eight simulated tabs. The main web checks included 247 Node tests and 16 actual Next route Vitest cases; lint, types and build passed. All six downstream modules had six revocation tests each, including a generic HTTP 200 response without the validated-family marker failing closed. These are controlled tests, not production load claims.

Limits: the rotation response recovery receipt lasts 30 seconds; recovery after that grace period may require fresh sign-in. Offline logout clears local cookies but cannot positively confirm server revocation. Older browsers without Web Locks do not provide the same cross-tab coordination. One replica has finite capacity; no unlimited-load or zero-future-error guarantee is made.

## Deployed backend inventory

All entries below were read from Azure after run 38896. Each had latest=ready, Single revision mode and min/max replicas 1/1. Registry prefix: cravesprodlowacr82121.azurecr.io/craves/.

| App suffix | Deployed image | Ready revision suffix |
|---|---|---|
| auth-service-prodlow | auth-service@sha256:ffdeb9a3fabc532a4b0bcd6baeff36b5b11188a036d7e353f5a7317150606070 | 0000036 |
| notification-service-p | notification-service@sha256:bb15cc81121173ef2c701f2edc4e967a7cf7ed4fb26f5e5cb4fae1d777145b44 | 0000041 |
| order-service-prodlow | order-service@sha256:08e28dd40a026a9f4b44045b1a940c275b7557546b0dd518d30bfececd0e44f7 | 0000081 |
| user-chef-service-prod | user-chef-service@sha256:6adf27a796d379b04ff42e81b728294525f8db2f5848c6c4b1a273830c14eaf1 | 0000042 |
| catalog-service-prodlo | catalog-service@sha256:7565a6101f359933ae65d77bb8efbb619895a8c0c55994277ae6a5244820671e | 0000040 |
| integration-service-pr | integration-service@sha256:9be09abccc7a1e19e3f776308f4a63ba7f213ad395f081dc976594de1a740a61 | 0000149 |
| subscription-service-p | subscription-service@sha256:631ee26b33e3f7bff963c0985dc168018e8d97b0f5c2f412e35ffa55b69fc6dd | 0000042 |
| admin-web-prodlow | admin-web:6691aa2ff663e51a257407b9b1f4b5b7b4ba87d5 | 0000008 |

Pidge postflight used only the reviewed read-only delivery feedback verifier and existing secret references, with no real rider/order/payment test. It reported provider PIDGE, environment PRODUCTION, productionReady=true, catalogActive=true and blockers=[]. Feedback enabled=true, capture_enabled=true, outstanding_capped=0 and dead_letters_capped=0; lastSuccessfulPoll advanced to 2026-09-12T23:53:51.997048892Z. Scoring version was OBSERVED_TERMINAL_V1 with completion and observed_pickup_timeliness automatic components. This proves the existing observation connection was running; it does not establish a new real-delivery outcome in this session.

## Public production checks after the interrupted sign-in

The externally routed URLs https://admin.craves.in/admin/academy and https://admin.craves.in/delivery-intelligence were freshly opened. Academy showed the existing Craves logo, loading state, navigation and branded administrator sign-in state; no lesson content was displayed. Delivery Intelligence showed its secure loading screen followed by the admin-role sign-in gate. This verifies signed-out behavior only.

The following requests sent no real session cookies. Only status, error code and cookie attributes were recorded; no credential values were exposed.

| Request / expected | Actual | Result |
|---|---|---|
| GET /api/auth/admin-session: 401/no-store | 401, SESSION_REQUIRED, no-store/private | PASS |
| GET /api/admin/me: 401/no-store | 401, AUTHENTICATION_REQUIRED, no-store | PASS |
| GET /api/admin/academy/catalog: 401/no-store | 401, ACADEMY_401, no-store | PASS |
| GET /delivery-intelligence/api/admin/me: 401/no-store | 401, AUTHENTICATION_REQUIRED, no-store | PASS |
| POST /api/auth/refresh, same Origin, no cookie: 401/no-store | 401, REFRESH_REQUIRED, no-store | PASS |
| POST /api/auth/refresh, foreign Origin: 403/no-store | 403, ORIGIN_REJECTED, no-store | PASS |
| POST /api/auth/logout, same Origin, no cookie: 200/no-store and scoped cookie deletion | 200; both deletion cookies HttpOnly, Secure, SameSite=Lax, host-only, Max-Age=0; access path / and refresh path /api/auth | PASS |

Deletion-cookie attributes are not claimed as evidence of an authenticated rotation. No current user session was logged out by these cookie-free HTTP checks.

## Remaining acceptance and exact blockers

1. Azure Portal and Azure DevOps now show Microsoft account sign-in. The public run API returns a non-JSON authentication response and GitHub has no corresponding commit-status records. Restore authorized Azure browser access, inspect existing run 38899 (do not blindly queue another), record its actual commit/result/image and verify DI min/max 1/1. Main admin and all seven backend apps were already verified 1/1.
2. The Craves secure mobile sign-in request was interrupted; fresh canonical Academy navigation remained signed out. The control-browser skill requires secure credential handling and a human sign-in step when necessary. No OTP/credential was requested in chat, inspected or fabricated; the interrupted request was not retried. A signed-in authorized administrator is required for the remaining production acceptance.
3. CRAVES_ACADEMY_ENABLED was left unset/default false. V7/V8, Auth capability, gateway route/policy and the matching web release passed their checks. After access is restored, inspect current state, activate only this feature on the existing Auth app with the same reviewed image and min/max 1/1, then perform authorized lesson/source, save/reload, receipt/XP, retry, private-plan/report and UI accessibility checks. If any gate fails, disable Academy and restore affected known-good images without dropping learning/session data.
4. Production learning permissions for all nine internal roles, platform plan editing and platform/audit reports are covered by code/tests but not nine separate real production identities. Do not grant roles or manufacture test identities merely to complete the matrix. Authenticated mobile, keyboard, reduced-motion and error recovery review is still pending.
5. No real 15-minute renewal boundary or eight-hour production soak was observed. The several-hour wait at a sign-in prompt does not count as a session soak. Nothing is promised or scheduled to continue in the background.
6. Figma still requires the documented desktop import. Use the supplied ZIP's manifest.json and select design.json inside the development plugin. Expected inventory is twelve screens, 1,372 editable layers, eleven styles and four button variants on the new Craves Academy / Brand UI v2 page. Actual canvas inventory remains unverified because the connector quota rejected access.

Rollback remains available through the recorded previous images and existing pipelines. Restore only affected apps with min/max 1/1, preserve existing environment/secret references and provider settings, and retain V7/V8 data. No rollback was triggered solely because interactive acceptance was unavailable; deployed health and public denial checks passed.
