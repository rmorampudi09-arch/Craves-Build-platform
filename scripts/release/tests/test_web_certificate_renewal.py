"""Runs infra/certificates/web-letsencrypt/renew-web-certificate.sh against fake az/dig/git (no network, no Azure).

Covers the decisions that keep craves.in served: Front Door must follow the latest Key Vault version, Azure DNS must
be the public zone, the pipeline identity must be able to write DNS and import, and renewal starts only when due.
"""
import base64
import json
import os
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / 'infra/certificates/web-letsencrypt/renew-web-certificate.sh'
SUB = '721906c9-4a72-4606-830b-d3e7ace093ff'
RG = 'rg-craves-prodlow-centralindia'
KV_ID = f'/subscriptions/{SUB}/resourceGroups/{RG}/providers/Microsoft.KeyVault/vaults/kvcravesprodlowkmqgfy'
ZONE_ID = f'/subscriptions/{SUB}/resourceGroups/{RG}/providers/Microsoft.Network/dnszones/craves.in'
AZURE_NS = ['ns1-07.azure-dns.com.', 'ns2-07.azure-dns.net.', 'ns3-07.azure-dns.org.', 'ns4-07.azure-dns.info.']
PAYLOAD = base64.urlsafe_b64encode(json.dumps({'oid': '11111111-2222-3333-4444-555555555555'}).encode()).decode().rstrip('=')

FAKE_AZ = textwrap.dedent(f'''\
    #!/usr/bin/env python3
    import json, os, shutil, sys
    a = sys.argv[1:]
    open(os.environ['FAKE_LOG'], 'a').write('az ' + ' '.join(a) + '\\n')
    s = json.loads(os.environ['FAKE_SCENARIO'])
    q = a[a.index('--query') + 1] if '--query' in a else ''
    def out(v): print(v if isinstance(v, str) else json.dumps(v))
    if a[:2] == ['account', 'set']: pass
    elif a[:2] == ['account', 'show']: out('{SUB}' if q == 'id' else 'tenant-1')
    elif a[:2] == ['account', 'get-access-token']: out('h.{PAYLOAD}.sig')
    elif a[:4] == ['network', 'dns', 'zone', 'list']: out({{'id': '{ZONE_ID}', 'nameServers': {AZURE_NS!r}}})
    elif a[:2] == ['keyvault', 'show']: out({{'id': '{KV_ID}', 'properties': {{'enableRbacAuthorization': True, 'accessPolicies': []}}}})
    elif a[0] == 'rest': out({{'properties': {{'parameters': {{'type': 'CustomerCertificate',
        'secretSource': {{'id': '{KV_ID}/secrets/craves-web-tls'}}, 'useLatestVersion': s.get('latest', True),
        'expirationDate': '2027-01-24T16:53:53+00:00'}}}}}})
    elif a[:3] == ['role', 'assignment', 'list']:
        print('\\n'.join(s['roles']['kv' if 'vaults' in a[a.index('--scope') + 1] else 'dns']))
    elif a[:3] == ['keyvault', 'certificate', 'show']: sys.exit(0)
    elif a[:3] == ['keyvault', 'certificate', 'download']: shutil.copy(s['cert'], a[a.index('--file') + 1])
    else: sys.exit('fake az: unexpected call ' + ' '.join(a))
''')
FAKE_DIG = textwrap.dedent('''\
    #!/usr/bin/env python3
    import json, os, sys
    s = json.loads(os.environ['FAKE_SCENARIO'])
    print('\\n'.join(s['public_ns']) if 'NS' in sys.argv else s.get('caa', ''))
''')
FAKE_GIT = '#!/usr/bin/env bash\necho "git $*" >> "$FAKE_LOG"\nexit 3\n'


