import copy
import hashlib
import hmac
import json
import os
import stat
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
import configure_public_launch as release
import public_launch_evidence as evidence

SHA = "a" * 40
SUB = "11111111-1111-4111-8111-111111111111"
TENANT = "22222222-2222-4222-8222-222222222222"
PRINCIPAL = "33333333-3333-4333-8333-333333333333"
VAULT = "cravesfixture"


def fixture_app(role):
    refs = [{"name": "existing", "keyVaultUrl": f"https://{VAULT}.vault.azure.net/secrets/existing/" + "1" * 32, "identity": "system"}]
    env = [{"name": "UNCHANGED_PROVIDER_SETTING", "value": "unchanged-provider-fixture"}]
    if role in ("order", "integration"):
        refs.append({"name": "finance-internal", "keyVaultUrl": f"https://{VAULT}.vault.azure.net/secrets/finance/" + "2" * 32, "identity": "system"})
        env.append({"name": "CRAVES_FINANCE_INTERNAL_KEY", "secretRef": "finance-internal"})
    if role == "order":
        env.append({"name": "CRAVES_FINANCE_INTEGRATION_BASE_URL", "value": "https://integration.fixture.azurecontainerapps.io"})
    if role == "catalog":
        env.append({"name": "CRAVES_PUBLIC_CATALOG_PRIVACY_ENFORCEMENT_ENABLED", "value": "true"})
    revision = role + "--fixture"
    return {"id": f"/subscriptions/{SUB}/resourceGroups/{release.RG}/providers/Microsoft.App/containerApps/{release.APPS[role]}",
            "name": release.APPS[role], "type": "Microsoft.App/containerApps", "tags": {"owner": "existing"}, "location": "centralindia",
            "identity": {"type": "SystemAssigned", "principalId": PRINCIPAL},
            "properties": {"managedEnvironmentId": "existing-environment", "provisioningState": "Succeeded", "latestReadyRevisionName": revision,
                "configuration": {"activeRevisionsMode": "Single", "ingress": {"fqdn": role + ".fixture.azurecontainerapps.io", "allowInsecure": False,
                    "traffic": [{"revisionName": revision, "weight": 100}]}, "secrets": refs},
                "template": {"scale": {"minReplicas": 1, "maxReplicas": 1}, "containers": [{"name": "app", "image": "fixture.azurecr.io/craves/" + role + ":immutable-build",
                    "resources": {"cpu": 0.5, "memory": "1Gi"}, "env": env}]}}}


