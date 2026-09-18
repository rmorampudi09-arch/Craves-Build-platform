"""Test the new exact-file scope gate in disposable local Git repositories."""
import ast
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[2]
class ChefMinimumScopeTests(unittest.TestCase):
    def setUp(self):
        self.work=tempfile.TemporaryDirectory()
        self.addCleanup(self.work.cleanup)
        self.repo=Path(self.work.name)
        self.previous=Path.cwd(); os.chdir(self.repo)
        self.addCleanup(os.chdir,self.previous)
        self.git('init','-q'); self.git('config','user.name','Disposable test')
        self.git('config','commit.gpgsign','false'); self.git('config','core.hooksPath','/dev/null')
        self.git('config','user.email','test@example.invalid')
        source=ast.parse((ROOT/'scripts/referrals/verify-backend-scope.py').read_text())
        selected=[n for n in source.body if isinstance(n,ast.FunctionDef) and n.name=='reviewed_chef_minimum_scope']
        assert len(selected)==1
        self.ns={'subprocess':subprocess,'CHEF_MINIMUM_REQUIRED':{'source.java':'M','V11.sql':'A'}}
        exec(compile(ast.Module(body=selected,type_ignores=[]),'scope-test','exec'),self.ns)
        (self.repo/'source.java').write_text('original')
        (self.repo/'V9.sql').write_text('immutable')
        self.commit(); self.ns['CHEF_MINIMUM_BASE']=self.git('rev-parse','HEAD').strip()
        (self.repo/'source.java').write_text('corrected'); (self.repo/'V11.sql').write_text('forward')
    def git(self,*args):
        return subprocess.check_output(['git',*args],text=True,stderr=subprocess.DEVNULL)
    def commit(self):
        self.git('add','.'); self.git('commit','-qm','disposable fixture')
    def allowed(self):
        self.commit(); return self.ns['reviewed_chef_minimum_scope']()
    def test_exact_scope_passes(self): self.assertTrue(self.allowed())
    def test_missing_migration_fails(self):
        (self.repo/'V11.sql').unlink(); self.assertFalse(self.allowed())
    def test_unrelated_file_fails(self):
        (self.repo/'unrelated.txt').write_text('no'); self.assertFalse(self.allowed())
    def test_existing_migration_edit_fails(self):
        (self.repo/'V9.sql').write_text('changed'); self.assertFalse(self.allowed())
    def test_deleted_source_fails(self):
        (self.repo/'source.java').unlink(); self.assertFalse(self.allowed())

if __name__=='__main__': unittest.main()
