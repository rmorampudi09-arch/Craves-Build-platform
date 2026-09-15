#!/usr/bin/env python3
"""Fail release evidence when a required suite is absent, failed, errored or skipped."""
import json
from pathlib import Path
import xml.etree.ElementTree as E
required = {
 'auth-service': {'ReferralAccessTest':6,'ReferralAttributionTest':5,'ReferralEnrollmentDatabaseTest':5,'ReferralSourceOutboxDatabaseTest':7},
 'order-service': {'ReferralSourceOutboxDatabaseTest':7,'FinancialCheckoutDatabaseTest':7,'ReferralCheckoutIntegrationDatabaseTest':12,'ReferralBenefitsOwnerDatabaseTest':20},
}
summary={'status':'PASS','scope':'Deployed Auth/Order baseline with referral-only changes and disposable PostgreSQL; no Azure deployment or provider payment', 'services':{}}
for service,names in required.items():
 files=list((Path('services')/service/'target').glob('*reports/TEST-*.xml'))
 suites=[E.parse(p).getroot() for p in files]
 assert suites, f'No evidence: {service}'
 for suite in suites:
  assert int(suite.get('failures','0'))==0 and int(suite.get('errors','0'))==0, suite.get('name')
 for name,minimum in names.items():
  found=[s for s in suites if s.get('name','').endswith('.'+name)]
  assert len(found)==1, f'Missing/duplicate required suite: {service}/{name}'
  suite=found[0]
  assert int(suite.get('tests','0'))>=minimum and int(suite.get('skipped','0'))==0, f'Incomplete required suite: {name}'
 summary['services'][service]={key:sum(int(s.get(key,'0')) for s in suites) for key in ['tests','failures','errors','skipped']}
Path('target').mkdir(exist_ok=True)
Path('target/referral-owner-compatible-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
