import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("web_pilot_release", Path(__file__).parents[1] / "web_pilot_release.py")
pilot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pilot)
OLD_SHA = "a" * 40
NEW_SHA = "b" * 40


def app():
    return {"name": pilot.release.WEB, "identity": {"type": "SystemAssigned", "principalId": "fixture"}, "tags": {"owner": "unchanged"}, "location": "centralindia",
            "properties": {"environmentId": "existing", "configuration": {"ingress": {"external": True, "targetPort": 3000}, "secrets": [{"name": "existing", "keyVaultUrl": "https://fixture.vault.azure.net/secrets/existing", "identity": "system"}]},
                           "template": {"scale": {"minReplicas": 1, "maxReplicas": 1}, "containers": [{"name": "web", "image": "old@sha256:" + "c" * 64, "resources": {"cpu": .5, "memory": "1Gi"},
                               "env": [{"name": "CRAVES_BUILD_SHA", "value": OLD_SHA}, {"name": "EXISTING_SECRET", "secretRef": "existing"}, {"name": "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "value": "unchanged"}]}]}}}


class PilotRuntimePreservation(unittest.TestCase):
    def setUp(self):
        self.before = app()
        self.settings = dict(zip(pilot.SETTING_NAMES, (pilot.LAUNCH_URL, "d" * 64, "2099-01-01T00:00:00.000Z")))
        self.after = copy.deepcopy(self.before)
        container = self.after["properties"]["template"]["containers"][0]
        container["image"] = "new@sha256:" + "e" * 64
        container["env"][0]["value"] = NEW_SHA
        container["env"] += [{"name": name, "value": value} for name, value in self.settings.items()]

    def verify(self, value=None):
        pilot.guard(self.before, value or self.after, self.settings, "new@sha256:" + "e" * 64, NEW_SHA)

    def test_permits_only_exact_three_additions_and_image_source(self):
        self.verify()
        self.assertEqual(pilot.launch_settings("d" * 64, "2099-01-01T00:00:00.000Z"), self.settings)

    def test_rejects_every_unrelated_setting_and_parallel_rollout(self):
        mutations = [
            lambda a: a["properties"]["template"]["scale"].update(maxReplicas=2),
            lambda a: a["properties"]["template"]["containers"][0]["resources"].update(cpu=1),
            lambda a: a["identity"].update(principalId="another"),
            lambda a: a["properties"]["configuration"]["secrets"][0].update(keyVaultUrl="https://another.vault.azure.net/secrets/changed"),
            lambda a: a["properties"]["template"]["containers"][0]["env"][1].update(secretRef="another"),
            lambda a: a["properties"]["template"]["containers"][0]["env"][2].update(value="another"),
            lambda a: a["properties"]["template"]["containers"][0]["env"].append({"name": "CRAVES_NEW_UNRELATED", "value": "unexpected"}),
            lambda a: a["properties"]["template"]["containers"][0].update(image="another"),
            lambda a: a["properties"]["template"]["containers"][0]["env"][0].update(value="f" * 40),
            lambda a: a["properties"]["template"]["containers"][0]["env"][-1].update(value="another-expiry"),
        ]
        for mutation in mutations:
            with self.subTest(mutation=mutation):
                changed = copy.deepcopy(self.after)
                mutation(changed)
                with self.assertRaises(ValueError): self.verify(changed)

    def test_rejects_existing_gate_overwrite_or_private_key_as_parameter(self):
        self.before["properties"]["template"]["containers"][0]["env"].append({"name": pilot.SETTING_NAMES[0], "value": pilot.LAUNCH_URL})
        with self.assertRaises(ValueError): self.verify()
        with self.assertRaises(ValueError): pilot.launch_settings("private-key", "2099-01-01T00:00:00.000Z")
        with self.assertRaises(ValueError): pilot.launch_settings("d" * 64, "2000-01-01T00:00:00.000Z")

    def test_keeps_existing_release_evidence_and_business_services_out_of_mutations(self):
        source = (Path(__file__).parents[1] / "web_pilot_release.py").read_text()
        self.assertEqual(source.count("release.source_guard(args.source, args.sha, args.regression_run)"), 2)
        self.assertNotIn('"--min-replicas"', source)
        self.assertNotIn('"--max-replicas"', source)
        self.assertNotIn("deploy_backend", source)
        self.assertNotIn("chef_image_guard", source)


if __name__ == "__main__": unittest.main()
