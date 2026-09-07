# Craves Azure Infrastructure

Starter low-cost deployment for 50-100 concurrent users:
- Resource group
- PostgreSQL Flexible Server Burstable
- Key Vault
- Storage Account
- Log Analytics
- Application Insights
- Service Bus
- Azure Container Apps environment and service placeholders
- API Management

Deferred / separately activated infrastructure:
- Azure Managed Redis: `infra/redis/main.bicep`
- AKS
- Application Gateway
- Front Door Premium
- NAT Gateway
- Multi-region DR

## Base foundation

Deploy example:

```bash
az group create -n rg-craves-dev -l centralindia
az deployment group create -g rg-craves-dev -f infra/main.bicep -p environmentName=dev postgresAdminPassword='CHANGE_ME'
```

## Azure Managed Redis

Redis is deliberately not embedded into the original foundation deployment because it is billable and the current prod-low Container Apps environment is not VNet-integrated.

The deferred Redis module is located at:

```text
infra/redis/main.bicep
```

It defaults to `deployRedis=false`, so merely validating or running it with defaults does not create a Redis resource. See `infra/redis/README.md` for the networking decision, billable deployment gate, secure secret binding, activation sequence, and scale considerations.
