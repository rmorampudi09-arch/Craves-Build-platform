# Craves backend completion and guarded release

This runbook covers only the seven Spring Boot services. It does not build or deploy the admin/customer/chef web application, the React Native application, Azure Managed Redis, APIM changes, or any external-provider activation.

## What is complete in source

The current `main` history already contains the backend launch-policy, subscription schedule/generation/billing/payment/fulfilment, chef financial ledger, admin investigation, account intervention, notification delivery, payment, refund, delivery, outbox and recovery modules. Their real workers and production-provider paths remain disabled by default where activation would require product values, credentials, callback registration, or controlled rollout.

This completion change adds one canonical backend pipeline and corrects all seven service images so they can be built from source in ACR and run as UID/GID `10001`.

## Pipeline

Create an Azure DevOps pipeline from:

```text
azure-pipelines-backend-completion.yml
```

The pipeline follows the established Craves variable-driven pattern. Add or retain this non-secret Azure DevOps pipeline variable:

```text
AZURE_SERVICE_CONNECTION = Craves-Dev-Service-Connection
```

The resource-group and ACR names are prefilled as run parameters and validated against the guarded backend inventory. No Azure DevOps Environment resource is required.

Its default mode is `VERIFY_ONLY`, which performs no Azure mutation. It validates the backend release contract, Flyway ordering, secret hygiene and Docker hardening, then runs `mvn -B -ntp clean verify` with Java 21 for all seven services.

## Run order

### 1. Source verification

Run with the defaults:

```text
releaseMode: VERIFY_ONLY
confirmBuild: DO_NOT_BUILD
confirmDeployment: DO_NOT_DEPLOY
databaseBackupConfirmation: DATABASE_BACKUP_NOT_VERIFIED
```

Expected result: source evidence and JUnit test results are published. No image, Container App, database, APIM operation, secret, runtime flag or provider is changed.

### 2. Immutable image build

After `VERIFY_ONLY` passes, run:

```text
releaseMode: BUILD_IMAGES
confirmBuild: BUILD_SEVEN_SERVICES
```

Expected result: seven ACR images are tagged with the exact 40-character Git commit SHA. The pipeline resolves and publishes each repository digest. No deployment occurs.

### 3. Backend deployment

Before this mode, confirm a restorable Azure PostgreSQL backup/restore point for the three Craves databases. Flyway migrations are forward-only; an image rollback cannot undo a database migration.

Confirm that the pipeline is authorized to use `Craves-Dev-Service-Connection`. Then run:

```text
releaseMode: DEPLOY_BACKEND
confirmBuild: BUILD_SEVEN_SERVICES
confirmDeployment: DEPLOY_SEVEN_SERVICES
databaseBackupConfirmation: DATABASE_BACKUP_VERIFIED
resourceGroupName: rg-craves-prodlow-centralindia
containerRegistryName: cravesprodlowacr82121
```

The same run verifies source, runs all Maven tests, builds all seven images, records their digests, and deploys only those digests. The typed confirmations are the deliberate deployment gate.

## Deployment guarantees

- Every existing Container App environment value and secret reference is preserved; the script never calls `--set-env-vars`, `--replace-env-vars`, or secret mutation commands.
- Current working Cashfree sandbox/payment and notification settings are therefore not disabled by the deployment.
- External-provider and new background-worker settings keep their current runtime values. Their source defaults remain fail-closed.
- All seven Container Apps are checked before the first mutation.
- Each deployed revision must become the latest ready revision and pass an HTTP health probe.
- Environment configuration is hashed before and after every image update; any unexpected change fails the release.
- If any service fails, every service already updated in that run is restored in reverse order to its previous image.
- The pipeline publishes source, image-digest, deployment, health and rollback evidence.

## Service deployment order

1. Auth Service
2. Notification Service
3. User/Chef Service
4. Catalog Service
5. Integration Service
6. Subscription Service
7. Order Service

Dependencies are updated before the customer-facing Order Service. No APIM policy or route is changed by this pipeline.

## Deliberately deferred

- Cashfree production activation, production credentials and callback cutover
- delivery-provider activation and Hyderabad field validation
- automatic refund provider execution and reconciliation
- FCM and ACS Email production delivery activation
- recurring-subscription workers until schedules, lead time and financial policy are approved
- launch-policy enforcement until minimum-order and delivery-radius values are approved
- admin/customer/chef UI and UX work
- React Native and store/signing work

These are not missing source-code errors; they are controlled product, credential, provider, or operational activation gates.
