"""Read-only live dependency probe; never print secret values or response bodies."""
import json
import subprocess
import urllib.error
import urllib.request
from urllib.parse import urlparse

RG = 'rg-craves-prodlow-centralindia'
APP = 'ca-craves-order-service-prodlow'

def az(*args):
    result = subprocess.run(['az', *args, '--only-show-errors', '-o', 'json'], capture_output=True, text=True)
    if result.returncode:
        raise SystemExit('Azure read failed: ' + args[0])
    return json.loads(result.stdout.lstrip('\ufeff'))

app = az('containerapp', 'show', '-g', RG, '-n', APP)['properties']
container = app['template']['containers'][0]
print('ORDER_RUNTIME ' + json.dumps({
    'image': container['image'], 'latest': app['latestRevisionName'],
    'ready': app['latestReadyRevisionName'],
    'revisionMode': app['configuration'].get('activeRevisionsMode'),
    'traffic': app['configuration'].get('ingress', {}).get('traffic', [])}))
env = {item['name']: item for item in container.get('env', [])}
for name in sorted(env):
    if 'CATALOG' not in name:
        continue
    item = env[name]
    if name.endswith('BASE_URL'):
        value = item.get('value', '')
        parsed = urlparse(value)
        safe = parsed.scheme in ('https', 'http') and not parsed.username and not parsed.password and not parsed.query and not parsed.fragment
        print(name + ': ' + (value if safe else 'NON_LITERAL_OR_UNEXPECTED_URL'))
    else:
        print(name + ': ' + ('SECRET_REFERENCE' if item.get('secretRef') else 'LITERAL_PRESENT' if item.get('value') else 'EMPTY'))

apis = az('apim', 'api', 'list', '-g', RG, '--service-name', 'apim-craves-prodlow-l3ing6')
for api in apis:
    if api.get('path', '').strip('/') not in ('api/v1/cart', 'api/v1/catalog'):
        continue
    operations = az('apim', 'api', 'operation', 'list', '-g', RG,
        '--service-name', 'apim-craves-prodlow-l3ing6', '--api-id', api['name'])
    print('API ' + json.dumps({'id': api['name'], 'path': api['path'],
        'serviceUrl': api.get('serviceUrl'),
        'operations': [{'id': op['name'], 'method': op.get('method'), 'path': op.get('urlTemplate')} for op in operations]}))
print('READ_ONLY_COMPLETE: no secrets read, settings changed, or customer requests sent.')
