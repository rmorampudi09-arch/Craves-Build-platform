"""F14: inspect or repair cache headers on exactly two existing finance API policies.

No API creation, routing, credentials, authorization, product or operation changes.
Existing owner policy byte hashes and ETags are mandatory before any update.
"""
import argparse
import hashlib
import json
import re
import subprocess
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

BASE = 'https://management.azure.com/subscriptions/4f897b61-9b52-44b4-8cf1-bdac281cc1aa/resourceGroups/rg-craves-prodlow-centralindia/providers/Microsoft.ApiManagement/service/apim-craves-prodlow-l3ing6'
API_IDS = ('craves-finance-admin-v1', 'craves-chef-finance-v1')
EXPECTED_POLICY_SHA = '0baf929ee9c73bea0300be249bb656213033c0b8009883f48a05d4746d43acca'
EXPECTED_GLOBAL_SHA = '8e678113f285cd7bef4e758a8f7d3ca893310d891d6301e791b0537132fbedc5'
# Resource representations observed by read-only Azure run39086. Collection
# fingerprints above are retained and must reconcile structurally before writes.
EXPECTED_RESOURCE_POLICY_SHA = 'f34e6e2623f818053b7afebf7afc379736c0f1293df62b1b84f0a2ed97a0322e'
EXPECTED_RESOURCE_GLOBAL_SHA = 'be15daa26fce12414c353e55c31dba2e43177dc754ad57b3312ea43d6c6a287c'
CACHE_VALUE = 'private, no-store, max-age=0'
PATHS = ('/api/v1/admin/finance/settings', '/api/v1/admin/finance/source-status',
         '/api/v1/admin/finance/manual-settlements', '/api/v1/chef/finance/balance')


class GuardError(RuntimeError): pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl): return None


def sha(value): return hashlib.sha256(value.encode('utf-8')).hexdigest()


def root(text, require_sections=True):
    if not isinstance(text, str) or '<!DOCTYPE' in text.upper() or '<!ENTITY' in text.upper():
        raise GuardError('Unexpected XML declaration')
    try: value = ET.fromstring(text)
    except ET.ParseError: raise GuardError('Policy XML could not be parsed safely') from None
    if value.tag != 'policies' or (require_sections and [n.tag for n in value] != ['inbound', 'backend', 'outbound', 'on-error']):
        raise GuardError('Unexpected policy sections')
    return value


def structure(node):
    return (node.tag, tuple(sorted(node.attrib.items())), node.text if node.text and node.text.strip() else None,
            tuple(structure(child) for child in node), node.tail if node.tail and node.tail.strip() else None)


def without_privacy(node):
    for parent in node.iter():
        for child in list(parent):
            if child.tag == 'set-header' and child.get('name', '').lower() in ('cache-control', 'pragma'):
                parent.remove(child)
    return structure(node)


def set_privacy(parent):
    for child in list(parent):
        if child.tag == 'set-header' and child.get('name', '').lower() in ('cache-control', 'pragma'):
            parent.remove(child)
    # APIM requires set-status, then set-header, then set-body inside return-response.
    position = next((i for i, child in enumerate(parent) if child.tag == 'set-body'), len(parent))
    for name, value in [('Cache-Control', CACHE_VALUE), ('Pragma', 'no-cache')]:
        header = ET.Element('set-header', {'name': name, 'exists-action': 'override'})
        ET.SubElement(header, 'value').text = value
        parent.insert(position, header); position += 1


def patch_policy(text):
    tree = root(text)
    for response in tree.iter('return-response'): set_privacy(response)
    for section in ('outbound', 'on-error'): set_privacy(tree.find(section))
    updated = ET.tostring(tree, encoding='unicode')
    if without_privacy(root(text)) != without_privacy(root(updated)):
        raise GuardError('Non-privacy policy change detected')
    return updated


