import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('probe',Path(__file__).with_name('inspect-core-readiness.py'))
probe=importlib.util.module_from_spec(spec);spec.loader.exec_module(probe)


class ReadinessTests(unittest.TestCase):
    def data(self):
        return {'providerExecutionReady':False,'providerExecutionEligible':False,
                'unknownOutcomeCount':0,'historicalModeMismatchCount':0,
                'executableRefundCount':0,'reconciliationReady':True}
    def test_valid_only_aggregates(self):
        self.assertEqual(probe.validate_refund(self.data()),self.data())
    def test_rejects_secret_or_identity_text(self):
        for key in ['secret','email','paymentProvider']:
            with self.assertRaises(ValueError):probe.validate_refund({**self.data(),key:'PRIVATE_VALUE'})
    def test_invalid_count(self):
        for value in [-1,True,'0',2**64]:
            with self.assertRaises(ValueError):probe.validate_refund({**self.data(),'unknownOutcomeCount':value})
    def test_missing_state(self):
        with self.assertRaises(ValueError):probe.validate_refund({})
    def test_mutation_commands_rejected_before_execution(self):
        with patch.object(probe.ops.history.subprocess,'run') as run:
            for args in [('containerapp','update'),('keyvault','secret','set'),('postgres','flexible-server','create')]:
                with self.assertRaises(ValueError):probe.ops.history.az(*args)
            run.assert_not_called()
    def test_queries_only_fixed_aggregates(self):
        for sql in probe.QUERIES.values():
            self.assertTrue(sql.startswith('SELECT json_build_object('))
            self.assertNotRegex(sql.upper(),r'\b(UPDATE|DELETE|INSERT|ALTER|DROP|TRUNCATE)\b')


if __name__=='__main__':unittest.main()
