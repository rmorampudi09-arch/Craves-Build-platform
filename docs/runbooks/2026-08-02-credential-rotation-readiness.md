# Craves credential-rotation readiness gate

## Purpose

This gate verifies whether the existing `prodlow` Azure environment is safe to begin Storage-key and PostgreSQL-password rotation.

It is deliberately read-only. It does not rotate a key, change a password, write a Key Vault secret, modify a Container App, create a revision, run a database migration, change APIM, or call a provider.

## Pipeline

```text
azure-pipelines-credential-rotation-readiness.yml
```

## Branch and execution rule

Run only from a reviewed commit that contains:

```text
scripts/release/verify-credential-rotation-readiness.sh
azure-pipelines-credential-rotation-readiness.yml
config/production/azure-resource-inventory.json
```

Do not run a credential-mutation pipeline until this readiness gate completes with zero blockers.

## Default existing resources

```text
Resource group: rg-craves-prodlow-centralindia
Key Vault: kvcravesprodlowl3ing6
Storage account: stcravesprodlowl3ing6
PostgreSQL Flexible Server: pg-craves-prodlow-l3ing6
```

## What the gate checks

- The production inventory contains exactly seven Container Apps.
- The resource group, Key Vault, Storage account, and PostgreSQL server are readable.
- Key Vault uses Azure RBAC authorization.
- PostgreSQL is in the `Ready` state.
- Every Container App is `Running`.
- Each latest Container App revision is also the latest ready revision.
- Every Container App has a managed-identity principal ID.
- Every Container App identity has an effective Key Vault secret-reading role.
- The Azure DevOps service connection has effective resource-group write authority and Key Vault secret-write authority when its object ID can be resolved.
- Every service has a `SPRING_DATASOURCE_PASSWORD` binding.
- Storage-consuming services expose only binding metadata for `CRAVES_STORAGE_ENDPOINT_VALUE`.
- Each current binding is classified as `plaintext`, `container-app-secret`, or `key-vault` without reading its value.

## Published artifact

```text
credential-rotation-readiness/
  credential-rotation-readiness.md
  credential-rotation-readiness.json
```

The artifact contains resource names, revision names, managed-identity principal IDs, role names, secret-reference names, Key Vault reference URLs, binding classifications, blockers, and warnings.

It does not contain Storage keys, PostgreSQL passwords, connection-string values, Key Vault secret values, application tokens, Firebase credentials, Cashfree credentials, Borzo credentials, or private keys.

## Manual steps required

1. Create or select an Azure DevOps pipeline using `azure-pipelines-credential-rotation-readiness.yml`.
2. Confirm variable `AZURE_SERVICE_CONNECTION` points to `Craves-Dev-Service-Connection`.
3. Run the pipeline with the default resource names.
4. Download the `credential-rotation-readiness` artifact.
5. Resolve every blocker before any credential mutation.
6. Never paste secret values into chat, source control, pipeline logs, or non-secret Azure DevOps variables.

## Expected current migration categories

The discovery artifact determines which services are already Key Vault-backed and which still use plaintext or Container App-managed secret bindings. A non-Key-Vault binding is not itself treated as a preflight failure; the preflight verifies that identity, RBAC, health, and binding metadata are sufficient to migrate it safely.

## Rotation order after a zero-blocker pass

1. Stage Storage rotation using the currently unused Storage key.
2. Write the staged Storage connection string to Key Vault without printing it.
3. Rebind only Storage-consuming Container Apps to a versionless Key Vault reference.
4. Verify ready revisions and HTTP health.
5. Invalidate the previously exposed Storage key only after the staged binding is proven.
6. Stage all PostgreSQL consumers onto one versionless Key Vault password reference.
7. Rotate the PostgreSQL administrator password in a guarded maintenance window.
8. Refresh all seven Container Apps and verify health, authentication, Flyway state, and database connectivity.
9. Preserve rollback evidence without publishing secret values.

## Stop conditions

Stop immediately when any of the following occurs:

- A Container App is not running or latest-ready.
- A managed identity is missing.
- Key Vault secret-read access is missing.
- The service connection lacks required write authority.
- PostgreSQL is not ready.
- A required database password binding is missing.
- The sanitized artifact cannot be generated or validated.
- Any command attempts to print or publish a secret value.

## Production boundary

Passing this preflight authorizes nothing by itself. Storage rotation, PostgreSQL rotation, Key Vault writes, Container App updates, image deployment, APIM rollout, runtime-worker activation, and provider activation each remain separate explicitly confirmed operations.
