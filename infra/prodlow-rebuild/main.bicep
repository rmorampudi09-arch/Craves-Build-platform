@description('Deployment location.')
param location string = resourceGroup().location

@description('Environment name.')
param environmentName string = 'prodlow'

@description('Project prefix.')
param projectName string = 'craves'

@description('Globally unique Azure Container Registry name. Lowercase letters and numbers only.')
param acrName string

@description('PostgreSQL administrator login.')
param postgresAdminLogin string = 'cravesadmin'

@secure()
@description('PostgreSQL administrator password.')
param postgresAdminPassword string

@description('API Management publisher email.')
param apimPublisherEmail string = 'contact@craves.in'

@description('API Management publisher name.')
param apimPublisherName string = 'Craves'

var env = toLower(environmentName)
var project = toLower(projectName)
var shortHash = 'kmqgfy'
var cleanProject = replace(project, '-', '')
var cleanEnv = replace(env, '-', '')
var suffix = '${project}-${env}'

var logAnalyticsName = 'law-${suffix}-${shortHash}'
var appInsightsName = 'appi-${suffix}-${shortHash}'
var storageName = take(toLower('st${cleanProject}${cleanEnv}${shortHash}'), 24)
var keyVaultName = take(toLower('kv${cleanProject}${cleanEnv}${shortHash}'), 24)
var postgresName = take(toLower('pg-${project}-${env}-${shortHash}'), 63)
var managedRedisName = take(toLower('amr-${project}-${env}-${shortHash}'), 60)
var serviceBusName = take(toLower('sb-${project}-${env}-${shortHash}'), 50)
var acaEnvName = take(toLower('cae-${project}-${env}-${shortHash}'), 32)
var apimName = take(toLower('apim-${project}-${env}-${shortHash}'), 50)
var frontDoorProfileName = take(toLower('afd-${project}-${env}-${shortHash}'), 64)
var frontDoorEndpointName = take(toLower('${project}-${env}-${shortHash}'), 46)

var commonTags = {
  project: projectName
  environment: environmentName
  workload: 'craves-prodlow-rebuild'
  managedBy: 'azure-devops-bicep'
}

var commandQueues = [
  'payment-command'
  'delivery-command'
  'notification-command'
  'subscription-schedule'
]

var containerApps = [
  {
    name: 'web'
    containerName: 'web'
    external: true
    minReplicas: 1
    maxReplicas: 2
    cpu: '0.25'
    memory: '0.5Gi'
  }
  {
    name: 'auth-service'
    containerName: 'auth-service'
    external: false
    minReplicas: 1
    maxReplicas: 2
    cpu: '0.25'
    memory: '0.5Gi'
  }
  {
    name: 'user-chef-service'
    containerName: 'user-chef-service'
    external: false
    minReplicas: 0
    maxReplicas: 2
    cpu: '0.25'
    memory: '0.5Gi'
  }
  {
    name: 'catalog-service'
    containerName: 'catalog-service'
    external: false
    minReplicas: 0
    maxReplicas: 2
    cpu: '0.25'
    memory: '0.5Gi'
  }
  {
    name: 'order-service'
    containerName: 'order-service'
    external: false
    minReplicas: 0
    maxReplicas: 3
    cpu: '0.5'
    memory: '1Gi'
  }
  {
    name: 'subscription-service'
    containerName: 'subscription-service'
    external: false
    minReplicas: 0
    maxReplicas: 2
    cpu: '0.25'
    memory: '0.5Gi'
  }
  {
    name: 'integration-service'
    containerName: 'integration-service'
    external: false
    minReplicas: 0
    maxReplicas: 2
    cpu: '0.5'
    memory: '1Gi'
  }
  {
    name: 'notification-service'
    containerName: 'notification-service'
    external: false
    minReplicas: 0
    maxReplicas: 2
    cpu: '0.25'
    memory: '0.5Gi'
  }
]

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  tags: commonTags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  tags: commonTags
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: toLower(acrName)
  location: location
  tags: commonTags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageName
  location: location
  tags: commonTags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    accessTier: 'Hot'
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  name: 'default'
  parent: storage
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: 7
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: 7
    }
  }
}

