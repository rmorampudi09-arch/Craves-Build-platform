#!/usr/bin/env python3
import subprocess
BASE='3a4dfa69a547a64223ec09373bfcefbd5d487131'
MODIFIED={
 'services/auth-service/src/main/java/in/craves/auth/api/FirebaseExchangeRequest.java',
 'services/auth-service/src/main/java/in/craves/auth/service/AuthService.java',
 'services/order-service/src/main/java/in/craves/order/web/ApiDtos.java',
 'services/order-service/src/test/java/in/craves/order/finance/FinancialCheckoutDatabaseTest.java',
}
ADDITIVE=('services/auth-service/src/main/java/in/craves/auth/referrals/', 'services/auth-service/src/test/java/in/craves/auth/referrals/',
 'services/order-service/src/main/java/in/craves/order/referrals/', 'services/order-service/src/test/java/in/craves/order/referrals/',
 'scripts/referrals/', 'docs/referrals/')
EXACT={'.github/workflows/referral-owner-compatibility-ci.yml', 'services/order-service/src/test/java/in/craves/order/finance/ReferralBenefitsOwnerDatabaseTest.java', 'services/order-service/src/test/java/in/craves/order/finance/ReferralCheckoutIntegrationDatabaseTest.java'}
for service,versions in {'auth-service':[(12,'source_outbox'),(13,'enrollment'),(14,'account_status')], 'order-service':[(28,'source_outbox'),(29,'order_binding'),(30,'lifecycle_outbox'),(31,'checkout_benefits'),(32,'checkout_recovery_audit')]}.items():
 for v,n in versions: EXACT.add(f'services/{service}/src/main/resources/db/migration/V{v}__referral_{n}.sql')
lines=subprocess.check_output(['git','diff','--name-status','--no-renames',BASE,'HEAD'],text=True).splitlines()
assert lines
for line in lines:
 state,path=line.split('\t',1)
 assert (state=='M' and path in MODIFIED) or (state=='A' and (path in EXACT or path.startswith(ADDITIVE))),line
print(f'PASS: {len(lines)} referral-only owner files; deployed Auth/Order baseline preserved')
