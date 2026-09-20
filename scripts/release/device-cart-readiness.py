"""Read-only live dependency probe; never print secret values or response bodies."""
import json
import subprocess
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from urllib.parse import urlparse

RG = 'rg-craves-prodlow-centralindia'
APP = 'ca-craves-order-service-prodlow'

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def probe(url, key=None):
    headers = {'X-Craves-Internal-Key': key} if key else {}
    request = urllib.request.Request(url, headers=headers, method='GET')
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=25) as response:
            body = json.loads(response.read(131072))
            return {'status': response.status, 'idMatches': body.get('id') == '8990a560-5720-4273-be46-5a8e9fba1169', 'active': body.get('status') == 'ACTIVE'}
    except urllib.error.HTTPError as error:
        return {'status': error.code}
    except Exception:
        return {'status': 'NETWORK_OR_RESPONSE_ERROR'}

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

# The existing service credential stays in this runner's memory and goes only to
# its existing Catalog destination. Never print its value or private response.
setting = env.get('CRAVES_INTERNAL_SERVICE_SECRET', {})
ref = setting.get('secretRef')
metadata = next((item for item in app['configuration'].get('secrets', []) if item['name'] == ref), None)
if not metadata or not metadata.get('keyVaultUrl'):
    raise SystemExit('Internal dependency probe requires the existing Key Vault reference')
secret_url = metadata['keyVaultUrl']
parsed = urlparse(secret_url)
if parsed.scheme != 'https' or not parsed.hostname.endswith('.vault.azure.net') or not parsed.path.startswith('/secrets/'):
    raise SystemExit('Unexpected Key Vault reference')
key = az('keyvault', 'secret', 'show', '--id', secret_url)['value']
catalog_id = '8990a560-5720-4273-be46-5a8e9fba1169'
origin = 'https://ca-craves-catalog-service-prodlo.happysand-aedc7165.centralindia.azurecontainerapps.io/api/v1/catalog'
gateway = 'https://apim-craves-prodlow-l3ing6.azure-api.net/api/v1/catalog'
if env.get('CRAVES_CATALOG_BASE_URL', {}).get('value') != gateway:
    raise SystemExit('Catalog destination changed; review before probing')
for label, base in [('GATEWAY', gateway), ('DIRECT', origin)]:
    print('INTERNAL_READ_' + label + ' ' + json.dumps(probe(base + '/internal/kitchens/' + catalog_id, key)))
key = None
print('PUBLIC_READ ' + json.dumps(probe(gateway + '/kitchens/' + catalog_id)))
print('DEPENDENCY_PROBE_COMPLETE: GET only; credential and private response never displayed.')
