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


# Azure DevOps pipelines turned off on 27 Oct 2026 (they run old Azure Repos copies). A tracked file that
# names one must carry PIPELINE_NOTE pointing at the replacement, so people and agents don't revive them.
RETIRED_PIPELINES = re.compile(
    r'definitionId=(?:3|4|6|7|8|9|10|11|14|20|21)\b|Craves \(14\)|Craves-RMORAMPUDI09-(?:Product-Activation|Finance-Referral-Completion)'
    r'|Craves-Referral-Chef\b(?!-Release)|Craves-Admin-Portal-Fix|Craves-Borzo-Secret-Binding'
    r'|Craves-(?:Order|Integration)-Delivery-120s|Craves-Delivery-(?:Production-Activation|Borzo-Pidge-CI)'
)
PIPELINE_NOTE = 'Pipelines changed 27 Oct 2026'


def tracked():
    listing = subprocess.run(['git', 'ls-files', '-z'], cwd=ROOT, check=True, capture_output=True).stdout
    for name in filter(None, listing.decode().split('\0')):
        path = ROOT / name
        if not path.is_file():
            continue
        data = path.read_bytes()
        if b'\0' not in data[:8192]:
            yield name, data.decode('utf-8', 'ignore')


def pipeline_offenders():
    return [name for name, text in tracked()
            if name not in (RUNBOOK, 'scripts/release/tests/test_no_retired_azure_names.py')
            and not text.startswith(BANNER) and RETIRED_PIPELINES.search(text) and PIPELINE_NOTE not in text]


def offenders():
    found = []
    for name, text in tracked():
        if name in ALLOWED:
            continue
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

    def test_retired_pipelines_carry_the_pointer(self):
        self.assertEqual(pipeline_offenders(), [],
                         f'These name a turned-off Azure DevOps pipeline; add a "> **{PIPELINE_NOTE}.**" line with the replacement from {RUNBOOK}')
        self.assertTrue(RETIRED_PIPELINES.search('Run Craves (14) or _build?definitionId=20'))
        self.assertTrue(RETIRED_PIPELINES.search('pipeline Craves-Referral-Chef'))
        self.assertFalse(RETIRED_PIPELINES.search('Craves-Referral-Chef-Release definitionId=23 definitionId=17'))

    def test_pattern_and_allow_list(self):
        self.assertTrue(RETIRED.search('https://kvCravesProdlowL3ING6.vault.azure.net'))
        self.assertFalse(RETIRED.search('kvcravesprodlowkmqgfy cravesrm09prodlow6bf632 Craves-RMORAMPUDI09-Service-Connection'))
        self.assertIn('## Retired', (ROOT / RUNBOOK).read_text())
        for name in ALLOWED:
            self.assertTrue((ROOT / name).is_file(), f'{name} is allow-listed but no longer exists; remove it from ALLOWED')


if __name__ == '__main__':
    unittest.main()
