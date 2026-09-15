#!/usr/bin/env python3
"""Verify actual executed tests, same-build HTTP fixtures and the executable referral archive.
Run from the repository root after a clean Maven verify. No network or production writes.
"""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path('services/referral-service')
TARGET = ROOT / 'target'
counts = {}
suite_counts = {}
for folder, minimum in [('surefire-reports', 18), ('failsafe-reports', 39)]:
    reports = sorted((TARGET / folder).glob('TEST-*.xml'))
    assert reports, f'Missing test evidence: {folder}'
    suites = [ET.parse(path).getroot() for path in reports]
    counts[folder] = sum(int(s.attrib['tests']) for s in suites)
    assert counts[folder] >= minimum, f'Too few executed tests: {folder}'
    for suite in suites:
        assert all(int(suite.attrib.get(key, '0')) == 0 for key in ['failures', 'errors', 'skipped']), suite.attrib
        suite_counts[suite.attrib['name']] = int(suite.attrib['tests'])
for name, minimum in [('BoundaryValidationTest', 6), ('ReferralResilienceIT', 10), ('ReferralHttpContractIT', 6)]:
    assert suite_counts.get('in.craves.referral.' + name, 0) >= minimum, f'Hardening suite did not execute: {name}'

fixtures = {}
for name in ['overview', 'rewards', 'cashouts', 'admin-overview', 'policies']:
    path = TARGET / 'contract-fixtures' / (name + '.json')
    content = path.read_bytes()
    assert isinstance(json.loads(content), dict), f'Missing HTTP fixture: {name}'
    fixtures[name] = hashlib.sha256(content).hexdigest()

bom_bytes = (TARGET / 'classes/META-INF/sbom/application.cdx.json').read_bytes()
bom = json.loads(bom_bytes)
assert bom.get('bomFormat') == 'CycloneDX' and bom.get('components'), 'Missing usable SBOM'
jar_path = TARGET / 'referral-service-0.1.0-SNAPSHOT.jar'
sbom_entry = 'META-INF/sbom/application.cdx.json'
with zipfile.ZipFile(jar_path) as archive:
    names = set(archive.namelist())
    for entry in ['BOOT-INF/classes/in/craves/referral/ReferralApplication.class',
                  'BOOT-INF/classes/in/craves/referral/infra/ReferralMigrate.class',
                  'org/springframework/boot/loader/launch/JarLauncher.class']:
        assert entry in names, f'Missing executable archive entry: {entry}'
    assert any(n.startswith('BOOT-INF/lib/') and n.endswith('.jar') for n in names)
    manifest = archive.read('META-INF/MANIFEST.MF').decode('utf-8').replace('\r\n ', '').replace('\r\n', '\n')
    assert 'Main-Class: org.springframework.boot.loader.launch.JarLauncher' in manifest
    assert 'Start-Class: in.craves.referral.ReferralApplication' in manifest
    migrations = sorted((ROOT / 'src/main/resources/db/referral_migration').glob('*.sql'))
    assert len(migrations) == 9
    assert any(p.name == 'V8__discount_refund_evidence.sql' for p in migrations)
    for migration in migrations:
        assert archive.read('BOOT-INF/classes/db/referral_migration/' + migration.name) == migration.read_bytes()
    assert archive.read(sbom_entry) == bom_bytes, 'Packaged SBOM differs from verified inventory'

receipt = {'workflowRunId': os.environ.get('GITHUB_RUN_ID'),
           'sourceSha': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
           'tests': counts, 'suites': suite_counts, 'contractFixtureSha256': fixtures,
           'sbomComponents': len(bom['components']), 'sbomPackaged': True,
           'sbomArchiveEntry': sbom_entry,
           'jarSha256': hashlib.sha256(jar_path.read_bytes()).hexdigest(),
           'sbomSha256': hashlib.sha256(bom_bytes).hexdigest()}
(TARGET / 'artifact-verification.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt, indent=2))
