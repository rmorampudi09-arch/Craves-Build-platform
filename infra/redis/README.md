# Craves Azure Managed Redis (deferred infrastructure)

This folder contains the Azure Managed Redis infrastructure definition for the Craves backend security stack.

## Current status

As of 2026-09-08, the prod-low Azure environment has:

- no Azure Managed Redis resource;
- no VNet integration on the existing Azure Container Apps environment;
- no VNet, subnet, private endpoint, or private DNS zone in `rg-craves-prodlow-centralindia`;
- no `SPRING_DATA_REDIS_URL` binding on any of the seven Java backend services.

Because distributed token revocation is fail-closed when enabled, the Redis-backed security flags must remain disabled until Redis is provisioned, connected, and tested.

## Safety design

`main.bicep` is intentionally separate from `infra/main.bicep`.

The module defaults to:

```text
deployRedis=false
redisSkuName=Balanced_B0
publicNetworkAccess=Disabled
highAvailability=Enabled
minimum TLS=1.2
client protocol=Encrypted
port=10000
eviction policy=NoEviction
```

Running the existing foundation Bicep does not create Redis. Running this Redis module with its default parameters also creates no Redis resource.

Creating Azure Managed Redis is a billable Azure action. Do not set `deployRedis=true` until the deployment window and networking decision are approved.

## Why `NoEviction`

The first Craves Redis use case is security-critical token-revocation projection. Silent eviction of a revocation key could weaken enforcement. `NoEviction` therefore prefers a visible write failure over silently dropping security state. The existing Auth publisher has durable PostgreSQL outbox, retry, and dead-letter behavior for failed Redis publication.

## Networking decision still required

The current prod-low Container Apps environment is not VNet-integrated.

Long-term production direction:

1. VNet-integrated Container Apps environment;
2. dedicated private-endpoint subnet;
3. Azure Managed Redis Private Endpoint;
4. private DNS;
5. `publicNetworkAccess=Disabled`.

If Redis is activated before that network migration, public network access would have to be explicitly enabled and protected by TLS plus Redis authentication. That is a temporary topology decision, not the target architecture.

## Validate the template without provisioning

From Azure Cloud Shell or a workstation with Azure CLI/Bicep:

```bash
az bicep build --file infra/redis/main.bicep
```

A resource-group what-if can also be run safely with the deployment gate left off:

```bash
az deployment group what-if \
  --resource-group rg-craves-prodlow-centralindia \
  --template-file infra/redis/main.bicep \
  --parameters deployRedis=false environmentName=prodlow
```

## Preview the future Redis deployment

This previews the billable resources without creating them:

```bash
az deployment group what-if \
  --resource-group rg-craves-prodlow-centralindia \
  --template-file infra/redis/main.bicep \
  --parameters \
    deployRedis=true \
    environmentName=prodlow \
    redisSkuName=Balanced_B0 \
    publicNetworkAccess=Disabled
```

Do not execute a real deployment with `publicNetworkAccess=Disabled` until the Container Apps environment has private connectivity to Redis.

## Existing application-side rollout assets

After Redis infrastructure exists and connectivity is proven, use the existing repository assets in this order:

1. `azure-pipelines-backend-redis-secret-binding.yml`
   - creates/binds the `redis-url` Container App secret;
   - maps `SPRING_DATA_REDIS_URL=secretref:redis-url` across all seven services;
   - keeps execution flags disabled.
2. `azure-pipelines-backend-redis-security-ci.yml`
   - validates the seven-service Java implementation and Redis security contracts.
3. `azure-pipelines-backend-redis-security-activation.yml`
   - Phase 1: Auth revocation publisher;
   - Phase 2: all seven revocation consumers;
   - Phase 3: Auth rate limiter after explicit thresholds are approved.
4. `azure-pipelines-backend-redis-security-rollback.yml`
   - emergency rollback in reverse order.

## Required runtime secret

Every Java backend service eventually needs:

```text
SPRING_DATA_REDIS_URL=secretref:redis-url
```

Never commit the Redis access key, password, or full connection URL. Never paste them into chat, logs, pipeline YAML, or documentation.

## Production activation conditions

Do not enable the Redis security flags until all of these are true:

- Azure Managed Redis is provisioned and healthy;
- TLS connectivity from every backend Container App is proven;
- `SPRING_DATA_REDIS_URL` is a secret reference on all seven services;
- Auth publisher test succeeds;
- ACTIVE/SUSPENDED/old-token-version scenarios pass;
- fail-closed Redis outage behavior is understood and monitored;
- production rate-limit thresholds are explicitly approved;
- rollback pipeline remains available.

## Scale note

`Balanced_B0` is only the planned initial prod-low tier. It is not the final capacity design for approximately one million concurrent users. Before that scale, reassess Redis tier/cluster sizing, zone redundancy, networking, connection pools, local near-cache, APIM/Front Door controls, telemetry, and regional failure handling.
