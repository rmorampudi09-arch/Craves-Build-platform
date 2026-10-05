import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch


SPEC = importlib.util.spec_from_file_location("web_performance", Path(__file__).parents[1] / "web_performance_release.py")
performance = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(performance)
release = performance.release
LIVE_SHA = "a" * 40
MAIN_SHA = "b" * 40
SOURCE_SHA = "c" * 40
OLD_IMAGE = release.LOGIN + "/craves/customer-web-next@sha256:" + "a" * 64
NEW_IMAGE = release.LOGIN + "/craves/customer-web-next@sha256:" + "b" * 64


def app(image=OLD_IMAGE, sha=LIVE_SHA):
    return {"identity": {"type": "SystemAssigned"}, "properties": {
        "configuration": {"secrets": [{"name": "binding", "keyVaultUrl": "https://existing.vault.azure.net/secrets/binding"}]},
        "template": {"scale": {"minReplicas": 1, "maxReplicas": 1}, "containers": [{
            "name": "web", "image": image, "env": [
                {"name": "CRAVES_BUILD_SHA", "value": sha},
                {"name": "NEXT_PUBLIC_RAZORPAY_MODE", "value": "production"},
                {"name": "PRIVATE_SETTING", "secretRef": "binding"}]}]}}}


class LocalEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.path = self.root / "evidence.json"
        self.tree = "d" * 40
        self.value = {"schema": 1, "webTree": self.tree, "checks": []}
        for name in sorted(performance.CHECKS):
            log = self.root / (name + ".log")
            log.write_bytes((name + " succeeded\n").encode())
            self.value["checks"].append({"name": name, "exitCode": 0, "logFile": log.name,
                                         "logSha256": performance.sha256(log.read_bytes())})

    def check(self, expected_tree=None):
        self.path.write_text(json.dumps(self.value), encoding="utf-8")
        return performance.local_evidence(self.root, self.path, performance.sha256(self.path.read_bytes()), expected_tree or self.tree)

    def test_exact_web_tree_and_all_saved_logs_are_accepted(self):
        self.assertEqual(self.check()["checks"], sorted(performance.CHECKS))

    def test_different_tree_and_changed_log_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "exact web tree"):
            self.check("e" * 40)
        (self.root / "build.log").write_text("changed", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "log differs"):
            self.check()

    def test_failed_missing_and_duplicate_checks_are_rejected(self):
        original = copy.deepcopy(self.value)
        for kind in ("failed", "missing", "duplicate"):
            self.value = copy.deepcopy(original)
            if kind == "failed":
                self.value["checks"][0]["exitCode"] = 1
            elif kind == "missing":
                self.value["checks"].pop()
            else:
                self.value["checks"][0]["name"] = self.value["checks"][1]["name"]
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                self.check()

    def test_log_path_escape_and_unreviewed_evidence_are_rejected(self):
        self.value["checks"][0]["logFile"] = "../outside.log"
        with self.assertRaisesRegex(ValueError, "escaped"):
            self.check()
        with self.assertRaisesRegex(ValueError, "reviewed hash"):
            performance.local_evidence(self.root, self.path, "0" * 64, self.tree)


class SourceReviewTests(unittest.TestCase):
    def args(self):
        return SimpleNamespace(source=Path("."), sha=SOURCE_SHA, expected_main_sha=MAIN_SHA,
                               expected_live_sha=LIVE_SHA, evidence=Path("evidence.json"), evidence_sha256="e" * 64)

    def commands(self, dirty="", main=MAIN_SHA, remote=MAIN_SHA, changes=performance.APP_PATH + "/src/page.tsx"):
        def answer(source, *args):
            if args == ("rev-parse", "HEAD"):
                return SOURCE_SHA
            if args[0] == "status":
                return dirty
            if args == ("rev-parse", "origin/main"):
                return main
            if args[0] == "ls-remote":
                return remote + "\trefs/heads/main"
            if args[0] == "merge-base":
                return ""
            if args[0] == "diff":
                return changes
            if args[0] == "rev-parse" and args[1].startswith(SOURCE_SHA):
                return "f" * 40
            return "d" * 40
        return answer

    def test_candidate_on_reviewed_main_with_exact_tree_evidence(self):
        with patch.object(performance, "git", side_effect=self.commands()), patch.object(performance, "local_evidence", return_value={}) as evidence:
            performance.source_guard(self.args())
            self.assertEqual(evidence.call_args.args[-1], "f" * 40)

    def test_dirty_stale_remote_and_backend_changes_fail_before_evidence(self):
        cases = [{"dirty": " M src/page.tsx"}, {"remote": "e" * 40}, {"main": "e" * 40},
                 {"changes": "services/order-service/src/Order.java"}]
        for case in cases:
            with self.subTest(case=case), patch.object(performance, "git", side_effect=self.commands(**case)), patch.object(performance, "local_evidence") as evidence:
                with self.assertRaises(ValueError):
                    performance.source_guard(self.args())
                evidence.assert_not_called()