resource mediaContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  name: 'media'
  parent: blobService
  properties: {
    publicAccess: 'None'
  }
}

resource documentsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  name: 'documents'
  parent: blobService
  properties: {
    publicAccess: 'None'
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: commonTags
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enabledForTemplateDeployment: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    publicNetworkAccess: 'Enabled'
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: postgresName
  location: location
  tags: commonTags
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    version: '16'
    storage: {
      storageSizeGB: 32
      autoGrow: 'Enabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
    authConfig: {
      activeDirectoryAuth: 'Disabled'
      passwordAuth: 'Enabled'
    }
  }
}

resource postgresAllowAzureServices 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-06-01-preview' = {
  name: 'AllowAzureServices'
  parent: postgres
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource authDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  name: 'craves_auth_db'
  parent: postgres
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource businessDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  name: 'craves_business_db'
  parent: postgres
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource integrationDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  name: 'craves_integration_db'
  parent: postgres
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource managedRedis 'Microsoft.Cache/redisEnterprise@2025-04-01' = {
  name: managedRedisName
  location: location
  tags: commonTags
  sku: {
    name: 'Balanced_B0'
  }
  properties: {
    encryption: {}
    highAvailability: 'Disabled'
    minimumTlsVersion: '1.2'
  }
}

resource managedRedisDatabase 'Microsoft.Cache/redisEnterprise/databases@2025-04-01' = {
  name: 'default'
  parent: managedRedis
  properties: {
    accessKeysAuthentication: 'Enabled'
    clientProtocol: 'Encrypted'
    clusteringPolicy: 'OSSCluster'
    evictionPolicy: 'VolatileLRU'
    modules: []
    port: 10000
  }
}

resource serviceBus 'Microsoft.ServiceBus/namespaces@2022-10-01-preview' = {
  name: serviceBusName
  location: location
  tags: commonTags
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: false
  }
}

resource domainEventsTopic 'Microsoft.ServiceBus/namespaces/topics@2022-10-01-preview' = {
  name: 'craves-domain-events'
  parent: serviceBus
  properties: {
    defaultMessageTimeToLive: 'P14D'
    enablePartitioning: true
    requiresDuplicateDetection: true
    duplicateDetectionHistoryTimeWindow: 'PT10M'
  }
}

resource serviceBusQueues 'Microsoft.ServiceBus/namespaces/queues@2022-10-01-preview' = [for queueName in commandQueues: {
  name: queueName
  parent: serviceBus
  properties: {
    defaultMessageTimeToLive: 'P14D'
    deadLetteringOnMessageExpiration: true
    lockDuration: 'PT1M'
    maxDeliveryCount: 10
    requiresDuplicateDetection: true
    duplicateDetectionHistoryTimeWindow: 'PT10M'
  }
}]

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: acaEnvName
  location: location
  tags: commonTags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource acaApps 'Microsoft.App/containerApps@2023-05-01' = [for app in containerApps: {
  name: take(toLower('ca-${project}-${app.name}-${env}'), 32)
  location: location
  tags: union(commonTags, { service: app.name })
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: app.external
        targetPort: 80
        transport: 'auto'
        allowInsecure: false
      }
    }
    template: {
      containers: [
        {
          name: app.containerName
          image: 'mcr.microsoft.com/k8se/quickstart:latest'
          resources: {
            cpu: json(app.cpu)
            memory: app.memory
          }
          env: [
            {
              name: 'CRAVES_ENVIRONMENT'
              value: environmentName
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: appInsights.properties.ConnectionString
            }
            {
              name: 'REDIS_HOST'
              value: managedRedis.name
            }
          ]
        }
      ]
      scale: {
        minReplicas: app.minReplicas
        maxReplicas: app.maxReplicas
      }
    }
  }
}]

