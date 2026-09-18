#!/usr/bin/env python3
"""Review gate for the accepted referral integration and named follow-up changes."""
import subprocess
ACCEPTED='075382779390902040e504466fe82345b3fecf92'
BASE='d0c1245a3e1e02c43d1b70578491fbc54f2baf3c'
MODIFIED={
 'scripts/admin-explorer/test-runtime-readiness.py',
 'services/integration-service/src/main/java/in/craves/integration/payout/ManualChefSettlementService.java',
 'services/integration-service/src/main/java/in/craves/integration/payout/ChefPayoutService.java',
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
 'services/integration-service/src/main/resources/db/migration/V145__manual_referral_withdrawal_allocations.sql',
 'services/integration-service/src/test/java/in/craves/integration/finance/source/ReferralManualWithdrawalDatabaseTest.java',
 'services/integration-service/src/test/java/in/craves/integration/finance/source/ChefReferralEarningsDatabaseTest.java',
 'services/order-service/src/test/java/in/craves/order/finance/ReferralCheckoutIntegrationDatabaseTest.java'}
for service,versions in {'auth-service':[(12,'source_outbox'),(13,'enrollment'),(14,'account_status')],'order-service':[(28,'source_outbox'),(29,'order_binding'),(30,'lifecycle_outbox'),(31,'checkout_benefits'),(32,'checkout_recovery_audit')],'integration-service':[(137,'source_outbox'),(138,'finance_consumer'),(139,'finance_refresh'),(140,'finance_reviews_and_execution'),(141,'checkout_funding'),(142,'split_refunds'),(143,'recovery_audit_and_cancellation')]}.items():
 for version,name in versions:EXACT.add(f'services/{service}/src/main/resources/db/migration/V{version}__referral_{name}.sql')

# PR391 touches the shared payment client after PR369 was merged. Its explicit
# reviewed baseline is protected main, not the pre-referral platform. This is a
# six-path scope, not an exception for arbitrary later main changes. All four
# implementation/test paths must be present and compatibility tests still run.
FOLLOWUP_BASE='d3ea89bb079fa83dcc2ef8d1d975a2e8520aa3a9'
FOLLOWUP_REQUIRED={
 'services/integration-service/src/main/java/in/craves/integration/payment/RazorpayPaymentClient.java':'M',
 'services/integration-service/src/main/java/in/craves/integration/subscription/SubscriptionPaymentService.java':'M',
 'services/integration-service/src/test/java/in/craves/integration/payment/RazorpayOrderRecoveryTest.java':'A',
 'services/integration-service/src/test/java/in/craves/integration/subscription/SubscriptionRazorpayCatchUpTest.java':'A',
}
FOLLOWUP_OPTIONAL={
 'scripts/referrals/verify-backend-scope.py':'M',
 'scripts/launch/test_subscription_recovery_scope.py':'A',
}

def reviewed_subscription_recovery_scope():
 if subprocess.run(['git','merge-base','--is-ancestor',FOLLOWUP_BASE,'HEAD'],capture_output=True).returncode!=0:
  return False
 rows=subprocess.check_output(['git','diff','--name-status','--no-renames',FOLLOWUP_BASE,'HEAD'],text=True).splitlines()
 actual={}
 for row in rows:
  parts=row.split('\t')
  if len(parts)!=2 or parts[1] in actual:return False
  actual[parts[1]]=parts[0]
 allowed={**FOLLOWUP_REQUIRED,**FOLLOWUP_OPTIONAL}
 return (all(actual.get(path)==state for path,state in FOLLOWUP_REQUIRED.items())
         and all(allowed.get(path)==state for path,state in actual.items()))

if subprocess.run(['git','merge-base','--is-ancestor',ACCEPTED,'HEAD'],capture_output=True).returncode==0:
 protected = sorted({p for p in MODIFIED|EXACT if p.startswith('services/')} |
                    {p for p in ADDED if p.startswith('services/')})
 changed = subprocess.check_output(['git','diff','--name-only',ACCEPTED,'HEAD','--',*protected],text=True).splitlines()
 if not changed:
  print('PASS: accepted referral module and owner integration seams are unchanged; full compatibility tests still required')
  raise SystemExit(0)
 if reviewed_subscription_recovery_scope():
  print('PASS: exact named subscription recovery follow-up scope; full referral compatibility tests still required')
  raise SystemExit(0)
subprocess.run(['git','merge-base','--is-ancestor',BASE,'HEAD'],check=True)
lines=subprocess.check_output(['git','diff','--name-status','--no-renames',BASE,'HEAD'],text=True).splitlines()
assert lines,'No integration changes found'
for line in lines:
 state,path=line.split('\t',1)
 assert (state=='M' and path in MODIFIED) or (state=='A' and (path in EXACT or path.startswith(ADDED))),f'Out of reviewed backend scope: {line}'
print(f'PASS: {len(lines)} backend files; no frontend, existing pipeline or unrelated service edits')
