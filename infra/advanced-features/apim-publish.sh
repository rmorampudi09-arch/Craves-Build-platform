#!/usr/bin/env bash
# Publish the advanced-features APIs on the production gateway from infra/apim/advanced-features/routes.txt.
# Declarative and scoped: it only touches APIs whose id starts with craves-adv-; it refuses to take a path another API owns.
# Run in Azure Cloud Shell from a checkout (or a curl of this folder). DRY_RUN=true prints the plan only.
#   bash infra/advanced-features/apim-publish.sh              publish everything in routes.txt
#   bash infra/advanced-features/apim-publish.sh --remove ID  remove one craves-adv-* API (rollback)
set -euo pipefail
SUB=34eefd95-1a19-416f-b9df-92b326500615
APIM_RG=rg-craves-shared-prod
APIM=apim-craves-prod-34eefd
APP_RG=rg-craves-advanced-prod
APP=ca-craves-advanced-prod
VERSION=2022-08-01
HERE=$(cd "$(dirname "$0")" && pwd)
ROUTES=${ROUTES:-$HERE/../apim/advanced-features/routes.txt}
POLICIES=${POLICIES:-$HERE/../apim/advanced-features}
DRY_RUN=${DRY_RUN:-false}

az account set -s "$SUB"
BASE="https://management.azure.com/subscriptions/$SUB/resourceGroups/$APIM_RG/providers/Microsoft.ApiManagement/service/$APIM"

if [ "${1:-}" = "--remove" ]; then
  id=${2:?api id}
  [[ "$id" == craves-adv-* ]] || { echo "Only craves-adv-* APIs can be removed here"; exit 2; }
  az rest --method delete --url "$BASE/apis/$id?api-version=$VERSION&deleteRevisions=true" -o none
  echo "Removed $id"; exit 0
fi

FQDN=$(az containerapp show -g "$APP_RG" -n "$APP" --query properties.configuration.ingress.fqdn -o tsv)
[ -n "$FQDN" ] || { echo "Container app $APP has no ingress yet"; exit 1; }
echo "Backend: https://$FQDN"

# Existing API paths, to refuse taking a path another API already serves.
az rest --method get --url "$BASE/apis?api-version=$VERSION&\$top=500" --query "value[].{id:name,path:properties.path}" -o json > /tmp/adv-apis.json

python3 - "$ROUTES" "$POLICIES" "$FQDN" "$BASE" "$VERSION" "$DRY_RUN" <<'PY'
import json, re, subprocess, sys, tempfile
routes, policies, fqdn, base, version, dry = sys.argv[1:7]
dry = dry == 'true'
existing = {a['path'].strip('/'): a['id'] for a in json.load(open('/tmp/adv-apis.json'))}
apis, ops = {}, {}
for raw in open(routes, encoding='utf-8'):
    line = raw.strip()
    if not line or line.startswith('#'):
        continue
    parts = line.split('|')
    if parts[0] == 'api':
        _, api_id, path, name, module = parts
        apis[api_id] = (path, name, module)
        ops[api_id] = []
    elif parts[0] == 'route':
        _, api_id, op, method, template, policy = parts
        ops[api_id].append((op, method, template, policy))

def rest(method, url, body=None):
    if dry:
        print(f'DRY {method.upper()} {url.replace(base, "")}')
        return '{}'
    cmd = ['az', 'rest', '--method', method, '--url', url, '-o', 'json']
    if body is not None:
        f = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False)
        json.dump(body, f); f.close()
        cmd += ['--body', '@' + f.name, '--headers', 'Content-Type=application/json', 'If-Match=*']
    out = subprocess.run(cmd, capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit(f'FAILED {method} {url}: {out.stderr.strip()[:500]}')
    return out.stdout

for api_id, (path, name, module) in apis.items():
    owner = existing.get(path)
    if owner and owner != api_id:
        sys.exit(f'Path {path} already belongs to API {owner}; refusing to publish {api_id}')
    if not api_id.startswith('craves-adv-'):
        sys.exit(f'Refusing non craves-adv- API id {api_id}')
    rest('put', f'{base}/apis/{api_id}?api-version={version}', {'properties': {
        'displayName': name, 'path': path, 'protocols': ['https'], 'serviceUrl': f'https://{fqdn}/{path}',
        'subscriptionRequired': False, 'apiType': 'http',
        'description': f'advanced-features-service module {module}; contract contracts/openapi/advanced/{module}-v1.yaml'}})
    current = set()
    if not dry and owner:
        listing = json.loads(rest('get', f'{base}/apis/{api_id}/operations?api-version={version}&$top=500'))
        current = {o['name'] for o in listing.get('value', [])}
    wanted = set()
    for op, method, template, policy in ops[api_id]:
        wanted.add(op)
        params = [{'name': p, 'type': 'string', 'required': True} for p in re.findall(r'{([A-Za-z0-9_]+)}', template)]
        rest('put', f'{base}/apis/{api_id}/operations/{op}?api-version={version}', {'properties': {
            'displayName': f'{method} {template}', 'method': method, 'urlTemplate': template, 'templateParameters': params}})
        xml = open(f'{policies}/{policy}-policy.xml', encoding='utf-8').read()
        rest('put', f'{base}/apis/{api_id}/operations/{op}/policies/policy?api-version={version}',
             {'properties': {'format': 'rawxml', 'value': xml}})
        print(f'{api_id:34} {method:6} /{path}{template if template != "/" else ""}  [{policy}]')
    for stale in sorted(current - wanted):
        rest('delete', f'{base}/apis/{api_id}/operations/{stale}?api-version={version}')
        print(f'{api_id:34} removed stale operation {stale}')
print(f'{"Planned" if dry else "Published"}: {len(apis)} APIs, {sum(len(v) for v in ops.values())} operations')
PY
