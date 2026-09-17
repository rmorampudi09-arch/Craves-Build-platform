"""Pin already-reviewed service images without rebuilding or changing configuration."""
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
TARGETS = {
    'auth': 'ca-craves-auth-service-prodlow',
    'user-chef': 'ca-craves-user-chef-service-prod',
    'order': 'ca-craves-order-service-prodlow',
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def image_plan(service, source, registry, current, reviewed_digest):
    require(service in TARGETS, 'Unexpected backend service')
    require(bool(re.fullmatch(r'[0-9a-f]{40}', source)), 'Exact reviewed source required')
    require(bool(re.fullmatch(r'[a-z0-9]+\.azurecr\.io', registry)), 'Unexpected registry')
    require(bool(re.fullmatch(r'sha256:[0-9a-f]{64}', reviewed_digest)), 'Reviewed digest unavailable')
    repository = f'{registry}/craves/{service}-service'
    pinned = repository + '@' + reviewed_digest
    require(current in (repository + ':' + source, pinned), 'Current backend is not the reviewed image')
    return pinned, current != pinned


def execute(sources, read, deploy, registry, group):
    require(set(sources) == set(TARGETS), 'Complete source inventory required')
    plans = []
    # Resolve EVERY dependency before the first write; unknown images never get
    # silently replaced. Existing deployment helper verifies all other runtime
    # settings, identity, Key Vault references, readiness and rollback.
    for service, app in TARGETS.items():
        current = read(['containerapp', 'show', '-g', group, '-n', app,
                        '--query', 'properties.template.containers[0].image', '-o', 'tsv'])
        digest = read(['acr', 'repository', 'show', '--name', registry.split('.')[0],
                       '--image', f'craves/{service}-service:{sources[service]}', '--query', 'digest', '-o', 'tsv'])
        pinned, changed = image_plan(service, sources[service], registry, current, digest)
        plans.append((service, app, current, pinned, changed))
    for service, app, original, pinned, changed in plans:
        if changed:
            current = read(['containerapp', 'show', '-g', group, '-n', app,
                            '--query', 'properties.template.containers[0].image', '-o', 'tsv'])
            require(current == original, 'Backend changed after pin review; stop and inspect')
            deploy(group, app, pinned, service)
        print(f'PINNED: {service} source={sources[service]} image={pinned} updated={changed}')


def main():
    expected = os.environ.get('EXPECTED_RELEASE_SHA', '')
    require(bool(re.fullmatch('[0-9a-f]{40}', expected)), 'Exact Admin release required')
    require(subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip() == expected,
            'Pinning checkout differs from reviewed Admin source')
    spec = importlib.util.spec_from_file_location('backend_gate', Path(__file__).with_name('verify-backend-release.py'))
    gate = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gate)
    sources = gate.verify(ROOT, json.loads((ROOT/'docs/admin/explorer/backend-release.json').read_text()))
    require(isinstance(sources, dict), 'Independent source inventory required')
    group = os.environ.get('RG', '')
    acr = os.environ.get('ACR', '')
    require(group == 'rg-craves-prodlow-centralindia' and acr == 'cravesprodlowacr82121', 'Unexpected production target')
    def read(args):
        return subprocess.check_output(['az', *args, '--only-show-errors'], text=True).strip()
    registry = read(['acr', 'show', '--name', acr, '--query', 'loginServer', '-o', 'tsv'])
    require(registry == acr + '.azurecr.io', 'Registry ownership differs')
    def deploy(rg, app, image, service):
        subprocess.run(['bash', str(ROOT/'scripts/release/deploy-single-service-preserve-runtime.sh'),
                        rg, app, image, service], cwd=ROOT, check=True)
    execute(sources, read, deploy, registry, group)


if __name__ == '__main__':
    main()
