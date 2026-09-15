# Craves backend Step 1 production deployment and controlled smoke

**Approval date:** 2026-09-11  
**Approved scope:** backend deployment window plus controlled non-provider smoke  
**Deferred:** product-owned rules and new Hyperlocal vendor contracts  
**Real transaction:** one controlled real test after Step 1 acceptance; repeat after the deferred work is implemented

## 1. Release split

Craves will use two independent activation cycles.

### Cycle A — now

Deploy the completed backend source and additive migrations while preserving every current runtime environment value, secret reference, ingress setting, scaling setting and currently approved production provider path.

The deployment must not activate newly introduced decision-dependent capabilities. In particular:

- Catalog discovery Redis caching remains disabled.
- Scheduled-payment enforcement remains disabled.
- No scheduled-order policy row is created by engineering.
- Review media remains unavailable until the approved media authorizer exists.
- No new Hyperlocal provider adapter is activated.
- No pricing, commission, delivery-radius, cancellation, refund, FSSAI, loyalty, promotion or provider-selection rule is inferred.
- No customer web or mobile source is deployed in this cycle.

After the backend deployment and controlled smoke pass, the owner may perform one real customer transaction on the already approved production payment and delivery path.

### Cycle B — later

After product-owned decisions and real Hyperlocal contracts are approved, implement and activate only those approved rules/adapters. Run the same controlled deployment gates again, then perform a second real end-to-end transaction.

## 2. Source baseline

Use the latest reviewed `main` SHA after this release-guard pull request is merged. Do not use a feature-branch SHA, a mutable image tag or an older production image.

The source baseline includes the merged support-case, ratings/trust, Catalog discovery, order-history/cart-preflight, notification-inbox, scheduled-order and scheduled-payment-guard backend work.

## 3. Single pipeline

Run the existing Azure DevOps pipeline backed by:

```text
azure-pipelines-backend-completion.yml
```

Use these parameters:

```text
releaseMode                 = DEPLOY_BACKEND
confirmBuild                = BUILD_SEVEN_SERVICES
confirmDeployment           = DEPLOY_SEVEN_SERVICES
databaseBackupConfirmation  = DATABASE_BACKUP_VERIFIED
resourceGroupName           = rg-craves-prodlow-centralindia
containerRegistryName       = cravesprodlowacr82121
```

The Azure service connection is already declared in the guarded release inventory:

```text
Craves-Dev-Service-Connection
```

`DATABASE_BACKUP_VERIFIED` must be selected only after current PostgreSQL backup/PITR evidence has been checked. This cannot be bypassed because Order Service will apply forward-only Flyway migrations.

## 4. Pipeline execution contract

The pipeline must perform, in this order:

1. backend-only source integrity and secret-material scans;
2. Flyway version validation;
3. Java 21 Maven `clean verify` for all seven services;
4. immutable ACR image builds tagged with the exact Git SHA;
5. digest resolution and immutable image manifest publication;
6. read-only verification that the two Step 1 dormant flags are absent or false;
7. capture of every previous healthy revision, image and environment hash;
8. digest-pinned service deployment in guarded order;
9. readiness, running-state and health verification after each service;
10. proof that runtime environment values and secret references were preserved;
11. full reverse-order rollback if any service fails;
12. publication of deployment events, rollback map and final deployment manifest.

The pipeline does not alter a feature flag, secret, ingress rule, scaling value, APIM operation or external provider configuration.

## 5. Step 1 dormant flags

The production release must stop before the first Container App update if either value is explicitly active:

```text
Catalog Service:
  CRAVES_DISCOVERY_CACHE_ENABLED

Integration Service:
  CRAVES_SCHEDULED_PAYMENT_GUARD_ENABLED
```

Absent values are accepted because both source defaults are false. Secret references or non-boolean values are rejected because their state cannot be safely established.

These flags are activated only in later controlled changes:

- discovery cache after uncached Catalog behavior and invalidation are proven;
- scheduled-payment guard after Order V23, the protected internal eligibility route and explicit schedule policies are proven.

## 6. Controlled smoke acceptance

Step 1 passes only when all seven deployed images correspond to the same source SHA and every service satisfies:

