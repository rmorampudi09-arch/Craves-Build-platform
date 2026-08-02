# Craves production completion source pack

**Date:** 2 August 2026  
**Target:** complete the remaining source and pipeline definitions before the owner runs Azure DevOps pipelines  
**Runtime target:** existing Azure Container Apps `prodlow` environment for approximately 50–100 concurrent users  
**Actions performed while creating this pack:** GitHub source changes only; no Azure pipeline execution, image build, deployment, migration, APIM write, provider call or credential rotation

## 1. Purpose

This pack consolidates the remaining engineering definitions needed to move the merged Craves source from source-ready to executable production rollout. It does not claim that production is deployed. It prepares guarded pipelines, exact inventories, immutable image rules, rollback evidence and manual-action boundaries so Krishna can run the pipelines later.

## 2. Locked direction

Existing Azure Storage and PostgreSQL credentials remain unchanged until the full production-completion security phase. Existing historical plaintext or Container App-managed secret bindings are not migrated by this pack. Every new secret introduced by later work must be stored in Azure Key Vault and consumed through a Key Vault-backed reference. Secret values must never appear in Git, pipeline parameters, normal pipeline variables, command output, screenshots or chat.

## 3. Scope delivered

The pack adds or corrects:

- one canonical production-completion manifest;
- a source validator covering all seven Spring services, Next.js, React Native, Dockerfiles, pipeline YAML and Key Vault-first rules;
- a generated production execution run plan;
- one comprehensive source-only completion pipeline;
- one immutable seven-service ACR image-build pipeline;
- one sequential seven-service Container App deployment pipeline with safety flags disabled;
- one customer-web ACR image-build pipeline using Key Vault-backed Firebase build configuration;
- one customer-web Container App deployment pipeline;
- one React Native native-readiness and shell-artifact pipeline;
- one corrected seven-service release-readiness orchestrator without the obsolete PR-stack gate;
- one production-completion planning orchestrator;
- one corrected legacy infrastructure pipeline using the exact service connection and a Key Vault bootstrap secret instead of a plaintext pipeline variable;
- deployment scripts that preserve rollback evidence and never read or change runtime secret values.

## 4. Canonical source files

```text
config/production/production-completion-pack.json
scripts/release/validate-production-completion-pack.sh
scripts/release/generate-production-completion-runbook.py
scripts/release/deploy-seven-services.sh
scripts/release/deploy-customer-web.sh
azure-pipelines-production-source-completion.yml
azure-pipelines-seven-service-image-build.yml
azure-pipelines-seven-service-deploy.yml
azure-pipelines-customer-web-image-build.yml
azure-pipelines-customer-web-deploy.yml
azure-pipelines-mobile-native-readiness.yml
azure-pipelines-production-completion-orchestrator.yml
azure-pipelines-release-readiness-orchestrator.yml
pipelines/azure-pipelines-infra.yml
docs/runbooks/2026-08-02-production-completion-pack.md
```

## 5. Exact backend inventory

| Order | Service path | ACR repository | Existing Container App |
|---|---|---|---|
| 1 | `services/auth-service` | `craves/auth-service` | `ca-craves-auth-service-prodlow` |
| 2 | `services/user-chef-service` | `craves/user-chef-service` | `ca-craves-user-chef-service-prod` |
| 3 | `services/catalog-service` | `craves/catalog-service` | `ca-craves-catalog-service-prodlo` |
| 4 | `services/order-service` | `craves/order-service` | `ca-craves-order-service-prodlow` |
| 5 | `services/subscription-service` | `craves/subscription-service` | `ca-craves-subscription-service-p` |
| 6 | `services/integration-service` | `craves/integration-service` | `ca-craves-integration-service-pr` |
| 7 | `services/notification-service` | `craves/notification-service` | `ca-craves-notification-service-p` |

The names intentionally match the existing Azure resources, including shortened names caused by Azure limits. Pipelines must not substitute the stale full-length names.

## 6. Source-completion pipeline

Use `azure-pipelines-production-source-completion.yml` first.

It performs:

1. production manifest and pipeline validation;
2. secret-material, Dockerfile, Flyway, APIM and rollback static gates;
3. Java 21 `mvn -B -ntp clean verify` for all seven services;
4. Next.js typecheck, tests and production build;
5. React Native typecheck and tests;
6. mobile secure-file checks;
7. generated run-plan and source-SHA artifacts.

