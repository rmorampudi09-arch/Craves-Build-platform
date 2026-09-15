import copy
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("release_plan", Path(__file__).with_name("verify-release-plan.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
SUB = "11111111-1111-4111-8111-111111111111"
RG = "disposable-plan-test"

def example():
    prefix = f"/subscriptions/{SUB}/resourceGroups/{RG}/providers/"
    values = {
        "appName": "ca-craves-referral-test", "location": "centralindia",
        "managedEnvironmentId": prefix + "Microsoft.App/managedEnvironments/test",
        "userAssignedIdentityId": prefix + "Microsoft.ManagedIdentity/userAssignedIdentities/test",
        "registryServer": "disposabletest.azurecr.io", "image": "disposabletest.azurecr.io/referrals@sha256:" + "a" * 64,
        "redisHost": "disposable.example.test", "redisPort": 6380,
        "secretReferences": {name: f"https://disposable-test.vault.azure.net/secrets/{name}/" + "b" * 32 for name in module.SECRETS}
    }
    return {"parameters": {name: {"value": value} for name, value in values.items()}}

class ReleasePlanTest(unittest.TestCase):
    def test_accepts_only_static_dormant_new_name_plan(self):
        module.validate(example(), [], SUB, RG)
    def test_rejects_existing_app(self):
        inventory = [{"name": "ca-craves-referral-test", "id": f"/subscriptions/{SUB}/resourceGroups/{RG}/providers/Microsoft.App/containerApps/ca-craves-referral-test"}]
        with self.assertRaises(ValueError): module.validate(example(), inventory, SUB, RG)
    def test_rejects_placeholder_tag_flag_raw_secret_and_shared_source_key(self):
        for key, value in [("image", "disposabletest.azurecr.io/referrals:latest"), ("location", "REPLACE_REGION"), ("appName", "ca-craves-web-prodlow")]:
            plan = example(); plan["parameters"][key]["value"] = value
            with self.assertRaises(ValueError): module.validate(plan, [], SUB, RG)
        plan = example(); plan["parameters"]["CRAVES_REFERRALS_ENABLED"] = {"value": True}
        with self.assertRaises(ValueError): module.validate(plan, [], SUB, RG)
        plan = example(); plan["parameters"]["secretReferences"]["value"]["dbPassword"] = "raw-secret-not-a-url"
        with self.assertRaises(ValueError): module.validate(plan, [], SUB, RG)
        plan = example(); refs = plan["parameters"]["secretReferences"]["value"]; refs["authHmac"] = refs["orderHmac"]
        with self.assertRaises(ValueError): module.validate(plan, [], SUB, RG)
    def test_rejects_wrong_subscription_inventory(self):
        with self.assertRaises(ValueError): module.validate(example(), [{"name": "other", "id": "/subscriptions/OTHER/resourceGroups/WRONG/providers/Microsoft.App/containerApps/other"}], SUB, RG)

if __name__ == "__main__": unittest.main()
