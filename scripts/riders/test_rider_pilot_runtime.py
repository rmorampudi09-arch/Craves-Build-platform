"""Tests for rider_pilot_runtime.py with a fake Azure CLI: python3 -m unittest discover -s scripts/riders -p 'test_*.py'"""
import copy
import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

import rider_pilot_runtime as runtime

KEY = "same-internal-key"
PRODUCTION = {"id": "34eefd95-1a19-416f-b9df-92b326500615", "tenantId": "182d6285-5895-47f8-9ade-77b10854ed0d"}
# Since 29 Oct 2026 each app lives in its own resource group (docs/runbooks/production-environment.md).
GROUP = {"ca-craves-integration-prod": "rg-craves-integration-prod", "ca-craves-order-prod": "rg-craves-order-prod",
         "ca-craves-notification-prod": "rg-craves-notification-prod", "ca-craves-user-chef-prod": "rg-craves-user-chef-prod",
         "ca-craves-auth-prod": "rg-craves-auth-prod"}


def app(name, env, secrets=None):
    return {"name": name, "properties": {
        "provisioningState": "Succeeded", "latestRevisionName": name + "--r1", "latestReadyRevisionName": name + "--r1",
        "configuration": {"ingress": {"fqdn": name + ".internal.env.centralindia.azurecontainerapps.io"}},
        "template": {"containers": [{"name": "app", "env": env}]}},
        "_secrets": secrets or {}}


def ref(name, secret):
    return {"name": name, "secretRef": secret}


def val(name, value):
    return {"name": name, "value": value}


def ready_world():
    return {
        "ca-craves-integration-prod": app("ca-craves-integration-prod", [
            ref("CRAVES_INTERNAL_SERVICE_KEY", "internal"), ref("CRAVES_STORAGE_ENDPOINT_VALUE", "storage"),
            ref("CRAVES_BANK_DATA_KEYS_JSON", "bank"), val("CRAVES_BANK_DATA_ACTIVE_KEY_ID", "bank-v1"),
            val("CRAVES_LEDGER_POSTING_ENABLED", "true")],
            {"internal": KEY, "storage": "DefaultEndpointsProtocol=https;AccountKey=x", "bank": "{}"}),
        "ca-craves-order-prod": app("ca-craves-order-prod", [ref("CRAVES_INTERNAL_SERVICE_KEY", "k")], {"k": KEY}),
        "ca-craves-notification-prod": app("ca-craves-notification-prod", [
            ref("CRAVES_INTERNAL_SERVICE_KEY", "k"), ref("FIREBASE_SERVICE_ACCOUNT_JSON_BASE64", "fb"),
            ref("ACS_EMAIL_CONNECTION_STRING", "acs")], {"k": KEY, "fb": "e30=", "acs": "endpoint=x"}),
        "ca-craves-user-chef-prod": app("ca-craves-user-chef-prod", [
            ref("CRAVES_INTERNAL_SERVICE_SECRET", "k"), ref("OLA_MAPS_API_KEY", "ola")], {"k": KEY, "ola": "o"}),
        "ca-craves-auth-prod": app("ca-craves-auth-prod", [
            ref("CRAVES_INTERNAL_SERVICE_SECRET", "k"), val("CRAVES_CENTRAL_OTP_ENABLED", "true"), ref("MSG91_AUTHKEY", "msg"),
            val("CRAVES_MSG91_OTP_TEMPLATE_ID", "0123456789abcdef01234567")], {"k": KEY, "msg": "msg91-auth-key"}),
    }


