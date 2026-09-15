#!/usr/bin/env python3
"""Review gate: only named existing owner files and additive referral backend paths may change."""
import subprocess
BASE='870f5293884888aa28f0c069b91a86d06492c9a2'
MODIFIED={
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
EXACT={'.github/workflows/referral-backend-ci.yml',
 'services/order-service/src/test/java/in/craves/order/finance/ReferralCheckoutIntegrationDatabaseTest.java'}
for service,versions in {'auth-service':[(12,'source_outbox'),(13,'enrollment'),(14,'account_status')],'order-service':[(28,'source_outbox'),(29,'order_binding'),(30,'lifecycle_outbox')],'integration-service':[(137,'source_outbox'),(138,'finance_consumer'),(139,'finance_refresh')]}.items():
 for version,name in versions:EXACT.add(f'services/{service}/src/main/resources/db/migration/V{version}__referral_{name}.sql')
lines=subprocess.check_output(['git','diff','--name-status','--no-renames',BASE,'HEAD'],text=True).splitlines()
assert lines,'No integration changes found'
for line in lines:
 state,path=line.split('\t',1)
 assert (state=='M' and path in MODIFIED) or (state=='A' and (path in EXACT or path.startswith(ADDED))),f'Out of reviewed backend scope: {line}'
print(f'PASS: {len(lines)} backend files; no frontend, existing pipeline or unrelated service edits')
