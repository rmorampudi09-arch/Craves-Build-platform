import json
from pathlib import Path
import subprocess
root=Path(__file__).resolve().parents[2]
manifest=json.loads((Path(__file__).with_name('customer-email-live-migrations.json')).read_text())
for path,expected in manifest['files'].items():
    actual=subprocess.check_output(['git','hash-object','--',path],cwd=root,text=True).strip()
    if actual!=expected: raise SystemExit('Previously deployed migration changed: '+path)
additions={
    'auth-service':{'V15__authoritative_email_verification.sql','V16__postgres_auth_rate_limits.sql'},
    'notification-service':{'V7__auth_email_verification_receipts.sql'},
    'user-chef-service':{'V12__authoritative_auth_email_projection.sql'},
}
for service,names in additions.items():
    prefix='services/'+service+'/src/main/resources/db/migration/'
    previous={name for name in manifest['files'] if name.startswith(prefix)}
    current={str(path.relative_to(root)).replace('\\','/') for path in (root/prefix).glob('*.sql')}
    if current != previous | {prefix+name for name in names}: raise SystemExit('Unexpected migration set: '+service)
print('EMAIL_LIVE_MIGRATIONS_PRESERVED: existing hashes exact; reviewed additive changes only')
