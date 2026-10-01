# Admin manual payment readiness correction

The approved launch mode is manual Craves settlement. RazorpayX payouts and automatic bank validation remain disabled while merchant activation is pending. This change does not send money, activate either provider, alter prices or tax treatment, edit a migration, or create historical earnings.

## Defect and resulting behavior

The saved finance policy could enable ledger accounting and manual withdrawals while the service's journal posting switch was off. The manual payment API previously reported that new manual work was enabled, accepted a reservation and authorized an external transfer, then failed when the operator recorded the actual paid outcome. The disabled journal error also lacked a useful stable response.

New reservation and transfer authorization now require the actual journal writer to be enabled. The read-only chef balance retains the actual available amount and reports specific blockers. The API uses a fixed safe error code and guidance for journal pause, policy/runtime pause, financial hold, daily quota, stale balance/version, changed replay context, invalid action state and actual bank amount mismatch.

An uninitialized chef finance account remains unable to reserve money. Its blocker explains that a captured and delivered source earning must establish a payable account; the code does not manufacture an account or earning to make the screen appear successful.

Existing commitments retain their evidence and reservations. A paused new-work policy does not prevent truthful confirmation of an already-sent transfer when journal posting is available. When the journal itself is paused, paid/reversed recording waits for restoration without changing the instruction, allocation or journal. Unsent cancellation, marking an already-sent outcome unknown, definitive no-debit recording and exact replay remain available according to the existing state rules.

## Code map

| File | Responsibility |
| --- | --- |
| `services/integration-service/src/main/java/in/craves/integration/ledger/LedgerPostingService.java` | Read-only access to the actual journal posting gate |
| `services/integration-service/src/main/java/in/craves/integration/payout/ManualChefSettlementService.java` | Effective new-work readiness, chef balance blockers and dependency-aware existing-outcome recording |
| `services/integration-service/src/main/java/in/craves/integration/payout/ManualSettlementException.java` | Explicit fixed non-sensitive codes and user guidance |
| `services/integration-service/src/main/java/in/craves/integration/web/ManualSettlementApiAdvice.java` | Safe manual admin error response with no-store/no-cache headers |
| `services/integration-service/src/main/java/in/craves/integration/web/FinanceApiAdvice.java` | Matching safe code for chef-triggered manual withdrawals |
| `services/integration-service/src/test/java/in/craves/integration/finance/source/ManualChefSettlementDatabaseTest.java` | Real PostgreSQL reservations, journal pause, exact replay, commitment preservation and financial blockers |
| `services/integration-service/src/test/java/in/craves/integration/web/ManualSettlementSecurityTest.java` | Authenticated safe guidance, status/headers and private exception text suppression |

## API compatibility

`GET /api/v1/admin/finance/chefs/{chef}/manual-settlement` adds `blockers: string[]`. Existing fields remain. The frontend should treat this field as optional during deployment and preserve validated blocker codes through the BFF. `enabled` describes the new-work runtime/policy dependencies. Holds, quota and available earnings are separate blockers and remain separately visible.

Explicit manual operation rejections use HTTP 409 with Problem Detail fields `code` and `detail`. Only the fixed server enumeration is published. SQL text, private bank references, arbitrary exception messages and request evidence are never copied into the response. Authorization and bounded request validation retain their previous status codes.

A committed journal conflict can return the existing instruction while preserving its new independent hold and immutable conflict evidence. The frontend must verify that the response status matches the requested action's result before reporting success.

## Validation

Use Java 21 and Maven with an isolated disposable PostgreSQL database. The database suites reset schemas and must never run against production, a production tunnel or an existing personal database. The existing fixture requires a localhost JDBC URL whose database is exactly `chef_ledger_test`, plus the disposable database acknowledgement.

```bash
export CRAVES_DISPOSABLE_TEST_DATABASE=true
export LEDGER_TEST_JDBC_URL=jdbc:postgresql://localhost:55432/chef_ledger_test
export LEDGER_TEST_DB_USER=ledger_ci
export LEDGER_TEST_DB_PASSWORD=ledger_ci_local_only
mvn -B -ntp -f services/integration-service/pom.xml \
  -Dtest=ManualChefSettlementDatabaseTest,ManualSettlementSecurityTest,ChefAccountingReadDatabaseTest,ReferralManualWithdrawalDatabaseTest test
```

The password shown is an isolated local test value. The six added database cases cover paused-journal reservation/quota safety, authorization/cancellation, sent unknown/no-debit handling, linked return after restoration, replay with journal paused and specific chef balance blockers. Two added MVC cases cover stable journal guidance and private exception text suppression. The required suites contain at least 35 manual database cases and 9 manual API security cases after this change.

Executed locally on 30 September 2026 with Java 21.0.12, PostgreSQL 16.15 and PostGIS 3.4.2. All 68 focused cases passed with zero failures, errors or skips: 35 manual settlement database cases, 9 manual API security cases, 11 full-history accounting cases and 13 referral manual withdrawal cases. The service's 220 production classes and 120 test classes also compiled. The local sandbox requires ByteBuddy to be loaded when the test JVM starts; the same tests were rerun with the resolved agent after automatic self-attachment was denied. No production setting, assertion or fixture was weakened to obtain the pass.

The authoritative files for this execution are the four corresponding XML reports under `services/integration-service/target/surefire-reports`. Static inspection or a previously green build is not a substitute for these results. An independent read-only code review found no concrete defect in the readiness, replay, authorization or privacy changes.

## Deployment and remaining runtime work

Deploy the reviewed Integration image through `azure-pipelines-integration-service.yml`, preserving existing runtime settings and one replica. This patch adds no migration. Verify the applied migration history against the actual deployed source before deployment; do not force Flyway repair or replace historical SQL.

The deployment must preserve `CRAVES_RAZORPAYX_PRODUCTION_APPROVED=false`, `CRAVES_RAZORPAYX_WORKER_ENABLED=false`, `CRAVES_BANK_PROVIDER_ENABLED=false` and the persisted automatic bank validation control disabled. No vendor credentials or activation are required for this manual-readiness correction.

After deployment, test authenticated admin read and wrong-role rejection; verify manual balances expose true blockers and no-store headers through both direct service and BFF/APIM. Use existing saved chef records for read-only checks. Do not create a live reservation, confirm a paid outcome, send a transfer, charge a bank validation or refund a customer as a dashboard test.

If `CRAVES_LEDGER_POSTING_ENABLED` remains false, the screen must say journal posting is paused. Restoring it is separate runtime work requiring the current source/finalization state, existing instruction states and authoritative finance counters to be checked. `scripts/finance/activate_source_runtime.py` is a first-empty-cutover script and must not be repurposed to reset a finance system with existing history.

Subscription financial allocation, cumulative compensation/refund accounting, provider invoice/bank close and statutory exports remain broader workflows; this readiness correction does not certify them.
