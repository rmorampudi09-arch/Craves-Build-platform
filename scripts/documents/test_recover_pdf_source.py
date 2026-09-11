"""Tests only the recovery utility, not the PDF business module."""
from __future__ import annotations
import base64
import hashlib
import json
from pathlib import Path
import stat
import tempfile
import unittest
import zipfile

from recover_pdf_source import PackageError, clean_path, load_package, recover

JAVA = "services/notification-service/src/main/java/in/craves/documents/Example.java"
SQL = "services/notification-service/src/main/resources/db/migration/V1__example.sql"


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.root = self.base / "repo"
        self.root.mkdir()
        self.archive = self.base / "module.zip"
        self.report = self.base / "report.json"

    def tearDown(self):
        self.temp.cleanup()

    def zip(self, entries):
        with zipfile.ZipFile(self.archive, "w", zipfile.ZIP_DEFLATED) as bundle:
            for name, value in entries:
                bundle.writestr(name, value)
        return self.archive

    def manifest(self, entries):
        return self.zip([("payload.json", json.dumps({"files": entries}))])

    def test_raw_source_layout(self):
        self.zip([(JAVA, "class Example {}")])
        self.assertEqual(load_package(self.archive)[JAVA], b"class Example {}")

    def test_repository_prefix(self):
        self.zip([("repository/" + JAVA, "class Example {}")])
        self.assertIn(JAVA, load_package(self.archive))

    def test_utf8_manifest(self):
        self.manifest([{"path": JAVA, "content": "// Craves\nclass Example {}"}])
        self.assertIn(JAVA, load_package(self.archive))

    def test_explicit_base64_manifest(self):
        self.manifest([{"path": JAVA, "content": base64.b64encode(b"class Example {}").decode(), "encoding": "base64"}])
        self.assertEqual(load_package(self.archive)[JAVA], b"class Example {}")

    def test_content_base64_property(self):
        self.manifest([{"path": JAVA, "content_base64": "e30="}])
        self.assertEqual(load_package(self.archive)[JAVA], b"{}")

    def test_checksum_success(self):
        self.manifest([{"path": JAVA, "content": "{}", "sha256": hashlib.sha256(b"{}").hexdigest()}])
        self.assertIn(JAVA, load_package(self.archive))

    def test_checksum_failure(self):
        self.manifest([{"path": JAVA, "content": "{}", "sha256": "0" * 64}])
        with self.assertRaises(PackageError):
            load_package(self.archive)

    def test_traversal(self):
        for value in ("../x.java", "services/notification-service/../../x.java", "/tmp/x.java", "services\\notification-service\\x.java"):
            with self.subTest(value=value), self.assertRaises(PackageError):
                clean_path(value)

    def test_scope_and_protected_files(self):
        for value in (".github/workflows/deploy.yml", "infra/main.bicep", "services/auth-service/pom.xml", "scripts/documents/recover_pdf_source.py"):
            with self.subTest(value=value), self.assertRaises(PackageError):
                clean_path(value)

    def test_secret_and_generated_files_are_blocked(self):
        for value in ("services/order-service/.env", "services/order-service/target/a.java", "apps/customer-web-next/node_modules/a.json", "services/notification-service/font.ttf", "docs/key.pem"):
            with self.subTest(value=value), self.assertRaises(PackageError):
                clean_path(value)

    def test_env_example_permitted(self):
        self.assertEqual(clean_path("services/order-service/.env.example"), "services/order-service/.env.example")

    def test_case_collision(self):
        self.zip([(JAVA, "a"), (JAVA.replace("Example.java", "example.java"), "b")])
        with self.assertRaises(PackageError):
            load_package(self.archive)

    def test_archive_symlink(self):
        member = zipfile.ZipInfo(JAVA)
        member.create_system = 3
        member.external_attr = (stat.S_IFLNK | 0o777) << 16
        with zipfile.ZipFile(self.archive, "w") as bundle:
            bundle.writestr(member, "/tmp/escape")
        with self.assertRaises(PackageError):
            load_package(self.archive)

    def test_destination_symlink(self):
        external = self.base / "external"
        external.mkdir()
        (self.root / "services").symlink_to(external, target_is_directory=True)
        self.zip([(JAVA, "class Example {}")])
        with self.assertRaises(PackageError):
            recover(self.archive, self.root, self.report, True)
        self.assertEqual(list(external.iterdir()), [])

    def test_no_partial_write_on_invalid_migration(self):
        old = self.root / SQL
        old.parent.mkdir(parents=True)
        old.write_text("SELECT 1;", encoding="utf-8")
        self.zip([(JAVA, "class Example {}"), (SQL, "SELECT 2;")])
        with self.assertRaises(PackageError):
            recover(self.archive, self.root, self.report, True)
        self.assertFalse((self.root / JAVA).exists())
        self.assertEqual(old.read_text(), "SELECT 1;")

    def test_existing_identical_migration_is_allowed(self):
        old = self.root / SQL
        old.parent.mkdir(parents=True)
        old.write_text("SELECT 1;", encoding="utf-8")
        self.zip([(SQL, "SELECT 1;")])
        self.assertEqual(recover(self.archive, self.root, self.report, True)["fileCount"], 1)

    def test_dry_run_does_not_write_source(self):
        self.zip([(JAVA, "class Example {}")])
        result = recover(self.archive, self.root, self.report)
        self.assertFalse((self.root / JAVA).exists())
        self.assertEqual(result["sourceAcceptance"], "NOT_VALIDATED")
        self.assertFalse(result["productionChanges"])

    def test_apply_writes_bytes_and_nonexecutable_mode(self):
        self.zip([(JAVA, "class Example {}")])
        result = recover(self.archive, self.root, self.report, True)
        self.assertEqual((self.root / JAVA).read_text(), "class Example {}")
        self.assertEqual(stat.S_IMODE((self.root / JAVA).stat().st_mode), 0o644)
        self.assertEqual(json.loads(self.report.read_text()), result)

    def test_invalid_utf8(self):
        self.zip([(JAVA, b"\xff\xfe")])
        with self.assertRaises(PackageError):
            load_package(self.archive)

    def test_file_directory_collision(self):
        self.zip([("docs/source.md", "a"), ("docs/source.md/nested.md", "b")])
        with self.assertRaises(PackageError):
            recover(self.archive, self.root, self.report, True)

    def test_manifest_requires_content_not_blob_reference(self):
        self.manifest([{"path": JAVA, "sha": "a" * 40}])
        with self.assertRaises(PackageError):
            load_package(self.archive)

    def test_empty_archive(self):
        self.zip([])
        with self.assertRaises(PackageError):
            load_package(self.archive)


if __name__ == "__main__":
    unittest.main()