class Cloud:
    """Pure in-memory Azure fixture. It never invokes a subprocess or network request."""
    def __init__(self):
        self.apps = {role: fixture_app(role) for role in release.APPS}
        self.secrets = {"existing": {"id": f"https://{VAULT}.vault.azure.net/secrets/existing/" + "1" * 32, "value": "unrelated-secret-fixture-" + "x" * 40,
                          "attributes": {"enabled": True}},
                        "finance": {"id": f"https://{VAULT}.vault.azure.net/secrets/finance/" + "2" * 32, "value": "finance-secret-fixture-" + "y" * 40,
                          "attributes": {"enabled": True}}}
        self.vault = {"name": VAULT, "id": f"/subscriptions/{SUB}/resourceGroups/{release.RG}/providers/Microsoft.KeyVault/vaults/{VAULT}",
                      "properties": {"tenantId": TENANT, "enableRbacAuthorization": False,
                         "accessPolicies": [{"objectId": PRINCIPAL, "permissions": {"secrets": ["get", "list", "set"]}}]}}
        self.writes = []
    def call(self, *args, **kwargs):
        def option(name): return args[args.index(name) + 1]
        if args[:2] == ("account", "show"):
            return {"id": SUB, "tenantId": TENANT, "state": "Enabled", "user": {"type": "servicePrincipal", "name": PRINCIPAL}}
        if args[:2] == ("containerapp", "show"):
            return copy.deepcopy(self.apps[next(role for role, name in release.APPS.items() if name == option("-n"))])
        if args[:3] == ("containerapp", "secret", "list"):
            app = self.apps[next(role for role, name in release.APPS.items() if name == option("-n"))]
            return copy.deepcopy(app["properties"]["configuration"]["secrets"])
        if args[:3] == ("containerapp", "revision", "list"):
            app = self.apps[next(role for role, name in release.APPS.items() if name == option("-n"))]
            return [{"name": app["properties"]["latestReadyRevisionName"], "properties": {"active": True, "healthState": "Healthy", "runningState": "Running",
                    "template": copy.deepcopy(app["properties"]["template"])}}]
        if args[:3] == ("containerapp", "replica", "list"): return [{"name": "one-replica"}]
        if args[:2] == ("acr", "show"): return {"name": "cravesprodlowacr82121", "loginServer": "fixture.azurecr.io",
            "id": f"/subscriptions/{SUB}/resourceGroups/{release.RG}/providers/Microsoft.ContainerRegistry/registries/cravesprodlowacr82121"}
        if args[:3] == ("acr", "repository", "show"): return "sha256:" + "a" * 64
        if args[:2] == ("keyvault", "show"): return copy.deepcopy(self.vault)
        if args[:3] == ("keyvault", "secret", "list"): return [{"id": item["id"]} for item in self.secrets.values()]
        if args[:3] == ("keyvault", "secret", "show"):
            name = option("--id").split("/")[4] if "--id" in args else option("--name")
            return copy.deepcopy(self.secrets[name])
        if args[:3] == ("ad", "sp", "show"): return PRINCIPAL
        if args[:3] == ("keyvault", "secret", "set"):
            self.writes.append(args[:3])
            assert "--value" not in args
            file = Path(option("--file"))
            assert stat.S_IMODE(file.stat().st_mode) == 0o600
            name = option("--name")
            assert name not in self.secrets
            ref = f"https://{VAULT}.vault.azure.net/secrets/{name}/" + release.digest(name)[:32]
            self.secrets[name] = {"id": ref, "value": file.read_text(), "attributes": {"enabled": True}, "tags": {"craves-purpose": option("--tags").split("=", 1)[1]}}
            return ref
        if args[:3] == ("containerapp", "secret", "set"):
            self.writes.append(args[:3])
            app = self.apps[next(role for role, name in release.APPS.items() if name == option("-n"))]
            for addition in args[args.index("--secrets") + 1:]:
                alias, binding = addition.split("=keyvaultref:")
                ref, identity = binding.split(",identityref:")
                app["properties"]["configuration"]["secrets"].append({"name": alias, "keyVaultUrl": ref, "identity": identity})
            return None
        if args[:2] == ("containerapp", "update"):
            self.writes.append(args[:2])
            app = self.apps[next(role for role, name in release.APPS.items() if name == option("-n"))]
            values = release.bank.environment(app)
            for change in args[args.index("--set-env-vars") + 1:]:
                key, value = change.split("=", 1)
                values[key] = {"name": key, "secretRef": value[10:]} if value.startswith("secretref:") else {"name": key, "value": value}
            app["properties"]["template"]["containers"][0]["env"] = list(values.values())
            return None
        raise AssertionError("Unexpected Azure fixture operation: " + " ".join(args[:3]))


