# Account deletion coordinator — Implementation Plan (plan 2 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in person can ask to delete their account (customer side, chef side or both), Craves reviews chef requests, and 30 days later auth-service runs the erase in every service in a fixed order and then wipes or narrows the login.

**Architecture:** auth-service stores each request and its per-service steps, issues a `deletion_pending` token claim, and runs one scheduled worker that calls plan 1's `/internal/v1/account-erasure*` endpoints. order and subscription read the claim to refuse new orders and meal plans; catalog and subscription get a `release` endpoint so "Keep my account" undoes what `prepare` closed.

**Tech Stack:** Java 21, Spring Boot 3.3, JdbcTemplate, PostgreSQL + Flyway, `java.net.http.HttpClient`, firebase-admin, JUnit 5, Mockito, MockMvc standalone, JDK `com.sun.net.httpserver.HttpServer` for client tests.

**Spec:** `docs/superpowers/specs/2026-11-03-account-deletion-design.md`. Plan 1 (service endpoints): `docs/superpowers/plans/2026-11-03-account-erasure-service-endpoints.md`; its rulings and plan 2 notes: `docs/superpowers/plans/2026-11-03-account-erasure-followups.md` (binding). Later plans: 3 app screens, 4 website + admin page, 5 gateway routes, credentials and rollout.

## Decisions this plan makes (owner can change)

