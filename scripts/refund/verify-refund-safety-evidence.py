#!/usr/bin/env python3
"""Fail closed if a required refund suite is absent, failed or skipped."""
import json
from pathlib import Path
import xml.etree.ElementTree as ET

REQUIRED = {
 'RazorpayRefundClientTest':21,
 'RefundExecutionWorkerTest':13,
 'RefundProductionReadinessServiceTest':3,
 'RefundProductionApprovalDefaultsTest':1,
 'RefundDispatchDatabaseTest':16,
 'RefundMigrationDatabaseTest':1,
 'RefundRequestServiceTest':2,
 'RefundStatusEventFactoryTest':1,
 'RefundEventValidatorTest':3,
 'RefundWorkflowPropertiesTest':1,
}

def verify(root):
 result=[]
 for name,minimum in REQUIRED.items():
  files=list(root.glob('TEST-*.'+name+'.xml'))
  if len(files)!=1:raise ValueError('Missing or duplicated suite: '+name)
  attributes=ET.parse(files[0]).getroot().attrib
  row={key:int(attributes.get(key,'0')) for key in ['tests','failures','errors','skipped']}
  if row['tests']<minimum or any(row[k] for k in ['failures','errors','skipped']):raise ValueError('Required suite failed or skipped: '+name)
  result.append({'suite':name,**row,'durationSeconds':attributes.get('time'),'evidenceFile':str(files[0])})
 return {'status':'PASS','suites':result,'tests':sum(x['tests'] for x in result),'failed':0,'requiredSkipped':0}

if __name__=='__main__':
 root=Path('services/integration-service/target/surefire-reports')
 result=verify(root)
 destination=Path('target/refund-safety/test-results.json');destination.parent.mkdir(parents=True,exist_ok=True)
 destination.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'status':result['status'],'tests':result['tests'],'requiredSkipped':0}))
