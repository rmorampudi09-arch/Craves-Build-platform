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
# Reviewed additions are exact artifacts, not a blanket allowance for newer migrations.
reviewed_additions = {
    'services/order-service/src/main/resources/db/migration/V33__checkout_operation_recovery.sql': '64142bffc6b682aa82ecb7649c6293af28a18842',
    'services/order-service/src/main/resources/db/migration/V34__composite_refund_completion.sql': '8098989504dee0a398f3625d4d67edc041ae7038',
}
if current != previous | set(reviewed_additions):
    raise SystemExit('Unreviewed checkout migration set')
for path, expected in reviewed_additions.items():
    actual = subprocess.check_output(['git', 'hash-object', '--', path], cwd=root, text=True).strip()
    if actual != expected:
        raise SystemExit('Reviewed checkout migration changed: ' + path)
print('CHECKOUT_LIVE_CONTRACT_PRESERVED: existing source and migrations unchanged; exact reviewed V33 and V34 additions only')
