"""Read-only customer readiness, or publish only missing review write routes."""
import argparse
import importlib.util
import json
from pathlib import Path
import xml.etree.ElementTree as ET

spec = importlib.util.spec_from_file_location('safe_cart', Path(__file__).with_name('device-safe-cart-routes.py'))
safe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(safe)
EXPECTED = 'cravesprodlowacr82121.azurecr.io/craves/order-service:device-cart-e1cf04e0537e2eaf32f1c494142dd52a3e3bafa0'
WRITES = [('create-order-review', 'POST'), ('update-order-review', 'PUT')]
PATH = '/{orderId}/review'

def review_policy(origin):
    root = ET.fromstring(safe.policy(origin, PATH))
    root.find('inbound/set-backend-service').set('base-url', origin + '/api/v1/orders')
    return ET.tostring(root, encoding='unicode')

def main(apply=False):
    safe.require(safe.az('account', 'show')['id'] == safe.SUB, 'Wrong subscription')
    origin = safe.runtime(EXPECTED)
    apps = safe.az('containerapp', 'list', '-g', safe.RG)
    for app in apps:
        name = app['name']
        if not any(part in name for part in ('auth-service', 'notification-service', 'user-chef-service', 'order-service')):
            continue
        props = app['properties']
        container = props['template']['containers'][0]
        metadata = {}
        for item in container.get('env', []):
            key = item['name']
            if not key.startswith(('CRAVES_EMAIL_', 'CRAVES_DOCUMENTS_')):
                continue
            if key.endswith('_ENABLED'):
                metadata[key] = item.get('value', 'REFERENCE')
            else:
                metadata[key] = 'SECRET_REFERENCE' if item.get('secretRef') else 'PRESENT' if item.get('value') else 'EMPTY'
        print('FEATURE_RUNTIME ' + json.dumps({'name':name,'image':container['image'],
            'latest':props['latestRevisionName'],'ready':props['latestReadyRevisionName'],'settings':metadata}))
    base = f'https://management.azure.com/subscriptions/{safe.SUB}/resourceGroups/{safe.RG}/providers/Microsoft.ApiManagement/service/{safe.APIM}'
    safe.read_policies(base)
    apis = safe.az('apim', 'api', 'list', '-g', safe.RG, '--service-name', safe.APIM)
    owners = []
    for api in apis:
        path = api['path'].strip('/')
        if path not in ('api/v1/orders', 'api/v1/auth', 'api/v1/documents', 'api/v1/cart', 'api/v1/checkout'):
            continue
        scope = base + '/apis/' + api['name']
        ops = safe.rest('get', scope + '/operations')['value']
        print('ROUTES ' + json.dumps({'api': api['name'], 'path': path, 'operations': [
            {'id': op['name'], 'method': op['properties']['method'], 'path': op['properties']['urlTemplate']} for op in ops]}))
        if path == 'api/v1/orders':
            owners.append((api, scope, ops))
    safe.require(len(owners) == 1, 'Order API ownership ambiguous')
    api, scope, before = owners[0]
    safe.require(api.get('subscriptionRequired') is False, 'Unexpected subscription requirement')
    safe.require(api['serviceUrl'].rstrip('/') == origin + '/api/v1/orders', 'Unexpected order backend')
    safe.read_policies(scope)
    expected_policy = review_policy(origin)
    for name, method in WRITES:
        for op in before:
            p = op['properties']
            same = p['method'] == method and p['urlTemplate'] == PATH
            safe.require(not same or op['name'] == name, 'Review route already has another owner')
            safe.require(op['name'] != name or same, 'Operation ID has another purpose')
            if same:
                policies = safe.read_policies(scope + '/operations/' + name)
                safe.require(len(policies) == 1 and safe.canonical_policy(policies[0]['properties']['value']) == safe.canonical_policy(expected_policy), 'Existing write policy differs')
        safe.require(safe.http_status(origin + '/api/v1/orders/00000000-0000-4000-8000-000000000001/review', method) in (401,403), 'Backend auth guard absent')
    print('REVIEW_PLAN: existing reads preserved; two authenticated write routes only; no review submitted')
    if not apply:
        return
    safe.require(safe.runtime(EXPECTED) == origin, 'Runtime changed')
    for name, method in WRITES:
        target = scope + '/operations/' + name
        safe.rest('put', target, {'properties': {'displayName': name.replace('-', ' '), 'method': method,
            'urlTemplate': PATH, 'templateParameters': [{'name':'orderId','type':'string','required':True}],
            'responses': [{'statusCode': code} for code in (200,400,401,403,404,409,503)]}})
        safe.rest('put', target + '/policies/policy', {'properties': {'format':'xml','value':expected_policy}})
        actual = safe.rest('get', target + '/policies/policy')['properties']['value']
        safe.require(safe.canonical_policy(actual) == safe.canonical_policy(expected_policy), 'Policy readback mismatch')
        readback = safe.rest('get', target)['properties']
        safe.require(readback['method'] == method and readback['urlTemplate'] == PATH, 'Route readback mismatch')
        print('PUBLISHED ' + method + ' /api/v1/orders' + PATH)
    after = {op['name']:op['properties'] for op in safe.rest('get', scope + '/operations')['value']}
    owned = {name for name, _ in WRITES}
    safe.require(all(after.get(op['name']) == op['properties'] for op in before if op['name'] not in owned), 'Existing operation changed')
    print('REVIEW_GATEWAY_READBACK_VERIFIED; customer acceptance still required')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply-reviews', action='store_true')
    main(parser.parse_args().apply_reviews)
