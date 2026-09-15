import copy
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('release',Path(__file__).with_name('refund_production_release.py'))
release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)

class RefundReleaseTest(unittest.TestCase):
 def readiness(self):
  return dict(paymentProvider='RAZORPAY',paymentEnvironment='PRODUCTION',dispatchProtocol=release.PROTOCOL,
   downstreamReady=True,providerExecutionEligible=True,reconciliationReady=True,unknownOutcomeCount=0,historicalModeMismatchCount=0,
   processingRefundCount=0,statusOutboxDeadLetterCount=0,requestInboxFailureCount=0)
 def test_pause_stops_both_unsafe_worker_actions_without_changing_consumers(self):
  changes=release.changes('pause')
  self.assertEqual(changes[release.FLAGS['create']],'false');self.assertEqual(changes[release.FLAGS['reconcile']],'false')
  self.assertNotIn(release.FLAGS['consumer'],changes);self.assertNotIn(release.FLAGS['publisher'],changes)
 def test_reconciliation_requires_new_get_only_protocol(self):
  r=self.readiness();r.pop('dispatchProtocol')
  with self.assertRaisesRegex(release.GuardError,'PATCHED'):release.validate_readiness('reconciliation',r,{})
 def test_unknown_financial_work_blocks_creation(self):
  r=self.readiness();r['unknownOutcomeCount']=18
  with self.assertRaisesRegex(release.GuardError,'UNRESOLVED'):release.validate_readiness('provider_execution',r,{})
 def test_expected_counts_are_exact_and_not_boolean(self):
  r=self.readiness()
  for value in [1,True,None]:
   r['unknownOutcomeCount']=value
   with self.assertRaisesRegex(release.GuardError,'EXPOSURE'):release.validate_readiness('reconciliation',r,{'unknownOutcomeCount':0})
 def test_known_test_history_does_not_override_unclassified_cashfree(self):
  r=self.readiness();r['historicalTestRefundCount']=18;r['historicalModeMismatchCount']=7
  with self.assertRaisesRegex(release.GuardError,'UNRESOLVED'):release.validate_readiness('provider_execution',r,{})
 def test_pause_does_not_require_unsafe_old_readiness_probe(self):release.validate_readiness('pause',{}, {})
 def test_payment_provider_must_be_razorpay(self):
  r=self.readiness();r['paymentProvider']='CASHFREE'
  with self.assertRaises(release.GuardError):release.validate_readiness('provider_execution',r,{})
 def test_clean_reviewed_creation_is_permitted(self):release.validate_readiness('provider_execution',self.readiness(),{'unknownOutcomeCount':0})
 def test_reconciliation_never_enables_creation(self):self.assertEqual(release.changes('reconciliation')[release.FLAGS['create']],'false')
 def test_unhealthy_inactive_or_multiple_actual_replicas_fail_preflight(self):
  app={'properties':{'configuration':{'ingress':{'traffic':[{'latestRevision':True,'weight':100}]}}}}
  for state,replicas in [({'healthState':'Unhealthy','active':True},[{}]),({'healthState':'Healthy','active':False},[{}]),({'healthState':'Healthy','active':True},[{},{}])]:
   with patch.object(release,'az',side_effect=[{'properties':state},replicas]):
    with self.assertRaisesRegex(release.GuardError,'HEALTHY_ACTIVE_SINGLE'):release.healthy_runtime(app,'reviewed')
 def test_healthy_revision_must_own_all_traffic_before_configuration(self):
  app={'properties':{'configuration':{'ingress':{'traffic':[{'revisionName':'different','weight':100}]}}}}
  with patch.object(release,'az',side_effect=[{'properties':{'healthState':'Healthy','active':True}},[{}]]):
   with self.assertRaisesRegex(release.GuardError,'TRAFFIC'):release.healthy_runtime(app,'reviewed')

if __name__=='__main__':unittest.main()