def inspect(text):
    tree = root(text, require_sections=False)
    sections = ['inbound', 'backend', 'outbound', 'on-error']
    return {'sha256': sha(text), 'xmlBytes': len(text.encode('utf-8')),
            'sectionsMatchPatchShape': [n.tag for n in tree] == sections,
            'sectionOrder': [n.tag if n.tag in sections else 'UNRECOGNIZED' for n in tree],
            'returnResponses': len(list(tree.iter('return-response'))),
            'hasFragments': bool(list(tree.iter('include-fragment'))),
            'hasCaching': any(n.tag.startswith('cache-') for n in tree.iter()),
            'sectionTags': {section.tag: [node.tag for node in section] for section in tree if section.tag in sections},
            'privacy': [{'section': section.tag,
                         'noStoreHeaders': sum(1 for n in section.iter('set-header') if n.get('name', '').lower() == 'cache-control' and any('no-store' in (v.text or '').lower() for v in n.findall('value')))}
                        for section in tree if section.tag in sections]}


def scope_url(scope):
    allowed = {'/policies/policy'} | {'/apis/' + aid + '/policies/policy' for aid in API_IDS}
    allowed |= {value.removesuffix('/policy') for value in tuple(allowed)}
    if scope not in allowed: raise GuardError('Policy scope outside reviewed targets')
    return BASE + scope + '?api-version=2022-08-01'


class Management:
    def __init__(self):
        result = subprocess.run(['az', 'account', 'get-access-token', '--resource', 'https://management.azure.com/',
                                 '--query', 'accessToken', '-o', 'tsv', '--only-show-errors'],
                                capture_output=True, text=True, timeout=60)
        if result.returncode or not result.stdout.strip(): raise GuardError('Existing Azure session unavailable')
        self.token = result.stdout.strip()
        self.opener = urllib.request.build_opener(NoRedirect())

    def request(self, scope, method='GET', text=None, etag=None):
        target = scope_url(scope)
        if method not in ('GET', 'PUT') or (method == 'PUT' and scope not in
                {'/apis/' + aid + '/policies/policy' for aid in API_IDS}):
            raise GuardError('Method or global mutation outside reviewed targets')
        headers = {'Authorization': 'Bearer ' + self.token, 'Accept': 'application/json'}
        payload = None
        if method == 'PUT':
            if not etag or etag == '*' or '\r' in etag or '\n' in etag:
                raise GuardError('Exact current ETag is required')
            root(text)
            headers.update({'If-Match': etag, 'Content-Type': 'application/json'})
            payload = json.dumps({'properties': {'format': 'xml', 'value': text}}).encode()
        request = urllib.request.Request(target, data=payload, headers=headers, method=method)
        try:
            with self.opener.open(request, timeout=40) as response:
                if method == 'PUT': return None
                raw = response.read(1024 * 1024 + 1)
                if len(raw) > 1024 * 1024: raise GuardError('Policy response exceeds bound')
                data = json.loads(raw)
                if scope.endswith('/policies'):
                    return collection_policy(data), None
                return data['properties']['value'], response.headers.get('ETag')
        except urllib.error.HTTPError as error:
            raise GuardError('Management request rejected with HTTP ' + str(error.code)) from None


def collection_policy(data):
    rows = data.get('value')
    if data.get('nextLink') or not isinstance(rows, list) or len(rows) != 1:
        raise GuardError('Expected exactly one non-paginated policy')
    properties = rows[0].get('properties') or {}
    if properties.get('format') not in ('xml', 'rawxml'):
        raise GuardError('Unexpected policy representation')
    value = properties.get('value')
    root(value, require_sections=False)
    return value


def reconcile(client, scope, resource_text):
    collection_text, _ = client.request(scope.removesuffix('/policy'))
    global_scope = scope == '/policies/policy'
    expected_collection = EXPECTED_GLOBAL_SHA if global_scope else EXPECTED_POLICY_SHA
    expected_resource = EXPECTED_RESOURCE_GLOBAL_SHA if global_scope else EXPECTED_RESOURCE_POLICY_SHA
    equivalent = structure(root(collection_text, False)) == structure(root(resource_text, False))
    return {'collectionSha256': sha(collection_text), 'resourceSha256': sha(resource_text),
            'collectionBaselineMatches': sha(collection_text) == expected_collection,
            'resourceBaselineMatches': sha(resource_text) == expected_resource,
            'structureEquivalent': equivalent,
            'passed': equivalent and sha(collection_text) == expected_collection
                      and sha(resource_text) == expected_resource}