- latest revision equals latest ready revision;
- running status is `Running`;
- revision health is `Healthy`;
- readiness and health endpoints return HTTP 200 within the bounded retry window;
- environment hash matches the pre-deployment revision;
- required Key Vault-backed secret references still resolve;
- no automatic rollback event exists;
- deployment evidence contains seven successful health events and the two dormant-flag checks.

Service readiness also proves that owned Flyway migrations completed successfully enough for the application to start. The evidence review must still inspect startup logs and Flyway history before the real transaction.

## 7. Read-only post-deployment checks

Before the real transaction, verify:

- the final pipeline source SHA equals current `main`;
- all ACR references are digest pinned;
- V22 order review/trust and V23 scheduled-order migrations are successful in Order Service Flyway history;
- V5 notification inbox migration is successful in Notification Service Flyway history;
- Catalog V6/V7 history remains unchanged and successful;
- no unexpected schema repair or checksum change occurred;
- the newly introduced schedule policy table contains no engineering-seeded policy row;
- the current customer web/mobile revision was not changed;
- current approved payment and delivery runtime settings were preserved rather than reconstructed;
- no Hyperlocal API call was made.

## 8. Entry criteria for the first real transaction

Proceed only when:

- the deployment pipeline is green;
- deployment evidence is downloadable;
- the seven new revisions are healthy;
- Flyway history is clean;
- no rollback occurred;
- the existing approved payment webhook path is healthy;
- the existing approved delivery path is healthy;
- there is no active incident or unexplained 5xx increase.

## 9. First real production test

Use one owner-approved low-value order and one payment attempt only. Use the existing approved customer, chef, payment and delivery route; do not use an unapproved Hyperlocal provider.

Record, without exposing secrets:

```text
source SHA
pipeline run ID
service revision names
checkout ID
order ID
payment-order ID
provider order/payment reference
webhook event identity
chef acceptance timestamp
ready-for-pickup timestamp
delivery assignment/provider reference
normalized delivery status history
correlation ID
delivery completion timestamp
```

Validate:

1. customer authentication and selected delivery address;
2. current Catalog item, price and availability;
3. cart preflight has no blocking issue;
4. checkout authoritative total matches the provider amount exactly;
5. one provider payment order is created;
6. payment capture/webhook is signature-valid and idempotent;
7. Craves checkout/order reaches the correct paid state once;
8. chef receives and accepts the order once;
9. preparation and ready-for-pickup transitions are recorded once;
10. one delivery booking/assignment exists;
11. normalized tracking reaches delivered without duplicate booking;
12. notifications, order history and support context remain owner scoped;
13. no unexpected sensitive data is returned or logged.

## 10. Immediate stop conditions

Stop and do not create another payment when any of the following occurs:

- amount or currency mismatch;
- more than one Craves or provider payment order;
- captured provider payment but Craves remains unpaid;
- duplicate webhook mutation;
- more than one delivery booking;
- ownership/authorization leakage;
- Flyway checksum or failed migration;
- new revision not healthy;
- runtime environment hash differs;
- unexpected 5xx, timeout or queue backlog;
- unapproved provider request.

Preserve all order, payment, webhook, delivery, inbox, outbox and audit evidence. Roll back the application revision only through the generated rollback map; do not delete transactional records or edit Flyway history.

## 11. Deferred decisions

The following remain intentionally unresolved in Cycle A:

- schedule lead time, horizon, slots and payment gate;
- cancellation/refund/compensation outcomes;
- pricing, commission, tax and promotional rules;
- serviceability radius and provider ranking;
- loyalty/referral economics;
- review media/content policy;
- FSSAI and food-safety claims;
- Hyperlocal vendor authentication, create/cancel/status/webhook contracts and commercial rules.

Cycle B begins only when the relevant architecture/functional-spec sections and approved vendor contracts are available.

## 12. Manual action count

One Azure DevOps queue action is required for Cycle A because the connected GitHub tool cannot operate the Azure DevOps tenant. No secret should be copied into chat or pipeline parameters. All other build, deploy, health, rollback and evidence actions are performed by the single guarded pipeline.
