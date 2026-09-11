#!/usr/bin/env python3
"""Plan/apply only Craves PDF routes on existing APIM. No cloud resource provisioning.

Default is read-only planning. --apply requires safe inherited policies/diagnostics
and refuses to overwrite an API not owned by this module. No credentials are printed.
"""
import argparse
import json
from pathlib import Path
import re
import subprocess
import tempfile
from urllib.parse import quote
import xml.etree.ElementTree as ET

API_VERSION = '2022-08-01'
API_ID = 'craves-documents-v1'
MARKER = '[craves-pdf-documents-v1]'
OPERATIONS = (
    ('capabilities', 'GET', '/capabilities'), ('create-document', 'POST', '/'),
    ('list-documents', 'GET', '/'), ('get-document', 'GET', '/{id}'),
    ('download-document', 'GET', '/{id}/download'), ('email-document', 'POST', '/{id}/email'),
    ('email-history', 'GET', '/{id}/emails'),
)

def az(*args):
    result = subprocess.run(['az', *args, '--only-show-errors', '-o', 'json'], capture_output=True, text=True, timeout=90)
    if result.returncode:
        raise RuntimeError('Azure command failed; inspect the authorized Azure session without publishing credentials')
    return json.loads(result.stdout.lstrip('\ufeff')) if result.stdout.strip() else {}


def rest(method, url, body=None, absent_ok=False):
    command = ['az', 'rest', '--method', method, '--url', url, '--only-show-errors', '-o', 'json']
    with tempfile.TemporaryDirectory() as folder:
        if body is not None:
            file = Path(folder) / 'request.json'
            file.write_text(json.dumps(body))
            command += ['--body', '@' + str(file), '--headers', 'Content-Type=application/json']
        result = subprocess.run(command, capture_output=True, text=True, timeout=90)
    if result.returncode:
        if absent_ok and re.search(r'\"code\"\s*:\s*\"(?:ResourceNotFound|NotFound)\"|\((?:ResourceNotFound|NotFound)\)|\b404\b', result.stderr): return None
        raise RuntimeError('APIM request failed; no credentials or response body were emitted')
    payload = result.stdout.lstrip('\ufeff').strip()
    if payload.startswith('<') and '/policies/policy?' in url:
        root = ET.fromstring(payload)
        if root.tag != 'policies':
            raise RuntimeError('Unexpected Azure policy XML response')
        return {'properties': {'value': payload}}
    return json.loads(payload) if payload else {}


def policy_safe(value):
    if not value: return
    root = ET.fromstring(value)
    forbidden = {'cache-lookup', 'cache-lookup-value', 'cache-store', 'cache-store-value',
                 'set-body', 'log-to-eventhub', 'trace', 'send-one-way-request', 'send-request'}
    if any(node.tag.split('}')[-1] in forbidden for node in root.iter()):
        raise RuntimeError('Inherited APIM policy requires financial-document privacy review before apply')


def diagnostics_safe(data):
    for diagnostic in (data or {}).get('value', []):
        props = diagnostic.get('properties', {})
        for side in ['frontend', 'backend']:
            for direction in ['request', 'response']:
                settings = props.get(side, {}).get(direction, {})
                if (settings.get('body') or {}).get('bytes', 0):
                    raise RuntimeError('APIM body logging must be disabled before financial document routing')
                names = [str(v).lower() for v in settings.get('headers', [])]
                if any(v in ['authorization', 'cookie', 'set-cookie', 'ocp-apim-subscription-key'] for v in names):
                    raise RuntimeError('APIM sensitive header logging requires correction before apply')


def policy_document(sku='Consumption'):
    document = '''<policies><inbound><base />
<check-header name="Authorization" failed-check-httpcode="401" failed-check-error-message="Authentication required" ignore-case="true" />
<rate-limit-by-key calls="60" renewal-period="60" counter-key="@(context.Request.IpAddress)" />
</inbound><backend><base /></backend><outbound><base />
<set-header name="Cache-Control" exists-action="override"><value>private, no-store, max-age=0</value></set-header>
<set-header name="X-Content-Type-Options" exists-action="override"><value>nosniff</value></set-header>
</outbound><on-error><base /><set-header name="Cache-Control" exists-action="override"><value>private, no-store</value></set-header></on-error></policies>'''
    if sku.lower() == 'consumption':
        # Consumption has no rate-limit-by-key; retain application per-owner quotas
        # and bound PDF backend concurrency using a policy supported on this tier.
        document = document.replace('<rate-limit-by-key calls="60" renewal-period="60" counter-key="@(context.Request.IpAddress)" />', '')
        document = document.replace('<backend><base /></backend>', '<backend><limit-concurrency key="craves-pdf-documents-v1" max-count="8"><forward-request timeout="60" /></limit-concurrency></backend>')
    return document


