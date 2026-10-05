import copy
import importlib.util
import io
import json
from pathlib import Path
import subprocess
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

    def commands(self, dirty="", main=MAIN_SHA, remote=MAIN_SHA,
                 changes=performance.APP_PATH + "/src/page.tsx", main_landing_tree="d" * 40):
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
            if args == ("rev-parse", MAIN_SHA + ":" + performance.LANDING_PATH):
                return main_landing_tree
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

    def test_landing_authoring_change_with_rebuilt_web_tree_is_allowed(self):
        changes = performance.LANDING_PATH + "/src/App.tsx\n" + performance.APP_PATH + "/public/landing-v20/index.html"
        with patch.object(performance, "git", side_effect=self.commands(changes=changes)), patch.object(performance, "local_evidence", return_value={}) as evidence:
            performance.source_guard(self.args())
            self.assertEqual(evidence.call_args.args[-1], "f" * 40)

    def test_unreconciled_main_landing_authoring_changes_fail_before_evidence(self):
        with patch.object(performance, "git", side_effect=self.commands(main_landing_tree="e" * 40)), patch.object(performance, "local_evidence") as evidence:
            with self.assertRaisesRegex(ValueError, "unreconciled landing"):
                performance.source_guard(self.args())
            evidence.assert_not_called()


