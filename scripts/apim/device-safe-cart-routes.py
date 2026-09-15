"""Add only the three authenticated conditional-cart operations after a pinned rollout."""
import argparse
import json
import subprocess
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

RG = 'rg-craves-prodlow-centralindia'
APIM = 'apim-craves-prodlow-l3ing6'
APP = 'ca-craves-order-service-prodlow'
SUB = '4f897b61-9b52-44b4-8cf1-bdac281cc1aa'
VERSION = '2022-08-01'
ROUTES = [('clear-cart-if-unchanged', '/clear-if-unchanged'),
          ('switch-cart-kitchen', '/switch-kitchen'),
          ('reorder-cart-if-unchanged', '/reorder-if-unchanged/{orderId}')]

def require(ok, message):
    if not ok:
        raise RuntimeError(message)

def canonical_policy(value):
    root = ET.fromstring(value)
    for element in root.iter():
        attributes = sorted(element.attrib.items())
        element.attrib.clear()
        element.attrib.update(attributes)
        if element.text is not None and not element.text.strip():
            element.text = None
        if element.tail is not None and not element.tail.strip():
            element.tail = None
    return ET.tostring(root)

def az(*args, write=False):
    response = subprocess.run(['az', *args, '--only-show-errors', '-o', 'none' if write else 'json'], capture_output=True, text=True)
    require(response.returncode == 0, 'Azure operation failed: ' + ' '.join(args[:2]))
    return None if write else json.loads(response.stdout.lstrip('\ufeff'))

def rest(method, scope, body=None):
    args = ['rest', '--method', method, '--url', scope + '?api-version=' + VERSION,
            '--headers', 'Accept=application/json']
    if body is not None:
        args += ['--body', json.dumps(body)]
    return az(*args, write=method != 'get')

def http_status(url, method='GET', headers=None):
    request = urllib.request.Request(url, method=method, data=b'{}' if method == 'POST' else None,
                                    headers={'Content-Type': 'application/json', **(headers or {})})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code

def runtime(expected):
    app = az('containerapp', 'show', '-g', RG, '-n', APP)['properties']
    require(app['latestRevisionName'] == app['latestReadyRevisionName'], 'Order rollout not fully ready')
    require(app['template']['containers'][0]['image'] == expected, 'Order image changed; refusing gateway writes')
    require(app['configuration'].get('activeRevisionsMode') == 'Single', 'Unexpected traffic mode')
    origin = 'https://' + app['configuration']['ingress']['fqdn']
    require(http_status(origin + '/actuator/health') == 200, 'Order health failed')
    return origin

def read_policies(scope):
    policies = rest('get', scope + '/policies')['value']
    for policy in policies:
        root = ET.fromstring(policy['properties']['value'])
        require(not any('backend-id' in element.attrib for element in root.iter('set-backend-service')),
                'Inherited backend-id requires separate review')
    return policies

def policy(origin, path):
    root = ET.Element('policies')
    inbound = ET.SubElement(root, 'inbound')
    ET.SubElement(inbound, 'base')
    when = ET.SubElement(ET.SubElement(inbound, 'choose'), 'when', condition='@(!context.Request.Headers.GetValueOrDefault("Authorization", "").StartsWith("Bearer ", System.StringComparison.OrdinalIgnoreCase))')
    response = ET.SubElement(when, 'return-response')
    ET.SubElement(response, 'set-status', code='401', reason='Unauthorized')
    ET.SubElement(ET.SubElement(response, 'set-header', name='Content-Type', **{'exists-action':'override'}), 'value').text = 'application/json'
    ET.SubElement(response, 'set-body').text = '{"error":"AUTHENTICATION_REQUIRED","message":"Please sign in to continue."}'
    ET.SubElement(inbound, 'set-backend-service', **{'base-url': origin + '/api/v1/cart'})
    ET.SubElement(inbound, 'rewrite-uri', template=path, **{'copy-unmatched-params':'false'})
    ET.SubElement(ET.SubElement(root, 'backend'), 'base')
    outbound = ET.SubElement(root, 'outbound')
    ET.SubElement(outbound, 'base')
    for name, value in [('Cache-Control', 'no-store, no-cache, must-revalidate'), ('Pragma','no-cache'), ('X-Content-Type-Options','nosniff')]:
        ET.SubElement(ET.SubElement(outbound, 'set-header', name=name, **{'exists-action':'override'}), 'value').text = value
    ET.SubElement(ET.SubElement(root, 'on-error'), 'base')
    return ET.tostring(root, encoding='unicode')

