#!/usr/bin/env python3
"""CI-only dormant image smoke check. Builds/runs one temporary local container.
No Azure login, registry push, database connection or provider request. No real credentials.
"""
from pathlib import Path
import json
import os
import subprocess
import time
import urllib.error
import urllib.request
import uuid

if os.environ.get('GITHUB_ACTIONS') != 'true' or os.environ.get('REFERRAL_TEST_CONFIRM') != 'YES_DISPOSABLE_REFERRAL_TEST_ONLY':
    raise SystemExit('STOP: this smoke check is for the isolated GitHub CI runner only')

def command(*args: str) -> str:
    return subprocess.check_output(list(args), text=True).strip()

source = command('git', 'rev-parse', 'HEAD')
image = 'craves-referral-ci:' + source[:12]
name = 'craves-referral-smoke-' + uuid.uuid4().hex[:12]
flags = ['ENABLED', 'PUBLIC_ACCESS_ENABLED', 'WORKERS_ENABLED', 'AWARDS_ENABLED',
         'SETTLEMENT_ENABLED', 'WITHDRAWALS_ENABLED', 'SPENDING_ENABLED', 'REVOCATION_ABSENCE_CONTRACT_CONFIRMED']
subprocess.run(['docker', 'build', '-t', image, 'services/referral-service'], check=True, timeout=600)
image_info = json.loads(command('docker', 'image', 'inspect', image))[0]
assert image_info['Config']['User'] == '10001:10001', 'Runtime is not the expected non-root identity'
args = ['docker', 'run', '--rm', '-d', '--name', name, '--cpus=1', '--memory=768m',
        '--cap-drop=ALL', '--security-opt=no-new-privileges', '--read-only',
        '--tmpfs=/tmp:rw,size=64m,mode=1777', '-p', '127.0.0.1::8080']
for flag in flags:
    args += ['-e', 'CRAVES_REFERRALS_' + flag + '=false']
args += [image]
started = False
try:
    command(*args)
    started = True
    info = json.loads(command('docker', 'inspect', name))[0]
    published = info['NetworkSettings']['Ports']['8080/tcp'][0]
    assert published['HostIp'] == '127.0.0.1'
    base = 'http://127.0.0.1:' + published['HostPort']
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    live = None
    for _ in range(60):
        try:
            with opener.open(base + '/actuator/health/liveness', timeout=2) as response:
                live = json.load(response)
                if live.get('status') == 'UP':
                    break
        except (OSError, ValueError):
            pass
        time.sleep(2)
    assert live and live.get('status') == 'UP', 'Dormant packaged container did not become live'
    try:
        with opener.open(base + '/api/v1/referrals/me', timeout=5) as response:
            code, body = response.status, response.read(16384)
    except urllib.error.HTTPError as response:
        code, body = response.code, response.read(16384)
    assert code == 503 and json.loads(body).get('code') == 'REFERRALS_DISABLED', 'Dormant module exposed member processing'
    receipt = {'sourceSha': source, 'imageId': image_info['Id'], 'runtimeUser': image_info['Config']['User'],
               'readOnlyRoot': True, 'publishedInterface': '127.0.0.1', 'liveness': 'UP',
               'disabledMemberStatus': code, 'allReferralFlagsOff': True,
               'productionDeployment': False, 'externalDependenciesTested': False}
    Path('services/referral-service/target/container-verification.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt, indent=2))
finally:
    if started:
        subprocess.run(['docker', 'rm', '--force', name], check=False, stdout=subprocess.DEVNULL)
