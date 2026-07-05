# Craves Azure Foundation Deployment

This guide deploys the Craves full-app low-capacity production foundation to the existing Azure Startup subscription.

## Prerequisites

Repository secrets:

- AZURE_CLIENT_ID
- AZURE_TENANT_ID
- AZURE_SUBSCRIPTION_ID
- POSTGRES_ADMIN_PASSWORD

Repository variables:

- AZURE_RESOURCE_GROUP
- AZURE_LOCATION
- ENV_NAME
- PROJECT
- ACR_NAME

## Current target

- Tenant: 6ac26780-f774-41e0-bf31-45f5e6e7167d
- Subscription: Craves-Dev
- Subscription ID: 4f897b61-9b52-44b4-8cf1-bdac281cc1aa
- Region: southindia
- Resource group: rg-craves-prodlow-southindia

## Deployment resources

The Bicep template provisions:

- Azure Container Registry
- Azure Container Apps Environment
- Eight Container Apps placeholders for web plus seven backend services
- PostgreSQL Flexible Server with craves_auth_db, craves_business_db and craves_integration_db
- Azure Cache for Redis
- Azure Service Bus namespace, domain event topic and command queues
- Azure Blob Storage containers for media and documents
- Azure Key Vault with RBAC enabled
- API Management
- Application Insights
- Log Analytics

## Manual deployment command

Run from Azure Cloud Shell after confirming the correct subscription is selected.

```bash
az account set --subscription 4f897b61-9b52-44b4-8cf1-bdac281cc1aa

az deployment group validate \
  --resource-group rg-craves-prodlow-southindia \
  --template-file infra/main.bicep \
  --parameters location=southindia \
               environmentName=prodlow \
               projectName=craves \
               acrName=<your-acr-name> \
               postgresAdminPassword='<strong-password>'

az deployment group what-if \
  --resource-group rg-craves-prodlow-southindia \
  --template-file infra/main.bicep \
  --parameters location=southindia \
               environmentName=prodlow \
               projectName=craves \
               acrName=<your-acr-name> \
               postgresAdminPassword='<strong-password>'

az deployment group create \
  --name craves-foundation-001 \
  --resource-group rg-craves-prodlow-southindia \
  --template-file infra/main.bicep \
  --parameters location=southindia \
               environmentName=prodlow \
               projectName=craves \
               acrName=<your-acr-name> \
               postgresAdminPassword='<strong-password>'
```

Never commit real secrets. Store provider credentials in Azure Key Vault and map them into Container Apps later.
