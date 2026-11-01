"""app-hash.sh prints the SMS Retriever hash Google defines for the rider app (developers.google.com/identity/sms-retriever,
"Computing your app's hash string"), checked here against an independent Python version of the same algorithm."""
import base64
import hashlib
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("app-hash.sh")


def google_hash(package: str, certificate: bytes) -> str:
    # Google's AppSignatureHelper: SHA-256 of "<package> <certificate hex>", base64, the first 11 characters.
    return base64.b64encode(hashlib.sha256(f"{package} {certificate.hex()}".encode()).digest()).decode()[:11]


@unittest.skipUnless(shutil.which("openssl"), "needs openssl")
class AppHashTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=rider",
                        "-keyout", self.dir / "key.pem", "-out", self.dir / "cert.pem"], check=True, capture_output=True)
        subprocess.run(["openssl", "x509", "-in", self.dir / "cert.pem", "-outform", "DER", "-out", self.dir / "cert.der"],
                       check=True, capture_output=True)
        self.expected = google_hash("com.cravesapp.rider", (self.dir / "cert.der").read_bytes())

    def tearDown(self):
        self.tmp.cleanup()

    def run_script(self, *args, env=None):
        return subprocess.run(["bash", SCRIPT, *map(str, args)], check=True, capture_output=True, text=True,
                              env={**os.environ, **(env or {})}).stdout

    def test_certificate_file_der_or_pem(self):
        for name in ("cert.der", "cert.pem"):
            self.assertEqual(self.run_script("--cert", self.dir / name), self.expected + "\n")

    @unittest.skipUnless(shutil.which("keytool"), "needs keytool")
    def test_keystore(self):
        subprocess.run(["openssl", "pkcs12", "-export", "-in", self.dir / "cert.pem", "-inkey", self.dir / "key.pem",
                        "-name", "rider", "-out", self.dir / "rider.p12", "-passout", "pass:test-only-1"],
                       check=True, capture_output=True)
        out = self.run_script(self.dir / "rider.p12", "rider", env={"RIDER_KEYSTORE_PASSWORD": "test-only-1"})
        self.assertEqual(out, self.expected + "\n")

    def test_usage(self):
        result = subprocess.run(["bash", SCRIPT], capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn("usage", result.stderr)


if __name__ == "__main__":
    unittest.main()