class WindowsCommandTests(unittest.TestCase):
    def test_azure_cmd_uses_bundled_python_with_argument_boundaries(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cli = root / "wbin" / "az.cmd"
            (root / "python.exe").touch()
            with patch.object(performance.shutil, "which", return_value=str(cli)):
                command = performance.portable_command(("az", "acr", "build", "--build-arg", "PUBLIC=a&b"))
        self.assertEqual(command[1:4], ["-IBm", "azure.cli", "acr"])
        self.assertEqual(command[-1], "PUBLIC=a&b")
        self.assertNotIn("cmd.exe", command)

    def test_missing_cli_fails_without_starting_a_shell(self):
        with patch.object(performance.shutil, "which", return_value=None):
            with self.assertRaisesRegex(ValueError, "unavailable"):
                performance.portable_command(("az", "account", "show"))


class RegistryVerificationTests(unittest.TestCase):
    def payloads(self, label=SOURCE_SHA, architecture="amd64"):
        config = json.dumps({"os": "linux", "architecture": architecture,
                             "config": {"Labels": {"org.opencontainers.image.revision": label},
                                        "Env": ["PRIVATE=never-print-this"]}}, separators=(",", ":")).encode()
        manifest = json.dumps({"schemaVersion": 2, "config": {"digest": "sha256:" + performance.sha256(config),
                                                               "size": len(config)}}, separators=(",", ":")).encode()
        image = release.LOGIN + "/craves/customer-web-next@sha256:" + performance.sha256(manifest)
        return image, manifest, config

    def test_digests_label_platform_and_scoped_pull_without_exposing_env(self):
        image, manifest, config = self.payloads()
        requests = []
        def read(request, limit, allow_blob_redirect=False):
            requests.append(request)
            return [b'{"access_token":"scoped-pull-token"}', manifest, config][len(requests) - 1]
        with patch.object(release, "azure", return_value={"loginServer": release.LOGIN, "accessToken": "private-refresh-token"}), patch.object(performance, "read_bytes", side_effect=read):
            result = performance.verify_registry_image(image, SOURCE_SHA)
        form = performance.urllib.parse.parse_qs(requests[0].data.decode())
        self.assertEqual(form["scope"], ["repository:craves/customer-web-next:pull"])
        self.assertEqual(result["sourceSha"], SOURCE_SHA)
        self.assertNotIn("never-print-this", json.dumps(result))
        self.assertNotIn("token", json.dumps(result))

    def test_wrong_label_platform_and_corrupt_bytes_fail(self):
        for case in ("label", "platform", "digest"):
            image, manifest, config = self.payloads(label=LIVE_SHA if case == "label" else SOURCE_SHA,
                                                    architecture="arm64" if case == "platform" else "amd64")
            if case == "digest":
                config += b" "
            with self.subTest(case=case), patch.object(release, "azure", return_value={"loginServer": release.LOGIN, "accessToken": "refresh"}), patch.object(performance, "read_bytes", side_effect=[b'{"access_token":"pull"}', manifest, config]):
                with self.assertRaises(ValueError):
                    performance.verify_registry_image(image, SOURCE_SHA)

    def test_other_registry_and_mutable_tag_rejected_before_authentication(self):
        for image in ("other.azurecr.io/craves/customer-web-next@sha256:" + "a" * 64,
                      release.LOGIN + "/craves/customer-web-next:latest"):
            with self.subTest(image=image), patch.object(release, "azure") as azure:
                with self.assertRaises(ValueError):
                    performance.verify_registry_image(image, SOURCE_SHA)
                azure.assert_not_called()

    def test_signed_blob_redirect_removes_registry_authorization(self):
        request = performance.urllib.request.Request("https://" + release.LOGIN + "/v2/craves/customer-web-next/blobs/sha256:test",
                                                     headers={"Authorization": "Bearer registry-token"})
        headers = {"Location": "https://registrydata123.blob.core.windows.net/config?sig=private-signed-url"}
        error = performance.urllib.error.HTTPError(request.full_url, 307, "redirect", headers, None)
        opener = Mock()
        opener.open.side_effect = [error, io.BytesIO(b"config")]
        with patch.object(performance.urllib.request, "build_opener", return_value=opener):
            self.assertEqual(performance.read_bytes(request, 20, True), b"config")
        self.assertEqual(opener.open.call_args.args[0].headers, {})

    def test_non_azure_or_insecure_blob_redirect_is_rejected(self):
        for target in ("https://attacker.example/config", "http://registrydata.blob.core.windows.net/config"):
            request = performance.urllib.request.Request("https://" + release.LOGIN + "/v2/craves/customer-web-next/blobs/sha256:test")
            error = performance.urllib.error.HTTPError(request.full_url, 307, "redirect", {"Location": target}, None)
            opener = Mock()
            opener.open.side_effect = error
            with self.subTest(target=target), patch.object(performance.urllib.request, "build_opener", return_value=opener):
                with self.assertRaisesRegex(ValueError, "destination"):
                    performance.read_bytes(request, 20, True)
                self.assertEqual(opener.open.call_count, 1)


class ReleaseSafetyTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.args = SimpleNamespace(source=Path(self.directory.name), sha=SOURCE_SHA,
            expected_main_sha=MAIN_SHA, expected_live_sha=LIVE_SHA, expected_live_image=OLD_IMAGE,
            evidence=Path(self.directory.name) / "evidence.json", evidence_sha256="e" * 64,
            receipt=Path(self.directory.name) / "receipt.json", candidate_image=None, deploy=False)

    def test_default_inspection_never_builds_selects_image_or_contacts_registry_oauth(self):
        with patch.object(performance, "source_guard", return_value={}), patch.object(release, "azure", return_value={"id": release.SUBSCRIPTION, "tenantId": release.inspect.TENANT}) as azure, patch.object(release, "app", return_value=app()), patch.object(release, "ready_web"), patch.object(release, "resolve_image", return_value=OLD_IMAGE), patch.object(performance, "protected_apps", return_value={}), patch.object(performance, "build_image") as build, patch.object(performance, "verify_registry_image") as verify:
            result = performance.execute(self.args)
        self.assertFalse(result["verified"])
        self.assertEqual(azure.call_args_list[0].args, ("account", "show"))
        self.assertEqual(azure.call_count, 1)
        build.assert_not_called()
        verify.assert_not_called()
        self.assertNotIn("PRIVATE_SETTING", self.args.receipt.read_text())

    def test_concurrent_source_image_secret_scale_or_identity_blocks_recovery(self):
        before = app()
        receipt = {"previousImage": OLD_IMAGE, "previousSourceSha": LIVE_SHA}
        for field in ("source", "image", "secret", "scale", "identity"):
            current = app(NEW_IMAGE, SOURCE_SHA)
            if field == "source":
                current["properties"]["template"]["containers"][0]["env"][0]["value"] = "d" * 40
            elif field == "image":
                current["properties"]["template"]["containers"][0]["image"] = "somebody-elses-release"
            elif field == "secret":
                current["properties"]["template"]["containers"][0]["env"][2]["secretRef"] = "changed-binding"
            elif field == "scale":
                current["properties"]["template"]["scale"]["maxReplicas"] = 2
            else:
                current["identity"]["type"] = "None"
            with self.subTest(field=field), patch.object(release, "app", return_value=current), patch.object(release, "azure") as azure:
                with self.assertRaises(ValueError):
                    performance.recover(before, NEW_IMAGE, SOURCE_SHA, receipt, self.args.receipt)
                azure.assert_not_called()

    def test_unchanged_old_runtime_is_verified_without_redundant_rollback(self):
        receipt = {"previousImage": OLD_IMAGE, "previousSourceSha": LIVE_SHA}
        with patch.object(release, "app", return_value=app()), patch.object(release, "ready_web"), patch.object(release, "public_status"), patch.object(release, "azure") as azure:
            performance.recover(app(), NEW_IMAGE, SOURCE_SHA, receipt, self.args.receipt)
        azure.assert_not_called()
        self.assertTrue(receipt["recoveryVerified"])
        self.assertFalse(receipt["recoveryRequired"])

    def test_failed_candidate_recovery_changes_only_image_and_build_sha(self):
        receipt = {"previousImage": OLD_IMAGE, "previousSourceSha": LIVE_SHA}
        with patch.object(release, "app", side_effect=[app(NEW_IMAGE, SOURCE_SHA), app()]), patch.object(release, "ready_web"), patch.object(release, "public_status"), patch.object(release, "azure") as azure:
            performance.recover(app(), NEW_IMAGE, SOURCE_SHA, receipt, self.args.receipt)
        self.assertEqual(azure.call_args.args, ("containerapp", "update", "-g", release.RG, "-n", release.WEB,
            "--image", OLD_IMAGE, "--set-env-vars", "CRAVES_BUILD_SHA=" + LIVE_SHA, "--no-wait"))
        self.assertTrue(receipt["recoveryVerified"])

    def test_successful_deploy_preserves_all_runtime_settings(self):
        self.args.deploy = True
        before = app()
        with patch.object(performance, "source_guard", return_value={}), patch.object(release, "azure", return_value={"id": release.SUBSCRIPTION, "tenantId": release.inspect.TENANT}) as azure, patch.object(release, "app", side_effect=[before, before, before, app(NEW_IMAGE, SOURCE_SHA)]), patch.object(release, "ready_web", return_value="reviewed-revision"), patch.object(release, "resolve_image", return_value=OLD_IMAGE), patch.object(performance, "protected_apps", return_value={}), patch.object(performance, "verify_registry_image"), patch.object(performance, "build_image", return_value=NEW_IMAGE), patch.object(release, "public_status", return_value={"sourceVerified": True}):
            result = performance.execute(self.args)
        self.assertTrue(result["verified"])
        self.assertEqual(azure.call_args.args, ("containerapp", "update", "-g", release.RG, "-n", release.WEB,
            "--image", NEW_IMAGE, "--set-env-vars", "CRAVES_BUILD_SHA=" + SOURCE_SHA, "--no-wait"))


if __name__ == "__main__":
    unittest.main()
