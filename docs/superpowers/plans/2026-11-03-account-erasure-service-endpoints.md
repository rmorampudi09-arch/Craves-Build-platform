# Account erasure endpoints in each service — Implementation Plan (plan 1 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every service that holds a person's data gets private endpoints that report what blocks a deletion, prepare it, and erase or anonymise that person's data for one side (customer, chef) or the whole account.

**Architecture:** Each service adds one internal controller under `/internal/v1/account-erasure`, protected like its existing internal routes, plus a small service class with the SQL. auth-service's coordinator (plan 2) calls them; nothing calls them until plan 2 ships, so this plan changes no live behaviour.

**Tech Stack:** Java 21, Spring Boot, JdbcTemplate, PostgreSQL with Flyway, JUnit 5, MockMvc.

**Spec:** `docs/superpowers/specs/2026-11-03-account-deletion-design.md` (approved 3 Nov 2026). Later plans: 2 coordinator in auth (requests, timer, `deletion_pending` claim, worker, admin API, auth's own wipe), 3 app screens, 4 website and admin pages, 5 gateway routes and rollout.

## Global Constraints

- Endpoints, identical in every service (all POST, JSON, because referral's filter accepts only signed JSON POSTs):
  - `POST /internal/v1/account-erasure/blockers` body `{"identityId": "<uuid>", "scope": "CUSTOMER"|"CHEF"|"ALL"}` → 200 `{"service": "<svc>", "blockers": [{"code": "<UPPER_SNAKE>", "detail": "<plain words for staff>"}]}`.
  - `POST /internal/v1/account-erasure/prepare` body `{"requestId": "<uuid>", "identityId": "<uuid>", "scope": ...}` → 200 `{"service": "<svc>", "status": "DONE", "counts": {...}}`. Only subscription and catalog do work here; every other service answers DONE with empty counts.
  - `POST /internal/v1/account-erasure` same body as prepare → 200 `{"service", "status": "DONE", "counts": {"<table>": <rows>}}`, or 409 `{"service", "status": "BLOCKED", "blockers": [...]}` when its own blockers are not empty. Idempotent: a second call with the same input returns DONE with zero counts.
  - Unknown scope or missing field → 400 with the service's usual error body.
- `ALL` = `CUSTOMER` + `CHEF` in that service.
- Protection: the service's existing internal check, copied from its pattern controller (header and env differ per service, see each task); plus `/internal/v1/account-erasure/**=auth` appended to `craves.internal-auth.allowed-callers` default in `application.yml`, and a `permitAll` line in SecurityConfig where the chain does not already permit `/internal/**`.
- Every new `@RestController` is added to that service's `src/main/resources/live-runtime-lock.txt` (CI fails otherwise, `scripts/release/tests/test_launch_live_runtime_lock.py`).
- Never update or delete rows protected by immutability or money triggers: order `guard_bound_order_money` (V25) and snapshots (V24), integration ledger/finance/bank tables (V121, V125, V131), notification `pdf_document` READY rows (V6), referral journal. Kept rows keep their ids.
- Anonymised text uses fixed placeholders defined once per service as constants (builder picks values that satisfy each column's CHECK constraints); phones and emails are replaced, never left partially visible.
- No new migration unless a task says so; migrations use the next number (auth V21, user-chef V23, catalog V11, order V42, subscription V21, notification V9, integration V183) and lowercase names.
- Each service logs one INFO line per erase: service, requestId, scope, counts; never the person's data.

## Review Focus

1. A dual-role chef asks for **CUSTOMER** only: no catalog, chef-application or payout data may change. Owning tasks test that CUSTOMER leaves chef rows untouched (Tasks 6, 7).
2. Erase runs twice (worker retry after a timeout): second call DONE, counts zero, nothing else changes (every task).
3. An order is still on its way on day 30: order's blockers list it and erase answers 409, never anonymising a live order's dropoff address (Task 2).
4. A customer whose order already has a financial snapshot: dropoff fields are anonymised and the money guard trigger does not fire (Task 2 database test).
5. advanced module switched off: its data is still erased if its schema exists, and skipped (counted 0) if the schema was never created (Task 5).

---

### Task 1: subscription-service

**Files:**
- Create: `services/subscription-service/src/main/java/in/craves/subscription/erasure/AccountErasureController.java`, `AccountErasureService.java`, `AccountErasureDtos.java`
- Modify: `services/subscription-service/src/main/java/in/craves/subscription/config/SecurityConfig.java`, `src/main/resources/application.yml` (allowed-callers), `src/main/resources/live-runtime-lock.txt`
- Test: `src/test/java/in/craves/subscription/erasure/AccountErasureControllerTest.java` (copy `order/OccurrenceOrderInternalSecurityTest`, @WebMvcTest), `AccountErasureDatabaseTest.java` (copy `credit/DayCreditDatabaseTest`, env `SUBSCRIPTION_TEST_JDBC_URL`)

**Interfaces:**
- Produces: the three endpoints (Global Constraints). Internal check `OccurrenceOrderProperties.validInternalAccess` with header `X-Craves-Internal-Secret`.
- Blocker codes: `SUBSCRIPTION_UNPAID_INVOICE`, `DAY_CREDIT_CHOICE_PENDING` (CUSTOMER); `PLAN_HAS_ACTIVE_SUBSCRIBERS` (CHEF).

- [ ] **Step 1: Write failing tests**
  - Controller: missing/wrong secret → 401; `scope: "OTHER"` → 400; blockers returns `{"service":"subscription","blockers":[]}` for a person with nothing.
  - Database: `prepareCustomerCancelsActiveSubscriptionsUnderNormalRules` (ACTIVE and PAUSED end CANCELLED through the same cancel path `PATCH /subscriptions/{id}/cancel` uses; refund/credit rows are created exactly as a customer cancel would);
    `prepareChefStopsNewSubscribers` (all the chef's plans `accepting_subscribers=false`);
    `eraseCustomerAnonymisesNotesAndSkipReasons` (notes and skip reasons become the placeholder; status history and invoices unchanged);
    `eraseIsBlockedWhileAnInvoiceIsUnpaid` (409, nothing changed);
    `eraseTwiceIsDoneWithZeroCounts`.
- [ ] **Step 2: Run them — expect FAIL** `mvn -f services/subscription-service/pom.xml -Dtest='AccountErasure*' test`
- [ ] **Step 3: Implement** controller (`/internal/v1/account-erasure`), `AccountErasureService.blockers/prepare/erase(UUID identityId, Scope scope, UUID requestId)`; reuse the existing customer-cancel service method for prepare. Add the permitAll line for `/internal/v1/account-erasure/**`, the allowed-callers entry, the lock-file entry.
- [ ] **Step 4: Run tests — expect PASS** (same command; DB tests run where the env is set, as in CI)
- [ ] **Step 5: Commit** `feat(subscription): internal account erasure endpoints`

### Task 2: order-service

**Files:**
- Create: `services/order-service/src/main/java/in/craves/order/erasure/AccountErasureController.java`, `AccountErasureService.java`, `AccountErasureDtos.java`
- Modify: `src/main/resources/application.yml` (allowed-callers), `src/main/resources/live-runtime-lock.txt`
- Test: `.../erasure/AccountErasureControllerTest.java` (copy `web/InternalSupportOrderControllerTest`), `AccountErasureDatabaseTest.java` (copy `delivery/DeliveryCodeDatabaseTest`, env `LEDGER_TEST_JDBC_URL`)

**Interfaces:**
- Internal check: header `X-Craves-Internal-Secret` against `CRAVES_INTERNAL_SERVICE_KEY` (as `InternalSupportOrderController`).
- Blocker codes: `ORDER_IN_PROGRESS` (customer order in PAYMENT_PENDING, PAID, CHEF_ACCEPTANCE_PENDING, CHEF_ACCEPTED, PREPARING, READY_FOR_PICKUP, OUT_FOR_DELIVERY), `REFUND_IN_PROGRESS` (REFUND_PENDING, REFUND_FAILED); for CHEF scope `KITCHEN_ORDER_IN_PROGRESS` (same statuses where `chef_identity_id` = person).
- CUSTOMER erase: delete `cart`, `cart_item`, `order_review` and its revision/media/helpful_vote/report rows written by the person, `order_delivery_code` for their orders, their `idempotency_record` rows; anonymise `customer_order` and `checkout` `dropoff_*`, `customer_note` (and `scheduled_order_request` free text). CHEF erase: nothing to remove (DONE, empty counts).

- [ ] **Step 1: Write failing tests**
  - Controller: auth and 400 cases as Task 1.
  - Database: `eraseCustomerAnonymisesDropoffOnABoundOrderWithoutTouchingMoney` (order with an `order_financial_snapshot`: dropoff fields become placeholders, `chk_order_dropoff_snapshot_complete` still holds, amounts and `customer_identity_id` unchanged, no trigger error);
    `eraseCustomerDeletesCartReviewsAndDeliveryCodes`;
    `eraseIsBlockedWhileAnOrderIsOutForDelivery` (409, dropoff unchanged);
    `eraseCustomerLeavesTheirKitchenOrdersAlone` (dual role: orders where they are the chef unchanged);
    `eraseTwiceIsDoneWithZeroCounts`.
- [ ] **Step 2: Run — expect FAIL** `mvn -f services/order-service/pom.xml -Dtest='AccountErasure*' test`
- [ ] **Step 3: Implement** the controller and service (SQL per table); review media blobs are deleted through the store review media already uses, if any (builder confirms in `order/review`).
- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** `feat(order): internal account erasure endpoints`

### Task 3: integration-service

**Files:**
- Create: `services/integration-service/src/main/java/in/craves/integration/erasure/AccountErasureController.java`, `AccountErasureService.java`, `AccountErasureDtos.java`
- Modify: `application.yml` (allowed-callers), `live-runtime-lock.txt`
- Test: `.../erasure/AccountErasureControllerTest.java` (standalone MockMvc, pattern `web/ManualSettlementSecurityTest`), `AccountErasureDatabaseTest.java` (pattern `finance/FinancePolicyDatabaseTest`, env `LEDGER_TEST_JDBC_URL`)

**Interfaces:**
- Internal check: `delivery/InternalRequestAuthorizer.requireValid` (header `X-Craves-Internal-Secret`, env `CRAVES_INTERNAL_SERVICE_KEY`).
- Blocker codes: `REFUND_IN_FLIGHT` (CUSTOMER: refund rows REQUESTED, PROCESSING, RETRY, PENDING, ONHOLD); CHEF: `PAYABLE_UNPAID`, `PAYOUT_NOT_FINISHED` (instruction not PAID/FAILED), `PAYOUT_ON_HOLD` (`finance_chef_payout_control.on_hold`), `SETTLEMENT_PENDING` (`chef_earning_entry`).
- CUSTOMER erase: in `payment_order.request_payload` replace customer name, phone and email with placeholders (JSONB update) — only if no trigger forbids it; if one does, skip and count 0 (spec: kept, disclosed). CHEF erase: nothing (ledger, payouts, bank kept): DONE.

- [ ] **Step 1: Write failing tests** — auth/400; `blockersListUnfinishedPayoutsForChef`; `eraseCustomerScrubsPaymentRequestPayload` (amounts and order ids in the payload unchanged); `eraseChefChangesNothing` (row counts of ledger/payout/bank tables identical before and after); `eraseTwiceIsDoneWithZeroCounts`.
- [ ] **Step 2: Run — expect FAIL** `mvn -f services/integration-service/pom.xml -Dtest='AccountErasure*' test`
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** `feat(integration): internal account erasure endpoints`

### Task 4: referral-service

**Files:**
- Create: `services/referral-service/src/main/java/in/craves/referral/api/AccountErasureController.java`, `.../erasure/AccountErasureService.java`
- Modify: `security/SourceAuthenticationFilter.java` (allow the three POST paths for source `auth` only), `live-runtime-lock.txt`
- Test: extend `ReferralHttpContractIT` (three paths, source `auth` accepted, source `order` rejected), new `AccountErasureIT` (pattern `SchemaIT`, `TestDatabase.reset()`, env `REFERRAL_TEST_JDBC_URL` + `REFERRAL_TEST_CONFIRM`)

**Interfaces:**
- Signed with the existing `X-Referral-*` HMAC; auth already has `ReferralSourceClient` (plan 2 uses it).
- Blocker codes: CHEF `REFERRAL_CASH_UNPAID` (chef's cash referral earnings not paid out — owner decision 7); ALL `FRAUD_CASE_OPEN`.
- Erase: anonymise the member's code/profile link (code retired so it can never be reused); keep `contact_hash`, `device_hash`, `payment_hash` (fraud retention); CUSTOMER credits: append one forfeiture journal entry for any unused balance, never update journal rows.

- [ ] **Step 1: Write failing tests** — `chefWithUnpaidCashEarningsIsBlocked`; `eraseForfeitsCustomerCreditsWithOneJournalEntry` (balance 0 after, journal row count +1, no journal row updated); `eraseKeepsFraudHashes`; `retiredCodeCannotBeRedeemed`; `eraseTwiceIsDoneWithZeroCounts`.
- [ ] **Step 2: Run — expect FAIL** `mvn -f services/referral-service/pom.xml -Dit.test='AccountErasureIT,ReferralHttpContractIT' verify`
- [ ] **Step 3: Implement** (journal entry type name chosen to match existing journal entry kinds; schema change, if needed, goes in `db/referral_migration` V13)
- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** `feat(referral): internal account erasure endpoints`

### Task 5: advanced-features-service

**Files:**
- Create: `services/advanced-features-service/src/main/java/in/craves/advanced/platform/erasure/AccountErasureController.java`, `AccountErasureService.java`
- Modify: `tastedata/TasteDataController.java` (move the erase loop into `AccountErasureService.eraseAll(UUID person, boolean includeDisabled)` and call it), `platform/security/SecurityConfig.java` (permitAll `/internal/v1/account-erasure/**`; everything else stays denied), `application.yml` (`craves.internal.service-secret: ${CRAVES_INTERNAL_SERVICE_SECRET:}`), `live-runtime-lock.txt`
- Test: `src/test/java/in/craves/advanced/platform/erasure/AccountErasureIT.java` (extends `support/IntegrationTestBase`, env `ADV_TEST_JDBC_URL`)

**Interfaces:**
- Internal check: header `X-Craves-Internal-Secret` equals `craves.internal.service-secret` (constant-time compare); empty secret → 503.
- CUSTOMER/ALL erase every `PersonalDataContributor`; CHEF erases only chef-owned modules (`kitchencapacity`). Blockers: none.
- The existing `DELETE /api/v1/advanced/my-taste-data` keeps its behaviour (skips disabled modules) by calling `eraseAll(person, false)`; the internal erase calls `eraseAll(person, true)`.

- [ ] **Step 1: Write failing tests** — `internalEraseNeedsTheSecret` (no header 401, empty config 503); `internalEraseCoversASwitchedOffModule` (module disabled but schema present: its rows deleted); `internalEraseSkipsAModuleWhoseSchemaNeverExisted` (count 0, DONE); existing `TasteDataIT` still passes unchanged.
- [ ] **Step 2: Run — expect FAIL** `mvn -f services/advanced-features-service/pom.xml -Dit.test='AccountErasureIT,TasteDataIT' verify`
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** `feat(advanced): internal account erasure endpoints`

### Task 6: notification-service

**Files:**
- Create: `services/notification-service/src/main/java/in/craves/notification/api/InternalAccountErasureController.java`, `.../erasure/AccountErasureService.java`
- Modify: `application.yml` (allowed-callers), `live-runtime-lock.txt`
- Test: `.../api/InternalAccountErasureControllerTest.java` (copy `api/InternalRealtimeControllerTest`), `.../repository/AccountErasureDbTest.java` (copy `AppNoticeRoleFilterDbTest`, env `DOCUMENT_TEST_JDBC_URL`)

**Interfaces:**
- Internal check: header `X-Craves-Internal-Key` against `craves.internal.service-key`.
- CUSTOMER: delete in-app notices addressed to the CUSTOMER role; CHEF: those for CHEF; ALL: all in-app notices, `notification_preference`, `push_device_registration`, and blank `notification_request` body/payload/delivery_address. `pdf_document` untouched. Blockers: none.

- [ ] **Step 1: Write failing tests** — auth case; `customerScopeKeepsChefNotices`; `allScopeRemovesDevicesPreferencesAndBodies`; `pdfDocumentsAreUntouched`; `eraseTwiceIsDoneWithZeroCounts`.
- [ ] **Step 2: Run — expect FAIL** `mvn -f services/notification-service/pom.xml -Dtest='*AccountErasure*' test`
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** `feat(notification): internal account erasure endpoints`

### Task 7: catalog-service

**Files:**
- Create: `services/catalog-service/src/main/java/in/craves/catalog/web/InternalAccountErasureController.java`, `.../service/AccountErasureService.java`
- Modify: `security/SecurityConfig.java` (permitAll `/internal/v1/account-erasure/**`), `service/MediaStorageService.java` (add `delete(String blobName)`, deleting if it exists), `application.yml` (allowed-callers), `live-runtime-lock.txt`
- Test: `.../web/InternalAccountErasureAccessTest.java` (pattern `InternalCatalogAccessTest`), `.../service/AccountErasureDatabaseTest.java` (pattern `ChefCatalogDatabaseTest`, env `CATALOG_TEST_JDBC_URL`), `.../service/MediaStorageServiceTest` (add a delete case)

**Interfaces:**
- Internal check: `InternalCatalogAuthorizer.requireAuthorized` (header `X-Craves-Internal-Key`).
- prepare (CHEF/ALL): `kitchen_schedule_config.accepting_orders=false`, `pause_reason='ACCOUNT_DELETION'`, no `paused_until` — through `KitchenScheduleService`, so discovery caches are invalidated as today.
- erase (CHEF/ALL): `kitchen_profile` contact, address and name fields anonymised, status `INACTIVE`, photo URLs cleared and kitchen photo blobs deleted; every `menu_item` ARCHIVED and its image blobs deleted; `kitchen_pickup_location` contact/address anonymised. CUSTOMER: nothing (DONE). Blockers: none.

- [ ] **Step 1: Write failing tests** — `prepareClosesTheKitchenToNewOrders` (availability().availableNow false); `eraseChefAnonymisesKitchenArchivesMenuAndDeletesPhotos` (blob deletes called for each stored photo); `customerScopeChangesNoCatalogRow`; `eraseTwiceIsDoneWithZeroCounts`; access test for the key.
- [ ] **Step 2: Run — expect FAIL** `mvn -f services/catalog-service/pom.xml -Dtest='*AccountErasure*,MediaStorageServiceTest' test`
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** `feat(catalog): internal account erasure endpoints`

### Task 8: user-chef-service

**Files:**
- Create: `services/user-chef-service/src/main/java/in/craves/userchef/web/InternalAccountErasureController.java`, `.../service/AccountErasureService.java`
- Modify: `config/SecurityConfig.java` (permitAll line), `application.yml` (allowed-callers), `live-runtime-lock.txt`
- Test: `.../web/InternalAccountErasureControllerTest.java` (pattern `supportchat/InternalVoiceSupportControllerTest`), `.../service/AccountErasureDatabaseTest.java` (pattern `onboarding/ChefOnboardingDatabaseTest`, env `ONBOARDING_TEST_DB_URL`)

**Interfaces:**
- Internal check: `security/InternalRequestAuthorizer.requireValid` (header `X-Craves-Internal-Secret`).
- CUSTOMER/ALL: delete `customer_profile`, all `customer_address` rows (hard delete), the four favourite tables, `customer_kitchen_launch_alert`; anonymise the person's own messages in `support_case*`.
- CHEF/ALL: anonymise `chef_application` and onboarding draft/help/visit contact and address fields and mark the application so a later re-application resets this row to a fresh draft (owner "chef again later"); `chef_kyc_document` rows and blobs untouched (owner decision 8).
- Blockers: none. `auth_email_projection` untouched (DELETE blocked by trigger; kept, disclosed).

- [ ] **Step 1: Write failing tests** — auth case; `customerScopeRemovesProfileAddressesFavouritesAndAlerts`; `customerScopeLeavesChefApplicationAlone`; `chefScopeAnonymisesApplicationAndKeepsKyc`; `reapplyAfterChefErasureStartsAFreshDraft`; `eraseTwiceIsDoneWithZeroCounts`.
- [ ] **Step 2: Run — expect FAIL** `mvn -f services/user-chef-service/pom.xml -Dtest='*AccountErasure*' test`
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** `feat(user-chef): internal account erasure endpoints`
