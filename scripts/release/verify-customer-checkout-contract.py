import json
from pathlib import Path
import subprocess
root=Path(__file__).resolve().parents[2]
manifest=json.loads((root/'scripts/release/device-cart-live-contract.json').read_text())
for path,expected in manifest['files'].items():
    actual=subprocess.check_output(['git','hash-object','--',path],cwd=root,text=True).strip()
    if actual!=expected:raise SystemExit('Live contract changed: '+path)
prefix='services/order-service/src/main/resources/db/migration/'
previous={name for name in manifest['files'] if name.startswith(prefix)}
current={str(path.relative_to(root)).replace('\\','/') for path in (root/prefix).glob('*.sql')}
if current!=previous|{prefix+'V33__checkout_operation_recovery.sql'}:raise SystemExit('Unreviewed checkout migration set')
print('CHECKOUT_LIVE_CONTRACT_PRESERVED: existing source and migrations unchanged; additive V33 only')