def main(expected, apply):
    require(az('account', 'show')['id'] == SUB, 'Wrong subscription')
    origin = runtime(expected)
    base = f'https://management.azure.com/subscriptions/{SUB}/resourceGroups/{RG}/providers/Microsoft.ApiManagement/service/{APIM}'
    read_policies(base)
    apis = az('apim', 'api', 'list', '-g', RG, '--service-name', APIM)
    owners = [api for api in apis if api['path'].strip('/') == 'api/v1/cart']
    require(len(owners) == 1 and owners[0]['name'] == 'craves-cart-v1', 'Unexpected cart API ownership')
    require(owners[0]['subscriptionRequired'] is False, 'Unexpected cart security setting')
    require(owners[0]['serviceUrl'].rstrip('/') == origin + '/api/v1/cart', 'Unexpected cart backend')
    scope = base + '/apis/craves-cart-v1'
    read_policies(scope)
    before = rest('get', scope + '/operations')['value']
    wanted = dict(ROUTES)
    for operation in before:
        p = operation['properties']
        key = operation['name']
        for operation_id, path in ROUTES:
            same_route = p['method'] == 'POST' and p['urlTemplate'].rstrip('/') == path
            require(not same_route or key == operation_id, 'Route owned by another operation')
            require(key != operation_id or same_route, 'Operation ID belongs to another route')
        if key in wanted:
            existing = read_policies(scope + '/operations/' + key)
            require(len(existing) == 1 and canonical_policy(existing[0]['properties']['value']) == canonical_policy(policy(origin, wanted[key])), 'Existing new-route policy differs; preserve and review')
    for _, path in ROUTES:
        probe = path.replace('{orderId}', '00000000-0000-4000-8000-000000000000')
        require(http_status(origin + '/api/v1/cart' + probe, 'POST') in (401, 403), 'Backend does not require authentication')
    print('CART_ROUTE_PLAN: three conditional POST routes; existing routes and policies preserved')
    if not apply:
        return
    require(runtime(expected) == origin, 'Runtime changed during preflight')
    for operation_id, path in ROUTES:
        target = scope + '/operations/' + operation_id
        parameters = [{'name':'orderId','type':'string','required':True}] if '{orderId}' in path else []
        rest('put', target, {'properties': {'displayName': operation_id.replace('-', ' '), 'method':'POST',
            'urlTemplate':path, 'templateParameters':parameters,
            'responses':[{'statusCode':n} for n in (200,400,401,403,404,409,422,503)]}})
        rest('put', target + '/policies/policy', {'properties': {'format':'rawxml','value':policy(origin,path)}})
        result = rest('get', target)['properties']
        require(result['method'] == 'POST' and result['urlTemplate'] == path, 'Route readback failed')
        actual = rest('get', target + '/policies/policy')['properties']['value']
        require(canonical_policy(actual) == canonical_policy(policy(origin,path)), 'Policy readback failed')
        print('PUBLISHED POST /api/v1/cart' + path)
    after = {op['name']:op['properties'] for op in rest('get', scope + '/operations')['value']}
    require(all(after.get(op['name']) == op['properties'] for op in before if op['name'] not in wanted), 'An existing operation changed')
    for _, path in ROUTES:
        probe = path.replace('{orderId}', '00000000-0000-4000-8000-000000000000')
        for attempt in range(12):
            status = http_status('https://api.craves.in/api/v1/cart' + probe, 'POST')
            if status in (401,403):
                break
            time.sleep(10)
        require(status in (401,403), 'Public route authentication check failed')
    print('CART_GATEWAY_VERIFIED: no order/payment created; authenticated phone acceptance remains')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--expected-image', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    main(args.expected_image, args.apply)