resource apiManagement 'Microsoft.ApiManagement/service@2022-08-01' = {
  name: apimName
  location: location
  tags: commonTags
  sku: {
    name: 'Consumption'
    capacity: 0
  }
  properties: {
    publisherEmail: apimPublisherEmail
    publisherName: apimPublisherName
  }
}

resource frontDoorProfile 'Microsoft.Cdn/profiles@2023-05-01' = {
  name: frontDoorProfileName
  location: 'global'
  tags: commonTags
  sku: {
    name: 'Standard_AzureFrontDoor'
  }
}

resource frontDoorEndpoint 'Microsoft.Cdn/profiles/afdEndpoints@2023-05-01' = {
  name: frontDoorEndpointName
  parent: frontDoorProfile
  location: 'global'
  properties: {
    enabledState: 'Enabled'
  }
}

resource frontDoorOriginGroup 'Microsoft.Cdn/profiles/originGroups@2023-05-01' = {
  name: 'craves-web-origin-group'
  parent: frontDoorProfile
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
      additionalLatencyInMilliseconds: 50
    }
    healthProbeSettings: {
      probePath: '/'
      probeRequestType: 'GET'
      probeProtocol: 'Https'
      probeIntervalInSeconds: 120
    }
    sessionAffinityState: 'Disabled'
  }
}

resource frontDoorOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2023-05-01' = {
  name: 'craves-web-origin'
  parent: frontDoorOriginGroup
  properties: {
    hostName: acaApps[0].properties.configuration.ingress.fqdn
    originHostHeader: acaApps[0].properties.configuration.ingress.fqdn
    priority: 1
    weight: 1000
    enabledState: 'Enabled'
    httpPort: 80
    httpsPort: 443
    enforceCertificateNameCheck: true
  }
}

resource frontDoorAppRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2023-05-01' = {
  name: 'craves-web-route'
  parent: frontDoorEndpoint
  dependsOn: [
    frontDoorOrigin
  ]
  properties: {
    originGroup: {
      id: frontDoorOriginGroup.id
    }
    supportedProtocols: [
      'Http'
      'Https'
    ]
    patternsToMatch: [
      '/*'
    ]
    forwardingProtocol: 'HttpsOnly'
    linkToDefaultDomain: 'Enabled'
    httpsRedirect: 'Enabled'
    enabledState: 'Enabled'
  }
}

resource frontDoorStaticRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2023-05-01' = {
  name: 'craves-static-route'
  parent: frontDoorEndpoint
  dependsOn: [
    frontDoorOrigin
  ]
  properties: {
    originGroup: {
      id: frontDoorOriginGroup.id
    }
    supportedProtocols: [
      'Http'
      'Https'
    ]
    patternsToMatch: [
      '/_next/static/*'
    ]
    forwardingProtocol: 'HttpsOnly'
    linkToDefaultDomain: 'Enabled'
    httpsRedirect: 'Enabled'
    enabledState: 'Enabled'
    cacheConfiguration: {
      compressionSettings: {
        isCompressionEnabled: true
        contentTypesToCompress: [
          'text/css'
          'text/javascript'
          'application/javascript'
          'application/json'
          'image/svg+xml'
          'font/woff2'
        ]
      }
      queryStringCachingBehavior: 'IgnoreQueryString'
    }
  }
}

output acrName string = acr.name
output acrLoginServer string = acr.properties.loginServer
output keyVaultName string = keyVault.name
output postgresServerName string = postgres.name
output managedRedisName string = managedRedis.name
output managedRedisDatabaseName string = managedRedisDatabase.name
output storageAccountName string = storage.name
output serviceBusNamespaceName string = serviceBus.name
output containerAppsEnvironmentName string = containerAppsEnvironment.name
output apiManagementName string = apiManagement.name
output webContainerAppFqdn string = acaApps[0].properties.configuration.ingress.fqdn
output applicationInsightsName string = appInsights.name
output logAnalyticsName string = logAnalytics.name
output frontDoorProfileName string = frontDoorProfile.name
output frontDoorEndpointName string = frontDoorEndpoint.name
output frontDoorHostName string = frontDoorEndpoint.properties.hostName
