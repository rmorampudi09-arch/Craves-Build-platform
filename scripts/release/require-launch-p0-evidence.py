"""Scoped P0 regression evidence, not whole-platform launch approval."""
import argparse
import hashlib
import json
import re
import subprocess
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

REQUIRED={'SubscriptionMigrationDatabaseTest':2,'SubscriptionSchemaSnapshotTest':8,'SubscriptionDocumentSourceDbTest':5}


def verify(reports, expected, actual):
    if not re.fullmatch('[a-f0-9]{40}',expected) or actual != expected:
        raise ValueError('Evidence source does not match the exact reviewed commit')
    files=sorted(Path(reports).glob('TEST-*.xml'))
    if not files:raise ValueError('Missing test evidence')
    suites={}; tests=0; hashes={}
    for file in files:
        root=ET.parse(file).getroot();name=root.attrib['name'].split('.')[-1]
        if name in suites:raise ValueError('Duplicate suite identity')
        cases=root.findall('testcase');declared=int(root.attrib['tests'])
        if declared!=len(cases) or declared<=0:raise ValueError('Empty or inconsistent suite')
        if any(int(root.attrib.get(k,0)) for k in ('failures','errors','skipped')) or any(c.find(k) is not None for c in cases for k in ('failure','error','skipped')):
            raise ValueError('Failed or skipped suite: '+name)
        suites[name]=declared;tests+=declared;hashes[file.name]=hashlib.sha256(file.read_bytes()).hexdigest()
    for name,minimum in REQUIRED.items():
        if suites.get(name,0)<minimum:raise ValueError('Missing or incomplete required suite: '+name)
    if tests<62:raise ValueError('Incomplete subscription service regression')
    return {'sourceSha':expected,'scope':'P0 subscription service ONLY','tests':tests,'suites':suites,
            'reportSha256':hashes,'skipped':0,'wholePlatformAccepted':False,
            'recordedAt':datetime.now(timezone.utc).isoformat()}


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--expected-sha',required=True)
    parser.add_argument('--output',required=True);args=parser.parse_args()
    actual=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
    evidence=verify('services/subscription-service/target/surefire-reports',args.expected_sha,actual)
    output=Path(args.output);output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(evidence,indent=2,sort_keys=True)+'\n',encoding='utf-8')
    print('P0_REQUIRED_EVIDENCE_PASSED: '+str(evidence['tests'])+' tests; no skips; source='+actual)
