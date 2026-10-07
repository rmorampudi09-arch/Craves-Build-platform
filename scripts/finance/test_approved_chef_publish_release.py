import copy
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("publishing_release", Path(__file__).with_name("approved_chef_publish_release.py"))
release = importlib.util.module_from_spec(spec); spec.loader.exec_module(release)

class PublishingReleaseTests(unittest.TestCase):
    def status(self, approvals, eligible, exact=True):
        apps = {release.CHEF: {}, release.INTEGRATION: {}}
        with patch.object(release.finance, "source_bindings", return_value="SYNTHETIC"), patch.object(
                release.finance, "secret", return_value="SYNTHETIC"), patch.object(release.finance, "signed", side_effect=[
                    {"approvals": approvals}, {"eligibleChefIds": eligible}]):
            return release.approval_status(apps, exact)

    def test_every_admin_approved_state_is_required(self):
        approvals = [{"chefId": "telangana", "stateCode": "36"}, {"chefId": "other", "stateCode": "UNSUPPORTED"}]
        self.assertEqual(2, self.status(approvals, ["other", "telangana"])["eligibleChefCount"])
        with self.assertRaisesRegex(ValueError, "all admin-approved"):
            self.status(approvals, ["telangana"])

    def test_unapproved_extra_or_duplicate_identity_cannot_pass(self):
        with self.assertRaises(ValueError): self.status([{"chefId": "approved"}], ["approved", "pending"])
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            self.status([{"chefId": "approved"}, {"chefId": "approved"}], ["approved"])

    def test_preflight_can_measure_existing_blocked_chefs_without_mutation(self):
        result = self.status([{"chefId": "approved"}], [], exact=False)
        self.assertEqual(1, result["approvedExcludedCount"])

    def test_scoped_release_preserves_unrelated_apps_and_checks_web_stamp(self):
        baseline = {"webRuntime": {"name": "before"}}
        apps = {release.WEB: {"name": "after"}, release.CHEF: {"name": "chef"}, release.INTEGRATION: {"name": "integration"}}
        original = copy.deepcopy(apps)
        with patch.object(release.web, "web_guard") as web_guard, patch.object(release.finance, "compare_inventory") as compare:
            release.guard(baseline, apps, "integration-image", "web-image", "a" * 40)
            web_guard.assert_called_once_with(baseline["webRuntime"], apps[release.WEB], "web-image", "a" * 40)
            self.assertEqual({release.INTEGRATION: "integration-image"}, compare.call_args.args[2])
            self.assertEqual(baseline["webRuntime"], compare.call_args.args[1][release.WEB])
        self.assertEqual(original, apps)

if __name__ == "__main__": unittest.main()
