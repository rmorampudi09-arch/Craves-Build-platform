# Backend revision provisioning recovery

Date: 2026-09-11

## Incident symptom

The seven-service backend deployment entered the Azure CLI deployment task while the newly submitted Container App revision did not become the latest healthy Ready revision. The visible pipeline excerpt showed only Azure service-principal login and did not contain the target service, revision, provisioning state, or application error.

## Release-tooling defect found

The full-backend wrapper had implemented a second, weaker Container Apps wait loop instead of using the repository's established runtime-preserving single-service helper.

That loop watched only:

- the app-level configured image;
- `latestRevisionName` and `latestReadyRevisionName`;
- app-level `runningStatus`;
- revision `healthState`.

It did not inspect or publish the Azure fields required to distinguish image-pull, startup, probe, secret-sync, database-migration, activation, or control-plane failures:

- app/revision `provisioningState`;
- app/revision `provisioningError`;
- revision `runningState`;
- revision `runningStateDetails`;
- replica state and restart count;
- Container Apps system logs.

It also submitted another image update during any timeout, even when the previous Ready revision was still healthy. That could create unnecessary revisions while hiding the original failure evidence.

## Fix

`scripts/release/deploy-backend-release.sh` now delegates every service deployment and rollback to:

```text
scripts/release/deploy-single-service-preserve-runtime.sh
```

The shared helper already proves:

- exact immutable target image;
- Key Vault-backed active secret references;
- runtime-template preservation;
- Container App configuration preservation;
- managed-identity preservation;
- secret-metadata preservation;
- explicit revision provisioning/running/health state;
- liveness/readiness HTTP smoke;
- guarded current-service rollback only on an explicit failure.

The full wrapper now adds:

- safe app, revision, replica, probe, scale, system-log, and sanitized console-log diagnostics;
- a separate log file for every service deployment and rollback attempt;
- failure evidence even when the release does not reach the final service;
- resume behavior when the exact target digest is already the healthy Ready revision;
- rollback only for services that this run successfully changed;
- no second direct `az containerapp update` implementation in the full-release wrapper.

## Current running pipeline

A pipeline already started from source SHA `147f381b578207e95c7678d208ae2366bce92579` continues to use the previous wrapper because Azure DevOps checks out source at run start. Merging this hotfix cannot change that in-flight process.

Do not start a second deployment concurrently. Let the current run finish its existing bounded wait and rollback handling, or preserve its final log/evidence if it fails. Then run the backend completion pipeline once from the new `main` SHA.

## Expected next-run output

For each service the log must show either:

```text
========== RESUME <service> -> target image already ready ==========
```

or:

```text
========== DEPLOY <service> -> <container-app> ==========
CRAVES SINGLE-SERVICE RUNTIME-PRESERVING DEPLOYMENT
Attempt ... provisioning=... revisionRunning=... health=...
```

On failure, the same run publishes:

```text
backend-deployment-evidence/
  backend-deployment-manifest.json
  deployment-events.json
  rollback-map.json
  service-logs/<service>-deployment.log
  service-logs/<service>-rollback.log
```

and prints sanitized provisioning, replica, system-log, and console-log evidence before stopping.

## Safety

This hotfix changes release tooling only. It does not:

- deploy a service;
- change an image, environment variable, secret, ingress, scale setting, or traffic weight;
- change APIM;
- run a database repair;
- activate scheduled-payment enforcement or discovery caching;
- call a payment or delivery provider;
- alter any product rule.
