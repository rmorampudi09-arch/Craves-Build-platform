"""Read only the owned cart rule; report structural differences, never values."""
import importlib.util
from pathlib import Path
import xml.etree.ElementTree as ET
import json

spec = importlib.util.spec_from_file_location('cart_routes', Path(__file__).with_name('device-safe-cart-routes.py'))
routes = importlib.util.module_from_spec(spec)
spec.loader.exec_module(routes)
expected_image = 'cravesprodlowacr82121.azurecr.io/craves/order-service:device-cart-e1cf04e0537e2eaf32f1c494142dd52a3e3bafa0'
origin = routes.runtime(expected_image)
scope = f'https://management.azure.com/subscriptions/{routes.SUB}/resourceGroups/{routes.RG}/providers/Microsoft.ApiManagement/service/{routes.APIM}/apis/craves-cart-v1/operations/clear-cart-if-unchanged/policies/policy'
actual = routes.rest('get', scope)['properties']
expected_nodes = list(ET.fromstring(routes.policy(origin, '/clear-if-unchanged')).iter())
actual_nodes = list(ET.fromstring(actual['value']).iter())
print('POLICY_FORMAT', actual.get('format'), 'NODE_COUNTS', len(expected_nodes), len(actual_nodes))
for index, (expected, observed) in enumerate(zip(expected_nodes, actual_nodes)):
    differences = {'index': index, 'tagMatches': expected.tag == observed.tag}
    if expected.attrib != observed.attrib:
        differences['attributes'] = {key: {'presentExpected': key in expected.attrib, 'presentActual': key in observed.attrib,
            'equal': expected.get(key) == observed.get(key),
            'trimEqual': (expected.get(key) or '').strip() == (observed.get(key) or '').strip()}
            for key in sorted(set(expected.attrib) | set(observed.attrib)) if expected.get(key) != observed.get(key)}
    if (expected.text or '') != (observed.text or ''):
        differences['text'] = {'expectedLength': len(expected.text or ''), 'actualLength': len(observed.text or ''),
            'trimEqual': (expected.text or '').strip() == (observed.text or '').strip()}
    if len(differences) > 2 or not differences['tagMatches']:
        print('POLICY_DIFFERENCE', json.dumps(differences))
print('READ_ONLY_POLICY_INSPECTION_COMPLETE')
