"""Tests for preflight.py with a fake Azure CLI: python3 -m unittest discover -s scripts/account-deletion -p 'test_preflight.py'"""
import copy
import io
import json
import os
import subprocess
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest.mock import patch

import preflight

SECRET = "SENTINEL-SECRET-VALUE"
AUTH = "ca-craves-auth-prod"
NAMES = ["subscription", "order", "integration", "referral", "advanced", "catalog", "user-chef", "notification"]


def app(name, env, secrets=None, fqdn=None, restrictions=None, traffic=None):
    ingress = {"external": False, "fqdn": fqdn or f"{name}.internal.env.centralindia.azurecontainerapps.io"}
    if restrictions:
        ingress["ipSecurityRestrictions"] = restrictions
    configuration = {"ingress": ingress, "secrets": secrets or []}
    if traffic:
        configuration["activeRevisionsMode"] = "Multiple"
        ingress["traffic"] = traffic
    return {"name": name, "properties": {
        "provisioningState": "Succeeded", "runningStatus": "Running", "latestRevisionName": name + "--r1",
        "latestReadyRevisionName": name + "--r1", "configuration": configuration,
        "template": {"containers": [{"name": "app", "env": env}]}}}


def ref(name, secret):
    return {"name": name, "secretRef": secret}


def val(name, value):
    return {"name": name, "value": value}


def env_of(world, name):
    return world[name]["properties"]["template"]["containers"][0]["env"]


def ready_world():
    credential = {"subscription": "CRAVES_INTERNAL_SERVICE_SECRET", "order": "CRAVES_INTERNAL_SERVICE_KEY",
                  "integration": "CRAVES_INTERNAL_SERVICE_KEY", "advanced": "CRAVES_INTERNAL_SERVICE_SECRET",
                  "catalog": "CRAVES_INTERNAL_SERVICE_SECRET", "user-chef": "CRAVES_INTERNAL_SERVICE_SECRET",
                  "notification": "CRAVES_INTERNAL_SERVICE_KEY"}
    auth_env = [ref("CRAVES_INTERNAL_SERVICE_SECRET", "internal-secret"),
                ref("CRAVES_REFERRAL_SOURCE_HMAC_BASE64", "referral-source-hmac"),
                ref("CRAVES_ACCOUNT_DELETION_REFERRAL_HMAC_BASE64", "referral-source-hmac"),
                val("CRAVES_ACCOUNT_DELETION_ENABLED", "false"), val("CRAVES_ACCOUNT_DELETION_WORKER_ENABLED", "false")]
    world = {}
    for name in NAMES:
        key = name.upper().replace("-", "_")
        auth_env.append(val(f"CRAVES_ACCOUNT_DELETION_{key}_BASE_URL", f"https://{name}.example.azurecontainerapps.io"))
        if name != "referral":
            auth_env.append(ref(f"CRAVES_ACCOUNT_DELETION_{key}_CREDENTIAL", "internal-secret"))
            world[f"ca-craves-{name}-prod"] = app(f"ca-craves-{name}-prod", [ref(credential[name], "cred")])
    world["ca-craves-referral-prod"] = app("ca-craves-referral-prod", [ref("CRAVES_REFERRALS_AUTH_HMAC_BASE64", "hmac")])
    world["ca-craves-referral-members-prod"] = app("ca-craves-referral-members-prod", [])
    world[AUTH] = app(AUTH, auth_env, secrets=[{"name": "internal-secret", "keyVaultUrl":
                                                "https://kv-crv-auth-34eefd.vault.azure.net/secrets/craves-internal-service-secret"}])
    return world


def drop_env(world, name, var):
    env = env_of(world, name)
    env[:] = [e for e in env if e["name"] != var]


def set_val(world, name, var, value):
    drop_env(world, name, var)
    env_of(world, name).append(val(var, value))


def add_env(world, name, item):
    env_of(world, name).append(item)


def drop_all_deletion_settings(world):
    env = env_of(world, AUTH)
    env[:] = [e for e in env if not e["name"].startswith("CRAVES_ACCOUNT_DELETION_")]


def split_traffic(world, name, a, b):
    configuration = world[name]["properties"]["configuration"]
    configuration["activeRevisionsMode"] = "Multiple"
    configuration["ingress"]["traffic"] = [{"revisionName": name + "--r1", "weight": a},
                                           {"revisionName": name + "--r0", "weight": b}]


def fake_az(world):
    calls = []

    def run(cmd, **kwargs):
        calls.append(cmd)
        assert cmd[:3] == ["az", "containerapp", "show"], cmd
        name = cmd[cmd.index("-n") + 1]
        assert cmd[cmd.index("-g") + 1] == name.replace("ca-", "rg-", 1)
        return subprocess.CompletedProcess(cmd, 0, json.dumps(copy.deepcopy(world[name])), "")
    run.calls = calls
    return run


def failing_az(stderr):
    return lambda cmd, **kwargs: subprocess.CompletedProcess(cmd, 1, "stdout " + stderr, stderr)


def run(world_or_fake, *argv):
    fake = world_or_fake if callable(world_or_fake) else fake_az(world_or_fake)
    out = io.StringIO()
    with patch.object(preflight.subprocess, "run", fake), redirect_stdout(out), redirect_stderr(out):
        code = preflight.main(list(argv))
    return code, out.getvalue()


