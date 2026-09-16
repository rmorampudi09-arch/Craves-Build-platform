#!/usr/bin/env python3
"""Offline checks over private Azure readbacks for an image-only production web release."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import re


def require(condition, message):
    if not condition:
        raise ValueError(message)


def normalized_template(value):
    template = copy.deepcopy(value)
    template.pop('revisionSuffix', None)
    for container in template['containers']:
        environment = container.get('env', [])
        require(len({item['name'] for item in environment}) == len(environment), 'Duplicate running environment setting')
        normalized = []
        for item in environment:
            item = dict(item)
            # Azure may emit unused null/empty fields beside a secret binding.
            # Keep all actual settings and unknown fields in the comparison.
            if item.get('secretRef'):
                require(item.get('value') in (None, ''), 'Ambiguous running secret binding')
                item.pop('value', None)
            elif item.get('secretRef') in (None, ''):
                item.pop('secretRef', None)
            normalized.append(item)
        container['env'] = sorted(normalized, key=lambda item: item['name'])
    return template


def stable(app):
    props = app['properties']
    configuration = copy.deepcopy(props['configuration'])
    configuration.get('ingress', {}).pop('traffic', None)
    template = normalized_template(props['template'])
    for container in template['containers']:
        container.pop('image', None)
    value = {'identity': app.get('identity'), 'configuration': configuration, 'template': template,
             'location': app.get('location'), 'tags': app.get('tags'),
             'environmentId': props.get('environmentId'), 'managedEnvironmentId': props.get('managedEnvironmentId')}
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def comparable_running_template(value):
    """Resolve only documented defaults absent from Azure's revision response.

    This is NOT used by stable(): desired settings must remain byte-for-byte
    structurally unchanged across the image-only release, apart from its existing
    environment/revision normalization. Unknown fields and non-defaults survive.
    """
    template = normalized_template(value)
    scale = template.get('scale', {})
    for name, default in (('cooldownPeriod', 300), ('pollingInterval', 30)):
        if scale.get(name) is None:
            scale[name] = default
    containers = template['containers']
    for container in containers:
        if container.get('probes') is None:
            container['probes'] = []
        resources = container.get('resources', {})
        cpu = resources.get('cpu')
        # Azure assigns total temporary storage by replica vCPU. Restrict this
        # equivalence to the supported single-container, no-init-container case.
        if len(containers) == 1 and not template.get('initContainers') and type(cpu) in (int, float) and 0 < cpu <= 4:
            default = '1Gi' if cpu <= .25 else '2Gi' if cpu <= .5 else '4Gi' if cpu <= 1 else '8Gi'
            if resources.get('ephemeralStorage') is None:
                resources['ephemeralStorage'] = default
    return template


def production(app):
    props = app['properties']
    require(props['configuration']['activeRevisionsMode'] == 'Single', 'Existing web must use Single revision mode')
    require(props['template']['scale']['minReplicas'] == props['template']['scale']['maxReplicas'] == 1, 'Existing web replica bounds must both be one')
    containers = props['template']['containers']
    require(len(containers) == 1, 'Unexpected additional web container')
    environment = containers[0].get('env', [])
    require(len({item['name'] for item in environment}) == len(environment), 'Duplicate web environment setting')
    mode = next((item for item in environment if item['name'] == 'NEXT_PUBLIC_RAZORPAY_MODE'), {})
    require(mode.get('value') == 'production' and not mode.get('secretRef'), 'Existing production payment mode must already be production')


def ready(app, revisions, replicas, validate=production):
    validate(app)
    props = app['properties']
    require(props.get('provisioningState') == 'Succeeded' and props.get('runningStatus') == 'Running', 'Web app is not healthy and running')
    current = props.get('latestRevisionName')
    require(current and current == props.get('latestReadyRevisionName'), 'Candidate web revision is not ready')
    active = [revision for revision in revisions if revision.get('properties', {}).get('active') is True]
    require(len(active) == 1 and active[0]['name'] == current, 'Exactly the current web revision must be active')
    revision = active[0]['properties']
    require(revision.get('healthState') == 'Healthy' and revision.get('runningState') in ('Running', 'RunningAtMaxScale'), 'Active web revision is not healthy')
    require(revision['template']['containers'][0]['image'] == props['template']['containers'][0]['image'], 'Running web image differs from desired image')
    require(comparable_running_template(revision['template']) == comparable_running_template(props['template']), 'Running web template differs from desired configuration')
    require(isinstance(replicas, list) and len(replicas) == 1, 'Actual web replica count must be one')
    containers = replicas[0].get('properties', {}).get('containers', [])
    expected_name = props['template']['containers'][0]['name']
    require(isinstance(containers, list) and len(containers) == 1 and containers[0].get('name') == expected_name,
            'Actual web replica must report exactly the expected container')
    require(containers[0].get('ready') is True and containers[0].get('started') is True, 'Actual web container must be ready and started')
    require(type(revision.get('trafficWeight')) in (int, float) and revision['trafficWeight'] == 100,
            'Active web revision must report actual traffic weight 100')
    traffic = props['configuration']['ingress'].get('traffic', [])
    require(isinstance(traffic, list), 'Web ingress traffic evidence is invalid')
    if traffic:
        receiving = [item for item in traffic if item.get('weight', 0) > 0]
        require(len(receiving) == 1 and receiving[0]['weight'] == 100, 'Web traffic is split')
        require(receiving[0].get('latestRevision') is True or receiving[0].get('revisionName') == current, 'Web traffic targets another revision')
    return current


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('capture', 'guard', 'verify', 'rollback-allowed'))
    parser.add_argument('--app', required=True)
    parser.add_argument('--baseline', required=True)
    parser.add_argument('--revisions')
    parser.add_argument('--replicas')
    parser.add_argument('--expected-image')
    args = parser.parse_args()
    app = json.loads(Path(args.app).read_text())
    production(app)
    image = app['properties']['template']['containers'][0]['image']
    if args.mode == 'capture':
        revision = ready(app, json.loads(Path(args.revisions).read_text()), json.loads(Path(args.replicas).read_text()))
        with Path(args.baseline).open('x') as stream:
            json.dump({'settingsHash': stable(app), 'image': image, 'revision': revision}, stream)
        return
    baseline = json.loads(Path(args.baseline).read_text())
    require(stable(app) == baseline['settingsHash'], 'Web runtime/identity/secret references changed; stop and inspect before recovery')
    if args.mode == 'rollback-allowed':
        require(image == args.expected_image, 'Another image was selected; automatic rollback is unsafe')
        return
    revision = ready(app, json.loads(Path(args.revisions).read_text()), json.loads(Path(args.replicas).read_text()))
    if args.mode == 'guard':
        require(image == baseline['image'] and revision == baseline['revision'], 'Web runtime changed during image build')
    else:
        require(re.fullmatch(r'[a-z0-9]+\.azurecr\.io/[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}', args.expected_image or ''), 'Web release requires an immutable digest')
        require(image == args.expected_image, 'The reviewed web image is not running')
        print(f'PASS: web revision={revision} image={image} traffic=100 replicas=1 production payment mode and runtime preserved')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, TypeError) as error:
        raise SystemExit('Web release runtime guard: ' + str(error))
