"""F01/P0 read-only metadata inventory. Never resolves secrets or probes customer routes."""
import argparse
import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

SUB = '4f897b61-9b52-44b4-8cf1-bdac281cc1aa'
RG = 'rg-craves-prodlow-centralindia'
ACR = 'cravesprodlowacr82121'
APIM = 'apim-craves-prodlow-l3ing6'
ALLOWED = {('account','show'), ('containerapp','list'), ('containerapp','show'),
           ('containerapp','revision','list'), ('acr','manifest','show-metadata'),
           ('apim','api','list'), ('apim','api','operation','list'),
           ('postgres','flexible-server','list'), ('monitor','metrics','alert','list'),
           ('monitor','action-group','list')}


def az(*args):
    if not any(tuple(args[:len(prefix)]) == prefix for prefix in ALLOWED):
        raise ValueError('Only explicit read-only command families are allowed')
    result = subprocess.run(['az', *args, '--only-show-errors', '-o', 'json'],
                            capture_output=True, text=True, timeout=120)
    if result.returncode:
        # Azure stderr can include sensitive values. Do not echo it or arguments.
        raise RuntimeError('READ_FAILED:' + '/'.join(args[:2]))
    return json.loads(result.stdout.lstrip('\ufeff'))


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def containers(items):
    result = []
    for item in items:
        settings = []
        for env in sorted(item.get('env', []), key=lambda e: e['name']):
            name = env['name']
            if env.get('secretRef'):
                settings.append({'name': name, 'kind': 'secretReference'})
            elif name.startswith('CRAVES_') and name.endswith(('_ENABLED', '_APPROVED')) and str(env.get('value')).lower() in ('true','false'):
                settings.append({'name': name, 'kind': 'booleanGate', 'value': str(env['value']).lower() == 'true'})
            else:
                settings.append({'name': name, 'kind': 'literalRedacted', 'present': bool(env.get('value'))})
        image = item.get('image', '')
        commit = re.search(r'(?:^|[-:])([a-f0-9]{40})$', image)
        result.append({'name': item.get('name'), 'image': image, 'resources': item.get('resources'),
                       'settings': settings, 'sourceHintFromTag': commit.group(1) if commit else None,
                       'sourceHintVerified': False})
    return result


def summarize_app(app, revisions):
    p = app['properties']; cfg = p.get('configuration', {}); ingress = cfg.get('ingress') or {}
    scale = p.get('template', {}).get('scale') or {}
    active = []
    for revision in revisions:
        rp = revision['properties']
        if not rp.get('active'):
            continue
        active.append({'name': revision['name'], 'healthy': rp.get('healthState'),
                       'running': rp.get('runningState'), 'replicas': rp.get('replicas'),
                       'createdTime': rp.get('createdTime'),
                       'containers': containers(rp.get('template', {}).get('containers', []))})
    summary = {'name': app['name'], 'latest': p.get('latestRevisionName'),
               'ready': p.get('latestReadyRevisionName'), 'running': p.get('runningStatus'),
               'revisionMode': cfg.get('activeRevisionsMode'), 'traffic': ingress.get('traffic', []),
               'externalIngress': ingress.get('external'), 'fqdn': ingress.get('fqdn'),
               'scale': {'minReplicas':scale.get('minReplicas'),'maxReplicas':scale.get('maxReplicas'),
                         'rules':[{'name':r.get('name'),'types':sorted(k for k in r if k!='name')} for r in scale.get('rules') or []]},
               'containers': containers(p.get('template', {}).get('containers', [])),
               'activeRevisions': sorted(active, key=lambda r:r['name']),
               'secretReferenceCount': len(cfg.get('secrets', [])),
               'workerOwnership': 'NOT_VERIFIED: active revisions are not durable lease evidence',
               'migrationHistory': 'NOT_READ: database/private capability evidence required'}
    summary['sanitizedConfigurationSha256'] = fingerprint(summary)
    return summary


def image_digest(image):
    prefix = ACR + '.azurecr.io/'
    if not image.startswith(prefix):
        return {'status': 'REGISTRY_NOT_IN_SCOPE'}
    reference = image[len(prefix):]
    try:
        metadata = az('acr','manifest','show-metadata','-r',ACR,'-n',reference)
        return {'digest': metadata.get('digest'), 'createdTime': metadata.get('createdTime'),
                'status': 'REGISTRY_METADATA_READ',
                'limitation': 'Tag resolution is not independent proof of the digest pulled by a replica'}
    except (RuntimeError, subprocess.TimeoutExpired):
        return {'status': 'READ_UNAVAILABLE'}


