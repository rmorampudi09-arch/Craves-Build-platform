@description('Azure region for the existing Container Apps environment.')
param location string = resourceGroup().location

@description('Existing Container Apps managed environment resource ID.')
param managedEnvironmentId string

@description('Existing Azure Container Registry name.')
param acrName string = 'cravesprodlowacr82121'

@description('Customer web Container App name.')
param containerAppName string = 'ca-craves-web-prodlow'

@description('Immutable ACR image reference including tag.')
param image string

@description('Non-secret APIM base URL used by server-side Next.js BFF routes.')
param apiBaseUrl string = 'https://apim-craves-prodlow-l3ing6.azure-api.net/api/v1'

@minValue(0)
@maxValue(10)
param minReplicas int = 1

@minValue(1)
@maxValue(20)
param maxReplicas int = 2

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

resource customerWeb 'Microsoft.App/containerApps@2023-05-01' = {
  name: containerAppName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: managedEnvironmentId
    configuration: {
      activeRevisionsMode: 'Single'
      registries: [
        {
          server: acr.properties.loginServer
          identity: 'system'
        }
      ]
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
      }
    }
    template: {
      containers: [
        {
          name: 'customer-web-next'
          image: image
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'PORT'
              value: '3000'
            }
            {
              name: 'NEXT_TELEMETRY_DISABLED'
              value: '1'
            }
            {
              name: 'CRAVES_API_BASE_URL'
              value: apiBaseUrl
            }
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
}

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, customerWeb.id, 'AcrPull')
  scope: acr
  properties: {
    principalId: customerWeb.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}

output containerAppName string = customerWeb.name
output fqdn string = customerWeb.properties.configuration.ingress.fqdn
output principalId string = customerWeb.identity.principalId
output image string = image
