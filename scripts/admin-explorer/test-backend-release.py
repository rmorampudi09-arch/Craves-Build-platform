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

    def release_manifest(self):
        return {'version':2,'services':{service:{'source':self.source} for service,_,_ in gate.BINDINGS}}

    def test_independent_service_releases_require_complete_matching_trees(self):
        manifest=self.release_manifest()
        (self.root/'web.txt').write_text('admin only');self.commit()
        self.assertEqual({s:self.source for s,_,_ in gate.BINDINGS},gate.verify(self.root,manifest))

    def test_unrelated_runtime_change_is_rejected_even_with_same_explorer(self):
        manifest=self.release_manifest()
        (self.root/'services/auth-service/Dockerfile').write_text('different build');self.commit()
        with self.assertRaisesRegex(AssertionError,'build context drift'):gate.verify(self.root,manifest)

    def test_independent_sources_can_differ_when_each_full_tree_matches(self):
        manifest=self.release_manifest()
        (self.root/'services/order-service/Dockerfile').write_text('reviewed order release')
        manifest['services']['order']['source']=self.commit()
        self.assertEqual(self.source,gate.verify(self.root,manifest)['auth'])

    def test_independent_inventory_and_mutable_sources_are_rejected(self):
        for mode in ['missing','extra','mutable']:
            manifest=self.release_manifest()
            if mode=='missing':del manifest['services']['auth']
            elif mode=='extra':manifest['services']['unknown']={'source':self.source}
            else:manifest['services']['auth']['source']='main'
            with self.subTest(mode=mode), self.assertRaises(AssertionError):gate.verify(self.root,manifest)

    def test_independent_source_outside_history_is_rejected(self):
        manifest=self.release_manifest();self.git('checkout','--detach',self.baseline)
        with self.assertRaises(subprocess.CalledProcessError):gate.verify(self.root,manifest)

if __name__=='__main__':unittest.main()
