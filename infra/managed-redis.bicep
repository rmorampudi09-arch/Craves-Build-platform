@description('Azure region for Azure Managed Redis.')
param location string = resourceGroup().location

@description('Azure Managed Redis resource name.')
param redisName string = 'amr-craves-prodlow-l3ing6'

@description('Smallest approved Azure Managed Redis SKU for the current low-capacity environment.')
param skuName string = 'Balanced_B0'

resource managedRedis 'Microsoft.Cache/redisEnterprise@2025-04-01' = {
  name: redisName
  location: location
  tags: {
    project: 'craves'
    environment: 'prodlow'
    workload: 'authentication-cache'
    managedBy: 'azure-devops-bicep'
  }
  sku: {
    name: skuName
  }
  properties: {
    encryption: {}
    highAvailability: 'Enabled'
    minimumTlsVersion: '1.2'
  }
}

resource defaultDatabase 'Microsoft.Cache/redisEnterprise/databases@2025-04-01' = {
  name: 'default'
  parent: managedRedis
  properties: {
    accessKeysAuthentication: 'Enabled'
    clientProtocol: 'Encrypted'
    clusteringPolicy: 'NoCluster'
    evictionPolicy: 'VolatileLRU'
    modules: []
    port: 10000
  }
}

output redisName string = managedRedis.name
output hostName string = managedRedis.properties.hostName
output databaseName string = defaultDatabase.name
output port int = 10000
output tlsEnabled bool = true