class WebCertificateRenewal(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        (self.dir / 'bin').mkdir()
        for name, body in (('az', FAKE_AZ), ('dig', FAKE_DIG), ('git', FAKE_GIT)):
            path = self.dir / 'bin' / name
            path.write_text(body)
            path.chmod(0o755)
        self.log = self.dir / 'calls.log'

    def tearDown(self):
        self.tmp.cleanup()

    def cert(self, days):
        path = self.dir / f'cert-{days}.pem'
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', str(days),
                        '-subj', '/CN=craves.in', '-addext', 'subjectAltName=DNS:craves.in,DNS:www.craves.in',
                        '-keyout', str(self.dir / 'key.pem'), '-out', str(path)], check=True, capture_output=True)
        return str(path)

    def run_script(self, check_only=False, days=90, **scenario):
        scenario = {'public_ns': [ns.upper() for ns in AZURE_NS], 'cert': self.cert(days),
                    'roles': {'dns': ['Contributor'], 'kv': ['Key Vault Certificates Officer']}, **scenario}
        env = {**os.environ, 'PATH': f"{self.dir / 'bin'}:{os.environ['PATH']}", 'FAKE_LOG': str(self.log),
               'FAKE_SCENARIO': json.dumps(scenario), 'SUBSCRIPTION_ID': SUB, 'RESOURCE_GROUP': RG,
               'DNS_ZONE_NAME': 'craves.in', 'KEY_VAULT_NAME': 'kvcravesprodlowkmqgfy',
               'KEY_VAULT_CERTIFICATE_NAME': 'craves-web-tls', 'FRONT_DOOR_PROFILE': 'afd-craves-prodlow',
               'FRONT_DOOR_SECRET_NAME': 'craves-web-tls', 'APEX_HOSTNAME': 'craves.in', 'WWW_HOSTNAME': 'www.craves.in',
               'LETSENCRYPT_CONTACT_EMAIL': 'support@craves.in', 'CHECK_ONLY': str(check_only).lower()}
        result = subprocess.run(['bash', str(SCRIPT)], env=env, capture_output=True, text=True, timeout=120)
        calls = self.log.read_text() if self.log.exists() else ''
        return result.returncode, result.stdout + result.stderr, calls

    def test_check_only_reports_and_changes_nothing(self):
        code, out, calls = self.run_script(check_only=True)
        self.assertEqual(code, 0, out)
        self.assertIn('CHECK_ONLY=true', out)
        self.assertNotIn('git ', calls)
        self.assertNotIn('certificate import', calls)

    def test_valid_certificate_is_not_renewed(self):
        code, out, calls = self.run_script(days=90)
        self.assertEqual(code, 0, out)
        self.assertIn('CERTIFICATE_CHANGED=false', out)
        self.assertNotIn('git ', calls)

    def test_certificate_inside_35_days_starts_renewal(self):
        code, out, calls = self.run_script(days=20)
        self.assertNotEqual(code, 0)  # fake git refuses to download acme.sh
        self.assertIn('within the 35-day renewal window', out)
        self.assertIn('git clone', calls)

    def test_front_door_must_follow_latest_version(self):
        code, out, _ = self.run_script(latest=False)
        self.assertEqual(code, 2)
        self.assertIn('useLatestVersion off', out)

    def test_public_dns_must_be_the_azure_zone(self):
        code, out, _ = self.run_script(public_ns=['ns51.domaincontrol.com.', 'ns52.domaincontrol.com.'])
        self.assertEqual(code, 2)
        self.assertIn('are not the Azure DNS zone', out)

    def test_caa_must_allow_letsencrypt(self):
        code, out, _ = self.run_script(caa='0 issue "digicert.com"')
        self.assertEqual(code, 2)
        self.assertIn('do not allow letsencrypt.org', out)

    def test_missing_key_vault_role_prints_the_fix(self):
        code, out, calls = self.run_script(roles={'dns': ['Contributor'], 'kv': ['Reader']})
        self.assertEqual(code, 2)
        self.assertIn("--role 'Key Vault Certificates Officer'", out)
        self.assertNotIn('git ', calls)

    def test_pipeline_targets_front_door_not_container_apps(self):
        pipeline = (ROOT / 'azure-pipelines-web-letsencrypt-certificate.yml').read_text()
        self.assertIn('frontDoorSecretName: craves-web-tls', pipeline)
        self.assertIn('azureSubscription: Craves-RMORAMPUDI09-Service-Connection', pipeline)
        self.assertIn('renewBeforeDays: 35', pipeline)
        self.assertNotIn('containerApp', pipeline + SCRIPT.read_text())


if __name__ == '__main__':
    unittest.main()
