# Craves fleet engine on Azure

`main.bicep` runs the fleet engine (`services/fleet-engine`, design in `docs/riders/SCALE.md`) as one new container app in the existing Container Apps environment. It adds nothing else and changes no app that runs today. The engine has no ingress. It makes no dispatch decision until integration-service writes to its streams, which needs `CRAVES_FLEET_ENGINE_MODE=shadow` or `live` there (`docs/riders/GO-LIVE.md` §9). While it runs, it does keep a few connections open on the shared cache: one blocking read per partition it holds (32 with one replica), a pool of up to 16, and a lease round and a PING every 2 seconds.

Every step here is a person's. Agents never deploy. The engine is released only by `azure-pipelines-fleet-engine.yml`, which builds from a clean checkout of GitHub `main` (`AGENTS.md`). Create that pipeline once in Azure DevOps (New pipeline → GitHub → `rmorampudi09-arch/Craves-Build-platform` → existing YAML), and add it to the pipeline table in `docs/runbooks/production-environment.md` in the same PR, as the runbook says. Run the commands below from a machine signed in to subscription `721906c9` (`az account show`).

## Before you start

- **integration-service** runs a release that has Phase 5 (P5-03), with `CRAVES_FLEET_ENGINE_MODE` unset, which means off.
- **The engine's own identity**, allowed to pull images and to read one secret, and nothing else. The Key Vault uses Azure roles (RBAC), not access policies:

  ```bash
  RG=rg-craves-prodlow-centralindia
  az identity create -g $RG -n id-craves-fleet-engine-prodlow -o none
  PRINCIPAL=$(az identity show -g $RG -n id-craves-fleet-engine-prodlow --query principalId -o tsv)
  az role assignment create --assignee-object-id $PRINCIPAL --assignee-principal-type ServicePrincipal --role AcrPull \
    --scope $(az acr show -n cravesrm09prodlow6bf632 --query id -o tsv) -o none
  ```

  The role on the secret comes after step 2, once the secret exists.
- **Redis memory.** The engine shares `amr-craves-prodlow-kmqgfy` with integration-service and auth. The template that made it (`infra/prodlow-rebuild/main.bicep`) sets VolatileLRU eviction: near full, Redis drops keys that have an expiry, least recently used first, and auth's token-revocation keys are among them. So the cache must stay far from full. In the portal, open the cache → Monitoring → Metrics → Used Memory Percentage, and go ahead if it is under 50%. A pilot's engine adds well under 10 MB: rider state, plus two minutes of stream entries (`SCALE.md`, "Memory"). To read the live cache's policy: `az redisenterprise database show -g rg-craves-prodlow-centralindia --cluster-name amr-craves-prodlow-kmqgfy --query evictionPolicy -o tsv`.

## 1. The image

Run the pipeline with `operation` `build`. It runs the engine's tests as its GitHub CI does, then has the registry build the image from that checkout, tagged with the commit, and prints its digest. Nothing is deployed.

## 2. The Redis URL secret

The engine uses the same Redis URL as integration-service. This copies it into Key Vault without printing it:

```bash
az containerapp secret show -g rg-craves-prodlow-centralindia -n ca-craves-integration-service-pr --secret-name redis-url \
  --query value -o tsv \
  | az keyvault secret set --vault-name kvcravesprodlowkmqgfy -n fleet-engine-redis-url --file /dev/stdin -o none
```

Then let the engine's identity read this one secret:

```bash
az role assignment create --assignee-object-id $PRINCIPAL --assignee-principal-type ServicePrincipal --role "Key Vault Secrets User" \
  --scope "$(az keyvault show -n kvcravesprodlowkmqgfy --query id -o tsv)/secrets/fleet-engine-redis-url" -o none
```

## 3. Deploy

Run the pipeline with `operation` `deploy`, first with `confirmProductionChange` unticked. It builds as in step 1, then runs the template's what-if and lists every change. It refuses to go on unless the only change is to `ca-craves-fleet-engine-prodlow` itself: a Create the first time. When that list is right, run it again with `confirmProductionChange` ticked.

## 4. Check it

The pipeline's last step shows the app and its start line. Or:

```bash
az containerapp logs show -g rg-craves-prodlow-centralindia -n ca-craves-fleet-engine-prodlow --tail 60
```

The engine logs one line per event, `NAME key=value …`, like the other Craves services. It starts in about half a minute on half a vCPU (a JVM). What you should see:

- **`FLEET_ENGINE_STARTED` with `redisShards=1`.**
  - With more than 1 there is also a `FLEET_ENGINE_REDIS_SHARDS` warning. Then leave integration-service's mode off. Its Redis client runs in standalone mode, which reaches one shard's keys only, so it must be switched to cluster mode first (`SCALE.md`, "When to grow").
  - The engine itself handles any number of shards.
- **One `FLEET_ENGINE_PARTITION` line per partition:** 32 with one replica.
- **`FLEET_ENGINE_STATS` every minute,** each figure for that minute, all zero until integration-service is switched.

`FLEET_ENGINE_REDIS_UNREACHABLE` means the URL or the network is wrong. The app stays not ready, retries on its own, and nothing else is affected.

Then follow `docs/riders/GO-LIVE.md` §9.

## Update

Run the pipeline's `deploy` again from `main`. The old revision hands its partitions back as it stops, and the new one takes them within a lease (6 seconds). Live dispatch meanwhile falls back to its own ranking.

## After a Redis key rotation

`azure-pipelines-backend-redis-secret-binding.yml` updates the seven services' copies of the Redis URL, not the engine's. Copy it again (step 2's first command), then restart the engine so it reads the new value:

```bash
az containerapp revision restart -g rg-craves-prodlow-centralindia -n ca-craves-fleet-engine-prodlow \
  --revision $(az containerapp show -g rg-craves-prodlow-centralindia -n ca-craves-fleet-engine-prodlow --query properties.latestRevisionName -o tsv)
```

Until then the engine can't reach Redis and live dispatch ranks riders itself.

## Roll back

1. On integration-service, set `CRAVES_FLEET_ENGINE_MODE=off` (GO-LIVE §9). Once its new revision is up, dispatch is Java's alone, as before Phase 5.
2. Delete the app: `az containerapp delete -g rg-craves-prodlow-centralindia -n ca-craves-fleet-engine-prodlow --yes`.

The engine holds nothing that isn't in Postgres. What it leaves in Redis goes on its own:

| Keys | Gone after |
|---|---|
| Rider state | 30 minutes |
| Block indexes | 1 hour |
| Replies | 30 seconds |
| Partition leases | 6 seconds |
| The list of engine instances | 1 minute |
| The 32 streams | 3 minutes after integration-service's last write |