1. **Step order** is the spec's with notification moved last before auth (plan 1 note: order and user-chef can still dispatch notices): subscription → order → integration → referral → advanced → catalog → user-chef → notification → final notice → auth. For a whole-account deletion, notification's erase runs again 24 hours later (`SWEEP`) to blank the final SMS/email once it is delivered.
2. **Lock, wait, then erase.** When erasing starts, auth locks the side being erased (whole account: status `SUSPENDED`, refresh sessions revoked; one side: that role removed; always `token_version` + 1) and waits the access-token lifetime + 1 minute before the first erase call. No live token then carries the erased side's role, which closes plan 1's "chef writes between catalog erase and login wipe" gap without guarding every catalog write. The login wipe (tombstones, Firebase `deleteUser`) is still the last step.
3. **`REQUESTED` is not stored.** A request is created directly as `PENDING_REVIEW` (needs Craves review) or `SCHEDULED`. `prepare` runs in the background as steps; erasing waits until every prepare step is `DONE`.
4. **Review is needed** when scope is `CHEF`, or `ALL` and the person has the `CHEF` role. Approve is refused while the chef side has blockers ("approve only when nothing is payable or on hold").
5. **Keep my account** puts the kitchen back exactly as it was before the request (catalog saves it at `prepare`) and reopens the chef meal plans `prepare` closed. Customer meal plans cancelled at request time stay cancelled (spec: cancelled under the plan's normal rules).
6. **Tombstones:** `phone_number` = the identity id as 32 lowercase hex characters (the column is `VARCHAR(32)`; the spec's `deleted:<id>` is 44 and does not fit); `firebase_uid` = `deleted:<identity id>`.
7. **auth_audit** rows are kept (security record) with `ip_address` and `user_agent` set to NULL for the person's rows; `login_attempt` rows are deleted.
8. **Referral forfeit stays off** until finance approves an account (plan 1 parked ruling): a whole-account deletion with a non-zero referral balance waits on blocker `FORFEIT_AWAITING_FINANCE`; zero-balance deletions go through.
9. **Abandoned meal-plan checkouts** (`PENDING_PAYMENT` older than 24 hours) stop blocking, like plan 1's abandoned orders.
10. **No call signing** except referral's existing HMAC: each service gets its own base URL and credential in auth's config, sent in the header that service checks today. Plan 5 sets the values.
11. **Two switches, both off by default:** `CRAVES_ACCOUNT_DELETION_ENABLED` (public and admin routes) and `CRAVES_ACCOUNT_DELETION_WORKER_ENABLED` (the worker).
12. **Not in this plan** (small plan 2b, service scrubs only): the chef's pickup stop inside published events, delivery commands and Pidge `sender_detail`; meal-plan payment provider ids passed to integration; Cashfree `order_expiry_time` = 24 h. main's #603 staff queue in advanced (M26) is left aside (owner, 4 Nov).

## Global Constraints

- Scopes `CUSTOMER`, `CHEF`, `ALL`. Request statuses `PENDING_REVIEW`, `SCHEDULED`, `WAITING_ON_OPEN_ITEMS`, `ERASING`, `COMPLETED`, `CANCELLED`, `REJECTED`; open = the first four. `requested_via` `APP` or `WEB`. One open request per identity.
- Wait 30 days from the request (customer) or from approval (chef review). Reminder 7 days before `due_at`. Blocked requests and blocked steps are re-checked every 24 hours.
- Public routes: `POST /api/v1/auth/me/deletion` `{scope, via}`, `GET /api/v1/auth/me/deletion`, `DELETE /api/v1/auth/me/deletion`. Admin routes under `/api/v1/admin/account-deletions`.
- Token claim name `deletion_pending`, value = the open request's scope; absent when there is no open request. Refusal everywhere: HTTP 409, code `ACCOUNT_DELETION_PENDING`.
- auth statuses stay `ACTIVE`/`SUSPENDED` only (Redis revocation rejects anything else).
- Plan 1 contract: every call is `POST` JSON `{"requestId","identityId","scope"}`; 200 = DONE; 409 is BLOCKED **only** when the body's `status` is `"BLOCKED"`; any other status, timeout or bad body = failed step (retried). Never parse count keys. Header per service: `X-Craves-Internal-Secret` for subscription, order, integration, advanced, user-chef; `X-Craves-Internal-Key` for notification and catalog; referral = HMAC (`X-Referral-*`, source `auth`).
- Never hold a DB transaction open across an HTTP call (auth's Hikari pool is 3): claim and commit, call, then record.
- New `@RestController`s go in that service's `live-runtime-lock.txt`; auth routes start `/api/` or `/internal/` (`DenyByDefaultRouteInventoryTest`); every `@Scheduled` names a pool from `WorkerSchedulingConfiguration` (`ScheduledJobsUseNamedPoolsTest`).
- Migrations: auth `V21__account_deletion.sql`, catalog `V11__kitchen_deletion_prior_state.sql`, lowercase names.
- Logs and `last_error` never hold a phone, email, name or address: ids, codes and HTTP status only. Failing work logs `CRAVES_ALERT alert=ACCOUNT_DELETION_STEP_FAILING` from the 5th attempt.
- DB tests reuse each service's existing env gate (auth: `EMAIL_TEST_DB_URL` with `EmailVerificationPersistenceTest`'s helpers; others: the gate of that service's plan 1 `AccountErasure*DatabaseTest`), because CI fails on skipped tests it does not expect.
- Local test runs: `export JAVA_HOME="/c/Program Files/Java/jdk-21"; /c/tools/apache-maven-3.9.9/bin/mvn -B -ntp -f services/<svc>/pom.xml test`.

## Review Focus

1. **Two taps or two devices** send the request at once: one request exists; the same scope returns it (200), a different scope gets 409 (Task 5 `concurrentRequestsLeaveOneOpenRequest`, Task 7 `sameScopeTwiceReturnsTheOpenRequest`).
2. **A service is down on day 30**: its step retries with back-off, later steps wait, the login is never wiped, the alert fires from attempt 5 (Task 9 `aFailingStepStopsTheRunAndNeverReachesAuth`).
3. **The person signs in while erasing**: a whole-account person gets `IDENTITY_NOT_ACTIVE`; a customer-side person does not get `CUSTOMER` back until the request completes (Task 8 `signInDuringCustomerErasingDoesNotRestoreTheRole`).
4. **Keep my account after a chef had paused the kitchen**: the kitchen is still paused with the same reason and end time (Task 3 `releaseRestoresAPausedKitchenExactly`).
5. **The same phone signs up after completion**: a new identity is created with no `PHONE_ALREADY_LINKED`, and a retried wipe whose Firebase user is already gone still completes (Task 9 `samePhoneSignsUpAgainAfterWipe`, `wipeRetryToleratesMissingFirebaseUser`).

---

### Task 1: order-service refuses checkout while a deletion is pending

**Files:**
- Modify: `services/order-service/src/main/java/in/craves/order/security/JwtVerifier.java:33-48`, `security/CravesPrincipal.java`, `service/OrderService.java:279-281`, `schedule/ScheduledOrderService.java:65-71`
- Create: `services/order-service/src/main/java/in/craves/order/security/AccountDeletionGuard.java`
- Test: `src/test/java/in/craves/order/security/AccountDeletionGuardTest.java`, `security/JwtVerifierDeletionClaimTest.java` (new; sign a token with a test RSA key pair)

**Interfaces:**
- Produces: `CravesPrincipal` gains a 4th component `String deletionPendingScope` (nullable); keep a 3-arg constructor that passes `null`, so the 36 existing `new CravesPrincipal(` sites compile unchanged. `AccountDeletionGuard.requireNoCustomerDeletion(CravesPrincipal)` throws `OrderApiException.conflict("ACCOUNT_DELETION_PENDING", "Your account is set to be deleted. Tap Keep my account to order again.")` when the scope is `CUSTOMER` or `ALL`.

- [ ] **Step 1: Failing tests** — `verifierReadsTheDeletionPendingClaim` (a token with `deletion_pending: "ALL"` gives scope `ALL`; without the claim, `null`); `checkoutIsRefusedForCustomerOrWholeAccountDeletion` (`CUSTOMER`, `ALL` → 409 `ACCOUNT_DELETION_PENDING`); `chefOnlyDeletionStillOrders` (`CHEF` passes); `scheduledOrderCreateIsRefusedToo`.
- [ ] **Step 2: Run** `mvn -f services/order-service/pom.xml -Dtest='AccountDeletionGuardTest,JwtVerifierDeletionClaimTest' test` — expect FAIL.
- [ ] **Step 3: Implement** — read the optional string claim in `verify()`; call the guard in `OrderService.checkout` right after `requireCustomer(principal)` (covers `CheckoutOperationService` too) and in `ScheduledOrderService.createSchedule` after `requireRole`. Existing-order actions stay open (spec: tracking and the delivery code keep working).
- [ ] **Step 4: Run** the same tests, then the whole order suite — expect PASS.
- [ ] **Step 5: Commit** `feat(order): refuse checkout while an account deletion is pending`

### Task 2: subscription-service — refuse new plans, release chef plans, age out abandoned checkouts

**Files:**
- Modify: `services/subscription-service/src/main/java/in/craves/subscription/security/JwtVerifier.java:33-74`, `security/CurrentUser.java`, `service/SubscriptionService.java:122-127`, `plan/ChefPlanWorkflowService.java:121`, `erasure/AccountErasureController.java`, `erasure/AccountErasureService.java`
- Test: `src/test/java/in/craves/subscription/erasure/AccountErasureControllerTest.java`, `AccountErasureDatabaseTest.java` (plan 1 files), `security/JwtVerifierDeletionClaimTest.java` (new), `service/SubscriptionDeletionGuardTest.java` (new)

**Interfaces:**
- Produces: `CurrentUser` gains `String deletionPendingScope` (keep the 4-arg constructor). `POST /internal/v1/account-erasure/release` (same body and auth as `prepare`) → 200 `{"service":"subscription","status":"DONE","counts":{"subscription_plan":<n>}}`. Refusal code `ACCOUNT_DELETION_PENDING`, messages "Your account is set to be deleted. Tap Keep my account to start a meal plan." and "Your account is set to be deleted. Tap Keep my account to take new subscribers."

- [ ] **Step 1: Failing tests**
  - `createSubscriptionIsRefusedWhileCustomerSideDeletionIsPending` (`CUSTOMER`/`ALL` → 409; `CHEF` → allowed).
  - `reopeningAPlanIsRefusedWhileChefSideDeletionIsPending` (`setAcceptingSubscribers(true)` with `CHEF`/`ALL` → 409; turning it off stays allowed).
  - DB `releaseReopensOnlyThePlansPrepareClosed` (a plan the chef had closed before the request stays closed; plans with a `subscription_plan_audit` row `action='CHEF_ACCEPTING_OFF'`, reason `'Chef account deletion requested'`, and no later accepting change go back to `accepting_subscribers=true` with an audit row reason `'Account deletion cancelled'`; second release counts 0).
  - DB `anAbandonedCheckoutNoLongerBlocks` (`PENDING_PAYMENT` created 25 h ago: no `SUBSCRIPTION_STILL_ACTIVE`, its `PAYMENT_PENDING`/`PAYMENT_REQUESTED` invoice no `SUBSCRIPTION_UNPAID_INVOICE`, erase anonymises it like a cancelled one and leaves the status alone); `aFreshCheckoutStillBlocks` (created 1 h ago).
- [ ] **Step 2: Run** `mvn -f services/subscription-service/pom.xml -Dtest='AccountErasure*,JwtVerifierDeletionClaimTest,SubscriptionDeletionGuardTest' test` — expect FAIL.
- [ ] **Step 3: Implement** — claim read as in Task 1; guard after `requireRole(user,"CUSTOMER")` in `createSubscription` and in `setAcceptingSubscribers` when `accepting` is true. `PENDING_PAYMENT_PAYABLE_HOURS = 24` as a named constant, with a one-line why, next to the blocker SQL. `release(identityId, scope, requestId)` acts only for `CHEF`/`ALL`.
- [ ] **Step 4: Run** the same tests, then the whole subscription suite — expect PASS.
- [ ] **Step 5: Commit** `feat(subscription): deletion-pending guards, release endpoint, abandoned checkouts stop blocking`

### Task 3: catalog-service — kitchen stays closed while pending, and release restores it exactly

**Files:**
- Create: `services/catalog-service/src/main/resources/db/migration/V11__kitchen_deletion_prior_state.sql`
- Modify: `services/catalog-service/src/main/java/in/craves/catalog/service/KitchenScheduleService.java:59-111`, `service/AccountErasureService.java:47-57`, `web/InternalAccountErasureController.java`
- Test: `src/test/java/in/craves/catalog/service/` (plan 1's catalog erasure DB test and controller test)

**Interfaces:**
- Produces: `kitchen_schedule_config` gains nullable `deletion_prior_accepting BOOLEAN`, `deletion_prior_paused_until TIMESTAMPTZ`, `deletion_prior_pause_reason VARCHAR(160)`, `deletion_prior_saved BOOLEAN NOT NULL DEFAULT false`. `KitchenScheduleService.releaseAccountDeletion(UUID identityId): int`. `POST /internal/v1/account-erasure/release` → 200 `{"service":"catalog","status":"DONE","counts":{"kitchen_schedule_config":<n>}}`.

- [ ] **Step 1: Failing tests**
  - `prepareSavesThePriorStateOnce` (a kitchen paused until tomorrow with reason "Diwali": after prepare the prior columns hold `false`/tomorrow/"Diwali"; a second prepare does not overwrite them with `ACCOUNT_DELETION`).
  - `releaseRestoresAPausedKitchenExactly` and `releaseRestoresAnOpenKitchen` (prior values back, prior columns cleared, `deletion_prior_saved=false`, discovery cache invalidated); `releaseTwiceCountsZero`; `releaseLeavesAKitchenNotClosedForDeletionAlone`.
  - `scheduleChangesAreRefusedWhileClosedForDeletion` (`replaceMySchedule` → 409 `ACCOUNT_DELETION_PENDING`, "Your account is set to be deleted. Tap Keep my account to open your kitchen.").
- [ ] **Step 2: Run** `mvn -f services/catalog-service/pom.xml -Dtest='*AccountErasure*,KitchenSchedule*' test` — expect FAIL.
- [ ] **Step 3: Implement** — `closeForAccountDeletion` copies the current three values into the prior columns only when `deletion_prior_saved` is false, in the same UPDATE. Release acts only where `pause_reason='ACCOUNT_DELETION'`. The refusal sits at the top of `replaceMySchedule`.
- [ ] **Step 4: Run** the same tests, then the whole catalog suite — expect PASS (the known local PostGIS-stub errors aside).
- [ ] **Step 5: Commit** `feat(catalog): kitchen stays closed during a pending deletion and is restored on release`

### Task 4: referral-service — forfeit waits for finance

**Files:**
- Modify: `services/referral-service/src/main/java/in/craves/referral/erasure/AccountErasureService.java` (blockers near line 62, forfeit near line 88), `ReferralSettings.java`, `src/main/resources/application.yml`
- Test: `services/referral-service/src/test/java/in/craves/referral/AccountErasureIT.java`

**Interfaces:**
- Produces: setting `referral.erasure.forfeit-enabled` (env `CRAVES_REFERRAL_ERASURE_FORFEIT_ENABLED`, default `false`). New blocker code `FORFEIT_AWAITING_FINANCE`, detail "referral balance can't be forfeited until finance approves the forfeiture account".

- [ ] **Step 1: Failing tests** — `wholeAccountWithABalanceWaitsWhileForfeitIsOff` (blockers lists `FORFEIT_AWAITING_FINANCE`; erase answers 409 BLOCKED; wallet, journal and member byte-identical); `wholeAccountWithZeroBalanceErasesWhileForfeitIsOff` (DONE, no journal entry, code retired); `forfeitOnBehavesAsPlanOne` (the existing ALL test, now with the switch on).
- [ ] **Step 2: Run** `mvn -f services/referral-service/pom.xml verify` with the referral test env — expect FAIL.
- [ ] **Step 3: Implement** — check the balance before any write. If the existing erase posts a journal entry for a zero balance, skip posting when the balance is 0.
- [ ] **Step 4: Run** again — expect PASS.
- [ ] **Step 5: Commit** `feat(referral): whole-account erase waits for finance while forfeit is off`

### Task 5: auth — tables and repository

**Files:**
- Create: `services/auth-service/src/main/resources/db/migration/V21__account_deletion.sql`, `services/auth-service/src/main/java/in/craves/auth/deletion/DeletionModel.java` (enums + records), `deletion/AccountDeletionRepository.java`
- Modify: `src/test/java/in/craves/auth/email/EmailVerificationPersistenceTest.java:66,232,234` and `security/PostgresAuthRateLimiterDbTest.java:83,89,97,100` (Flyway counts + 1)
- Test: `src/test/java/in/craves/auth/deletion/AccountDeletionRepositoryDbTest.java`

**Interfaces:**
- Produces, in `in.craves.auth.deletion`:
  - enums `Scope {CUSTOMER, CHEF, ALL}`, `RequestStatus` (the seven), `Via {APP, WEB}`, `Phase {PREPARE, ERASE, RELEASE, SWEEP}`, `StepStatus {PENDING, DONE, BLOCKED}`;
  - `record DeletionRequest(UUID id, UUID identityId, Scope scope, RequestStatus status, Via via, Instant requestedAt, Instant dueAt, UUID reviewedBy, Instant reviewedAt, String reviewNote, String blockersJson, Instant nextCheckAt, Instant lockedAt, Instant reminderSentAt, Instant finalNoticeSentAt, Instant completedAt, Instant cancelledAt)`;
  - `record DeletionStep(UUID requestId, Phase phase, String service, StepStatus status, int attempts, String lastError, Integer erasedCount, Instant nextAttemptAt, Instant completedAt)`;
  - `AccountDeletionRepository` (JdbcTemplate): `Optional<DeletionRequest> findOpen(UUID identityId)`, `Optional<DeletionRequest> findLatest(UUID identityId)`, `Optional<DeletionRequest> find(UUID requestId)`, `Optional<DeletionRequest> lockOpen(UUID identityId)` (FOR UPDATE), `DeletionRequest insert(UUID identityId, Scope, RequestStatus, Via, Instant requestedAt, Instant dueAt)`, `void insertSteps(UUID requestId, Phase, List<String> services, Instant runAfter)` (ON CONFLICT DO NOTHING), `List<DeletionStep> steps(UUID requestId)`, `boolean transition(UUID requestId, RequestStatus from, RequestStatus to, Consumer<Map<String,Object>> extraColumns)` (or one explicit method per transition, builder's choice), `List<UUID> claimDue(Instant now, int limit, Duration lease)`, `void recordStep(UUID requestId, Phase, String service, StepStatus, Integer erasedCount, String error, Instant nextAttemptAt)`, `boolean hasErasingCustomerSide(UUID identityId)`, `List<DeletionRequest> page(RequestStatus status, Instant afterRequestedAt, UUID afterId, int limit)`.
- Schema:
  - `account_deletion_request`: the record's columns plus `lease_until TIMESTAMPTZ` and `updated_at`; CHECKs on scope, status and via; FK `identity_id → auth_identity(id)`. Unique partial index on `identity_id` WHERE status is open. Index on `(status, due_at)` and `(status, next_check_at)`.
  - `account_deletion_step`: PK `(request_id, phase, service)`; CHECKs on phase, status, and `service IN ('subscription','order','integration','referral','advanced','catalog','user-chef','notification','auth')`; `last_error VARCHAR(300)`; index `(status, next_attempt_at)`.

- [ ] **Step 1: Failing DB tests** — `oneOpenRequestPerIdentity` (a second open insert violates the index; after CANCELLED a new one is allowed); `concurrentRequestsLeaveOneOpenRequest` (two threads, `lockOpen` + insert, one row); `claimDueSkipsLeasedRows` (two claimers get disjoint ids; an expired lease is claimable again); `stepsAreInsertedOnceAndRecorded` (`insertSteps` twice = one row per service; `recordStep` updates attempts and `next_attempt_at`); `hasErasingCustomerSideOnlyForCustomerOrAllWhileErasing`.
- [ ] **Step 2: Run** `mvn -f services/auth-service/pom.xml -Dtest='AccountDeletionRepositoryDbTest,EmailVerificationPersistenceTest,PostgresAuthRateLimiterDbTest' test` with the `EMAIL_TEST_DB_URL` env — expect FAIL.
- [ ] **Step 3: Implement** the migration, the model and the repository; bump the Flyway counts in the two existing tests.
- [ ] **Step 4: Run** again — expect PASS.
- [ ] **Step 5: Commit** `feat(auth): account deletion request and step tables`

### Task 6: auth — clients for the 8 services and for notices

**Files:**
- Create: `services/auth-service/src/main/java/in/craves/auth/deletion/AccountDeletionProperties.java`, `deletion/AccountErasureClient.java`, `deletion/DeletionNotices.java`
- Modify: `services/auth-service/src/main/resources/application.yml` (block below); `services/notification-service/src/main/resources/application.yml:38` (append `|auth` to `/internal/v1/notifications`)
- Test: `src/test/java/in/craves/auth/deletion/AccountErasureClientTest.java`, `DeletionNoticesTest.java` (both against a local `HttpServer`)

**Interfaces:**
- Consumes: plan 1 endpoints; Tasks 2-3 `release`; referral signing `in.craves.auth.referrals.transport.SourceSignatures`.
- Produces:
  - `AccountDeletionProperties` (`@ConfigurationProperties("craves.account-deletion")`): `enabled`, `workerEnabled`, `workerDelay` (PT1M), `waitDays` (30), `reminderDays` (7), `services` (map name → `{baseUrl, credential}`), `referralHmacKeyBase64`, `callTimeout` (PT20S). Env names: `CRAVES_ACCOUNT_DELETION_<SVC>_BASE_URL` and `CRAVES_ACCOUNT_DELETION_<SVC>_CREDENTIAL` for SUBSCRIPTION, ORDER, INTEGRATION, ADVANCED, NOTIFICATION, CATALOG, USER_CHEF; `CRAVES_ACCOUNT_DELETION_REFERRAL_BASE_URL`, `CRAVES_ACCOUNT_DELETION_REFERRAL_HMAC_BASE64`. Validates at start-up, when `enabled` or `workerEnabled` is true, that every base URL is `https://` (or `http://localhost` in tests) and every credential is set.
  - `AccountErasureClient`: `static final List<String> ERASE_ORDER = List.of("subscription","order","integration","referral","advanced","catalog","user-chef","notification")`; `ServiceCall blockers(String service, UUID identityId, Scope)`, `ServiceCall prepare(String service, UUID requestId, UUID identityId, Scope)`, `ServiceCall erase(...)` (same parameters), `ServiceCall release(...)`; `record ServiceCall(Outcome outcome, Map<String,Integer> counts, List<Blocker> blockers, String error)`, `enum Outcome {DONE, BLOCKED, FAILED}`, `record Blocker(String service, String code, String detail)`. `erasedCount` = the sum of counts.
  - `DeletionNotices`: `void requested(DeletionRequest, boolean needsReview)`, `approved(DeletionRequest)`, `rejected(DeletionRequest)`, `reminder(DeletionRequest)`, `completed(DeletionRequest, String phone, String verifiedEmailOrNull)`. Each posts `POST /internal/v1/notifications` with `X-Craves-Internal-Key` = the notification credential, `sourceService` `auth`, `requestKey` `account-deletion:<requestId>:<event>:<channel>`, `targetType` `ACCOUNT_DELETION`, `targetId` = requestId. It never throws: failures are logged with the requestId only.

Notice copy (dates `d MMM` in Asia/Kolkata, e.g. "3 Dec"):

| Event | Channels | Title | Body |
|---|---|---|---|
| requested, no review | IN_APP, PUSH | Account deletion scheduled | Your Craves account will be deleted on {date}. Open the app and tap Keep my account to stop it. |
| requested, needs review | IN_APP, PUSH | Deletion request sent | Craves will finish it once your payouts are settled. |
| approved | IN_APP, PUSH | Account deletion scheduled | Your Craves account will be deleted on {date}. Open the app and tap Keep my account to stop it. |
| rejected | IN_APP, PUSH | Deletion request not approved | {review note} |
| reminder | IN_APP, PUSH | Account deletion in 7 days | Your Craves account will be deleted on {date}. Tap Keep my account if you want to keep it. |
| completed, ALL | SMS (+ EMAIL when verified) | Craves account deleted | Your Craves account has been deleted. Thank you for using Craves. |
| completed, CUSTOMER | IN_APP | Customer details deleted | Your customer details have been deleted. Your chef account is unchanged. |
| completed, CHEF | IN_APP | Chef account deleted | Your chef account has been deleted. You can still order on Craves. |

- [ ] **Step 1: Failing tests**
  - `eachServiceGetsItsOwnHeaderAndCredential` (asserts the header matrix in Global Constraints).
  - `referralCallsAreSignedLikeTheSourceClient` (`X-Referral-Source: auth`, the key id, a timestamp, and a signature that `SourceSignatures` verifies over the exact body).
  - `twoHundredIsDoneWithCounts`; `conflictIsBlockedOnlyWithStatusBlocked` (409 + `{"status":"BLOCKED","blockers":[…]}` → BLOCKED with blockers tagged by service; 409 with an `ApiError` body → FAILED); `otherStatusesTimeoutsAndBadJsonFail` (401, 403, 500, 503, a 21-second stall, `not json` → FAILED, error = `"HTTP 503"` / `"TIMEOUT"` / `"BAD_BODY"`, never the body text).
  - `noticesUseTheCopyTableAndNeverThrow` (the rows above; server down → no exception); `completedAllSendsSmsAndEmailOnlyWhenVerified`.
- [ ] **Step 2: Run** `mvn -f services/auth-service/pom.xml -Dtest='AccountErasureClientTest,DeletionNoticesTest' test` — expect FAIL.
- [ ] **Step 3: Implement** with `java.net.http.HttpClient` (as `SignedEmailTransport`), connect timeout 5 s, request timeout `callTimeout`; one client per JVM; the notification body fields per `CreateNotificationRequest`.
- [ ] **Step 4: Run** again — expect PASS.
- [ ] **Step 5: Commit** `feat(auth): account erasure and notice clients`

### Task 7: auth — the person's routes, the claim and `/me`

**Files:**
- Create: `services/auth-service/src/main/java/in/craves/auth/deletion/AccountDeletionService.java`, `deletion/AccountDeletionController.java`, `deletion/DeletionView.java`
- Modify: `security/CravesJwtService.java:35-62` (optional `deletion_pending` claim), `service/AuthService.java:188-195,314-326`, `api/IdentityResponse.java` (+ `PendingDeletion pendingDeletion`, nullable, last component), `src/main/resources/live-runtime-lock.txt`
- Test: `src/test/java/in/craves/auth/deletion/AccountDeletionControllerTest.java`, `AccountDeletionServiceTest.java`, extend the `CravesJwtService` test

**Interfaces:**
- Consumes: Task 5 repository, Task 6 `DeletionNotices`, `AuthIdentityRepository.incrementTokenVersion`.
- Produces:
  - `record PendingDeletion(UUID requestId, String scope, String status, Instant dueAt)` and `record DeletionView(UUID requestId, String scope, String status, Instant requestedAt, Instant dueAt, String reviewNote)` (`reviewNote` only when REJECTED).
  - `AccountDeletionService.request(CurrentUser, Scope, Via): Created(DeletionView view, boolean created)`, `current(UUID identityId): DeletionView`, `keep(CurrentUser): DeletionView`, `Optional<PendingDeletion> pending(UUID identityId)`.
  - `issueAccessToken` puts `deletion_pending` = scope when `pending(...)` is present (consumer tokens only; admin tokens unchanged).
- Rules:
  - `request`:
    - same open scope → 200 with it; another open scope → 409 `ACCOUNT_DELETION_ALREADY_REQUESTED`;
    - `CHEF` without the CHEF role, `ALL` with the RIDER role, or `CUSTOMER` with neither CHEF nor RIDER (a customer-only account asks for `ALL`; final-review ruling F4) → 409 `ACCOUNT_DELETION_SCOPE_NOT_ALLOWED`;
    - otherwise insert as `PENDING_REVIEW` (Decision 4) or as `SCHEDULED` with `due_at = now + waitDays`;
    - insert `PREPARE` steps for all 8 services (`runAfter = now`), `token_version + 1`, commit, then `notices.requested`;
    - 201.
  - `keep`:
    - open and not ERASING → `CANCELLED`, plus `RELEASE` steps for subscription and catalog when scope is CHEF or ALL, plus `token_version + 1`;
    - ERASING → 409 `ACCOUNT_DELETION_IN_PROGRESS`;
    - none → 404 `NO_DELETION_REQUEST`.
  - `current`: the latest request of any status → 200, or 404 `NO_DELETION_REQUEST`.
  - Switch off → 503 `ACCOUNT_DELETION_NOT_ENABLED` on all three routes.

- [ ] **Step 1: Failing tests**
  - `customerRequestIsScheduledThirtyDaysOut`; `chefRequestWaitsForReview`; `allWithoutChefRoleNeedsNoReview`; `sameScopeTwiceReturnsTheOpenRequest`; `otherScopeWhileOpenIsRefused`; `riderCannotAskForWholeAccount`; `customerCannotAskForChefSide`.
  - `requestBumpsTokenVersionAndInsertsEightPrepareSteps`; `keepCancelsAndQueuesReleaseForChefScopes`; `keepWhileErasingIsRefused`; `routesAre503WhileSwitchedOff`.
  - `tokenCarriesDeletionPendingWhileOpenAndNotAfterKeep`; `meShowsPendingDeletionForTheBanner` (`pendingDeletion` = requestId/scope/status/dueAt for open requests, `null` otherwise).
- [ ] **Step 2: Run** `mvn -f services/auth-service/pom.xml -Dtest='AccountDeletion*,CravesJwtService*,DenyByDefaultRouteInventoryTest' test` — expect FAIL.
- [ ] **Step 3: Implement** — controller in the `EmailVerificationController` style (`CurrentUser` from `Authentication`, strict body: `scope` required, `via` optional, default `APP`); errors through `AuthException`; the claim is computed from the DB at every token issue, since refresh sessions outlive tokens.
- [ ] **Step 4: Run** again, then the whole auth suite — expect PASS.
- [ ] **Step 5: Commit** `feat(auth): request, view and keep account deletion; deletion_pending claim`

### Task 8: auth — worker part 1: prepare, release, the day-30 check and the lock

**Files:**
- Create: `services/auth-service/src/main/java/in/craves/auth/deletion/AccountDeletionEngine.java`, `deletion/AccountDeletionWorker.java`, `deletion/AccountLock.java`
- Modify: `config/WorkerSchedulingConfiguration.java` (`ACCOUNT_DELETION_SCHEDULER`, pool size 1)
- Test: `src/test/java/in/craves/auth/deletion/AccountDeletionEngineTest.java` (fake client, fixed `Clock`), `AccountLockDbTest.java`

**Interfaces:**
- Consumes: Tasks 5-7.
- Produces:
  - `AccountDeletionEngine.runOnce(Instant now)`: claims up to 10 requests with work due (lease 5 min) and, for each one, does what is due, committing after each call.
  - `AccountLock.lock(DeletionRequest)`:
    - ALL → status `SUSPENDED`, `token_version + 1`, refresh sessions revoked (as `AdminAccountInterventionRepository:52-60`);
    - CUSTOMER / CHEF → that role's row deleted, `token_version + 1`.
  - `AccountDeletionWorker`: `@Scheduled(fixedDelayString = "${craves.account-deletion.worker-delay:PT1M}", scheduler = ACCOUNT_DELETION_SCHEDULER)`, bean only when `worker-enabled` is true.
- Behaviour per tick:
  - **PREPARE / RELEASE / SWEEP steps due:** call the service.
    - DONE → `DONE`.
    - BLOCKED → retry in 24 h.
    - FAILED → `attempts + 1`, retry in `min(5 min × 2^(attempts−1), 6 h)`.
    - From attempt 5, log `CRAVES_ALERT alert=ACCOUNT_DELETION_STEP_FAILING requestId=… phase=… service=… attempts=… error=…`.
  - **Reminder:** `SCHEDULED` with `due_at − reminderDays ≤ now` and no `reminder_sent_at` → `notices.reminder`, then set it.
  - **Day-30 check:** `SCHEDULED` with `due_at ≤ now`, or `WAITING_ON_OPEN_ITEMS` with `next_check_at ≤ now`.
    - Every PREPARE step `DONE` and every service's `blockers` empty and reachable → `AccountLock.lock`, `locked_at = now`, `ERASING`, then `ERASE` steps for the 8 services plus `auth` with `runAfter = now + access-token TTL + 1 min`.
    - Otherwise → `WAITING_ON_OPEN_ITEMS` with `blockers_json` (each blocker tagged with its service; a prepare step not done = `PREPARE_NOT_DONE`; an unreachable service = `SERVICE_UNREACHABLE`) and `next_check_at = now + 24 h`.
    - A request still waiting 7 days after `due_at` logs `CRAVES_ALERT alert=ACCOUNT_DELETION_WAITING requestId=… days=…` at each daily check (spec anti-goal: never blocked forever with no one told).
- Also: `AuthService.ensureCustomerRole` skips re-adding CUSTOMER while `hasErasingCustomerSide(identityId)`.

- [ ] **Step 1: Failing tests**
  - `prepareStepsRunAndRetryWithBackoff`; `blockedPrepareRetriesNextDay`; `alertFromTheFifthAttempt`.
  - `dueRequestWithBlockersWaitsAndRechecksDaily`; `waitingAWeekPastDueAlerts`; `dueRequestWithAPrepareStepNotDoneWaits`; `dueRequestWithNothingOpenLocksAndSchedulesEraseAfterTheTokenLifetime`; `reminderIsSentOnceSevenDaysBefore`.
  - `releaseStepsRunAfterKeep`; `twoWorkersNeverRunTheSameRequest`; `noHttpCallInsideATransaction` (the fake client asserts `TransactionSynchronizationManager.isActualTransactionActive()` is false).
  - DB `AccountLockDbTest`: `lockAllSuspendsAndRevokesSessions`; `lockCustomerRemovesOnlyTheCustomerRole`; `signInDuringCustomerErasingDoesNotRestoreTheRole`.
- [ ] **Step 2: Run** `mvn -f services/auth-service/pom.xml -Dtest='AccountDeletionEngineTest,AccountLockDbTest,ScheduledJobsUseNamedPoolsTest' test` — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** again — expect PASS.
- [ ] **Step 5: Commit** `feat(auth): deletion worker prepares, checks open items and locks the account`

### Task 9: auth — worker part 2: erase in order, wipe the login, final notice, sweep

**Files:**
- Create: `services/auth-service/src/main/java/in/craves/auth/deletion/AuthAccountEraser.java`
- Modify: `deletion/AccountDeletionEngine.java`
- Test: `AccountDeletionEngineTest.java`, `src/test/java/in/craves/auth/deletion/AuthAccountEraserDbTest.java`

**Interfaces:**
- Consumes: Tasks 5-8; `FirebaseAuth` given as a constructor argument (mockable, as `Msg91FirebaseBridge`).
- Produces: `AuthAccountEraser.erase(DeletionRequest): Map<String,Integer>`.
  - **ALL:**
    - `FirebaseAuth.deleteUser(firebase_uid)` first, treating `AuthErrorCode.USER_NOT_FOUND` as done.
    - Then one transaction, which deletes `refresh_session`, `login_attempt` (by firebase_uid or phone_number), `auth_phone_otp` (by phone_number), `auth_email_challenge` (children before parents) and the `academy_schema` rows (children before `learner`).
    - The same transaction sets `ip_address`/`user_agent` NULL on the person's `auth_audit` rows and deletes the CUSTOMER and CHEF role rows.
    - It sets `auth_identity`: `phone_number` = 32-hex id, `firebase_uid` = `deleted:<id>`, `email`/`display_name`/`email_verified_at` NULL, `email_verified` false, `status` `SUSPENDED`, `token_version + 1`.
    - Immutable tables (`referral_enrollment`, `auth_email_projection_outbox`, `auth_email_audit`, `referral_source_outbox`, `auth_token_revocation_outbox`) are untouched.
  - **CUSTOMER / CHEF:** that role is gone (re-delete is a no-op), `token_version + 1`.
- Run order once `ERASING` and the step's `runAfter` has passed:
  - Run the first ERASE step in `ERASE_ORDER` that is not `DONE`, one call per tick per request. Never skip ahead: a FAILED or BLOCKED step stops the run there.
  - Once all 8 are `DONE`: read the phone and verified email, send `notices.completed` once (`final_notice_sent_at`), then the `auth` step.
  - Then `COMPLETED` and `completed_at`; for ALL, a `SWEEP` step for `notification` with `runAfter = now + 24 h`.

- [ ] **Step 1: Failing tests**
  - `stepsRunInTheFixedOrder` (call log = `ERASE_ORDER`, then the notice, then auth); `eraseWaitsForTheTokenLifetimeAfterLock`.
  - `aFailingStepStopsTheRunAndNeverReachesAuth` (order fails 6 times: integration…auth never called, alert logged, status stays ERASING); `aBlockedStepRetriesNextDay`.
  - `completedAllQueuesTheSweepADayLater`; `oneSideCompletionSendsInAppAndNoSweep`.
  - DB `wipeAllLeavesNoPersonalDataInAuth` (every column and table above checked, immutable tables unchanged); `samePhoneSignsUpAgainAfterWipe` (`AuthService.loadOrCreateIdentity` with the old phone creates a new identity); `wipeRetryToleratesMissingFirebaseUser`; `wipeTwiceChangesNothingTheSecondTime`.
- [ ] **Step 2: Run** `mvn -f services/auth-service/pom.xml -Dtest='AccountDeletionEngineTest,AuthAccountEraserDbTest' test` — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** again, then the whole auth suite — expect PASS.
- [ ] **Step 5: Commit** `feat(auth): deletion worker erases every service in order and wipes the login last`

### Task 10: auth — admin routes for Craves review

**Files:**
- Create: `services/auth-service/src/main/java/in/craves/auth/deletion/AdminAccountDeletionController.java`
- Modify: `deletion/AccountDeletionService.java` (approve/reject), `src/main/resources/live-runtime-lock.txt`
- Test: `src/test/java/in/craves/auth/deletion/AdminAccountDeletionControllerTest.java`

**Interfaces:**
- Consumes: Tasks 5-7; templates `AdminAccountInterventionController` (`requireEnabled`, `principal()`, `normalizeReason` 10-500 chars, `correlationId`) and the `auth_audit` insert.
- Produces:
  - `GET /api/v1/admin/account-deletions?status=&cursor=&limit=` (default 25, max 100; oldest `requested_at` first; cursor = base64url `requestedAt|id`) → `{items:[…], nextCursor}`.
  - `GET /api/v1/admin/account-deletions/{id}` → the request, `phoneLast4`, roles, steps (phase, service, status, attempts, lastError, completedAt) and live `blockers` from all 8 services (an unreachable service shows `SERVICE_UNREACHABLE`).
  - `POST …/{id}/approve` `{reason}`: PENDING_REVIEW only; chef-side blockers (`blockers` with scope CHEF) must be empty, else 409 `ACCOUNT_DELETION_HAS_OPEN_ITEMS` with the list. Then `SCHEDULED`, `due_at = now + waitDays`, `reviewed_by/at`, `token_version` unchanged, `notices.approved`.
  - `POST …/{id}/reject` `{reason}` (10-500 chars, shown to the person): PENDING_REVIEW, SCHEDULED or WAITING only → `REJECTED`, `review_note`, `RELEASE` steps as in `keep`, `token_version + 1`, `notices.rejected`.
- Roles:
  - read: PLATFORM_ADMIN, SUPPORT_ADMIN, COMPLIANCE_ADMIN, AUDIT_ADMIN;
  - approve/reject: PLATFORM_ADMIN, COMPLIANCE_ADMIN.
  - Nobody acts on their own request (403 `ACCOUNT_DELETION_OWN_REQUEST`).
  - A wrong status → 409 `ACCOUNT_DELETION_NOT_REVIEWABLE`.
  - Every read and write → one `auth_audit` row (`ACCOUNT_DELETION_READ`, `…_APPROVED`, `…_REJECTED`) with the correlation id.

- [ ] **Step 1: Failing tests** — `readersSeeTheQueueOldestFirstWithACursor`; `detailShowsStepsAndLiveBlockers`; `approveSchedulesThirtyDaysFromApproval`; `approveIsRefusedWhileChefSideHasOpenItems`; `rejectNeedsAReasonAndReleases`; `supportCanReadButNotApprove`; `nobodyActsOnTheirOwnRequest`; `everyCallIsAudited`; `routesAre503WhileSwitchedOff`.
- [ ] **Step 2: Run** `mvn -f services/auth-service/pom.xml -Dtest='AdminAccountDeletionControllerTest,DenyByDefaultRouteInventoryTest' test` — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** again, then the whole auth suite — expect PASS.
- [ ] **Step 5: Commit** `feat(auth): admin routes to review account deletion requests`