def validate_global(text):
    tree = root(text, False)
    # The recorded global policy has no on-error section. It is inherited but
    # never written. Accept only the known section orders, not arbitrary shapes.
    if [n.tag for n in tree] not in (['inbound', 'backend', 'outbound'],
                                    ['inbound', 'backend', 'outbound', 'on-error']):
        raise GuardError('Unexpected inherited policy sections')
    info = inspect(text)
    if info['returnResponses'] or info['hasFragments'] or info['hasCaching']:
        raise GuardError('Inherited early return, fragment or caching needs separate review')


def probe():
    results = []
    opener = urllib.request.build_opener(NoRedirect())
    for path in PATHS:
        request = urllib.request.Request('https://api.craves.in' + path, method='GET')
        try: response = opener.open(request, timeout=20)
        except urllib.error.HTTPError as error: response = error
        with response:
            # Only header metadata; do not read or retain a customer response body.
            cache = response.headers.get('Cache-Control', '')
            results.append({'path': path, 'status': response.code,
                            'cacheControl': cache, 'pragma': response.headers.get('Pragma', ''),
                            'passed': response.code == 401 and {'private', 'no-store'}.issubset(set(p.strip().lower() for p in cache.split(',')))})
    return results


def run(client, apply=False):
    global_xml, _ = client.request('/policies/policy')
    global_comparison = reconcile(client, '/policies/policy', global_xml)
    global_matches = global_comparison['passed']
    if apply and not global_matches: raise GuardError('Inherited global policy reconciliation failed')
    global_info = inspect(global_xml)
    if apply: validate_global(global_xml)
    planned = []
    for aid in API_IDS:
        scope = '/apis/' + aid + '/policies/policy'
        before, etag = client.request(scope)
        comparison = reconcile(client, scope, before)
        if apply and not comparison['passed']: raise GuardError('Finance owner policy reconciliation failed')
        if apply and (not etag or etag == '*'): raise GuardError('Policy ETag missing; no write authorized')
        # Read-only diagnosis must be able to describe an unexpected shape.
        # It never authorizes transforming that shape in write mode.
        try: after = patch_policy(before)
        except GuardError:
            if apply: raise
            after = None
        planned.append((scope, before, etag, after, comparison))
    evidence = {'readOnly': not apply, 'accepted': False, 'observedAt': datetime.now(timezone.utc).isoformat(),
                'global': global_info, 'globalBaselineMatches': global_matches,
                'globalRepresentationComparison': global_comparison,
                'policies': [], 'beforeAnonymous': probe()}
    for scope, before, etag, after, comparison in planned:
        record = {'scope': scope, 'before': inspect(before), 'proposed': inspect(after) if after else None, 'applied': False,
                  'baselineMatches': comparison['passed'], 'representationComparison': comparison,
                  'exactEtagAvailable': bool(etag and etag != '*')}
        if apply:
            # Re-read all shared inheritance immediately before each conditional write.
            fresh_global, _ = client.request('/policies/policy')
            if sha(fresh_global) != sha(global_xml) or not reconcile(client, '/policies/policy', fresh_global)['passed']:
                raise GuardError('Global policy changed during repair')
            current, current_etag = client.request(scope)
            if sha(current) != sha(before) or current_etag != etag: raise GuardError('Finance policy changed during repair')
            if not reconcile(client, scope, current)['passed']: raise GuardError('Finance collection changed during repair')
            client.request(scope, 'PUT', after, etag)
            actual, _ = client.request(scope)
            if structure(root(actual)) != structure(root(after)): raise GuardError('Policy readback differs; preserve evidence for review')
            record['applied'] = True; record['actualSha256'] = sha(actual)
        evidence['policies'].append(record)
    evidence['afterAnonymous'] = probe() if apply else []
    return evidence


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--expected-source-sha')
    args = parser.parse_args()
    try:
        if args.apply:
            actual_sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
            if not re.fullmatch('[0-9a-f]{40}', args.expected_source_sha or '') or actual_sha != args.expected_source_sha:
                raise GuardError('Exact source SHA required')
        result = run(Management(), args.apply)
        print(json.dumps(result, sort_keys=True))
        if args.apply and not all(row['passed'] for row in result['afterAnonymous']):
            raise GuardError('Anonymous live cache-header acceptance incomplete; no launch approval')
    except Exception as error:
        raise SystemExit('Finance privacy check stopped: ' + (str(error) if isinstance(error, GuardError) else type(error).__name__))
