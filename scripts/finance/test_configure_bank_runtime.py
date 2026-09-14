import base64
import copy
import json
import os
import stat
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import configure_bank_runtime as release


def app():
    return {"identity": {"type": "SystemAssigned", "principalId": "test-identity"}, "location": "centralindia",
            "properties": {"managedEnvironmentId": "test-environment",
             "configuration": {"ingress": {"fqdn": "test.internal.example.azurecontainerapps.io", "external": False},
                               "secrets": [{"name": "existing", "keyVaultUrl": "https://craveskv.vault.azure.net/secrets/existing/version", "identity": "system"}]},
             "template": {"scale": {"minReplicas": 1, "maxReplicas": 1}, "containers": [{"name": "app", "image": "unchanged:image", "resources": {"cpu": 0.5, "memory": "1Gi"}, "env": [{"name": "EXISTING_SECRET", "secretRef": "existing"}]}]}}}

class RuntimeGuardTest(unittest.TestCase):
    def test_azure_json_reads_keep_strict_parsing(self):
        result = release.subprocess.CompletedProcess([], 0, '{"value": []}', "")
        with patch.object(release.subprocess, "run", return_value=result) as command:
            self.assertEqual({"value": []}, release.az("rest", "--method", "get"))
            self.assertEqual(["-o", "json"], command.call_args.args[0][-2:])
        result.stdout = "<policies />"
        with patch.object(release.subprocess, "run", return_value=result), self.assertRaises(release.GuardError):
            release.az("rest", "--method", "get")
    def test_azure_write_output_none_does_not_parse_policy_xml(self):
        result = release.subprocess.CompletedProcess([], 0, "<policies />", "")
        with patch.object(release.subprocess, "run", return_value=result) as command:
            self.assertIsNone(release.az("rest", "--method", "put", output="none"))
            self.assertEqual(["-o", "none"], command.call_args.args[0][-2:])
        result.returncode = 1
        result.stderr = "restricted diagnostic"
        with patch.object(release.subprocess, "run", return_value=result), self.assertRaises(release.GuardError) as failure:
            release.az("rest", "--method", "put", output="none")
        self.assertNotIn("restricted diagnostic", str(failure.exception))
    def test_origin_is_read_from_actual_resource(self):
        self.assertEqual("https://test.internal.example.azurecontainerapps.io", release.origin(app()))
    def test_origin_rejects_untrusted_urls(self):
        value = app(); value["properties"]["configuration"]["ingress"]["fqdn"] = "attacker.invalid/path"
        with self.assertRaises(release.GuardError): release.origin(value)
    def test_existing_vault_discovery(self):
        self.assertEqual("craveskv", release.select_vault({"a": app()}, None))
        with self.assertRaises(release.GuardError): release.select_vault({"a": app()}, "anotherkv")
    def test_does_not_create_an_identity(self):
        self.assertEqual("system", release.existing_identity(app(), "craveskv"))
        value = app();value["properties"]["configuration"]["secrets"] = []; value["identity"] = None
        with self.assertRaises(release.GuardError): release.existing_identity(value, "craveskv")
    def test_conflicting_environment_cannot_be_overwritten(self):
        with self.assertRaises(release.GuardError): release.check_env(app(), {"EXISTING_SECRET": "secretref:different"})
        release.check_env(app(), {"EXISTING_SECRET": "secretref:existing", "NEW": "safe"})
    def test_existing_secret_reference_accepts_azure_empty_and_null_literal_value(self):
        for unused_value in ("", None):
            with self.subTest(unused_value=unused_value):
                value = app()
                value["properties"]["template"]["containers"][0]["env"][0]["value"] = unused_value
                release.check_env(value, {"EXISTING_SECRET": "secretref:existing"})
    def test_existing_literal_accepts_azure_null_secret_reference(self):
        value = app()
        value["properties"]["template"]["containers"][0]["env"].append(
            {"name": "ENABLED", "value": "true", "secretRef": None})
        release.check_env(value, {"ENABLED": "true"})
    def test_unused_optional_fields_do_not_hide_conflicting_bindings(self):
        cases = [
            ({"name": "SETTING", "secretRef": "different", "value": None}, "secretref:existing"),
            ({"name": "SETTING", "secretRef": "existing", "value": "inline-secret"}, "secretref:existing"),
            ({"name": "SETTING", "secretRef": "different", "value": ""}, "secretref:existing"),
            ({"name": "SETTING", "secretRef": "", "value": ""}, "secretref:existing"),
            ({"name": "SETTING", "value": ""}, "secretref:existing"),
            ({"name": "SETTING", "secretRef": "unexpected", "value": "true"}, "true"),
            ({"name": "SETTING", "secretRef": None, "value": "false"}, "true"),
            ({"name": "SETTING", "secretRef": None, "value": None}, "true"),
            ({"name": "SETTING", "secretRef": "existing", "value": None, "unexpected": None}, "secretref:existing"),
        ]
        for entry, wanted in cases:
            with self.subTest(entry=entry):
                value = app()
                value["properties"]["template"]["containers"][0]["env"].append(entry)
                with self.assertRaises(release.GuardError): release.check_env(value, {"SETTING": wanted})
    def test_apply_is_read_only_with_observed_azure_empty_secret_values(self):
        apps = {role: app() for role in release.APPS}
        wanted = release.desired(apps)
        refs = {local: "https://craveskv.vault.azure.net/secrets/" + remote + "/version"
                for local, remote in release.SECRET_NAMES.items()}
        for role, value in apps.items():
            for key, setting in wanted[role].items():
                # Observed on all three deployed apps: exact secretRef plus value="".
                entry = {"name": key, "value": "", "secretRef": setting.removeprefix("secretref:")} if setting.startswith("secretref:") else {"name": key, "value": setting}
                value["properties"]["template"]["containers"][0]["env"].append(entry)
            used = {setting.removeprefix("secretref:") for setting in wanted[role].values() if setting.startswith("secretref:")}
            value["properties"]["configuration"]["secrets"].extend(
                {"name": local, "keyVaultUrl": refs[local], "identity": "system"} for local in sorted(used))
        calls = []
        def fake(*args):
            calls.append(args)
            if args[:2] == ("account", "show"): return {"id": "test-subscription"}
            if args[:2] == ("containerapp", "show"):
                name = args[args.index("-n") + 1]
                role = next(role for role, app_name in release.APPS.items() if app_name == name)
                return copy.deepcopy(apps[role])
            if args[:2] == ("keyvault", "show"): return "test-vault-id"
            if args[:3] == ("keyvault", "secret", "list"): return [{"id": ref} for ref in refs.values()]
            if args[:3] == ("keyvault", "secret", "show"):
                name = args[args.index("--name") + 1]
                local = next(local for local, remote in release.SECRET_NAMES.items() if remote == name)
                return {"id": refs[local], "enabled": True, "tags": {"craves-purpose": release.PURPOSE}}
            raise AssertionError("An already configured runtime must not cause a cloud write")
        with tempfile.TemporaryDirectory() as folder, patch.object(release.subprocess, "check_output", return_value="a" * 40 + "\n"), \
             patch.object(release, "az", side_effect=fake):
            self.assertEqual(0, release.main(["--apply", "--expected-source-sha", "a" * 40, "--output", str(Path(folder) / "plan.json")]))
        self.assertTrue(all("set" not in args and "update" not in args for args in calls))
    def test_unrelated_image_scale_and_env_changes_are_detected(self):
        original = app(); baseline = release.stable(original, {"NEW"}, {"new"})
        for component in ("image", "scale", "env"):
            changed = copy.deepcopy(original)
            if component == "image": changed["properties"]["template"]["containers"][0]["image"] = "different:image"
            elif component == "scale": changed["properties"]["template"]["scale"]["maxReplicas"] = 2
            else: changed["properties"]["template"]["containers"][0]["env"] = []
            self.assertNotEqual(baseline, release.stable(changed, {"NEW"}, {"new"}))
    def test_only_declared_environment_changes_are_ignored_by_drift_hash(self):
        original = app();changed = copy.deepcopy(original)
        changed["properties"]["template"]["containers"][0]["env"].append({"name": "NEW", "value": "safe"})
        self.assertEqual(release.stable(original, {"NEW"}, set()), release.stable(changed, {"NEW"}, set()))
    def test_keyring_is_generated_in_private_temporary_file_without_cli_value(self):
        paths = []
        def fake(*args):
            if args[:3] == ("keyvault", "secret", "set"):
                self.assertNotIn("--value", args)
                path = Path(args[args.index("--file") + 1]);paths.append(path)
                self.assertEqual(0o600, stat.S_IMODE(path.stat().st_mode))
                value = json.loads(path.read_text());self.assertEqual(32, len(base64.b64decode(value["bank-v1"])))
                return "https://craveskv.vault.azure.net/secrets/keyring/version"
            return {"id": "https://craveskv.vault.azure.net/secrets/keyring/version", "enabled": True, "tags": {"craves-purpose": release.PURPOSE}}
        with patch.object(release, "az", side_effect=fake): release.ensure_secret("craveskv", release.SECRET_NAMES["bank-data-keyring"], set())
        self.assertTrue(paths);self.assertTrue(all(not p.exists() for p in paths))
    def test_existing_secret_is_not_rotated(self):
        name = release.SECRET_NAMES["bank-internal"]
        with patch.object(release, "az", return_value={"id": "version", "enabled": True, "tags": {"craves-purpose": release.PURPOSE}}) as mock:
            self.assertEqual("version", release.ensure_secret("craveskv", name, {name}))
            self.assertEqual(1, mock.call_count);self.assertEqual(("keyvault", "secret", "show"), mock.call_args.args[:3])
    def test_untrusted_secret_provenance_fails_closed(self):
        name = release.SECRET_NAMES["bank-internal"]
        with patch.object(release, "az", return_value={"id": "version", "enabled": True, "tags": {}}):
            with self.assertRaises(release.GuardError): release.ensure_secret("craveskv", name, {name})
    def test_desired_config_does_not_enable_provider_or_money_movement(self):
        values = release.desired({role: app() for role in release.APPS})
        keys = {key for entries in values.values() for key in entries}
        self.assertNotIn("CRAVES_BANK_PROVIDER_ENABLED", keys)
        self.assertNotIn("CRAVES_RAZORPAYX_PRODUCTION_APPROVED", keys)
        self.assertNotIn("CRAVES_LEDGER_POSTING_ENABLED", keys)
        self.assertNotIn("CRAVES_RAZORPAYX_KEY_SECRET", keys)
    def test_wrong_release_sha_is_rejected_before_azure_calls(self):
        with patch.object(release.subprocess, "check_output", return_value="a" * 40 + "\n"), patch.object(release, "az") as mock:
            with self.assertRaises(release.GuardError): release.main(["--apply", "--expected-source-sha", "b" * 40])
            mock.assert_not_called()
    def test_plan_is_read_only_and_contains_references_not_secret_values(self):
        calls = []
        def fake(*args):
            calls.append(args)
            if args[:2] == ("account", "show"): return {"id": "test-subscription"}
            if args[:2] == ("containerapp", "show"): return app()
            if args[:2] == ("keyvault", "show"): return "test-vault-id"
            raise AssertionError("Unexpected Azure write")
        with tempfile.TemporaryDirectory() as folder, patch.object(release.subprocess, "check_output", return_value="a" * 40 + "\n"), patch.object(release, "az", side_effect=fake):
            path = Path(folder) / "plan.json";self.assertEqual(0, release.main(["--output", str(path)]))
            result = json.loads(path.read_text());self.assertEqual("PLAN_ONLY", result["mode"])
            self.assertFalse(result["providerCallsEnabledByThisScript"]);self.assertFalse(result["newAzureResources"])
        self.assertTrue(all("set" not in args and "update" not in args for args in calls))

if __name__ == "__main__": unittest.main()
