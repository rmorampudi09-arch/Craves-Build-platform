#!/usr/bin/env python3
"""Review gate: only named existing owner files and additive referral backend paths may change."""
import subprocess
# Preserve current merged main, including the independent landing/chef-session releases.
BASE='9f270d27b6c33f299aea7e931f1d015e3dd4d32d'
MODIFIED={
 'docs/launch-closure/OWNER_DECISIONS_20260916.md',
 'services/order-service/src/main/java/in/craves/order/web/ApiDtos.java',
 'services/integration-service/src/main/java/in/craves/integration/payment/RazorpayPaymentClient.java',
 'services/integration-service/src/main/java/in/craves/integration/payout/RazorpayXPayoutClient.java',
 'services/integration-service/src/main/java/in/craves/integration/service/PaymentService.java',
 'services/integration-service/src/main/java/in/craves/integration/refund/RefundRequestService.java',
 'services/integration-service/src/main/java/in/craves/integration/refund/RefundRepository.java',
 'services/integration-service/src/main/java/in/craves/integration/finance/source/OrderFinancialFinalizationService.java',

 'services/auth-service/src/main/java/in/craves/auth/api/FirebaseExchangeRequest.java',
 'services/auth-service/src/main/java/in/craves/auth/service/AuthService.java',
 'services/auth-service/src/test/java/in/craves/auth/email/EmailVerificationPersistenceTest.java',
 'services/auth-service/src/test/java/in/craves/auth/security/PostgresAuthRateLimiterDbTest.java',
 'services/order-service/src/test/java/in/craves/order/finance/FinancialCheckoutDatabaseTest.java',
 'services/integration-service/src/test/java/in/craves/integration/refund/RefundMigrationDatabaseTest.java',
 'services/integration-service/src/test/java/in/craves/integration/payout/ManualSettlementMigrationDatabaseTest.java',
}
ADDED=('services/referral-service/','docs/referrals/','scripts/referrals/',
 'services/auth-service/src/main/java/in/craves/auth/referrals/',
 'services/auth-service/src/test/java/in/craves/auth/referrals/',
 'services/order-service/src/main/java/in/craves/order/referrals/',
 'services/order-service/src/test/java/in/craves/order/referrals/',
 'services/integration-service/src/main/java/in/craves/integration/referrals/',
 'services/integration-service/src/test/java/in/craves/integration/referrals/')
EXACT={'azure-pipelines-referral-private-backend.yml','services/order-service/src/test/java/in/craves/order/finance/ReferralBenefitsOwnerDatabaseTest.java','.github/workflows/referral-backend-ci.yml',
 'services/auth-service/src/main/resources/db/migration/V17__chef_referral_eligibility.sql',
 'services/integration-service/src/main/resources/db/migration/V144__chef_referral_earnings.sql',
 'services/integration-service/src/test/java/in/craves/integration/finance/source/ChefReferralEarningsDatabaseTest.java',
 'services/order-service/src/test/java/in/craves/order/finance/ReferralCheckoutIntegrationDatabaseTest.java'}
for service,versions in {'auth-service':[(12,'source_outbox'),(13,'enrollment'),(14,'account_status')],'order-service':[(28,'source_outbox'),(29,'order_binding'),(30,'lifecycle_outbox'),(31,'checkout_benefits'),(32,'checkout_recovery_audit')],'integration-service':[(137,'source_outbox'),(138,'finance_consumer'),(139,'finance_refresh'),(140,'finance_reviews_and_execution'),(141,'checkout_funding'),(142,'split_refunds'),(143,'recovery_audit_and_cancellation')]}.items():
 for version,name in versions:EXACT.add(f'services/{service}/src/main/resources/db/migration/V{version}__referral_{name}.sql')
subprocess.run(['git','merge-base','--is-ancestor',BASE,'HEAD'],check=True)
lines=subprocess.check_output(['git','diff','--name-status','--no-renames',BASE,'HEAD'],text=True).splitlines()
assert lines,'No integration changes found'
for line in lines:
 state,path=line.split('\t',1)
 assert (state=='M' and path in MODIFIED) or (state=='A' and (path in EXACT or path.startswith(ADDED))),f'Out of reviewed backend scope: {line}'
print(f'PASS: {len(lines)} backend files; no frontend, existing pipeline or unrelated service edits')
