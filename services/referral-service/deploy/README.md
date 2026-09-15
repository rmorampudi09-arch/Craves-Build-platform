# Dormant isolated deployment kit — NOT EXECUTED

This template adds only one new referral Container App. It does not provision or update an environment, registry, identity, vault, Redis instance, database server, gateway, existing Craves app or payment provider. These dependencies and their permissions must be explicitly approved and already exist. No deployment is triggered by this repository addition.

`main.bicep` uses the documented Microsoft.App/containerApps 2025-01-01 schema. Private HTTPS ingress, a non-root image definition, Key Vault references, an existing user-assigned identity and all seven referral flags OFF are the intended starting state. Replica bounds are one; CPU is 1 and memory 2 GiB. These are a proposed starting allocation requiring cost/capacity approval, not a measured production capacity promise or high-availability setup. Rolling revisions may transiently overlap.

## Files

- `main.bicep`: compileable dormant template; must use a NEW approved app name and immutable image digest.
- `parameters.example.json`: intentionally invalid placeholders; contains no usable credentials or production target.
- `../../../scripts/referrals/verify-release-plan.py`: read-only static checks against a separately supplied fresh app inventory; refuses existing names, runtime flag overrides, floating image tags, raw secret values, unversioned URLs and shared source key references. It cannot prove inventory freshness or Azure permissions.
- `observability.sql`: read-only referral-schema counts and wallet/journal drift checks, not installed alerts.

## Controlled operator sequence

1. Read `docs/referrals/INTEGRATION_RUNBOOK.md` and collect actual approvals. Confirm the approved subscription, resource group, environment region, isolated database role/schema, private network path, identity and cost. The identity needs only the appropriate registry pull/Key Vault secret access; no broad subscription role should be inferred.
2. Build/scan the exact reviewed service image and record its digest. Use the existing repository CI results; the Dockerfile intentionally skips tests during packaging.
3. Copy the example parameter file to a private local workspace and replace every placeholder with approved non-secret metadata and versioned Key Vault secret URLs. The DB URL secret must enforce authenticated PostgreSQL TLS/hostname verification. The JWT secret contains only the Auth verification PEM in the encoding expected by the service, never Auth's private signing key. Keep Auth, Order and Finance HMAC values distinct.
4. Export fresh full app inventory for the explicitly approved resource group. This is a read-only command; do not use an inventory from a different subscription or silently trust an old file.

```bash
az account show --query '{subscription:id,tenant:tenantId}' -o json
az containerapp list --subscription "$APPROVED_SUBSCRIPTION" \
  --resource-group "$APPROVED_RESOURCE_GROUP" -o json > current-containerapps.json
python3 scripts/referrals/verify-release-plan.py private-referral.parameters.json \
  current-containerapps.json --subscription "$APPROVED_SUBSCRIPTION" \
  --resource-group "$APPROVED_RESOURCE_GROUP"
az bicep build --file services/referral-service/deploy/main.bicep \
  --outfile /tmp/craves-referral-compiled.json
```

5. Run the normal Azure deployment **what-if** against only this new app using reviewed parameters. The what-if must show no current Craves app changes and no replacement of a dependency. An empty/stale supplied inventory is not evidence that an app name is unused; verify with a direct `az containerapp show` lookup as well. A 403/network error is not a confirmed absence.
6. Follow the isolated database migration runbook, restricted-runtime-role validation and backup/restore rehearsal. Apply the template only after a separate release approval. No actual `deployment create` command is included here to imply it has already been authorised or executed.
7. Verify all flags OFF from the new revision, private ingress, exact image digest, min/max replicas, probes and database/Redis readiness. Check no existing Craves application image/configuration changed. Do not run the current multi-service deployment pipeline.
8. Complete the owner-side signup/order/Finance/checkout/gateway integration in a separate review before activation. The template's readiness probe includes database and Redis connectivity, but readiness does not prove policy, financial correctness, revocation mapping or legal approval.

## Approvals and rotation

Template parameters intentionally cannot enable rewards, public access, withdrawals or spending. Activation must be a separate reviewed configuration change after the integration/acceptance gates. Current/previous source key support exists in service configuration; insert previous-version secret bindings through the approved rotation change rather than sharing one key among producers. Secret values must never be printed in logs or committed.

## Primary references

- Microsoft resource schema: https://learn.microsoft.com/en-us/azure/templates/microsoft.app/2025-01-01/containerapps
- Spring Boot alternative main launcher: https://docs.spring.io/spring-boot/3.5/specification/executable-jar/property-launcher.html

Compilation and static parameter tests are build evidence only. They are not Azure what-if, cloud deployment, runtime, billing, networking or availability acceptance.
