import copy
from datetime import datetime, timezone
import json
import unittest
from unittest.mock import patch
import uuid

import configure_catalog_read_runtime as target


def app():
    return {"name": target.APPS["integration"], "location": "centralindia", "identity": {"type": "SystemAssigned", "principalId": "existing"},
            "properties": {"configuration": {"activeRevisionsMode": "Single", "secrets": [],
                "ingress": {"fqdn": "ca-craves-integration-service-pr.example.azurecontainerapps.io"}},
                "template": {"scale": {"minReplicas": 1, "maxReplicas": 1}, "containers": [{"name": "app", "image": "unchanged", "env": [
                    {"name": "CRAVES_FINANCE_INTERNAL_KEY", "secretRef": "money-existing"}, {"name": "CRAVES_LEDGER_POSTING_ENABLED", "value": "true"}]}]}}}


class RuntimeTests(unittest.TestCase):
    def test_only_two_apps_and_read_settings(self):
        settings = target.wanted({"integration": app()})
        self.assertEqual(set(settings), {"catalog", "integration"})
        self.assertEqual(set(settings["integration"]), {target.SETTING})
        self.assertEqual(set(settings["catalog"]), {target.SETTING, "CRAVES_CATALOG_FINANCE_ORIGIN"})
        self.assertEqual(set(target.APPS), {"catalog", "integration"})

    def test_money_identity_image_and_scale_are_preserved(self):
        before = app()
        settings = target.wanted({"integration": before})["integration"]
        baseline = target.fingerprint(before, settings)
        for mutation in (lambda a: a["identity"].update(principalId="other"),
                         lambda a: a["properties"]["template"]["containers"][0].update(image="other"),
                         lambda a: a["properties"]["template"]["scale"].update(maxReplicas=2),
                         lambda a: a["properties"]["template"]["containers"][0]["env"][0].update(secretRef="other")):
            changed = copy.deepcopy(before); mutation(changed)
            self.assertNotEqual(target.fingerprint(changed, settings), baseline)

    def test_reject_existing_different_key_and_reference(self):
        current = app()
        current["properties"]["template"]["containers"][0]["env"].append({"name": target.SETTING, "secretRef": "money-existing"})
        with self.assertRaises(target.GuardError): target.shared.check_env(current, {target.SETTING: "secretref:" + target.LOCAL})
        current["properties"]["configuration"]["secrets"] = [{"name": target.LOCAL, "keyVaultUrl": "other", "identity": "system"}]
        with self.assertRaises(target.GuardError): target.check_reference(current, "approved", "system")

    def test_existing_key_not_rotated(self):
        with patch.object(target, "metadata", return_value="approved-version"), patch.object(target, "az") as azure:
            self.assertEqual(target.ensure_secret("existing"), "approved-version")
            azure.assert_not_called()

    def test_wrong_provenance_never_overwritten(self):
        with patch.object(target, "az", side_effect=[[target.SECRET], {"enabled": True, "tags": {"craves-purpose": "other"}}]) as azure:
            with self.assertRaises(target.GuardError): target.ensure_secret("existing")
            self.assertTrue(all(call.args[:3] != ("keyvault", "secret", "set") for call in azure.call_args_list))

    def test_idempotent_configuration_does_not_write(self):
        current = app(); settings = {target.SETTING: "secretref:" + target.LOCAL}
        current["properties"]["latestReadyRevisionName"] = "ready"
        current["properties"]["configuration"]["secrets"] = [{"name": target.LOCAL, "keyVaultUrl": "approved", "identity": "system"}]
        current["properties"]["template"]["containers"][0]["env"].append({"name": target.SETTING, "secretRef": target.LOCAL})
        with patch.object(target, "snapshot", return_value=current), patch.object(target, "ready", return_value=True), patch.object(target, "az") as azure:
            target.configure("integration", current, settings, "approved", "system")
            azure.assert_not_called()

    def test_concurrent_change_rejected_before_write(self):
        before = app(); changed = copy.deepcopy(before); changed["identity"]["principalId"] = "other"
        with patch.object(target, "snapshot", return_value=changed), patch.object(target, "az") as azure:
            with self.assertRaises(target.GuardError): target.configure("integration", before, {target.SETTING: "secretref:" + target.LOCAL}, "approved", "system")
            azure.assert_not_called()

    def response(self, **changes):
        now = 1800000000; request = str(uuid.uuid4()); key = "test-only" * 8
        data = {"requestId": request, "evaluatedAt": datetime.fromtimestamp(now, timezone.utc).isoformat(), "complete": True,
                "policyId": None, "revision": 0, "hash": "a" * 64, "eligibleChefIds": []}
        data.update(changes); raw = json.dumps(data).encode()
        headers = {target.STAMP: str(now), target.SIGNATURE: target.sign(key, "RESPONSE", str(now), raw), "Cache-Control": "no-store, private"}
        return [key, request, 200, headers, raw, now]

    def test_signed_empty_authority_is_valid_without_fake_chefs(self):
        result = target.validate_response(*self.response())
        self.assertEqual(result, {"signedReadVerified": True, "eligibleChefCount": 0, "policyRevision": 0})

    def test_signature_nonce_freshness_and_completeness_fail_closed(self):
        for changes in ({"complete": False}, {"requestId": str(uuid.uuid4())}, {"revision": True}):
            with self.assertRaises(target.GuardError): target.validate_response(*self.response(**changes))
        for mutation in (lambda a: a[3].update({target.SIGNATURE: "0" * 64}),
                         lambda a: a.__setitem__(5, a[5] + 16), lambda a: a.__setitem__(2, 503),
                         lambda a: a[3].update({"Cache-Control": "public"})):
            args = self.response(); mutation(args)
            with self.assertRaises(target.GuardError): target.validate_response(*args)

    def test_redirect_is_never_followed(self):
        self.assertIsNone(target.NoRedirect().redirect_request(None, None, 302, "redirect", {}, "https://other.example"))

    def test_runtime_guard_checks_actual_replica_and_running_template(self):
        current = app()
        current["properties"].update(latestRevisionName="current", latestReadyRevisionName="current")
        with patch.object(target, "az", side_effect=[[], []]), patch.object(target.runtime, "ready", side_effect=ValueError("Not ready")) as guard:
            self.assertFalse(target.ready("integration", current))
            guard.assert_called_once()

    def test_metadata_traffic_is_checked_by_readiness_not_unrelated_hash(self):
        current = app(); other = copy.deepcopy(current)
        other["properties"]["configuration"]["ingress"]["traffic"] = [{"revisionName": "new", "weight": 100}]
        self.assertEqual(target.fingerprint(current, {}), target.fingerprint(other, {}))

    def test_template_diagnostic_never_prints_environment_values(self):
        left = app()["properties"]["template"]; right = copy.deepcopy(left)
        right["containers"][0]["env"][0]["secretRef"] = "private-sentinel"
        right["scale"]["maxReplicas"] = 2
        differences = target.template_difference(left, right)
        self.assertNotIn("private-sentinel", json.dumps(differences))
        self.assertTrue(any(d.get("running") == 2 for d in differences))


if __name__ == "__main__": unittest.main()
