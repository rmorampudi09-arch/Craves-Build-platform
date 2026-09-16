from pathlib import Path
import xml.etree.ElementTree as ET
reports=Path('services/order-service/target/surefire-reports')
for name,minimum in {'CheckoutOperationDatabaseTest':18,'CheckoutOperationServiceTest':5,'CheckoutOperationFingerprintTest':2,'FinancialCheckoutDatabaseTest':7,'ReferralCheckoutIntegrationDatabaseTest':12}.items():
    files=list(reports.glob('TEST-*.'+name+'.xml'))
    if len(files)!=1:raise SystemExit('Missing checkout test suite: '+name)
    counts=ET.parse(files[0]).getroot().attrib
    if int(counts['tests'])<minimum or any(int(counts.get(key,0)) for key in ('failures','errors','skipped')):raise SystemExit('Required checkout evidence did not pass: '+name)
print('CHECKOUT_DATABASE_EVIDENCE_VERIFIED: no skipped critical checkout suites')
