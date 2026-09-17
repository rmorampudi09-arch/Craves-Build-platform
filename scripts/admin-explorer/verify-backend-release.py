#!/usr/bin/env python3
"""Bind an independently tested maintenance build to its merged admin release."""
import json
import argparse
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

def image_tag(release):
    source = release.get('source', '')
    tag = release.get('imageTag', source)
    deployment = release.get('deployment')
    assert tag == source or (type(deployment) is int and deployment > 0 and tag == str(deployment)), 'Image tag must match source or recorded deployment number'
    return tag

def verify(root, manifest):
    if manifest.get('version') == 2:
        releases = manifest.get('services', {})
        expected = {service for service, _, _ in BINDINGS}
        assert set(releases) == expected, 'Exact backend service inventory is required'
        sources = {}
        for service in sorted(expected):
            source = releases[service].get('source', '')
            assert re.fullmatch('[0-9a-f]{40}', source), 'Exact backend source is required'
            image_tag(releases[service])
            git(root, 'merge-base', '--is-ancestor', source, 'HEAD')
            # A normal service release may contain features beyond Explorer. Require
            # its ENTIRE build context to match the new fully tested main release,
            # rather than accepting a matching controller with unrelated drift.
            path = f'services/{service}-service'
            assert git(root, 'rev-parse', source+':'+path) == git(root, 'rev-parse', 'HEAD:'+path), 'Backend build context drift: '+service
            sources[service] = source
        return sources
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
    parser = argparse.ArgumentParser()
    parser.add_argument('--service', choices=[service for service, _, _ in BINDINGS])
    parser.add_argument('--verify-only', action='store_true')
    parser.add_argument('--image-tag', choices=[service for service, _, _ in BINDINGS])
    args = parser.parse_args()
    manifest = json.loads((ROOT/'docs/admin/explorer/backend-release.json').read_text())
    result = verify(ROOT, manifest)
    if not args.verify_only:
        if args.image_tag:
            print(image_tag(manifest['services'][args.image_tag]) if isinstance(result, dict) else result)
        elif isinstance(result, dict):
            print(result[args.service] if args.service else json.dumps(result, sort_keys=True))
        else:
            print(result)