class FakeAz:
    """The signed-in account, Key Vault secrets, and Container Apps in memory: show, secret list, update (set/remove env)
    and revision show."""

    def __init__(self, world, fail_revision=None, account=None, vault=None):
        """fail_revision: the one revision name (for example "<app>--r2") that comes up failed. vault: Key Vault secret
        URL to value; an app secret given as {"keyVaultUrl": url} points at one."""
        self.world, self.fail_revision, self.updates, self.calls = world, fail_revision, [], []
        self.account, self.vault = account or PRODUCTION, vault or {}

    def __call__(self, *args, output="json"):
        args = list(args)
        self.calls.append(args)
        if args[:2] == ["account", "show"]:
            return dict(self.account)
        if args[:3] == ["keyvault", "secret", "show"]:
            url = args[args.index("--id") + 1]
            if url not in self.vault:
                raise runtime.GuardError("Azure command failed: az keyvault secret show")
            return {"id": url, "value": self.vault[url]}
        name = args[args.index("-n") + 1] if "-n" in args else None
        if name and args[args.index("-g") + 1] != GROUP[name]:
            raise AssertionError(f"{name} used outside its resource group")
        if args[:2] == ["containerapp", "show"]:
            return copy.deepcopy({k: v for k, v in self.world[name].items() if k != "_secrets"})
        if args[:3] == ["containerapp", "secret", "list"]:
            return [{"name": k, **(v if isinstance(v, dict) else {"value": v})} for k, v in self.world[name]["_secrets"].items()]
        if args[:2] == ["containerapp", "update"]:
            self.updates.append((name, args))
            env = self.world[name]["properties"]["template"]["containers"][0]["env"]
            if "--set-env-vars" in args:
                for pair in args[args.index("--set-env-vars") + 1:]:
                    key, value = pair.split("=", 1)
                    env[:] = [e for e in env if e["name"] != key] + [{"name": key, "value": value}]
            if "--remove-env-vars" in args:
                gone = set(args[args.index("--remove-env-vars") + 1:])
                env[:] = [e for e in env if e["name"] not in gone]
            props = self.world[name]["properties"]
            number = int(props["latestRevisionName"].rsplit("--r", 1)[1]) + 1
            props["latestRevisionName"] = f"{name}--r{number}"
            if props["latestRevisionName"] != self.fail_revision:
                props["latestReadyRevisionName"] = props["latestRevisionName"]
            return None
        if args[:3] == ["containerapp", "revision", "show"]:
            failed = args[args.index("--revision") + 1] == self.fail_revision
            return {"properties": {"runningState": "Failed" if failed else "Running", "healthState": "Healthy",
                                   "provisioningState": "Failed" if failed else "Succeeded"}}
        raise AssertionError("unexpected az call: " + " ".join(args))


SHA = "a" * 40
WIRE = ["--stage", "wire", "--support-phone", "+919876543210", "--ops-alert-emails", "ops@craves.in, lead@craves.in",
        "--support-whatsapp-url", "https://chat.whatsapp.com/AbC123"]


class RiderPilotRuntimeTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.output = os.path.join(self.folder.name, "plan.json")

    def tearDown(self):
        self.folder.cleanup()

    def run_main(self, fake, argv):
        out = io.StringIO()
        with patch.object(runtime, "az", fake), patch.object(runtime.time, "sleep"), \
                patch.object(runtime.subprocess, "check_output", return_value=SHA + "\n"), redirect_stdout(out):
            code = runtime.main([*argv, "--output", self.output, "--ready-attempts", "3"])
        with open(self.output) as stream:
            return code, out.getvalue(), json.load(stream)

    @staticmethod
    def env(fake, name):
        return {e["name"]: e.get("value", "<ref>") for e in fake.world[name]["properties"]["template"]["containers"][0]["env"]}

    def test_status_is_read_only_and_never_prints_secrets(self):
        fake = FakeAz(ready_world())
        code, out, report = self.run_main(fake, ["--stage", "status"])
        self.assertEqual(0, code)
        self.assertEqual([], fake.updates)
        self.assertNotIn(KEY, out + json.dumps(report))
        self.assertNotIn("AccountKey", out + json.dumps(report))
        self.assertEqual("<secret internal>", report["apps"]["integration"]["settings"]["CRAVES_INTERNAL_SERVICE_KEY"])
        self.assertEqual("<missing>", report["apps"]["integration"]["settings"]["CRAVES_FLEET_ENABLED"])
        # The switches that stay off until their check are listed too (GO-LIVE.md §8).
        for later in runtime.LATER:
            self.assertEqual("<missing>", report["apps"]["integration"]["settings"][later])
        self.assertEqual("<missing>", report["apps"]["order"]["settings"]["CRAVES_DOMAIN_EVENT_ENABLED_TYPES"])
        self.assertEqual([], report["problems"])

    def test_status_needs_the_msg91_otp_for_rider_sign_in(self):
        world = ready_world()
        world["ca-craves-auth-prod"]["properties"]["template"]["containers"][0]["env"] = [
            ref("CRAVES_INTERNAL_SERVICE_SECRET", "k")]
        code, out, report = self.run_main(FakeAz(world), ["--stage", "status"])
        self.assertEqual(0, code)
        self.assertTrue(any("CRAVES_CENTRAL_OTP_ENABLED" in p for p in report["problems"]))
        self.assertNotIn("msg91-auth-key", out + json.dumps(report))

    def test_status_lists_what_people_must_fix(self):
        world = ready_world()
        world["ca-craves-auth-prod"]["_secrets"]["k"] = "a-different-key"
        world["ca-craves-notification-prod"]["properties"]["template"]["containers"][0]["env"] = [
            ref("CRAVES_INTERNAL_SERVICE_KEY", "k")]
        code, out, report = self.run_main(FakeAz(world), ["--stage", "status"])
        self.assertEqual(0, code)
        self.assertTrue(any("ca-craves-auth-prod CRAVES_INTERNAL_SERVICE_SECRET" in p for p in report["problems"]))
        self.assertTrue(any("FIREBASE_SERVICE_ACCOUNT_JSON_BASE64" in p for p in report["problems"]))
        self.assertTrue(any("ACS email" in w for w in report["warnings"]))
        self.assertIn("TO DO:", out)
        self.assertNotIn("a-different-key", out + json.dumps(report))

    def test_wire_plan_changes_nothing_without_apply(self):
        fake = FakeAz(ready_world())
        code, out, report = self.run_main(fake, WIRE)
        self.assertEqual(0, code)
        self.assertEqual([], fake.updates)
        integration = report["changes"]["ca-craves-integration-prod"]
        self.assertEqual("https://ca-craves-order-prod.internal.env.centralindia.azurecontainerapps.io",
                         integration["CRAVES_FLEET_ORDER_BASE_URL"])
        self.assertEqual("+919876543210", integration["CRAVES_FLEET_SUPPORT_PHONE"])
        self.assertNotIn("CRAVES_FLEET_ENABLED", integration)
        self.assertEqual({"CRAVES_REALTIME_PUSH_ENABLED": "true", "CRAVES_OPS_ALERT_EMAILS": "ops@craves.in,lead@craves.in"},
                         report["changes"]["ca-craves-notification-prod"])
        self.assertIn("Plan only", out)
        self.assertIn("--apply --expected-source-sha " + SHA, out, "the plan names the commit to apply")

    def test_apply_needs_the_reviewed_commit(self):
        with self.assertRaises(runtime.GuardError):
            self.run_main(FakeAz(ready_world()), [*WIRE, "--apply", "--expected-source-sha", "b" * 40])
        with self.assertRaises(runtime.GuardError):
            self.run_main(FakeAz(ready_world()), ["--stage", "status", "--apply", "--expected-source-sha", SHA])

    def test_wire_then_enable_then_disable(self):
        fake = FakeAz(ready_world())
        code, _, _ = self.run_main(fake, [*WIRE, "--apply", "--expected-source-sha", SHA])
        self.assertEqual(0, code)
        integration = self.env(fake, "ca-craves-integration-prod")
        self.assertEqual("+919876543210", integration["CRAVES_FLEET_SUPPORT_PHONE"])
        self.assertNotIn("CRAVES_FLEET_ENABLED", integration)
        self.assertEqual("true", self.env(fake, "ca-craves-notification-prod")["CRAVES_REALTIME_PUSH_ENABLED"])

        code, _, report = self.run_main(fake, [*WIRE, "--apply", "--expected-source-sha", SHA])
        self.assertEqual((0, {}), (code, report["changes"]), "wiring twice changes nothing")

        code, _, _ = self.run_main(fake, ["--stage", "enable", "--apply", "--expected-source-sha", SHA])
        self.assertEqual(0, code)
        integration = self.env(fake, "ca-craves-integration-prod")
        for flag in runtime.FLAGS:
            self.assertEqual("true", integration[flag])
        self.assertEqual(("true", "false"), (integration["CRAVES_FLEET_TEST_MODE"], integration["CRAVES_FLEET_PAYOUT_EXECUTION_ENABLED"]))

        code, _, _ = self.run_main(fake, ["--stage", "disable", "--apply", "--expected-source-sha", SHA])
        self.assertEqual(0, code)
        integration = self.env(fake, "ca-craves-integration-prod")
        for flag in runtime.FLAGS:
            self.assertEqual("false", integration[flag])
        self.assertEqual("+919876543210", integration["CRAVES_FLEET_SUPPORT_PHONE"], "disable keeps the wiring")

    def test_enable_refuses_before_wiring(self):
        fake = FakeAz(ready_world())
        code, out, report = self.run_main(fake, ["--stage", "enable", "--apply", "--expected-source-sha", SHA])
        self.assertEqual(1, code)
        self.assertEqual([], fake.updates)
        self.assertTrue(any("run the wire stage first" in p for p in report["problems"]))
        self.assertIn("BLOCKED:", out)

    def test_wire_refuses_bad_inputs_and_mismatched_keys(self):
        world = ready_world()
        world["ca-craves-order-prod"]["properties"]["template"]["containers"][0]["env"] = []
        fake = FakeAz(world)
        code, _, report = self.run_main(fake, ["--stage", "wire", "--support-phone", "12345", "--ops-alert-emails", "not-an-email",
                                               "--support-whatsapp-url", "http://example.com"])
        self.assertEqual(1, code)
        text = " ".join(report["problems"])
        for expected in ("--support-phone", "--ops-alert-emails", "--support-whatsapp-url", "ca-craves-order-prod"):
            self.assertIn(expected, text)
        self.assertEqual([], fake.updates)

    def test_disable_always_works_even_when_wiring_is_broken(self):
        world = ready_world()
        world["ca-craves-auth-prod"]["_secrets"]["k"] = "different"
        world["ca-craves-integration-prod"]["properties"]["template"]["containers"][0]["env"].append(
            val("CRAVES_FLEET_ENABLED", "true"))
        fake = FakeAz(world)
        code, _, _ = self.run_main(fake, ["--stage", "disable", "--apply", "--expected-source-sha", SHA])
        self.assertEqual(0, code)
        self.assertEqual("false", self.env(fake, "ca-craves-integration-prod")["CRAVES_FLEET_ENABLED"])

    def test_failed_revision_puts_previous_values_back(self):
        world = ready_world()
        world["ca-craves-integration-prod"]["properties"]["template"]["containers"][0]["env"].append(
            val("CRAVES_FLEET_MIN_APP_VERSION", "0.9.0"))
        fake = FakeAz(world, fail_revision="ca-craves-integration-prod--r2")
        with self.assertRaises(runtime.GuardError) as failure:
            self.run_main(fake, [*WIRE, "--apply", "--expected-source-sha", SHA])
        self.assertIn("previous values restored", str(failure.exception))
        integration = self.env(fake, "ca-craves-integration-prod")
        self.assertEqual("0.9.0", integration["CRAVES_FLEET_MIN_APP_VERSION"], "changed value restored")
        self.assertNotIn("CRAVES_FLEET_SUPPORT_PHONE", integration, "added value removed")
        self.assertEqual("true", self.env(fake, "ca-craves-notification-prod")["CRAVES_REALTIME_PUSH_ENABLED"],
                         "notification goes first; push on with nothing calling it is harmless")

    def test_failed_restore_says_a_person_must_check(self):
        fake = FakeAz(ready_world(), fail_revision="ca-craves-integration-prod--r2")
        original = fake.__call__

        def failing_twice(*args, output="json"):
            result = original(*args, output=output)
            if list(args[:2]) == ["containerapp", "update"] and "--remove-env-vars" in args:
                fake.fail_revision = fake.world["ca-craves-integration-prod"]["properties"]["latestRevisionName"]
                fake.world["ca-craves-integration-prod"]["properties"]["latestReadyRevisionName"] = "stale"
            return result
        with self.assertRaises(runtime.GuardError) as failure:
            self.run_main(failing_twice, [*WIRE, "--apply", "--expected-source-sha", SHA])
        self.assertIn("a person must check the app in Azure now", str(failure.exception))

    def test_failed_disable_never_switches_the_fleet_back_on(self):
        world = ready_world()
        world["ca-craves-integration-prod"]["properties"]["template"]["containers"][0]["env"].append(
            val("CRAVES_FLEET_ENABLED", "true"))
        fake = FakeAz(world, fail_revision="ca-craves-integration-prod--r2")
        with self.assertRaises(runtime.GuardError) as failure:
            self.run_main(fake, ["--stage", "disable", "--apply", "--expected-source-sha", SHA])
        self.assertIn("no roll back for disable", str(failure.exception))
        self.assertEqual("false", self.env(fake, "ca-craves-integration-prod")["CRAVES_FLEET_ENABLED"])

    def test_plain_secret_values_are_never_printed(self):
        world = ready_world()
        env = world["ca-craves-integration-prod"]["properties"]["template"]["containers"][0]["env"]
        env[:] = [e for e in env if e["name"] != "CRAVES_STORAGE_ENDPOINT_VALUE"] + [
            val("CRAVES_STORAGE_ENDPOINT_VALUE", "DefaultEndpointsProtocol=https;AccountKey=plain-secret")]
        code, out, report = self.run_main(FakeAz(world), ["--stage", "status"])
        self.assertEqual(0, code)
        self.assertNotIn("plain-secret", out + json.dumps(report))
        self.assertEqual("<set>", report["apps"]["integration"]["settings"]["CRAVES_STORAGE_ENDPOINT_VALUE"])

    def test_never_replaces_a_secret_reference(self):
        world = ready_world()
        world["ca-craves-integration-prod"]["properties"]["template"]["containers"][0]["env"].append(
            ref("CRAVES_FLEET_SUPPORT_PHONE", "phone"))
        with self.assertRaises(runtime.GuardError):
            self.run_main(FakeAz(world), WIRE)

    def test_refuses_any_other_subscription_before_reading_anything(self):
        idle = {"id": "721906c9-4a72-4606-830b-d3e7ace093ff", "tenantId": "1e7e43ac-c7f5-4d47-a74f-289a7cc21508"}
        for argv in (["--stage", "status"], ["--stage", "disable", "--apply", "--expected-source-sha", SHA]):
            fake = FakeAz(ready_world(), account=idle)
            with self.assertRaises(runtime.GuardError) as refused:
                self.run_main(fake, argv)
            self.assertIn("az account set -s 34eefd95-1a19-416f-b9df-92b326500615", str(refused.exception))
            self.assertEqual([["account", "show"]], fake.calls)

    def test_reads_key_vault_secrets_without_printing_them(self):
        world = ready_world()
        url = "https://kv-crv-order-34eefd.vault.azure.net/secrets/craves-internal-service-key"
        world["ca-craves-order-prod"]["_secrets"]["k"] = {"keyVaultUrl": url, "identity": "system"}
        code, out, report = self.run_main(FakeAz(world, vault={url: KEY}), ["--stage", "status"])
        self.assertEqual((0, []), (code, report["problems"]))
        self.assertNotIn(KEY, out + json.dumps(report))

        _, _, report = self.run_main(FakeAz(world, vault={url: "another-key"}), ["--stage", "status"])
        self.assertTrue(any("ca-craves-order-prod CRAVES_INTERNAL_SERVICE_KEY" in p for p in report["problems"]))
        with self.assertRaises(runtime.GuardError) as unreadable:
            self.run_main(FakeAz(world), ["--stage", "status"])
        self.assertIn("Key Vault Secrets User", str(unreadable.exception))

    def test_origin_must_be_an_azure_hostname(self):
        bad = ready_world()["ca-craves-order-prod"]
        bad["properties"]["configuration"]["ingress"]["fqdn"] = "attacker.example/path"
        with self.assertRaises(runtime.GuardError):
            runtime.origin(bad)


if __name__ == "__main__":
    unittest.main()
