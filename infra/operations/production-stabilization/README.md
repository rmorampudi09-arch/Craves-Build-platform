# Craves Production Stabilization Verification

This module verifies the production-low customer website after `craves.in` and `www.craves.in` were placed behind Azure Front Door Premium, with Azure Container Apps retained as the origin.

It is intentionally read-only. It does not change DNS, certificates, custom-domain bindings, Container App revisions, APIM configuration, or application settings. It also does not provision Azure Monitor, Application Insights, Log Analytics, action groups, or any other billable Azure resource.

## Scope

It checks the rebuilt production environment: Azure subscription 1 (`721906c9-…`), Container Apps environment `cae-craves-prodlow-kmqgfy`, Front Door `afd-craves-prodlow`. All public hostnames (`craves.in`, `www.craves.in`, `api.craves.in`, `admin.craves.in`) are Front Door custom domains, and Front Door terminates TLS for them; no custom domain is bound on a Container App.

The checks cover:

- Azure subscription safety check.
- Customer Container App running state.
- Latest revision equals latest ready revision.
- Container App FQDN and Container Apps environment static IP (`20.235.225.35`) are unchanged.
- The certificate each public hostname serves covers that hostname and has more than 30 days remaining.
- The Azure Front Door endpoint is enabled and successfully provisioned.
- All four Front Door custom domains are provisioned and validation-approved.
- The currently delegated authoritative DNS and Google/Cloudflare recursive DNS all resolve the apex, and `www` points to the Front Door endpoint.
- Both public customer URLs return HTTP 200 with valid TLS and an Azure Front Door response marker.
- `api.craves.in` points to the Front Door endpoint, its TLS is valid and its root answers 200 or 404.
- Integration-service: latest revision is ready and the JWT issuer and audience have not drifted (second pipeline step).

## Files

```text
azure-pipelines-production-stabilization.yml
infra/operations/production-stabilization/
├── README.md
└── check-production.sh
```

## Azure DevOps setup

Create an Azure DevOps YAML pipeline from:

```text
/azure-pipelines-production-stabilization.yml
```

The YAML sets `AZURE_SERVICE_CONNECTION=Craves-RMORAMPUDI09-Service-Connection`, the connection every pipeline for the rebuilt environment uses. The Azure DevOps project that runs this pipeline must have a service connection with that name and read access to subscription `721906c9-…`.

The YAML runs every six hours from `main` and can also be queued manually. The schedule consumes Azure DevOps hosted-agent minutes but does not provision an Azure resource.

## Expected success

A healthy run ends with:

```text
FINAL RESULT: PASS
FAILURES: 0
PRODUCTION_STABILIZATION_STATUS=PASS
```

## Failure handling

Do not immediately roll back on a single failed assertion. Use the failed section to classify the issue first:

- Runtime/revision failure: investigate the Container App revision before changing DNS.
- DNS mismatch: compare the currently delegated authoritative DNS with public resolvers and the configured Front Door endpoint. A recursive-only mismatch can be cache propagation.
- TLS or certificate failure: check the hostname's certificate on the Front Door custom domain before changing DNS.
- APIM failure: do not change customer website DNS; API routing is a separate component.

## History

Until 24 Oct 2026 this module checked the first, now retired environment (see "Retired: never use" in docs/runbooks/production-environment.md), with `craves-web-tls` bound on the customer Container App and the legacy Static Web App as a rollback target. Production moved to the rebuilt environment, so those checks failed on `az account set` and were retired with it.

## Cost note

This module creates no paid Azure resources. The scheduled Azure DevOps pipeline consumes build-agent minutes according to the project's existing Azure DevOps entitlement. If continuous Azure Monitor alerts are later required, treat that as a separate billing-sensitive infrastructure change and review cost before provisioning.
