"""Align an unused Redis health indicator with the existing disabled feature; no auth change."""
import argparse
import importlib.util
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request

spec = importlib.util.spec_from_file_location('email_runtime', Path(__file__).with_name('configure_email_runtime.py'))
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)
SETTING = 'MANAGEMENT_HEALTH_REDIS_ENABLED'
NAME = runtime.APPS['notification']


def validate(app):
    env = runtime.guard.environment(app)
    runtime.require(app['properties']['template']['containers'][0]['image'] == runtime.IMAGES['notification'], 'Notification image changed; re-audit Redis consumers first')
    runtime.require(env.get('CRAVES_TOKEN_REVOCATION_ENABLED', {}).get('value') == 'false', 'Revocation must already be explicitly disabled; this script never disables it')
    for key in env:
        runtime.require(not key.startswith(('SPRING_DATA_REDIS_', 'SPRING_REDIS_')), 'Redis is configured; do not hide a real dependency failure')
    for key in ('SPRING_APPLICATION_JSON', 'SPRING_CONFIG_IMPORT', 'SPRING_CONFIG_LOCATION'):
        runtime.require(key not in env, 'Additional configuration sources require review')
    # Source6691aa2 has only application.yml and no @Profile beans; live metadata
    # confirms exactly prod. Do not permit arbitrary profiles or external imports.
    runtime.guard.check_env(app, {'SPRING_PROFILES_ACTIVE': 'prod'})
    runtime.require(not any(key.startswith('SPRING_PROFILES_') and key != 'SPRING_PROFILES_ACTIVE' for key in env), 'Additional profile configuration requires review')
    for key in ('JAVA_TOOL_OPTIONS', 'JAVA_OPTS', 'JDK_JAVA_OPTIONS'):
        value = env.get(key, {}).get('value', '')
        runtime.require('redis' not in value.lower() and 'revocation' not in value.lower() and not env.get(key, {}).get('secretRef'), 'Java property overrides require review')
    container = app['properties']['template']['containers'][0]
    runtime.require(not container.get('command') and not container.get('args'), 'Custom startup arguments require review')
    runtime.guard.check_env(app, {SETTING: 'false'})
    props = app['properties']
    runtime.require(props['runningStatus'] == 'Running' and props['latestRevisionName'] == props['latestReadyRevisionName'], 'Notification revision is not ready')


def probe(url):
    try:
        with urllib.request.urlopen(url, timeout=20) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--expected-source-sha')
    args = parser.parse_args(argv)
    if args.apply:
        head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
        runtime.require(args.expected_source_sha == head and len(head) == 40, 'Apply requires exact reviewed source SHA')
    before = runtime.az('containerapp', 'show', '-g', runtime.RG, '-n', NAME)
    validate(before)
    origin = runtime.guard.origin(before)
    for group in ('liveness', 'readiness'):
        runtime.require(probe(origin + '/actuator/health/' + group) == 200, 'Notification probe failed; do not modify health configuration')
    print('Verified pinned source image, explicitly disabled Redis feature, no Redis connection config, healthy lifecycle probes')
    if not args.apply:
        print('PLAN ONLY: only proposed change is MANAGEMENT_HEALTH_REDIS_ENABLED=false; no authentication settings change')
        return
    baseline = runtime.guard.stable(before, {SETTING}, set())
    current = runtime.az('containerapp', 'show', '-g', runtime.RG, '-n', NAME)
    validate(current)
    runtime.require(runtime.guard.stable(current, {SETTING}, set()) == baseline, 'Concurrent unrelated runtime change')
    if SETTING not in runtime.guard.environment(current):
        runtime.az('containerapp', 'update', '-g', runtime.RG, '-n', NAME, '--container-name', current['properties']['template']['containers'][0]['name'], '--set-env-vars', SETTING + '=false', output='none')
    for attempt in range(30):
        after = runtime.az('containerapp', 'show', '-g', runtime.RG, '-n', NAME)
        runtime.require(runtime.guard.stable(after, {SETTING}, set()) == baseline, 'Unrelated settings changed after health alignment')
        try:
            validate(after)
            runtime.require(SETTING in runtime.guard.environment(after), 'Health setting missing')
            runtime.healthy(after)
            print('Verified Notification root health200; original image, authentication settings, secrets and unrelated configuration unchanged')
            return
        except (runtime.guard.GuardError, urllib.error.URLError, TimeoutError):
            if attempt == 29:
                raise runtime.guard.GuardError('Notification root health is not200; stop release and inspect remaining dependency')
            time.sleep(5)


if __name__ == '__main__':
    try:
        main()
    except (runtime.guard.GuardError, subprocess.SubprocessError, OSError, KeyError, ValueError) as error:
        print('Notification health alignment stopped: ' + (str(error) if isinstance(error, runtime.guard.GuardError) else type(error).__name__))
        raise SystemExit(1)