def capture():
    if az('account','show').get('id') != SUB:
        raise ValueError('Unexpected Azure subscription')
    observed = datetime.now(timezone.utc).isoformat()
    apps = az('containerapp','list','-g',RG)
    if not apps:
        raise ValueError('No apps returned; an empty inventory cannot establish readiness')
    summaries = []
    for app in sorted(apps, key=lambda a:a['name']):
        current = az('containerapp','show','-g',RG,'-n',app['name'])
        revisions = az('containerapp','revision','list','-g',RG,'-n',app['name'])
        summaries.append(summarize_app(current,revisions))
    images = {c['image'] for a in summaries for c in a['containers']}
    images.update(c['image'] for a in summaries for r in a['activeRevisions'] for c in r['containers'])
    apis = []
    for api in az('apim','api','list','-g',RG,'--service-name',APIM):
        operations = az('apim','api','operation','list','-g',RG,'--service-name',APIM,'--api-id',api['name'])
        apis.append({'id':api['name'],'path':api.get('path'),'revision':api.get('apiRevision'),
                     'subscriptionRequired':api.get('subscriptionRequired'),
                     'operations':sorted([{'id':o['name'],'method':o.get('method'),'path':o.get('urlTemplate')} for o in operations],key=lambda o:o['id']),
                     'policyFingerprint':'NOT_READ: policy-specific evidence still required'})
    safety = {}
    reads = {
        'postgres': ('postgres','flexible-server','list','-g',RG),
        'alerts': ('monitor','metrics','alert','list','-g',RG),
        'actionGroups': ('monitor','action-group','list','-g',RG)}
    for name,args in reads.items():
        try:
            rows = az(*args)
            if name == 'postgres':
                safety[name] = [{'name':r.get('name'),'version':r.get('version'),'state':r.get('state'),
                                  'backup':r.get('backup'),'highAvailability':r.get('highAvailability'),
                                  'restoreRehearsal':'NOT_RUN'} for r in rows]
            elif name == 'alerts':
                safety[name] = [{'name':r.get('name'),'enabled':r.get('enabled'),'severity':r.get('severity'),
                                  'actionGroupCount':len(r.get('actions',[]))} for r in rows]
            else:
                safety[name] = [{'name':r.get('name'),'enabled':r.get('enabled'),
                                  'emailReceiverCount':len(r.get('emailReceivers',[])),
                                  'smsReceiverCount':len(r.get('smsReceivers',[])),
                                  'webhookReceiverCount':len(r.get('webhookReceivers',[])),
                                  'humanAcknowledgement':'NOT_TESTED'} for r in rows]
        except (RuntimeError, subprocess.TimeoutExpired):
            safety[name] = {'status':'READ_UNAVAILABLE'}
    # Detect rollout/config drift without including literal setting values in evidence.
    drift = []
    for before in summaries:
        name = before['name']
        after = summarize_app(az('containerapp','show','-g',RG,'-n',name),
                              az('containerapp','revision','list','-g',RG,'-n',name))
        if before['sanitizedConfigurationSha256'] != after['sanitizedConfigurationSha256']:
            drift.append(name)
    return {'schemaVersion':1,'observedAt':observed,'finishedAt':datetime.now(timezone.utc).isoformat(),
            'subscription':SUB,'resourceGroup':RG,'apps':summaries,
            'registryImages':{i:image_digest(i) for i in sorted(images)},
            'apis':sorted(apis,key=lambda a:a['id']),'safetyBaseline':safety,'driftedApps':drift,
            'readOnly':True,'accepted':False,'finalOwnerJourney':'NOT_RUN',
            'limitations':['Source tag hints require source/label reconciliation.',
                          'Fingerprints cover sanitized metadata, not secret values or redacted literals.',
                          'Database history, policy bodies, queue age and durable worker leases remain separate evidence.',
                          'Resource-group inventory is not proof of resources outside this group.']}


if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);args=parser.parse_args()
    manifest=capture(); output=Path(args.output); output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(manifest,indent=2,sort_keys=True)+'\n',encoding='utf-8')
    print(json.dumps(manifest,sort_keys=True))
    if manifest['driftedApps']:
        raise SystemExit('Runtime drift detected; inventory is not an accepted stable manifest')
