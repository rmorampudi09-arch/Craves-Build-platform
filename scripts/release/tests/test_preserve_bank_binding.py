import importlib.util
from pathlib import Path
import unittest
from unittest.mock import Mock

SPEC = importlib.util.spec_from_file_location("binding", Path(__file__).resolve().parents[1] / "preserve_bank_binding.py")
binding = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(binding)


class BindingTests(unittest.TestCase):
    def setUp(self):
        self.app = {"identity": {"type": "SystemAssigned"}, "properties": {
            "configuration": {"secrets": [{"name": "bank-internal"}]},
            "template": {"containers": [{"env": [{"name": "BANK", "secretRef": "bank-internal"}]}]}}}
        self.metadata = [{"name": "bank-internal"}, {"name": "pg-pass", "identity": "system",
                         "keyVaultUrl": "https://scoped.vault.azure.net/secrets/pg"}]
        self.vaults = [{"name": "scoped", "properties": {"vaultUri": "https://scoped.vault.azure.net/"}}]
        self.secret = "existing-test-value"
        self.saved = None
        self.calls = []

    def azure(self, *args):
        self.calls.append(args)
        if args[:3] == ("containerapp", "secret", "list"):
            if "--show-values" in args:
                return [{"name": "bank-internal", "value": self.secret}]
            return self.metadata
        if args[:2] == ("keyvault", "list"):
            return self.vaults
        if args[:3] == ("keyvault", "secret", "list"):
            return [{"name": binding.DESTINATION}] if self.saved else []
        if args[:3] == ("keyvault", "secret", "show"):
            return self.saved
        if args[:3] == ("keyvault", "secret", "set"):
            value = Path(args[args.index("--file") + 1]).read_text()
            self.saved = {"id": "https://scoped.vault.azure.net/secrets/" + binding.DESTINATION + "/version1", "value": value}
            return self.saved
        if args[:3] == ("containerapp", "secret", "set"):
            self.metadata[0].update(keyVaultUrl=self.saved["id"], identity="system")
            return []
        raise AssertionError("Unexpected Azure command")

    def test_plan_is_read_only_and_redacted(self):
        plan, _ = binding.inspect(self.azure, "rg", "chef", self.app)
        self.assertTrue(plan["repairRequired"])
        self.assertNotIn(self.secret, str(plan))
        self.assertFalse(any("set" in call for call in self.calls))

    def test_explicit_confirmation_precedes_reads(self):
        azure = Mock()
        with self.assertRaisesRegex(ValueError, "confirmation"):
            binding.apply(azure, "rg", "chef", Mock())
        azure.assert_not_called()

    def test_copy_preserves_value_and_uses_pinned_version(self):
        result = binding.apply(self.azure, "rg", "chef", lambda _: self.app, confirmed=True)
        self.assertTrue(result["verified"])
        self.assertEqual(self.saved["value"], self.secret)
        self.assertEqual(self.metadata[0]["keyVaultUrl"], self.saved["id"])
        self.assertFalse(any(self.secret in str(call) for call in self.calls))

    def test_existing_different_value_is_never_overwritten(self):
        self.saved = {"value": "different"}
        with self.assertRaisesRegex(ValueError, "different value"):
            binding.apply(self.azure, "rg", "chef", lambda _: self.app, confirmed=True)
        self.assertFalse(any("set" in call for call in self.calls))

    def test_other_vault_is_rejected(self):
        self.metadata[1]["keyVaultUrl"] = "https://unrelated.vault.azure.net/secrets/pg"
        with self.assertRaisesRegex(ValueError, "scoped"):
            binding.inspect(self.azure, "rg", "chef", self.app)


if __name__ == "__main__":
    unittest.main()
