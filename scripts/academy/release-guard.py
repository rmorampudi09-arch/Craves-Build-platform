#!/usr/bin/env python3
"""Read-only Academy release guards. This script never builds, deploys or changes Azure.

The existing Auth pipeline owns image deployment. All Azure commands here are
show/list reads; evidence contains hashes and release identifiers, not settings.
"""
import argparse
import copy
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RG = 'rg-craves-prodlow-centralindia'
APP = 'ca-craves-auth-service-prodlow'
PG = 'pg-craves-prodlow-l3ing6'
BASELINE = '6691aa2ff663e51a257407b9b1f4b5b7b4ba87d5'
PREFIXES = (
    'services/auth-service/src/main/java/in/craves/auth/academy/',
    'services/auth-service/src/main/resources/academy/',
    'services/auth-service/src/test/java/in/craves/auth/academy/',
)


def check(condition, message):
    if not condition:
        raise ValueError(message)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def allowed_auth_change(path):
    return path.startswith(PREFIXES) and '..' not in path


def source_check(baseline):
    check(re.fullmatch('[a-f0-9]{40}', baseline), 'Baseline must be a full immutable SHA')
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    subprocess.run(['git', 'merge-base', '--is-ancestor', baseline, head], cwd=ROOT, check=True)
    changed = subprocess.check_output(['git', 'diff', '--name-only', '-z', baseline, head, '--', 'services/auth-service'], cwd=ROOT).decode().split('\0')
    changed = [p for p in changed if p]
    rejected = [p for p in changed if not allowed_auth_change(p)]
    check(not rejected, 'Non-Academy Auth changes require a different release review: ' + ', '.join(rejected))
    return {'sourceSha': head, 'baselineSourceSha': baseline, 'authChangedPaths': changed, 'schemaChange': False}


def snapshot(apps):
    result = {'otherApps': {}}
    for app in apps:
        name, props = app['name'], app['properties']
        specification = {'template': copy.deepcopy(props['template']), 'configuration': copy.deepcopy(props['configuration']), 'identity': app.get('identity', {})}
        if name != APP:
            result['otherApps'][name] = digest(specification)
            continue
        check('auth' not in result, 'Duplicate Auth app in inventory')
        template, config = specification['template'], specification['configuration']
        check(config.get('activeRevisionsMode') == 'Single', 'Auth must retain Single revision mode')
        check(template.get('scale', {}).get('minReplicas') == 1 and template.get('scale', {}).get('maxReplicas') == 1, 'Refusing to change the owner-approved one-replica configuration')
        check(len(template['containers']) == 1, 'Unexpected Auth container shape')
        check(props.get('latestRevisionName') and props.get('latestRevisionName') == props.get('latestReadyRevisionName'), 'Auth latest/ready revision must agree')
        container = template['containers'][0]
        flags = [v for v in container.get('env', []) if v['name'] == 'CRAVES_ACADEMY_ENABLED']
        check(len(flags) == 1 and str(flags[0].get('value', '')).lower() == 'true' and not flags[0].get('secretRef'), 'Academy is not explicitly enabled; no flag will be changed by this release')
        image = container.pop('image')
        template.pop('revisionSuffix', None)
        if config.get('ingress'):
            config['ingress'].pop('traffic', None)  # Single-mode traffic is managed by Azure.
        result['auth'] = {'image': image, 'revision': props['latestReadyRevisionName'], 'configurationHash': digest(specification)}
    check('auth' in result and bool(result['otherApps']), 'Incomplete existing application inventory')
    return result


def az_json(arguments):
    # Never print raw app configuration or Azure error bodies to public evidence.
    process = subprocess.run(['az', *arguments, '--only-show-errors', '--output', 'json'], cwd=ROOT, capture_output=True, text=True, timeout=120)
    check(process.returncode == 0, 'Authorized Azure read failed: ' + ' '.join(arguments[:2]))
    return json.loads(process.stdout)


def current_snapshot():
    state = snapshot(az_json(['containerapp', 'list', '--resource-group', RG]))
    revision = az_json(['containerapp', 'revision', 'show', '--resource-group', RG, '--name', APP, '--revision', state['auth']['revision']])
    props = revision['properties']
    check(props.get('healthState') == 'Healthy' and props.get('active') is True, 'Auth ready revision must be healthy and active')
    check(props['template']['containers'][0]['image'] == state['auth']['image'], 'Auth application and ready revision images disagree')
    return state


def compare(before, after, image):
    check(after['auth']['image'] == image, 'Auth does not use the expected immutable image')
    check(before['auth']['configurationHash'] == after['auth']['configurationHash'], 'Auth non-image configuration changed; stop and review without altering other services')
    check(before['otherApps'] == after['otherApps'], 'Other app specifications changed concurrently; no other app rollback is authorized')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=['source', 'preflight', 'postflight'])
    parser.add_argument('--baseline', default=BASELINE)
    parser.add_argument('--evidence', type=Path)
    args = parser.parse_args()
    source = source_check(args.baseline)
    if args.phase == 'source':
        print(json.dumps(source, indent=2))
        return
    check(args.evidence is not None, 'Evidence directory is required')
    check(os.environ.get('ACADEMY_EXPECTED_SOURCE') == source['sourceSha'], 'Selected pipeline commit differs from the reviewed release SHA')
    expected_image = os.environ.get('ACADEMY_EXPECTED_IMAGE', '')
    check(re.fullmatch(r'cravesprodlowacr82121\.azurecr\.io/craves/auth-service@sha256:[a-f0-9]{64}', expected_image), 'Expected image must be the exact approved Auth digest')
    args.evidence.mkdir(parents=True, exist_ok=True)
    current = current_snapshot()
    if args.phase == 'preflight':
        check(current['auth']['image'] == expected_image, 'Current Auth image differs from the approved baseline; inspect the newer release before proceeding')
        backup = az_json(['postgres', 'flexible-server', 'show', '--resource-group', RG, '--name', PG])
        check(backup.get('state') == 'Ready', 'PostgreSQL is not Ready')
        settings = backup.get('backup', {})
        check(int(settings.get('backupRetentionDays', 0)) > 0 and bool(settings.get('earliestRestoreDate')), 'PITR configuration/restore-point evidence is missing')
        current.update(source)
        current['backup'] = {'retentionDays': settings['backupRetentionDays'], 'earliestRestoreDate': settings['earliestRestoreDate']}
        (args.evidence / 'before.json').write_text(json.dumps(current, indent=2) + '\n')
        print('Academy preflight passed. No resource, image, flag, secret, schema or scale change was made.')
    else:
        before = json.loads((args.evidence / 'before.json').read_text())
        check(before['sourceSha'] == source['sourceSha'], 'Preflight belongs to a different source revision')
        compare(before, current, expected_image)
        current.update(source)
        current['authenticatedCatalogAcceptance'] = 'NOT_EXECUTED'
        (args.evidence / 'after.json').write_text(json.dumps(current, indent=2) + '\n')
        print('Auth image verified; other app specifications and Auth non-image settings unchanged. Authenticated routed catalog acceptance remains required.')


if __name__ == '__main__':
    main()