It does not connect to Azure and cannot deploy anything.

### Node lockfile status

At the time this pack was prepared, these files were not committed:

```text
apps/customer-web-next/package-lock.json
apps/mobile/customer-app/package-lock.json
```

The source pipeline can generate candidate lockfiles as artifacts when run with `requireCommittedNodeLockfiles=false`. Those candidates must be reviewed and committed before deterministic production builds are claimed. The strict setting `requireCommittedNodeLockfiles=true` fails until the files are present.

## 7. Seven-service image build

Use `azure-pipelines-seven-service-image-build.yml` after source verification.

Required confirmation:

```text
confirmBuild = BUILD_SEVEN_SERVICES
```

The pipeline builds all seven images in ACR using the exact source SHA when `imageTag` is blank. It rejects `latest`, records every digest and publishes `seven-service-image-manifest`.

This is a billable ACR build operation. It does not update Container Apps.

## 8. Seven-service deployment

Use `azure-pipelines-seven-service-deploy.yml` only after reviewing the image manifest.

Required inputs:

```text
confirmDeployment = DEPLOY_SEVEN_SERVICES
imageTag = <exact immutable tag from the image manifest>
```

The deployment runs in the order Auth → User-Chef → Catalog → Order → Subscription → Integration → Notification. It records the previous image and ready revision before each update. It forces all provider, publisher, consumer, worker, mutation and enforcement flags defined in the completion pack to `false`, then verifies revision readiness and health.

When an update or health check fails, the script restores the previous image for that service. It deliberately leaves newly disabled execution flags false because that is the safer rollback posture. It stops before the next service.

The pipeline does not read, modify or rotate any secret value.

## 9. Customer web image build

Use `azure-pipelines-customer-web-image-build.yml`.

The build uses the existing Next.js standalone Dockerfile and retrieves approved Firebase web build configuration from Key Vault through `AzureKeyVault@2`.

Expected Key Vault secret names:

```text
web-firebase-api-key
web-firebase-auth-domain
web-firebase-project-id
web-firebase-app-id
web-firebase-messaging-sender-id
web-firebase-storage-bucket
```

These values are build-time public Firebase configuration, but the project owner requested all new key-like configuration to originate from Key Vault. The values are masked and never published in artifacts.

`NEXT_PUBLIC_CASHFREE_MODE` is a non-secret build parameter. Initial deployment must remain `sandbox`; choosing `production` does not enable backend payment execution by itself.

Required confirmation:

```text
confirmBuild = BUILD_CUSTOMER_WEB
```

## 10. Customer web deployment

Use `azure-pipelines-customer-web-deploy.yml` only after the web image digest is reviewed.

Required confirmation:

```text
confirmDeployment = DEPLOY_CUSTOMER_WEB
imageTag = <exact immutable web tag>
```

The pipeline expects the existing Container App `ca-craves-web-prodlow`. It will not silently create a resource because creation is billable and requires explicit owner approval. It updates the image, target port 3000 and non-secret runtime variables, then verifies the ready revision and HTTP 200 from `/`.

## 11. Mobile native readiness

Use `azure-pipelines-mobile-native-readiness.yml` first in `source-only` mode.

It validates the TypeScript application, Keychain-based token storage, sandbox Cashfree boundary and absence of Firebase/signing files in Git.

Optional mode `generate-native-artifact` runs the existing bootstrap script and publishes unconfigured Android/iOS shell projects as an artifact. It does not add Firebase files, signing credentials or store configuration.

### Native items intentionally blocked

The source documents explicitly defer:

- native location-library choice;
- Android location permission;
- iOS location usage-description text;
- final consent wording;
- Firebase Android/iOS configuration files;
- Android signing keystore;
- Apple certificate and provisioning profile.

These cannot be invented by the pipeline. They require product/privacy review and owner console actions.

## 12. Corrected release-readiness orchestrator

`azure-pipelines-release-readiness-orchestrator.yml` now:

- derives all seven Container Apps from the canonical completion pack;
- removes the obsolete open-draft PR range 68–82 requirement;
- runs all seven Maven builds;
- runs Next.js and React Native verification;
- optionally performs read-only Azure checks;
- generates immutable release evidence.

It does not deploy or activate anything.

## 13. Corrected infrastructure pipeline

The old `pipelines/azure-pipelines-infra.yml` used `sc-craves-dev` and `POSTGRES_ADMIN_PASSWORD`. The corrected pipeline uses:

