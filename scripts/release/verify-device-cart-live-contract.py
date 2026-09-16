import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[2]
manifest = json.loads((root / 'scripts/release/device-cart-live-contract.json').read_text())
for name, expected in manifest['files'].items():
    actual = subprocess.check_output(['git', 'hash-object', '--', name], cwd=root, text=True).strip()
    if actual != expected:
        raise SystemExit('Live contract changed: ' + name)
directory = root / 'services/order-service/src/main/resources/db/migration'
actual = {str(path.relative_to(root)).replace('\\', '/') for path in directory.glob('*.sql')}
expected = {name for name in manifest['files'] if '/db/migration/' in name}
if actual != expected:
    raise SystemExit('Migration set changed; separate database review required')
print('LIVE_CONTRACT_PRESERVED: deployed referral source and migration set unchanged')
