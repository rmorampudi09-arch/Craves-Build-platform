import importlib.util
import tempfile
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('evidence',Path(__file__).parents[1]/'require-launch-p0-evidence.py')
evidence=importlib.util.module_from_spec(spec);spec.loader.exec_module(evidence)

class EvidenceTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.path=Path(self.temp.name)
        self.sha='a'*40
        for name,count in {**evidence.REQUIRED,'OtherTests':47}.items():self.report(name,count)
    def report(self,name,count,extra='',summary=''):
        (self.path/('TEST-'+name+'.xml')).write_text('<testsuite name="'+name+'" tests="'+str(count)+'" '+summary+'>'+''.join('<testcase name="case'+str(i)+'">'+(extra if i==0 else '')+'</testcase>' for i in range(count))+'</testsuite>')
    def test_complete_exact_source_passes(self):self.assertEqual(evidence.verify(self.path,self.sha,self.sha)['tests'],62)
    def test_other_source_fails(self):
        with self.assertRaises(ValueError):evidence.verify(self.path,self.sha,'b'*40)
    def test_missing_required_fails(self):
        (self.path/'TEST-SubscriptionMigrationDatabaseTest.xml').unlink()
        with self.assertRaises(ValueError):evidence.verify(self.path,self.sha,self.sha)
    def test_skipped_case_with_false_green_summary_fails(self):
        self.report('SubscriptionMigrationDatabaseTest',2,'<skipped/>')
        with self.assertRaises(ValueError):evidence.verify(self.path,self.sha,self.sha)
    def test_failure_fails(self):
        self.report('SubscriptionMigrationDatabaseTest',2,'<failure/>')
        with self.assertRaises(ValueError):evidence.verify(self.path,self.sha,self.sha)
    def test_wrong_declared_count_fails(self):
        self.report('SubscriptionMigrationDatabaseTest',0)
        with self.assertRaises(ValueError):evidence.verify(self.path,self.sha,self.sha)

if __name__=='__main__':unittest.main()