```text
Craves-Dev-Service-Connection
```

and reads the secure Bicep value from the existing Key Vault only inside a non-echoing Azure CLI process.

Default action is `validate`. `what-if` is read-only evaluation. `deploy` requires:

```text
confirmDeploy = DEPLOY_FOUNDATION
```

A deployment can create or modify billable resources. It must not be run merely to test a YAML change.

## 14. APIM and runtime modules

The repository already contains module-specific APIM CI/write pipelines and runtime activation/rollback pipelines. This pack does not combine all APIM writes or provider activations into one unsafe operation. They must be run one module at a time after the owning service is healthy.

Required order:

1. APIM static validation;
2. owning backend health;
3. one guarded APIM rollout;
4. policy and operation read-back;
5. unauthenticated 401 and role-boundary smoke;
6. stop on failure before the next APIM module.

Runtime activation remains downstream-first. Consumers must be proven before publishers. Webhook ingress must be proven before payment/refund/provider workers. Real provider execution remains last.

## 15. Key Vault-first contract

For every new confidential value:

1. Krishna creates or enters the value directly in Azure Key Vault or the approved provider console integration.
2. The Container App system-assigned identity receives only `Key Vault Secrets User` access needed for runtime reads.
3. The Container App secret uses a versionless Key Vault reference.
4. The application environment variable uses `secretRef`, never a plaintext value.
5. Pipelines validate the secret name and reference metadata without printing the value.
6. Source and pipeline artifacts contain no value.

Existing legacy bindings remain unchanged until the final security phase, per the owner’s instruction.

## 16. Manual steps required

### Azure DevOps

- Create pipelines from the new YAML files.
- Authorize `Craves-Dev-Service-Connection` once per pipeline when prompted.
- Configure approval checks on environments `craves-prodlow-backend` and `craves-prodlow-web`.
- Run source verification before image build.
- Use exact immutable tags from published manifests.

### Azure Portal and Key Vault

- Enter the six web Firebase configuration values under the exact Key Vault names listed above.
- Confirm Container App managed identities have required Key Vault access for future new secrets.
- Do not rotate existing Storage or PostgreSQL credentials yet.
- Review any future resource creation because Redis, Front Door/CDN, extra capacity and monitoring retention are billable.

### Firebase Console

- Confirm the existing Firebase project and web app configuration.
- Download Android/iOS files only when the native shell is approved.
- Never paste Firebase service-account JSON into chat.

### Cashfree and delivery providers

- Complete KYC and production callback registration.
- Keep execution flags disabled until controlled activation.
- Do not paste credentials into chat or source control.

### Mobile stores

- Upload signing materials through Azure DevOps Secure Files or the approved signing system.
- Complete Google Play Console and Apple Developer/App Store Connect setup manually.

## 17. Testing before deployment

Run locally or through the source pipeline:

```bash
scripts/release/validate-production-completion-pack.sh

for service in \
  auth-service user-chef-service catalog-service order-service \
  subscription-service integration-service notification-service; do
  (cd "services/$service" && mvn -B -ntp clean verify)
done

cd apps/customer-web-next
npm install --ignore-scripts
npm run verify

cd ../mobile/customer-app
npm install --ignore-scripts
npm run verify
```

The two `npm install` commands are temporary until reviewed lockfiles are committed.

## 18. Risks and stop conditions

- Missing Node lockfiles prevent deterministic release claims.
- Redis is not currently discovered in the Azure environment; token revocation and rate limiting must remain disabled.
- The web Container App name is derived from the existing Bicep design but must be verified before web deployment.
- Internal Container App health endpoints may not be reachable from a Microsoft-hosted agent; a failed health gate must be resolved through network design, not bypassed.
- No pricing, commission, radius, refund entitlement, settlement, subscription grace, delivery SLA or FSSAI value is introduced by this pack.
- No pipeline may continue after source, build, health, revision, APIM, migration, security or rollback failure.

## 19. Deferred final security phase

After the full application, APIM, mobile native projects, providers, monitoring and production tests are complete:

1. rotate the Azure Storage key safely using the unused-key sequence;
2. move Storage consumers to versionless Key Vault references;
3. rotate the PostgreSQL password in a maintenance window;
4. move every database consumer to the final Key Vault reference;
5. verify all revisions, health, Flyway history and authentication;
6. invalidate exposed historical credentials;
7. archive final evidence.

That phase is intentionally not part of the current source build.
