# Craves prodlow Azure rebuild

This folder is the repeatable rebuild path for the `rmorampudi09@gmail.com` Azure subscription.

It creates:

- Resource group: `rg-craves-prodlow-centralindia`
- Monthly Azure budget: INR 12,500 with 50%, 80%, and forecasted 100% alerts
- Azure Container Registry Basic
- Azure Container Apps environment
- Container Apps for web plus the approved backend services
- PostgreSQL Flexible Server `Standard_B1ms`
- Azure Managed Redis `Balanced_B0`
- Service Bus Standard with Craves queues/topic
- Storage Account Standard LRS with private `media` and `documents` containers
- Key Vault Standard
- API Management Consumption
- Application Insights and Log Analytics
- Azure Front Door **Standard**, not Premium

## Cost posture

This is a starter/prodlow rebuild, not a 1M-concurrent-user production shape. It is designed to stay near the INR 12,500/month ceiling while the platform is still being rebuilt:

- Keep web and auth warm with `minReplicas: 1`.
- Keep most backend services at `minReplicas: 0` until real traffic needs them.
- Use Front Door Standard.
- Use APIM Consumption.
- Avoid AKS, Front Door Premium, NAT Gateway, multi-region DR, and PostgreSQL HA.

Expected risk items:

- Service Bus Standard can become a meaningful fixed monthly cost.
- Front Door transfer costs grow with traffic.
- Log Analytics can grow unexpectedly; keep retention at 30 days and review ingestion.
- This shape will not support 1M concurrent users without scaling and a larger budget.

## Azure DevOps setup

Manual one-time setup in the new Azure DevOps organization/project signed in as `rmorampudi09@gmail.com`:

1. Create or import the Azure Repos repository.
2. Create an Azure Resource Manager service connection named `Craves-RMORAMPUDI09-Service-Connection`.
3. Give that service connection Contributor access to the target subscription.
4. Add secret pipeline variable `POSTGRES_ADMIN_PASSWORD`.
5. Add normal variable `ACR_NAME` with a globally unique lowercase value, for example `cravesrmorampudi09prod01`.
6. Run `azure-pipelines-rmorampudi09-rebuild.yml`.

## Disruption plan

1. Deploy this stack without touching existing DNS.
2. Validate the new Front Door default hostname from the pipeline output.
3. Deploy real container images over the placeholder quickstart images.
4. Smoke test web, APIM, and each service endpoint.
5. Lower existing DNS TTL to 300 seconds before cutover.
6. Add custom domain to the new Standard Front Door profile.
7. Validate domain ownership and managed certificate.
8. Switch DNS CNAME to the new Front Door endpoint.
9. Monitor errors, latency, and budget for 24 hours.
10. Keep the old subscription alive until rollback window ends.

Rollback is DNS-only if the old environment is left untouched: point the CNAME back to the old endpoint.