def section(out, title):
    return out.split(f"## {title}\n", 1)[1].split("\n## ", 1)[0]


class PreflightTest(unittest.TestCase):
    def test_ready_world_exits_0_and_suggests_eight_base_urls(self):
        code, out = run(ready_world())
        self.assertEqual(0, code, out)
        for name in NAMES:
            self.assertIn(f"{name}:", out)
        self.assertGreaterEqual(out.count("https://"), 8)

    def test_missing_credential_on_a_target_exits_1_and_names_it(self):
        world = ready_world()
        drop_env(world, "ca-craves-advanced-prod", "CRAVES_INTERNAL_SERVICE_SECRET")
        code, out = run(world)
        self.assertEqual(1, code)
        self.assertIn("advanced", out)
        self.assertIn("CRAVES_INTERNAL_SERVICE_SECRET missing", out)

    def test_enforced_path_patterns_stop(self):
        for value in ("/internal/**", "/internal/v1/account-erasure", "/a/b, /internal/v1/account-erasure/**"):
            world = ready_world()
            set_val(world, "ca-craves-order-prod", "CRAVES_INTERNAL_AUTH_ENFORCED_PATHS", value)
            code, out = run(world)
            self.assertEqual(2, code, value)
            self.assertIn("STOP: order", out)
        world = ready_world()
        set_val(world, "ca-craves-order-prod", "CRAVES_INTERNAL_AUTH_ENFORCED_PATHS", "/internal/v1/orders/**")
        self.assertEqual(0, run(world)[0])

    def test_ingress_allows_auth_by_range_and_deny(self):
        def verdict(rules):
            world = ready_world()
            world["ca-craves-catalog-prod"]["properties"]["configuration"]["ingress"]["ipSecurityRestrictions"] = rules
            return run(world)

        code, out = verdict([{"name": "a", "ipAddressRange": "20.198.108.0/24", "action": "Allow"}])
        self.assertEqual(0, code, out)
        self.assertIn("ingress: allows auth", out)
        code, out = verdict([{"name": "a", "ipAddressRange": "10.0.0.1/32", "action": "Allow"}])
        self.assertEqual(1, code)
        self.assertIn("ingress: does not allow auth", out)
        code, out = verdict([{"name": "a", "ipAddressRange": "20.198.108.229/32", "action": "Deny"}])
        self.assertEqual(1, code)
        self.assertIn("ingress: does not allow auth", out)
        self.assertIn("ingress: open", run(ready_world())[1])
        code, out = run(ready_world(), "--auth-outbound-ip", "10.0.0.1")
        self.assertEqual(0, code)

    def test_referral_target_is_the_app_holding_the_auth_hmac(self):
        code, out = run(ready_world())
        self.assertIn("referral: ca-craves-referral-prod", out)
        world = ready_world()
        add_env(world, "ca-craves-referral-members-prod", ref("CRAVES_REFERRALS_AUTH_HMAC_BASE64", "x"))
        code, out = run(world)
        self.assertEqual(1, code)
        self.assertIn("both referral apps", out)
        world = ready_world()
        drop_env(world, "ca-craves-referral-prod", "CRAVES_REFERRALS_AUTH_HMAC_BASE64")
        self.assertEqual(1, run(world)[0])

    def test_traffic_split_is_reported_not_guessed(self):
        world = ready_world()
        split_traffic(world, AUTH, 90, 10)
        code, out = run(world)
        self.assertEqual(1, code)
        self.assertIn("rolling out", out)

    def test_no_secret_value_reaches_output(self):
        world = ready_world()
        set_val(world, AUTH, "CRAVES_ACCOUNT_DELETION_ORDER_CREDENTIAL", SECRET)
        code, out = run(world)
        self.assertNotIn(SECRET, out)
        self.assertIn("plain value (hidden)", out)
        code, out = run(failing_az(stderr="token " + SECRET))
        self.assertEqual(1, code)
        self.assertNotIn(SECRET, out)
        self.assertIn("Azure command failed", out)

    def test_commands_never_set_switches_or_values(self):
        world = ready_world()
        drop_all_deletion_settings(world)
        code, out = run(world)
        commands = section(out, "commands")
        self.assertEqual(1, code)
        self.assertIn("az containerapp update -g rg-craves-auth-prod -n ca-craves-auth-prod", commands)
        self.assertIn("secretref:internal-secret", commands)
        self.assertIn("secretref:referral-source-hmac", commands)
        self.assertIn("CRAVES_ACCOUNT_DELETION_ORDER_BASE_URL=https://ca-craves-order-prod.", commands)
        self.assertNotIn("CRAVES_ACCOUNT_DELETION_ENABLED", commands)
        self.assertNotIn("WORKER_ENABLED", commands)
        self.assertNotIn(SECRET, commands)

    def test_only_container_app_show_is_called_and_output_file_holds_no_value(self):
        world = ready_world()
        set_val(world, AUTH, "CRAVES_ACCOUNT_DELETION_ORDER_CREDENTIAL", SECRET)
        fake = fake_az(world)
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "preflight.json")
            code, _ = run(fake, "--output", path)
            with open(path) as stream:
                text = stream.read()
        self.assertEqual(0, code)
        self.assertNotIn(SECRET, text)
        self.assertTrue(all(c[:3] == ["az", "containerapp", "show"] for c in fake.calls))


if __name__ == "__main__":
    unittest.main()
