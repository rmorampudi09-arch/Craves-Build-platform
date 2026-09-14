#!/usr/bin/env python3
"""Local Git fixtures verify the independent-backend provenance gate."""
import importlib.util
import pathlib
import subprocess
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('gate', pathlib.Path(__file__).with_name('verify-backend-release.py'))
gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate)

class BackendReleaseTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=pathlib.Path(self.tmp.name)
        self.git('init','-q');self.git('config','user.name','Fixture');self.git('config','user.email','fixture@example.test')
        for path in gate.paths():
            p=self.root/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('baseline')
        self.baseline=self.commit()
        (self.root/gate.paths()[0]).write_text('reviewed explorer fix')
        self.source=self.commit()
        self.manifest={'version':1,'baseline':self.baseline,'source':self.source}
    def git(self,*args):return gate.git(self.root,*args)
    def commit(self):self.git('add','.');self.git('commit','-qm','fixture');return self.git('rev-parse','HEAD')
    def test_merged_candidate_with_identical_explorer_passes(self):
        (self.root/'web.txt').write_text('new web release');self.commit()
        self.assertEqual(self.source,gate.verify(self.root,self.manifest))
    def test_mutable_ref_is_rejected(self):
        self.manifest['source']='main'
        with self.assertRaises(AssertionError):gate.verify(self.root,self.manifest)
    def test_candidate_outside_release_history_is_rejected(self):
        self.git('checkout','--detach',self.baseline)
        with self.assertRaises(subprocess.CalledProcessError):gate.verify(self.root,self.manifest)
    def test_explorer_drift_is_rejected(self):
        (self.root/gate.paths()[0]).write_text('changed untested engine');self.commit()
        with self.assertRaisesRegex(AssertionError,'implementation drift'):gate.verify(self.root,self.manifest)
    def test_unrelated_backend_changes_are_rejected(self):
        (self.root/'services/unrelated.txt').write_text('different feature')
        self.manifest['source']=self.commit()
        with self.assertRaisesRegex(AssertionError,'Unrelated backend change'):gate.verify(self.root,self.manifest)

if __name__=='__main__':unittest.main()
