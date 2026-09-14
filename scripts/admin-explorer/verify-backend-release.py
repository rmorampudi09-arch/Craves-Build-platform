#!/usr/bin/env python3
"""Bind an independently tested maintenance build to its merged admin release."""
import json
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]
BINDINGS = [('auth', 'auth', '9_1'), ('user-chef', 'userchef', '11_1'), ('order', 'order', '26_1')]

def paths():
    required = []
    for service, package, version in BINDINGS:
        prefix = f'services/{service}-service/src/'
        required.extend(prefix+'main/java/in/craves/adminexplorer/'+name+'.java'
                        for name in ['ExplorerEngine', 'ExplorerQuery', 'ExplorerDomain', 'ExplorerRateLimiter'])
        required.append(prefix+f'main/java/in/craves/{package}/admin/explorer/AdminExplorerController.java')
        required.append(prefix+f'main/resources/db/migration/V{version}__admin_explorer_admission.sql')
    return required

def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], text=True, stderr=subprocess.PIPE).strip()

def verify(root, manifest):
    assert manifest.get('version') == 1, 'Unsupported backend release manifest'
    source, baseline = manifest.get('source', ''), manifest.get('baseline', '')
    assert re.fullmatch('[0-9a-f]{40}', source) and re.fullmatch('[0-9a-f]{40}', baseline), 'Exact backend source and baseline are required'
    # The production web checkout remains a manual, exact-SHA main release. Its
    # history must contain this reviewed backend candidate, not a free-form override.
    git(root, 'merge-base', '--is-ancestor', source, 'HEAD')
    git(root, 'merge-base', '--is-ancestor', baseline, source)
    required = paths()
    for path in required:
        assert git(root, 'rev-parse', source+':'+path) == git(root, 'rev-parse', 'HEAD:'+path), 'Backend explorer implementation drift: '+path
    changed = git(root, 'diff', '--name-only', baseline, source, '--', 'services').splitlines()
    for path in changed:
        allowed = path in required or any(
            path.startswith(f'services/{service}-service/src/test/java/in/craves/adminexplorer/') or
            path == f'services/{service}-service/src/test/java/in/craves/{package}/admin/explorer/AdminExplorerControllerTest.java'
            for service, package, _ in BINDINGS)
        assert allowed, 'Unrelated backend change in maintenance release: '+path
    return source

if __name__ == '__main__':
    print(verify(ROOT, json.loads((ROOT/'docs/admin/explorer/backend-release.json').read_text())))