def operation_policy(operation_id, path):
    root = ET.Element('policies')
    inbound = ET.SubElement(root, 'inbound'); ET.SubElement(inbound, 'base')
    backend_path = '/api/v1/documents' + ('' if path == '/' else path)
    ET.SubElement(inbound, 'rewrite-uri', {'template': backend_path, 'copy-unmatched-params': 'true'})
    if operation_id == 'create-document':
        validation = ET.SubElement(inbound, 'validate-content', {
            'unspecified-content-type-action': 'prevent', 'max-size': '2048', 'size-exceeded-action': 'prevent'})
        ET.SubElement(validation, 'content', {'type': 'application/json', 'validate-as': 'json', 'action': 'prevent'})
    for scope in ['backend', 'outbound', 'on-error']: ET.SubElement(ET.SubElement(root, scope), 'base')
    return ET.tostring(root, encoding='unicode')


def plan(host, sku='Consumption'):
    if not re.fullmatch(r'[a-zA-Z0-9.-]+\.azurecontainerapps\.io', host):
        raise ValueError('Expected the existing Notification Container App ingress hostname')
    return {
        'api': {'properties': {'displayName': 'Craves private PDF documents', 'description': MARKER + ' Authenticated saved receipts and statements',
            'path': 'api/v1/documents', 'protocols': ['https'], 'subscriptionRequired': False,
            'serviceUrl': 'https://' + host}},
        'policy': {'properties': {'format': 'rawxml', 'value': policy_document(sku)}},
        'operations': [{'id': id, 'body': {'properties': {'displayName': id, 'method': method, 'urlTemplate': path,
            'templateParameters': ([{'name': 'id', 'type': 'string', 'required': True}] if '{id}' in path else []),
            'responses': []}}, 'policy': {'properties': {'format': 'rawxml', 'value': operation_policy(id, path)}}}
            for id, method, path in OPERATIONS],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--output', type=Path, default=Path('pdf-apim-plan.json'))
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    inventory = json.loads((root / 'config/production/azure-resource-inventory.json').read_text())
    subscription = az('account', 'show', '--query', 'id')
    rg, apim = inventory['resourceGroup'], inventory['apiManagement']
    host = az('containerapp', 'show', '-g', rg, '-n', inventory['containerApps']['notification'], '--query', 'properties.configuration.ingress.fqdn')
    sku = az('apim', 'show', '-g', rg, '-n', apim, '--query', 'sku.name')
    desired = plan(host, sku)
    base = f'https://management.azure.com/subscriptions/{quote(subscription)}/resourceGroups/{quote(rg)}/providers/Microsoft.ApiManagement/service/{quote(apim)}'
    endpoint = lambda path: base + path + '?api-version=' + API_VERSION
    api_path = '/apis/' + API_ID
    existing = rest('GET', endpoint(api_path), absent_ok=True)
    if existing and MARKER not in existing.get('properties', {}).get('description', ''):
        raise RuntimeError('Refusing to replace an APIM API not owned by this module')
    for scope in ['', api_path] if existing else ['']:
        inherited = rest('GET', endpoint(scope + '/policies/policy'), absent_ok=True)
        if inherited: policy_safe(inherited.get('properties', {}).get('value'))
        diagnostics_safe(rest('GET', endpoint(scope + '/diagnostics')))
    if existing:
        products = rest('GET', endpoint(api_path + '/products'))
        for product in products.get('value', []):
            policy = rest('GET', endpoint('/products/' + quote(product['name'], safe='') + '/policies/policy'), absent_ok=True)
            if policy: policy_safe(policy.get('properties', {}).get('value'))
        operations = rest('GET', endpoint(api_path + '/operations'))
        expected = {x['id'] for x in desired['operations']}
        if any(x['name'] not in expected for x in operations.get('value', [])):
            raise RuntimeError('Unexpected existing document operation; no changes applied')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({'mode': 'apply' if args.apply else 'plan', 'apiId': API_ID, 'desired': desired}, indent=2) + '\n')
    if args.apply:
        rest('PUT', endpoint(api_path), desired['api'])
        rest('PUT', endpoint(api_path + '/policies/policy'), desired['policy'])
        for operation in desired['operations']:
            path = api_path + '/operations/' + operation['id']
            rest('PUT', endpoint(path), operation['body'])
            rest('PUT', endpoint(path + '/policies/policy'), operation['policy'])
        print('Dedicated document routes configured. No feature flags enabled; production acceptance still required.')
    else:
        print('Read-only APIM plan saved. No cloud configuration changed.')

if __name__ == '__main__': main()
