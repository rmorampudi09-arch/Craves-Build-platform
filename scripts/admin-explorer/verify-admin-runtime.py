#!/usr/bin/env python3
"""Redacted before/after comparison for an image-only admin promotion."""
import copy
import hashlib
import json
import pathlib
import sys

def stable(app):
    props = app['properties']
    configuration = copy.deepcopy(props['configuration'])
    configuration.get('ingress', {}).pop('traffic', None)
    template = copy.deepcopy(props['template'])
    template.pop('revisionSuffix', None)
    for container in template['containers']:
        container.pop('image', None)
    value = {'identity': app.get('identity'), 'configuration': configuration, 'template': template}
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def single_ready(app):
    p = app['properties']
    assert p['configuration']['activeRevisionsMode'] == 'Single', 'Admin must retain Single revision mode'
    assert p['template']['scale']['minReplicas'] == p['template']['scale']['maxReplicas'] == 1, 'Admin replica bounds differ'
    assert len(p['template']['containers']) == 1, 'Unexpected additional admin container'
    assert p['latestRevisionName'] == p['latestReadyRevisionName'] and p['runningStatus'] == 'Running', 'Admin revision is not ready'
    traffic = p['configuration'].get('ingress', {}).get('traffic', [])
    if traffic:
        active = [t for t in traffic if t.get('weight', 0) > 0]
        assert len(active) == 1 and active[0]['weight'] == 100, 'Admin traffic is split'
        assert active[0].get('latestRevision') is True or active[0].get('revisionName') == p['latestReadyRevisionName'], 'Admin traffic targets a different revision'

app = json.loads(pathlib.Path(sys.argv[2]).read_text())
single_ready(app)
snapshot = pathlib.Path(sys.argv[3])
if sys.argv[1] == 'capture':
    snapshot.write_text(json.dumps({'preservedConfigurationHash': stable(app)}) + '\n')
elif sys.argv[1] == 'verify':
    assert stable(app) == json.loads(snapshot.read_text())['preservedConfigurationHash'], 'Admin identity/secrets or unrelated runtime configuration changed'
    assert app['properties']['template']['containers'][0]['image'] == sys.argv[4], 'Admin running image reference differs'
    assert '@sha256:' in sys.argv[4], 'Admin promotion must use a digest'
    replicas = json.loads(pathlib.Path(sys.argv[5]).read_text())
    assert len(replicas) == 1, 'Actual admin replica count is not one'
    print('PASS: ready digest-pinned admin, one actual replica, all traffic and preserved identity/secret/configuration hash')
else:
    raise SystemExit('Unknown runtime verification mode')
