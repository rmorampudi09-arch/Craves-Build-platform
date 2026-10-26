"""Fails when a retired Azure name (old subscription, its resources, DevOps org or service connection) is back in a tracked file.

Current and retired names: docs/runbooks/production-environment.md.
"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RUNBOOK = 'docs/runbooks/production-environment.md'
RETIRED = re.compile(
    r'4f897b61|l3ing6|cravesprodlowacr82121|Craves-Dev-Service-Connection|ravitejamorampudi7777'
    r'|happysand-aedc7165|6ac26780-f774-41e0-bf31-45f5e6e7167d',
    re.IGNORECASE,
)
# Dated docs under docs/ that describe the retired environment start with this line.
BANNER = '> Historical: written for the retired subscription 4f897b61'
# Files that keep a retired name on purpose, with the reason.
ALLOWED = {
    'AGENTS.md': 'says what is retired',
    'scripts/release/tests/test_no_retired_azure_names.py': 'this check',
    'apps/mobile/src/core/config/runtimeConfig.ts': 'sends a build still configured with the retired APIM host to api.craves.in',
    'apps/mobile/src/core/config/runtimeConfig.test.ts': 'tests that mapping',
    'services/catalog-service/src/test/java/in/craves/catalog/service/LegacyMenuImageRelocatorTest.java': 'menu image URLs saved before the move',
    'docs/launch-closure/evidence/applied-email-history-39094.json': 'run evidence from the retired DevOps org',
    'docs/launch-closure/evidence/email-health-39098.json': 'run evidence from the retired DevOps org',
}


def offenders():
    listing = subprocess.run(['git', 'ls-files', '-z'], cwd=ROOT, check=True, capture_output=True).stdout
    found = []
    for name in filter(None, listing.decode().split('\0')):
        path = ROOT / name
        if name in ALLOWED or not path.is_file():
            continue
        data = path.read_bytes()
        if b'\0' in data[:8192]:
            continue
        text = data.decode('utf-8', 'ignore')
        if name == RUNBOOK:
            text = text.split('## Retired', 1)[0]
        elif name.startswith('docs/') and name.endswith('.md') and text.startswith(BANNER):
            continue
        if RETIRED.search(text):
            found.append(name)
    return found


class NoRetiredAzureNames(unittest.TestCase):
    def test_retired_names_stay_out(self):
        self.assertEqual(offenders(), [], f'Retired Azure names are back; use the current names in {RUNBOOK}')

    def test_pattern_and_allow_list(self):
        self.assertTrue(RETIRED.search('https://kvCravesProdlowL3ING6.vault.azure.net'))
        self.assertFalse(RETIRED.search('kvcravesprodlowkmqgfy cravesrm09prodlow6bf632 Craves-RMORAMPUDI09-Service-Connection'))
        self.assertIn('## Retired', (ROOT / RUNBOOK).read_text())
        for name in ALLOWED:
            self.assertTrue((ROOT / name).is_file(), f'{name} is allow-listed but no longer exists; remove it from ALLOWED')


if __name__ == '__main__':
    unittest.main()