class SuccessorSourceReviewTests(unittest.TestCase):
    BASELINE_SHA = "e" * 40
    PRIOR_MAIN_SHA = "6" * 40
    LIVE_TREE = "d" * 40

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "prior.json"
        self.value = {"operation": "deploy", "verified": True, "sourceSha": LIVE_SHA,
                      "image": OLD_IMAGE, "previousSourceSha": self.BASELINE_SHA, "mainSha": self.PRIOR_MAIN_SHA,
                      "localEvidence": {"webTree": self.LIVE_TREE, "checks": sorted(performance.CHECKS)},
                      "protectedApps": {"chef": "1" * 64}}
        self.args = SimpleNamespace(source=Path(self.directory.name), sha=SOURCE_SHA,
            expected_main_sha=MAIN_SHA, expected_live_sha=LIVE_SHA, expected_live_image=OLD_IMAGE,
            evidence=Path("evidence.json"), evidence_sha256="0" * 64,
            prior_release_receipt=self.path, prior_release_receipt_sha256=None)
        self.write_receipt()

    def write_receipt(self):
        self.path.write_text(json.dumps(self.value), encoding="utf-8")
        self.args.prior_release_receipt_sha256 = performance.sha256(self.path.read_bytes())

    def commands(self, wrong_main=None, wrong_prior=None, patch=None, prior_patch=None,
                 main_patch=None, failed_ancestor=None):
        def answer(source, *args):
            if args == ("rev-parse", "HEAD"):
                return SOURCE_SHA
            if args[0] == "status":
                return ""
            if args == ("rev-parse", "origin/main"):
                return MAIN_SHA
            if args[0] == "ls-remote":
                return MAIN_SHA + "\trefs/heads/main"
            if args[0] == "merge-base":
                if args[-2:] == failed_ancestor:
                    raise ValueError("Reviewed source ancestry changed")
                return ""
            if args[0] == "diff":
                if args[2:] == (self.PRIOR_MAIN_SHA, LIVE_SHA):
                    return prior_patch if prior_patch is not None else performance.APP_PATH + "/src/old.tsx"
                if args[2:] == (LIVE_SHA, SOURCE_SHA):
                    return patch if patch is not None else performance.APP_PATH + "/src/new.tsx"
                return main_patch if main_patch is not None else performance.APP_PATH + "/src/old.tsx\n" + performance.APP_PATH + "/src/new.tsx"
            if args[0] == "rev-parse":
                sha, app_path = args[1].split(":")
                if sha == SOURCE_SHA:
                    return "f" * 40
                if sha == LIVE_SHA:
                    return self.LIVE_TREE if app_path == performance.APP_PATH else "7" * 40
                if sha == MAIN_SHA and app_path == wrong_main:
                    return "0" * 40
                if sha == self.PRIOR_MAIN_SHA and app_path == wrong_prior:
                    return "0" * 40
                return "2" * 40 if app_path == performance.APP_PATH else "3" * 40
            self.fail("Unexpected Git invocation")
        return answer

    def review(self, **kwargs):
        with patch.object(performance, "git", side_effect=self.commands(**kwargs)), \
                patch.object(performance, "local_evidence", return_value={"checks": sorted(performance.CHECKS)}):
            return performance.source_guard(self.args)

    def test_explicit_verified_successor_accepts_documented_main_divergence(self):
        proof = self.review()
        self.assertEqual(proof["successor"]["baselineSourceSha"], self.BASELINE_SHA)
        self.assertEqual(proof["successor"]["priorReceiptSha256"], self.args.prior_release_receipt_sha256)
        self.assertEqual(proof["successor"]["liveWebTree"], self.LIVE_TREE)
        self.assertNotEqual(proof["successor"]["mainWebTree"], proof["successor"]["liveWebTree"])
        self.assertNotIn(str(self.path), json.dumps(proof))

    def test_default_guard_does_not_fall_back_to_successor_mode(self):
        self.args.prior_release_receipt = None
        self.args.prior_release_receipt_sha256 = None
        with self.assertRaisesRegex(ValueError, "unreconciled web"):
            self.review()

    def test_missing_hash_or_receipt_and_tampering_are_rejected(self):
        original_hash = self.args.prior_release_receipt_sha256
        self.args.prior_release_receipt_sha256 = None
        with self.assertRaisesRegex(ValueError, "both prior"):
            self.review()
        self.args.prior_release_receipt_sha256 = original_hash
        self.args.prior_release_receipt = None
        with self.assertRaisesRegex(ValueError, "both prior"):
            self.review()
        self.args.prior_release_receipt = self.path
        self.path.write_text(self.path.read_text() + " ", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "reviewed hash"):
            self.review()

    def test_output_receipt_cannot_replace_the_historical_input(self):
        self.args.receipt = self.path.parent / "nested" / ".." / self.path.name
        with self.assertRaisesRegex(ValueError, "must not overwrite"):
            self.review()
        self.args.receipt = self.path.parent / "new-release.json"
        self.assertIn("successor", self.review())

    def test_unverified_wrong_live_image_or_prior_evidence_are_rejected(self):
        original = copy.deepcopy(self.value)
        cases = [("verified", False), ("operation", "inspect"), ("sourceSha", SOURCE_SHA),
                 ("image", NEW_IMAGE), ("previousSourceSha", "short"),
                 ("localEvidence", {"webTree": "0" * 40, "checks": sorted(performance.CHECKS)}),
                 ("localEvidence", {"webTree": self.LIVE_TREE, "checks": ["build"]}),
                 ("protectedApps", {}), ("protectedApps", {"chef": "not-a-fingerprint"})]
        for name, value in cases:
            self.value = copy.deepcopy(original)
            self.value[name] = value
            self.write_receipt()
            with self.subTest(field=name, value=value), self.assertRaises(ValueError):
                self.review()

    def test_main_frontend_changes_and_out_of_scope_successor_or_prior_patch_fail(self):
        for app_path in (performance.APP_PATH, performance.LANDING_PATH):
            with self.subTest(app=app_path), self.assertRaisesRegex(ValueError, "frontend.*baseline"):
                self.review(wrong_main=app_path)
            with self.subTest(prior_app=app_path), self.assertRaisesRegex(ValueError, "frontend.*baseline"):
                self.review(wrong_prior=app_path)
        for parameter in ("patch", "prior_patch", "main_patch"):
            with self.subTest(parameter=parameter), self.assertRaisesRegex(ValueError, "outside.*scope"):
                self.review(**{parameter: "services/order-service/src/Order.java"})

    def test_each_required_ancestry_relationship_is_enforced(self):
        for relationship in ((self.BASELINE_SHA, self.PRIOR_MAIN_SHA), (self.BASELINE_SHA, LIVE_SHA),
                             (self.PRIOR_MAIN_SHA, LIVE_SHA), (self.PRIOR_MAIN_SHA, MAIN_SHA),
                             (MAIN_SHA, SOURCE_SHA), (LIVE_SHA, SOURCE_SHA)):
            with self.subTest(relationship=relationship), self.assertRaisesRegex(ValueError, "ancestry"):
                self.review(failed_ancestor=relationship)

    def test_real_git_history_accepts_successor_but_rejects_candidate_dropping_live_patch(self):
        source = self.args.source
        def command(*args):
            result = subprocess.run(["git", *args], cwd=source, capture_output=True, text=True)
            if result.returncode:
                raise ValueError("Git source ancestry or command failed")
            return result.stdout.strip()
        command("init", "-q")
        command("config", "user.name", "Release guard test")
        command("config", "user.email", "release-guard@example.invalid")
        def commit_file(name, content):
            path = source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
            command("add", name)
            command("commit", "-qm", content)
            return command("rev-parse", "HEAD")
        commit_file(performance.APP_PATH + "/src/page.tsx", "baseline web")
        baseline = commit_file(performance.LANDING_PATH + "/src/App.tsx", "baseline landing")
        main = commit_file("services/orders/source.java", "existing main backend")
        live = commit_file(performance.APP_PATH + "/src/page.tsx", "first deployed improvement")
        candidate = commit_file(performance.APP_PATH + "/src/page.tsx", "second reviewed improvement")
        command("update-ref", "refs/remotes/origin/main", main)
        self.args.sha, self.args.expected_main_sha, self.args.expected_live_sha = candidate, main, live
        self.value.update(sourceSha=live, previousSourceSha=baseline, mainSha=main)
        self.value["localEvidence"]["webTree"] = command("rev-parse", live + ":" + performance.APP_PATH)
        self.write_receipt()
        def real_git(source, *args):
            if args[0] == "ls-remote":
                return main + "\trefs/heads/main"
            return command(*args)
        with patch.object(performance, "git", side_effect=real_git), patch.object(performance, "local_evidence", return_value={}):
            self.assertEqual(performance.source_guard(self.args)["successor"]["baselineSourceSha"], baseline)
            command("checkout", "-q", "--detach", main)
            self.args.sha = commit_file(performance.APP_PATH + "/src/page.tsx", "sibling drops deployed improvement")
            with self.assertRaisesRegex(ValueError, "ancestry"):
                performance.source_guard(self.args)


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

    def test_successor_protected_drift_stops_inspection_before_build_or_update(self):
        proof = {"successor": {"protectedApps": {"chef": "1" * 64}}}
        self.args.deploy = True
        with patch.object(performance, "source_guard", return_value=proof), patch.object(release, "azure", return_value={"id": release.SUBSCRIPTION, "tenantId": release.inspect.TENANT}) as azure, patch.object(release, "app", return_value=app()), patch.object(release, "ready_web"), patch.object(release, "resolve_image", return_value=OLD_IMAGE), patch.object(performance, "protected_apps", return_value={"chef": "2" * 64}), patch.object(performance, "build_image") as build, patch.object(performance, "verify_registry_image") as verify:
            with self.assertRaisesRegex(ValueError, "changed since.*prior deployment"):
                performance.execute(self.args)
        self.assertEqual(azure.call_count, 1)
        build.assert_not_called()
        verify.assert_not_called()

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

    def test_protected_app_image_and_traffic_drift_changes_fingerprint(self):
        backend = app()
        backend["name"] = release.CHEF
        backend["properties"]["configuration"]["ingress"] = {"traffic": [{"latestRevision": True, "weight": 100}]}
        web = app()
        web["name"] = release.WEB
        with patch.object(release, "azure", return_value=[web, backend]):
            baseline = performance.protected_apps()
        self.assertEqual(set(baseline), {release.CHEF})
        for kind in ("image", "traffic"):
            changed = copy.deepcopy(backend)
            if kind == "image":
                changed["properties"]["template"]["containers"][0]["image"] = NEW_IMAGE
            else:
                changed["properties"]["configuration"]["ingress"] = {"traffic": [{"revisionName": "other", "weight": 100}]}
            self.assertEqual(release.runtime.stable(backend), release.runtime.stable(changed))
            with self.subTest(kind=kind), patch.object(release, "azure", return_value=[web, changed]):
                self.assertNotEqual(baseline, performance.protected_apps())

    def test_automatic_latest_traffic_is_preserved(self):
        before = app()
        before["properties"]["configuration"]["ingress"] = {"traffic": [{"latestRevision": True, "weight": 100}]}
        current = app(NEW_IMAGE, SOURCE_SHA)
        for selector in ([], [{"latestRevision": True, "weight": 100}]):
            current["properties"]["configuration"]["ingress"] = {"traffic": selector}
            performance.web_guard(before, current, NEW_IMAGE, SOURCE_SHA)

    def test_protected_drift_before_image_selection_prevents_runtime_update(self):
        self.args.deploy = True
        before = app()
        with patch.object(performance, "source_guard", return_value={}), patch.object(release, "azure", return_value={"id": release.SUBSCRIPTION, "tenantId": release.inspect.TENANT}) as azure, patch.object(release, "app", return_value=before), patch.object(release, "ready_web"), patch.object(release, "resolve_image", return_value=OLD_IMAGE), patch.object(performance, "protected_apps", side_effect=[{"chef": "before"}, {"chef": "changed"}]), patch.object(performance, "verify_registry_image"), patch.object(performance, "build_image", return_value=NEW_IMAGE):
            with self.assertRaisesRegex(ValueError, "Another app changed"):
                performance.execute(self.args)
        self.assertEqual(azure.call_args_list[0].args, ("account", "show"))
        self.assertEqual(azure.call_count, 1)

    def test_protected_drift_during_release_recovers_only_web_without_waiting(self):
        self.args.deploy = True
        before = app()
        candidate = app(NEW_IMAGE, SOURCE_SHA)
        with patch.object(performance, "source_guard", return_value={}), patch.object(release, "azure", return_value={"id": release.SUBSCRIPTION, "tenantId": release.inspect.TENANT}) as azure, patch.object(release, "app", side_effect=[before, before, before, candidate, candidate, before]), patch.object(release, "ready_web"), patch.object(release, "resolve_image", return_value=OLD_IMAGE), patch.object(performance, "protected_apps", side_effect=[{"chef": "before"}, {"chef": "before"}, {"chef": "changed"}]), patch.object(performance, "verify_registry_image"), patch.object(performance, "build_image", return_value=NEW_IMAGE), patch.object(release, "public_status"), patch.object(performance.time, "sleep") as sleep:
            with self.assertRaisesRegex(ValueError, "previous web image and source were restored"):
                performance.execute(self.args)
        sleep.assert_not_called()
        self.assertEqual(azure.call_count, 3)
        for call in azure.call_args_list[1:]:
            self.assertEqual(call.args[:7], ("containerapp", "update", "-g", release.RG, "-n", release.WEB, "--image"))
        self.assertEqual(azure.call_args.args[7], OLD_IMAGE)

    def test_concurrent_traffic_pin_or_split_blocks_recovery_before_mutation(self):
        before = app()
        before["properties"]["configuration"]["ingress"] = {"traffic": [{"latestRevision": True, "weight": 100}]}
        receipt = {"previousImage": OLD_IMAGE, "previousSourceSha": LIVE_SHA}
        for selector in ([{"revisionName": "pinned", "weight": 100}],
                         [{"latestRevision": True, "weight": 90}, {"revisionName": "old", "weight": 10}]):
            current = app(NEW_IMAGE, SOURCE_SHA)
            current["properties"]["configuration"]["ingress"] = {"traffic": selector}
            with self.subTest(selector=selector), patch.object(release, "app", return_value=current), patch.object(release, "azure") as azure:
                with self.assertRaisesRegex(ValueError, "traffic no longer"):
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
