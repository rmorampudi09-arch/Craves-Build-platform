"""Read only the public Auth route policy chain; export no XML or literal bindings."""
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import xml.etree.ElementTree as ET

SPEC = importlib.util.spec_from_file_location('gateway_hashes', Path(__file__).with_name('capture-gateway-policy-fingerprints.py'))
gateway = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gateway)
API = '/apis/craves-auth-v1'
ROUTES = {'/firebase/exchange', '/refresh'}


def describe(scope, rows):
    summary = gateway.summarize(scope, rows)
    if not rows:
        return {**summary, 'inheritsInbound': True, 'unconditionalRateLimits': [], 'conditionalRateLimitCount': 0}
    xml = rows[0]['properties']['value']
    if '<!DOCTYPE' in xml.upper() or '<!ENTITY' in xml.upper():
        raise ValueError('Unsupported policy declarations')
    root = ET.fromstring(xml)
    if root.tag != 'policies':
        raise ValueError('Unexpected policy root')
    inbound = root.find('inbound')
    if inbound is None:
        raise ValueError('Missing inbound policy section')
    unconditional = []
    tags = {'rate-limit', 'rate-limit-by-key'}
    for child in inbound:
        if child.tag not in tags:
            continue
        numbers = {}
        for key in ('calls', 'renewal-period'):
            raw = child.get(key, '')
            numbers[key] = int(raw) if raw.isascii() and raw.isdecimal() and 0 < int(raw) <= 1000000 else None
        unconditional.append({'type': child.tag, **numbers,
                              'usesRequestIpAddress': 'context.Request.IpAddress' in child.get('counter-key', ''),
                              'incrementConditionPresent': 'increment-condition' in child.attrib})
    nested_count = sum(1 for child in inbound.iter() if child.tag in tags) - len(unconditional)
    return {**summary, 'inheritsInbound': any(e.tag == 'base' for e in inbound),
            'unconditionalRateLimits': unconditional, 'conditionalRateLimitCount': nested_count,
            'fragmentCount': sum(1 for e in root.iter('include-fragment'))}


def capture():
    global_rows = gateway.read('/policies')
    api_rows = gateway.read(API + '/policies')
    operations = gateway.read(API + '/operations')
    matched = [o for o in operations if o.get('properties', {}).get('method') == 'POST'
               and o.get('properties', {}).get('urlTemplate') in ROUTES]
    if len(matched) != 2 or {o['properties']['urlTemplate'] for o in matched} != ROUTES:
        raise ValueError('Auth protected routes not uniquely resolved')
    captures = {'global': global_rows, API: api_rows}
    route_summaries = []
    for operation in sorted(matched, key=lambda o: o['name']):
        scope = API + '/operations/' + gateway.segment(operation['name'])
        rows = gateway.read(scope + '/policies')
        captures[scope] = rows
        chain = [describe(scope, rows), describe(API, api_rows), describe('global', global_rows)]
        reachable = []
        for policy in chain:
            reachable.append(policy)
            if not policy['inheritsInbound']:
                break
        route_summaries.append({'method': 'POST', 'path': operation['properties']['urlTemplate'],
                                'reachableChain': reachable,
                                'unconditionalBoundedLimitPresent': any(
                                    limit['calls'] is not None and limit['renewal-period'] is not None
                                    and not limit['incrementConditionPresent']
                                    for policy in reachable for limit in policy['unconditionalRateLimits'])})
    for scope, original in captures.items():
        suffix = '/policies' if scope == 'global' else scope + '/policies'
        if gateway.read(suffix) != original:
            raise ValueError('Auth gateway policy changed during inspection')
    if gateway.read(API + '/operations') != operations:
        raise ValueError('Auth gateway operations changed during inspection')
    return {'readOnly': True, 'observedAt': datetime.now(timezone.utc).isoformat(),
            'routes': route_summaries, 'customerRequestsSent': 0, 'policyWrites': 0,
            'effectiveGatewayProtectionAccepted': False,
            'limitations': ['Static direct-child/inheritance inspection is not a complete policy execution proof.',
                            'Product/workspace policy, fragments, expressions and provider protection remain separate.',
                            'No XML, named-value binding, key expression or secret is exported.']}


if __name__ == '__main__':
    try:
        print(json.dumps(capture(), sort_keys=True))
    except Exception as error:
        raise SystemExit('Auth gateway inspection stopped: ' + type(error).__name__)
