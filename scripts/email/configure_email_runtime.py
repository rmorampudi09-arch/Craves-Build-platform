#!/usr/bin/env python3
"""Configure approved email secrets on existing resources, with all new gates closed."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse

# Reuse only the existing generic Azure/environment/drift validation utilities.
# No finance desired settings, finance keys or finance mutation entry point run.
spec = importlib.util.spec_from_file_location('runtime_guard', Path(__file__).resolve().parents[1] / 'finance/configure_bank_runtime.py')
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)
az = guard.az
RG = 'rg-craves-prodlow-centralindia'
PURPOSE = 'craves-email-verification-v1'
APPS = {
    'auth': 'ca-craves-auth-service-prodlow',
    'user-chef': 'ca-craves-user-chef-service-prod',
    'notification': 'ca-craves-notification-service-p',
}
IMAGES = {
    'auth': 'cravesprodlowacr82121.azurecr.io/craves/auth-service:referral-151c36cb2afaaf7b8482ee784704d983f7d87324',
    'user-chef': 'cravesprodlowacr82121.azurecr.io/craves/user-chef-service@sha256:fa546c94af8eb329593d158589e0bffee96e19d6f84a55f937032de1f74fa93d',
    'notification': 'cravesprodlowacr82121.azurecr.io/craves/notification-service@sha256:bb15cc81121173ef2c701f2edc4e967a7cf7ed4fb26f5e5cb4fae1d777145b44',
}
KEYS = {
    'email-verification-hmac': 'craves-email-verification-hmac-v1',
    'email-verification-transport': 'craves-email-verification-transport-v1',
    'email-projection-internal': 'craves-email-projection-internal-v1',
}


def require(value, message):
    if not value:
        raise guard.GuardError(message)


def desired(apps):
    return {
        'auth': {
            'CRAVES_EMAIL_VERIFICATION_ENABLED': 'false',
            'CRAVES_EMAIL_VERIFICATION_HMAC_KEY': 'secretref:email-verification-hmac',
            'CRAVES_EMAIL_VERIFICATION_INTERNAL_KEY': 'secretref:email-verification-transport',
            'CRAVES_EMAIL_NOTIFICATION_BASE_URL': guard.origin(apps['notification']),
            'CRAVES_EMAIL_PROJECTION_WORKER_ENABLED': 'false',
            'CRAVES_EMAIL_PROJECTION_INTERNAL_KEY': 'secretref:email-projection-internal',
            'CRAVES_EMAIL_USER_CHEF_BASE_URL': guard.origin(apps['user-chef']),
            'CRAVES_EMAIL_VERIFICATION_ALLOW_LOCAL_HTTP': 'false',
        },
        'user-chef': {'CRAVES_EMAIL_PROJECTION_INTERNAL_KEY': 'secretref:email-projection-internal'},
        'notification': {
            'CRAVES_EMAIL_VERIFICATION_TRANSPORT_ENABLED': 'false',
            'CRAVES_EMAIL_VERIFICATION_INTERNAL_KEY': 'secretref:email-verification-transport',
        },
    }


def healthy(app):
    props = app['properties']
    require(props['runningStatus'] == 'Running' and props['latestRevisionName'] == props['latestReadyRevisionName'], 'Service revision is not ready')
    request = urllib.request.Request(guard.origin(app) + '/actuator/health')
    with urllib.request.urlopen(request, timeout=20) as response:
        require(response.status == 200, 'Service health check failed')


def secret_metadata(vault, name):
    # Never request or output the value field.
    return az('keyvault', 'secret', 'show', '--vault-name', vault, '--name', name,
              '--query', '{id:id,enabled:attributes.enabled,expires:attributes.expires,tags:tags}')


def validate_metadata(metadata):
    require(metadata.get('enabled') is True and (metadata.get('tags') or {}).get('craves-purpose') == PURPOSE,
            'Existing email key is disabled or has different provenance; no rotation allowed')
    require(metadata.get('expires') is None, 'Existing email key has an expiry requiring separate rotation review')
    return metadata['id']


def existing_vault_identity(app, vault):
    identity = guard.existing_identity(app, vault)
    refs = [s for s in app['properties']['configuration'].get('secrets', [])
            if urlparse(s.get('keyVaultUrl', '')).hostname == vault + '.vault.azure.net' and s.get('identity') == identity]
    require(refs, 'Service has no existing Key Vault binding with this identity; review permissions before adding access')
    return identity


def used_secrets(wanted):
    return {value.removeprefix('secretref:') for value in wanted.values() if value.startswith('secretref:')}


def check_secret_slots(app, used, metadata, identity):
    entries = {entry['name']: entry for entry in app['properties']['configuration'].get('secrets', [])}
    for local in used:
        if local not in entries:
            continue
        require(local in metadata, 'Existing app secret has no matching reviewed Key Vault metadata')
        expected = {'name': local, 'keyVaultUrl': metadata[local]['id'], 'identity': identity}
        actual = dict(entries[local])
        if actual.get('value') in (None, ''):
            actual.pop('value', None)
        require(actual == expected, 'Existing app secret reference differs; it will not be replaced')


def preflight():
    apps = {role: az('containerapp', 'show', '-g', RG, '-n', name) for role, name in APPS.items()}
    for role, app in apps.items():
        guard.environment(app)
        require(app['properties']['template']['containers'][0]['image'] == IMAGES[role], 'Live service image changed; reconcile release source first')
        healthy(app)
    vault = guard.select_vault(apps, None)
    az('keyvault', 'show', '--name', vault, '--query', 'id')
    identities = {role: existing_vault_identity(app, vault) for role, app in apps.items()}
    listing = az('keyvault', 'secret', 'list', '--vault-name', vault, '--query', '[].{id:id,tags:tags}')
    known = {urlparse(item['id']).path.split('/')[2]: item for item in listing}
    for name, item in known.items():
        if (item.get('tags') or {}).get('craves-purpose') == PURPOSE:
            require(name in KEYS.values(), 'Another email key with this purpose exists; inspect for compatible reuse')
    metadata = {}
    for local, name in KEYS.items():
        if name in known:
            metadata[local] = secret_metadata(vault, name)
            validate_metadata(metadata[local])
    wanted = desired(apps)
    for role, app in apps.items():
        guard.check_env(app, wanted[role])
        check_secret_slots(app, used_secrets(wanted[role]), metadata, identities[role])
        print('Validated existing service, image, vault identity and closed gates: ' + APPS[role])
    print(f'Existing vault: {vault}; compatible email keys present: {len(metadata)}/3; no secret values displayed')
    return apps, vault, identities, metadata, wanted


def create_missing_key(vault, name):
    # Recheck immediately before creating; a concurrent creation stops instead of rotating it.
    ids = az('keyvault', 'secret', 'list', '--vault-name', vault, '--query', '[].id')
    names = {urlparse(item).path.split('/')[2] for item in ids}
    require(name not in names, 'Email key appeared concurrently; rerun preflight, do not rotate')
    with tempfile.TemporaryDirectory(prefix='craves-email-key-') as folder:
        path = Path(folder) / 'secret'
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'w') as stream:
            stream.write(secrets.token_urlsafe(48))
        az('keyvault', 'secret', 'set', '--vault-name', vault, '--name', name,
           '--file', str(path), '--encoding', 'utf-8', '--tags', 'craves-purpose=' + PURPOSE, output='none')
    return secret_metadata(vault, name)


def configure(plan):
    apps, vault, identities, metadata, wanted = plan
    # Validate all target apps again before creating keys or changing any binding.
    baselines = {role: guard.stable(app, set(wanted[role]), used_secrets(wanted[role])) for role, app in apps.items()}
    for role, name in APPS.items():
        current = az('containerapp', 'show', '-g', RG, '-n', name)
        require(guard.stable(current, set(wanted[role]), used_secrets(wanted[role])) == baselines[role], 'Concurrent runtime change before secure setup')
        guard.check_env(current, wanted[role])
        check_secret_slots(current, used_secrets(wanted[role]), metadata, identities[role])
    for local, name in KEYS.items():
        if local not in metadata:
            metadata[local] = create_missing_key(vault, name)
        validate_metadata(metadata[local])
    for role in ('notification', 'user-chef', 'auth'):
        name = APPS[role]
        current = az('containerapp', 'show', '-g', RG, '-n', name)
        used = used_secrets(wanted[role])
        require(guard.stable(current, set(wanted[role]), used) == baselines[role], 'Concurrent unrelated runtime change; stop configuration')
        guard.check_env(current, wanted[role])
        check_secret_slots(current, used, metadata, identities[role])
        current_names = {item['name'] for item in current['properties']['configuration'].get('secrets', [])}
        additions = [local + '=keyvaultref:' + metadata[local]['id'] + ',identityref:' + identities[role] for local in sorted(used) if local not in current_names]
        if additions:
            az('containerapp', 'secret', 'set', '-g', RG, '-n', name, '--secrets', *additions, output='none')
        missing = [key + '=' + value for key, value in wanted[role].items() if key not in guard.environment(current)]
        if missing:
            az('containerapp', 'update', '-g', RG, '-n', name,
               '--container-name', current['properties']['template']['containers'][0]['name'], '--set-env-vars', *missing, output='none')
        for attempt in range(24):
            after = az('containerapp', 'show', '-g', RG, '-n', name)
            require(guard.stable(after, set(wanted[role]), used) == baselines[role], 'Unrelated runtime drift after configuration; stop release')
            guard.check_env(after, wanted[role])
            check_secret_slots(after, used, metadata, identities[role])
            require(used.issubset({item['name'] for item in after['properties']['configuration'].get('secrets', [])}), 'Required secret references were not materialized')
            require(set(wanted[role]).issubset(guard.environment(after)), 'Required email settings were not materialized')
            try:
                healthy(after)
                break
            except (guard.GuardError, urllib.error.URLError, TimeoutError):
                if attempt == 23:
                    raise guard.GuardError('Configured service not ready; keep capability closed and inspect revision')
                time.sleep(5)
        print('Verified healthy, original image/settings preserved, email gates closed: ' + name)
    print('Approved secure bindings configured. Email verification is NOT activated or functionally certified.')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--expected-source-sha')
    args = parser.parse_args(argv)
    if args.apply:
        head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
        require(args.expected_source_sha == head and len(head) == 40, 'Apply requires exact reviewed source SHA')
        require(os.name == 'posix', 'Secure apply requires the reviewed Linux runner with private temporary-file permissions')
    plan = preflight()
    if args.apply:
        configure(plan)
    else:
        print('PLAN ONLY: no key creation, setting change, new permission, resource creation or provider call')


if __name__ == '__main__':
    try:
        main()
    except (guard.GuardError, subprocess.SubprocessError, OSError, KeyError, ValueError) as error:
        print('Email setup stopped: ' + (str(error) if isinstance(error, guard.GuardError) else type(error).__name__))
        raise SystemExit(1)