class RuntimeGuards(unittest.TestCase):
    def test_exact_sha_is_required_even_for_plan_before_azure(self):
        with patch.object(release.subprocess, "check_output", return_value=SHA), patch.object(release, "az") as cloud:
            with self.assertRaises(release.GuardError): release.main(["--expected-release-sha", "b" * 40])
            cloud.assert_not_called()
    def test_changed_tracked_source_is_rejected(self):
        with patch.object(release.subprocess, "check_output", side_effect=[SHA, " M source.py"]), patch.object(release, "az") as cloud:
            with self.assertRaises(release.GuardError): release.main(["--expected-release-sha", SHA])
            cloud.assert_not_called()
    def test_scope_minimum_and_maximum_are_all_checked(self):
        for kind in ("scope", "minimum", "maximum", "container-count", "ingress", "revision-mode"):
            with self.subTest(kind=kind):
                app = fixture_app("auth")
                if kind == "scope": app["id"] += "other"
                elif kind == "minimum": app["properties"]["template"]["scale"]["minReplicas"] = 0
                elif kind == "maximum": app["properties"]["template"]["scale"]["maxReplicas"] = 2
                elif kind == "container-count": app["properties"]["template"]["containers"].append(copy.deepcopy(app["properties"]["template"]["containers"][0]))
                elif kind == "ingress": app["properties"]["configuration"]["ingress"]["allowInsecure"] = True
                else: app["properties"]["configuration"]["activeRevisionsMode"] = "Multiple"
                with self.assertRaises(release.GuardError): release.check_app(app, SUB, release.APPS["auth"])
    def test_actual_replica_count_is_not_inferred_from_maximum(self):
        cloud = Cloud()
        def fake(*args, **kwargs):
            if args[:3] == ("containerapp", "replica", "list"): return [{}, {}]
            return cloud.call(*args, **kwargs)
        with patch.object(release, "az", side_effect=fake), self.assertRaises(release.GuardError): release.observe_revision(cloud.apps["auth"], release.APPS["auth"])
    def test_registry_scope_and_immutable_digest_are_verified(self):
        cloud = Cloud()
        image = cloud.apps["auth"]["properties"]["template"]["containers"][0]
        image["image"] = "fixture.azurecr.io/craves/auth@sha256:" + "a" * 64
        with patch.object(release, "az", side_effect=cloud.call):
            self.assertEqual("immutable-image-reference", release.observe_revision(cloud.apps["auth"], release.APPS["auth"])["digestEvidence"])
            image["image"] = "fixture.azurecr.io/craves/auth@sha256:" + "b" * 64
            with self.assertRaises(release.GuardError): release.observe_revision(cloud.apps["auth"], release.APPS["auth"])
        def wrong_scope(*args, **kwargs):
            result = cloud.call(*args, **kwargs)
            if args[:2] == ("acr", "show"): result["id"] += "different"
            return result
        with patch.object(release, "az", side_effect=wrong_scope), self.assertRaises(release.GuardError): release.observe_revision(cloud.apps["auth"], release.APPS["auth"])
    def test_same_image_old_running_environment_is_not_configuration_success(self):
        cloud = Cloud()
        old_template = copy.deepcopy(cloud.apps["auth"]["properties"]["template"])
        cloud.apps["auth"]["properties"]["template"]["containers"][0]["env"].append({"name": "CRAVES_EMAIL_VERIFICATION_ENABLED", "value": "true"})
        def old_revision(*args, **kwargs):
            result = cloud.call(*args, **kwargs)
            if args[:3] == ("containerapp", "revision", "list"): result[0]["properties"]["template"] = old_template
            return result
        with patch.object(release, "az", side_effect=old_revision), self.assertRaises(release.ReadinessPending):
            release.observe_revision(cloud.apps["auth"], release.APPS["auth"])
        with patch.object(release, "az", side_effect=cloud.call):
            self.assertEqual(release.template_hash(cloud.apps["auth"]["properties"]["template"]), release.observe_revision(cloud.apps["auth"], release.APPS["auth"])["runningTemplateHash"])

    def test_readiness_retries_only_transition_and_enforces_whole_readback_deadline(self):
        with patch.object(release, "read_app", side_effect=[release.ReadinessPending("warming"), ("ready", [], {})]) as read, patch.object(release.time, "sleep") as sleep:
            self.assertEqual(("ready", [], {}), release.read_ready_app("auth", SUB)); self.assertEqual(2, read.call_count); sleep.assert_called_once()
        with patch.object(release, "read_app", side_effect=release.GuardError("drift")), patch.object(release.time, "sleep") as sleep, self.assertRaises(release.GuardError):
            release.read_ready_app("auth", SUB)
        sleep.assert_not_called()
        with patch.object(release, "read_app", side_effect=release.ReadinessPending("warming")), patch.object(release.time, "monotonic", side_effect=[0, 61]), self.assertRaises(release.GuardError):
            release.read_ready_app("auth", SUB)
    def test_unrelated_provider_secret_tags_resources_image_and_traffic_are_hashed(self):
        original = fixture_app("auth")
        baseline = release.settings_hash(original, [{"name": "private", "value": "first"}], {"OWNED"}, {"owned"})
        for field in ("tag", "provider", "cpu", "image", "traffic", "secret"):
            changed = copy.deepcopy(original); protected = [{"name": "private", "value": "first"}]
            if field == "tag": changed["tags"]["owner"] = "different"
            elif field == "provider": changed["properties"]["template"]["containers"][0]["env"][0]["value"] = "different"
            elif field == "cpu": changed["properties"]["template"]["containers"][0]["resources"]["cpu"] = 1
            elif field == "image": changed["properties"]["template"]["containers"][0]["image"] += "different"
            elif field == "traffic": changed["properties"]["configuration"]["ingress"]["traffic"][0]["weight"] = 90
            else: protected[0]["value"] = "changed"
            self.assertNotEqual(baseline, release.settings_hash(changed, protected, {"OWNED"}, {"owned"}))
    def test_pinned_keys_reject_versionless_external_disabled_and_short(self):
        cloud = Cloud()
        for ref in (f"https://{VAULT}.vault.azure.net/secrets/existing", "https://other.invalid/secrets/existing/" + "1" * 32):
            with self.assertRaises(release.GuardError): release.pinned_secret(ref, VAULT)
        with patch.object(release, "az", side_effect=cloud.call):
            cloud.secrets["existing"]["attributes"]["enabled"] = False
            with self.assertRaises(release.GuardError): release.pinned_secret(cloud.secrets["existing"]["id"], VAULT)
            cloud.secrets["existing"]["attributes"]["enabled"] = True; cloud.secrets["existing"]["value"] = "short"
            with self.assertRaises(release.GuardError): release.pinned_secret(cloud.secrets["existing"]["id"], VAULT)
    def test_provision_closes_only_missing_gates_and_never_resets_reconciliation(self):
        cloud = Cloud()
        cloud.apps["auth"]["properties"]["template"]["containers"][0]["env"].append({"name": "CRAVES_EMAIL_PROJECTION_WORKER_ENABLED", "value": "true"})
        with patch.object(release, "az", side_effect=cloud.call): keys, _ = release.key_plan(cloud.apps, cloud.vault)
        wanted = release.desired(cloud.apps, keys, "provision")
        self.assertEqual("true", wanted["auth"]["CRAVES_EMAIL_PROJECTION_WORKER_ENABLED"])
        self.assertEqual("false", wanted["auth"]["CRAVES_EMAIL_VERIFICATION_ENABLED"])
        self.assertFalse(any("RAZORPAY" in key or key.startswith("CRAVES_BANK_") for values in wanted.values() for key in values))
    def test_alias_collision_fails_instead_of_reusing_an_unrelated_secret(self):
        cloud = Cloud(); alias = release.KEYS["email-hmac"][2]
        cloud.apps["auth"]["properties"]["configuration"]["secrets"].append({"name": alias, "value": "unrelated"})
        with patch.object(release, "az", side_effect=cloud.call), self.assertRaises(release.GuardError): release.key_plan(cloud.apps, cloud.vault)
    def test_missing_vault_permission_never_creates_a_role(self):
        cloud = Cloud(); cloud.vault["properties"]["accessPolicies"] = []
        with patch.object(release, "az") as call, self.assertRaises(release.GuardError): release.identity_for(cloud.apps["auth"], cloud.vault)
        call.assert_not_called()
    def test_conditional_rbac_is_not_assumed_to_allow_a_secret(self):
        cloud = Cloud(); cloud.vault["properties"]["enableRbacAuthorization"] = True
        role = {"principalId": PRINCIPAL, "scope": cloud.vault["id"], "condition": "restricted", "roleDefinitionId": "role/4633458b-17de-408a-b874-0445c86b69e6"}
        with patch.object(release, "az", return_value=[role]), self.assertRaises(release.GuardError): release.permission_for(cloud.vault, PRINCIPAL, "get")
        role["condition"] = None
        with patch.object(release, "az", return_value=[role]): release.permission_for(cloud.vault, PRINCIPAL, "get")
    def test_an_existing_key_is_never_created_as_a_new_version(self):
        cloud = Cloud()
        with patch.object(release, "az", side_effect=cloud.call), self.assertRaises(release.GuardError): release.create_key(VAULT, "test", "existing")
        self.assertEqual([], cloud.writes)
    def test_plan_records_are_not_overwritten(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "record.json"; release.write_once(path, {"test": 1})
            self.assertEqual(0o600, stat.S_IMODE(path.stat().st_mode))
            with self.assertRaises(FileExistsError): release.write_once(path, {"test": 2})
            self.assertEqual({"test": 1}, json.loads(path.read_text()))


class EvidenceGuards(unittest.TestCase):
    def activation_fixture(self, phase="finance-processing"):
        cloud = Cloud()
        for role, gates in release.GATES.items():
            for gate in gates:
                cloud.apps[role]["properties"]["template"]["containers"][0]["env"].append({"name": gate, "value": "false"})
        cloud.apps["auth"]["properties"]["template"]["containers"][0]["env"].append({"name": "CRAVES_EMAIL_VERIFICATION_ALLOW_LOCAL_HTTP", "value": "false"})
        timestamp = release.utcnow()
        record = {"schema": 1, "sourceSha": SHA, "checkedAt": timestamp, "services": {},
            "releaseControl": {"protectedResource": "Craves-Dev-Service-Connection", "exclusiveLockEnabled": True, "otherReleaseWritersPaused": True, "checkedAt": timestamp, "reviewedEvidenceHash": "d" * 64},
            "connectivity": {name: {"result": "PASS", "sourceSha": SHA, "checkedAt": timestamp, "evidenceHash": "a" * 64}
                             for name in ("auth-notification", "auth-user-chef", "authenticated-email-routes", "order-integration-source", "catalog-integration-read", "finance-auth-owner-denial", "statement-owner-denial")},
            "queuedExposure": {"checkedAt": timestamp, "reviewedEvidenceHash": "a" * 64, "counts": {key: 0 for key in evidence.EXPOSURE_COUNTS}, "approvedMaximums": {key: 0 for key in evidence.EXPOSURE_COUNTS}},
            "financePolicy": {"savedPolicyId": SUB, "state": "DRAFT", "revision": 1, "contentHash": "b" * 64, "reviewedBusinessEvidenceHash": "c" * 64, "checkedAt": timestamp,
                              "settings": {"ledgerStartDate": "2026-09-14", "ledgerEnabled": True, "manualWithdrawalsEnabled": True, "automaticPayoutsEnabled": False,
                                           "automaticPayoutDelayHours": 48, "chefFeeTaxTreatment": "EXCLUSIVE", "chefFeePercent": "7", "taxApprovalReference": "synthetic-test-only"}}}
        source = {"ready": True, "origin": "https://integration.fixture.azurecontainerapps.io", "catalogKey": "synthetic-key" * 4}
        return record, source, cloud.apps

    def test_private_launch_routes_fail_while_existing_catalog_history_is_preserved(self):
        for path, template in (("", "/*"), ("internal", "/*"), ("internal/v1", "/*"), ("internal/v1/finance", "/quote"),
                               ("internal/v1/auth-email", "/verification"), ("internal/v1/chef-bank", "/identity")):
            with self.subTest(path=path, template=template), self.assertRaises(release.GuardError): evidence.private_operation_guard(path, template)
        evidence.private_operation_guard("api/v1/catalog", "/internal/kitchens/{kitchenId}")
        evidence.private_operation_guard("api/v1/auth", "/*")
        evidence.private_operation_guard("internal/v1/delivery-intelligence", "/feedback/readiness")

    def test_lock_receipt_is_required_for_provision_and_mutable_tags_cannot_activate(self):
        record, source, apps = self.activation_fixture()
        changed = copy.deepcopy(record); changed["releaseControl"]["exclusiveLockEnabled"] = False
        self.assertTrue(evidence.validate_evidence(changed, SHA, "provision", {}, source, apps))
        runtime = {"revision": "web--fixture", "image": "fixture.azurecr.io/craves/web:123", "imageDigest": "sha256:" + "a" * 64}
        record["services"]["web"] = {**runtime, "buildSourceSha": SHA, "pipelineRunId": "123"}
        observed = {"web": ({}, [], runtime)}
        self.assertTrue(any("immutable exact-release" in item for item in evidence.validate_evidence(record, SHA, "finance-processing", observed, source, apps)))
        runtime["image"] = "fixture.azurecr.io/craves/web@" + runtime["imageDigest"]
        record["services"]["web"]["image"] = runtime["image"]
        self.assertEqual([], evidence.validate_evidence(record, SHA, "finance-processing", observed, source, apps))

    def test_privacy_rejects_body_signature_logging_and_private_rewrites(self):
        evidence.privacy_guard([{"properties": {"value": '<policies><inbound><base /></inbound></policies>'}}], [])
        for header in ("Authorization", "Cookie", "X-Craves-Email-Signature", "X-Craves-Catalog-Signature", "X-Craves-Internal-Key"):
            with self.subTest(header=header), self.assertRaises(release.GuardError):
                evidence.privacy_guard([], [{"properties": {"backend": {"request": {"headers": [header]}}}}])
        with self.assertRaises(release.GuardError): evidence.privacy_guard([], [{"properties": {"frontend": {"response": {"body": {"bytes": 1}}}}}])
        with self.assertRaises(release.GuardError): evidence.privacy_guard([{"properties": {"value": '<policies><inbound><rewrite-uri template="/internal/v1/finance/quote" /></inbound></policies>'}}], [])

    def test_nonobvious_public_api_cannot_hide_private_rewrite_and_excluded_family_is_not_read(self):
        scope = f"/subscriptions/{SUB}/resourceGroups/{release.RG}/providers/Microsoft.ApiManagement/service/{evidence.APIM}"
        seen = []
        unsafe = [{"properties": {"value": '<policies><inbound><rewrite-uri template="/internal/v1/finance/quote" /></inbound></policies>'}}]
        def pages(url):
            path = url.split("?", 1)[0].removeprefix("https://management.azure.com" + scope)
            seen.append(path)
            if path == "/apis": return [{"name": "misc-public", "properties": {"path": "api/v1/misc"}}, {"name": "delivery-providers", "properties": {"path": "api/v1/delivery"}}]
            if path == "/apis/misc-public/operations": return [{"name": "ordinary", "properties": {"urlTemplate": "/ordinary"}}, {"name": "delivery-status", "properties": {"urlTemplate": "/delivery/status"}}]
            if path == "/apis/misc-public/operations/ordinary/policies": return unsafe
            self.assertNotIn("delivery", path)
            return []
        with patch.object(release, "az", return_value={"id": scope}), patch.object(evidence.bank_apim, "pages", side_effect=pages):
            with self.assertRaises(release.GuardError): evidence.privacy_preflight(SUB)
            unsafe.clear(); seen.clear()
            result = evidence.privacy_preflight(SUB)
        self.assertEqual(["misc-public"], result["inspectedApis"])
        self.assertEqual(2, len(result["excludedDeliveryScopes"])); self.assertFalse(result["excludedPoliciesRead"])
        self.assertIn("/apis/misc-public/policies", seen); self.assertIn("/policies", seen)
        self.assertFalse(any("delivery" in item for item in seen))

    def test_provision_cannot_start_an_enabled_inert_worker_by_adding_its_dependency(self):
        cloud = Cloud()
        with patch.object(release, "az", side_effect=cloud.call): keys, _ = release.key_plan(cloud.apps, cloud.vault)
        wanted = release.desired(cloud.apps, keys, "provision")
        self.assertEqual([], evidence.provision_activation_blockers(cloud.apps, wanted))
        cloud.apps["auth"]["properties"]["template"]["containers"][0]["env"].append({"name": "CRAVES_EMAIL_PROJECTION_WORKER_ENABLED", "value": "true"})
        self.assertTrue(any("enabled email-projection" in item for item in evidence.provision_activation_blockers(cloud.apps, wanted)))
        for role, settings in wanted.items():
            env = release.bank.environment(cloud.apps[role])
            for name, value in settings.items():
                if name.startswith("CRAVES_EMAIL_") and not name.endswith("ENABLED"):
                    env[name] = {"name": name, "secretRef": value[10:]} if value.startswith("secretref:") else {"name": name, "value": value}
            cloud.apps[role]["properties"]["template"]["containers"][0]["env"] = list(env.values())
        self.assertEqual([], evidence.provision_activation_blockers(cloud.apps, wanted))

    def test_reviewed_saved_draft_allows_processing_but_never_opens_checkout(self):
        record, source, apps = self.activation_fixture()
        self.assertEqual([], evidence.validate_evidence(record, SHA, "finance-processing", {}, source, apps))
        with patch.object(evidence, "catalog_probe") as probe:
            blocked = evidence.validate_evidence(record, SHA, "order-checkout", {}, source, apps)
        self.assertTrue(any("saved reviewed policy" in item for item in blocked)); probe.assert_not_called()
        for field, value in (("ledgerStartDate", "2026-09-13"), ("chefFeePercent", "8"), ("automaticPayoutsEnabled", True), ("automaticPayoutDelayHours", 1)):
            changed = copy.deepcopy(record); changed["financePolicy"]["settings"][field] = value
            self.assertTrue(evidence.validate_evidence(changed, SHA, "finance-processing", {}, source, apps))
        changed = copy.deepcopy(record); changed["financePolicy"]["state"] = "EXPIRED"
        self.assertTrue(evidence.validate_evidence(changed, SHA, "finance-processing", {}, source, apps))

    def test_queue_counts_require_reviewed_bounds_and_no_hidden_extra_categories(self):
        record, source, apps = self.activation_fixture()
        for value in (1, -1, True, "0"):
            changed = copy.deepcopy(record); changed["queuedExposure"]["counts"]["sourceEventsQueued"] = value
            blocked = evidence.validate_evidence(changed, SHA, "finance-processing", {}, source, apps)
            self.assertTrue(any("queued-work counts" in item for item in blocked))
        record["queuedExposure"]["counts"]["sourceEventsQueued"] = 1
        record["queuedExposure"]["approvedMaximums"]["sourceEventsQueued"] = 1
        self.assertEqual([], evidence.validate_evidence(record, SHA, "finance-processing", {}, source, apps))

    def test_checkout_requires_live_signed_matching_policy_and_integration_gates(self):
        record, source, apps = self.activation_fixture()
        record["financePolicy"]["state"] = "ACTIVE"
        for item in apps["integration"]["properties"]["template"]["containers"][0]["env"]:
            if item["name"] in release.GATES["integration"]: item["value"] = "true"
        with patch.object(evidence, "catalog_probe", return_value={"policyId": SUB, "revision": 1}) as probe:
            self.assertEqual([], evidence.validate_evidence(record, SHA, "order-checkout", {}, source, apps))
            probe.assert_called_once_with(source["origin"], source["catalogKey"])
        with patch.object(evidence, "catalog_probe", return_value={"policyId": SUB, "revision": 2}):
            self.assertTrue(evidence.validate_evidence(record, SHA, "order-checkout", {}, source, apps))
        apps["integration"]["properties"]["template"]["containers"][0]["env"].append({"name": "CRAVES_RAZORPAYX_WORKER_ENABLED", "value": "true"})
        with patch.object(evidence, "catalog_probe") as probe:
            self.assertTrue(evidence.validate_evidence(record, SHA, "order-checkout", {}, source, apps)); probe.assert_not_called()
    def test_migration_sql_changes_fail_and_line_endings_do_not_hide_changes(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "V1__fixture.sql"; path.write_bytes(b"SELECT 1;\r\n")
            checksum = evidence.migration_checksum(path)
            rows = [{"version": "1", "checksum": checksum, "success": True}]
            with patch.dict(evidence.SERVICE_DIRS, {"auth": Path(folder)}):
                self.assertTrue(evidence.migrations_match("auth", rows, True))
                path.write_text("SELECT 1;\n"); self.assertTrue(evidence.migrations_match("auth", rows, True))
                path.write_text("SELECT 2;\n"); self.assertFalse(evidence.migrations_match("auth", rows, True))
    def test_incomplete_upgrade_fails_activation(self):
        with tempfile.TemporaryDirectory() as folder:
            first = Path(folder) / "V1__first.sql"; first.write_text("SELECT 1;")
            (Path(folder) / "V2__second.sql").write_text("SELECT 2;")
            rows = [{"version": "1", "checksum": evidence.migration_checksum(first), "success": True}]
            with patch.dict(evidence.SERVICE_DIRS, {"auth": Path(folder)}):
                self.assertTrue(evidence.migrations_match("auth", rows, False))
                self.assertFalse(evidence.migrations_match("auth", rows, True))
    def test_absent_or_stale_evidence_cannot_activate(self):
        self.assertTrue(evidence.validate_evidence(None, SHA, "finance-processing", {}, {}, {}))
        self.assertFalse(evidence.fresh("2000-01-01T00:00:00Z"))
        self.assertFalse(evidence.fresh("2099-01-01T00:00:00Z"))
    def test_checkout_without_actual_policy_and_source_receipts_is_blocked(self):
        cloud = Cloud()
        record = {"schema": 1, "sourceSha": SHA, "checkedAt": release.utcnow()}
        blocked = evidence.validate_evidence(record, SHA, "order-checkout", {}, {"ready": False, "reason": "source missing"}, cloud.apps)
        self.assertTrue(any("genuinely saved" in item for item in blocked))
        self.assertTrue(any("Activate the saved reviewed policy" in item for item in blocked))
        self.assertIn("source missing", blocked)


class SignedCatalogRead(unittest.TestCase):
    def exercise(self, failure=None):
        key = "catalog-fixture-key-" * 3
        path = "/internal/v1/finance/catalog-eligibility"
        class Response:
            def __init__(self, request):
                self.status = 200
                stamp = request.get_header("X-craves-catalog-timestamp")
                request_signature = hmac.new(key.encode(), f"POST\n{path}\n{stamp}\n".encode() + request.data, hashlib.sha256).hexdigest()
                assert request.get_header("X-craves-catalog-signature") == request_signature
                result = {"requestId": json.loads(request.data)["requestId"], "evaluatedAt": release.utcnow(), "complete": True,
                          "policyId": SUB, "revision": 1, "hash": "a" * 64, "eligibleChefIds": [PRINCIPAL]}
                if failure == "owner-correlation": result["requestId"] = TENANT
                if failure == "partial": result["complete"] = False
                if failure == "duplicate-chefs": result["eligibleChefIds"] *= 2
                if failure == "empty": result["eligibleChefIds"] = []
                if failure == "extra-field": result["privateTaxRecord"] = "forbidden"
                self.raw = json.dumps(result).encode() if failure != "oversized" else b"x" * 65537
                response_stamp = str(int(stamp) - 100) if failure == "stale" else stamp
                signature = hmac.new(key.encode(), f"RESPONSE\n{path}\n{response_stamp}\n".encode() + self.raw, hashlib.sha256).hexdigest()
                self.headers = {"X-Craves-Catalog-Timestamp": response_stamp, "X-Craves-Catalog-Signature": "0" * 64 if failure == "wrong-key" else signature}
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, size):
                assert size == 65537
                if failure == "timeout": raise TimeoutError("synthetic bounded timeout")
                return self.raw
        def open_fixture(request, timeout):
            self.assertEqual(5, timeout)
            self.assertEqual("POST", request.method)
            self.assertEqual("https://integration.fixture.azurecontainerapps.io" + path, request.full_url)
            return Response(request)
        with patch.object(evidence.urllib.request, "build_opener", return_value=SimpleNamespace(open=open_fixture)) as opener:
            result = evidence.catalog_probe("https://integration.fixture.azurecontainerapps.io", key)
            self.assertIsInstance(opener.call_args.args[0], evidence.bank_apim.NoRedirect)
            return result
    def test_signed_bounded_read_verifies_request_and_response(self):
        self.assertEqual([PRINCIPAL], self.exercise()["eligibleChefIds"])
    def test_bad_partial_unknown_or_unbounded_authority_fails_closed(self):
        for failure in ("owner-correlation", "partial", "duplicate-chefs", "empty", "extra-field", "oversized", "stale", "wrong-key", "timeout"):
            with self.subTest(failure=failure), self.assertRaises(release.GuardError): self.exercise(failure)


class PlanApplyRoundTrip(unittest.TestCase):
    def test_mocked_plan_apply_and_rerun_preserve_all_unrelated_settings_and_keys(self):
        cloud = Cloud()
        source_heads = {}
        for role, app in cloud.apps.items():
            rows = []
            if role != "web":
                path = next(evidence.SERVICE_DIRS[role].glob("V1__*.sql"))
                rows = [{"version": "1", "checksum": evidence.migration_checksum(path), "success": True}]
            source_heads[role] = {"revision": app["properties"]["latestReadyRevisionName"], "image": app["properties"]["template"]["containers"][0]["image"], "appliedMigrations": rows}
        record = {"schema": 1, "sourceSha": SHA, "checkedAt": release.utcnow(), "services": source_heads,
                  "releaseControl": {"protectedResource": "Craves-Dev-Service-Connection", "exclusiveLockEnabled": True, "otherReleaseWritersPaused": True,
                                     "checkedAt": release.utcnow(), "reviewedEvidenceHash": "d" * 64}}
        with tempfile.TemporaryDirectory() as folder, patch.object(release, "az", side_effect=cloud.call), \
                patch.object(release.subprocess, "check_output", side_effect=lambda args, **kwargs: SHA if args[1] == "rev-parse" else ""), \
                patch.object(evidence, "privacy_preflight", return_value={"fixture": "safe"}):
            proof = Path(folder) / "evidence.json"; proof.write_text(json.dumps(record))
            plan = Path(folder) / "plan.json"; applied = Path(folder) / "apply.json"
            args = ["--expected-release-sha", SHA, "--evidence", str(proof)]
            self.assertEqual(0, release.main([*args, "--output", str(plan)])); self.assertEqual([], cloud.writes)
            self.assertEqual([], json.loads(plan.read_text())["plan"]["blockers"])
            self.assertNotIn("unchanged-provider-fixture", plan.read_text()); self.assertNotIn("unrelated-secret-fixture", plan.read_text())
            self.assertEqual(0, release.main([*args, "--apply", "--approved-plan", str(plan), "--output", str(applied)]))
            self.assertEqual(4, sum(call == ("keyvault", "secret", "set") for call in cloud.writes))
            for role, app in cloud.apps.items():
                self.assertEqual("unchanged-provider-fixture", release.literal(app, "UNCHANGED_PROVIDER_SETTING"))
                self.assertEqual(1, app["properties"]["template"]["scale"]["maxReplicas"])
            previous = copy.deepcopy(cloud.secrets); cloud.writes.clear()
            plan2 = Path(folder) / "plan2.json"
            self.assertEqual(0, release.main([*args, "--output", str(plan2)]))
            self.assertEqual(0, release.main([*args, "--apply", "--approved-plan", str(plan2), "--output", str(Path(folder) / "apply2.json")]))
            self.assertEqual([], cloud.writes); self.assertEqual(previous, cloud.secrets)
            cloud.apps["auth"]["tags"]["owner"] = "concurrent-change"
            with self.assertRaises(release.GuardError): release.main([*args, "--apply", "--approved-plan", str(plan2), "--output", str(Path(folder) / "blocked.json")])
            self.assertEqual([], cloud.writes)


if __name__ == "__main__": unittest.main()
