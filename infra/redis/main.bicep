targetScope = 'resourceGroup'

@description('Deployment location. For prod-low this should remain Central India unless the platform topology changes.')
param location string = resourceGroup().location

@description('Craves environment name.')
param environmentName string = 'prodlow'

@description('Craves project prefix.')
param projectName string = 'craves'

@description('Safety gate. No Azure Managed Redis resource is created unless this is explicitly set to true.')
param deployRedis bool = false

@description('Azure Managed Redis SKU. Balanced_B0 is the planned initial prod-low SKU; reassess before high-scale production.')
param redisSkuName string = 'Balanced_B0'

@allowed([
  'Enabled'
  'Disabled'
])
@description('Public network access. Defaults to Disabled. Current prod-low Container Apps are not VNet-integrated, so connectivity design must be decided before deployment.')
param publicNetworkAccess string = 'Disabled'

@allowed([
  'Enabled'
  'Disabled'
])
@description('Redis high availability setting.')
param highAvailability string = 'Enabled'

var env = toLower(environmentName)
var project = toLower(projectName)
var shortHash = take(uniqueString(resourceGroup().id), 6)
var managedRedisName = take(toLower('amr-${project}-${env}-${shortHash}'), 60)

var commonTags = {
  project: projectName
  environment: environmentName
  workload: 'craves-auth-security-cache'
  managedBy: 'bicep'
  component: 'azure-managed-redis'
}

// Azure Managed Redis uses the Microsoft.Cache/redisEnterprise resource provider.
// This module is deliberately isolated from infra/main.bicep so running the
// original foundation deployment cannot accidentally create a billable Redis resource.
resource managedRedis 'Microsoft.Cache/redisEnterprise@2025-07-01' = if (deployRedis) {
  name: managedRedisName
  location: location
  tags: commonTags
  sku: {
    name: redisSkuName
  }
  properties: {
    encryption: {}
    highAvailability: highAvailability
    minimumTlsVersion: '1.2'
    publicNetworkAccess: publicNetworkAccess
  }
}

// The child database is required for Azure Managed Redis to function.
// NoEviction is intentional for Craves security projections: revocation keys
// must not be silently evicted under memory pressure. Publisher failures are
// handled by the existing durable outbox/retry path instead.
resource defaultDatabase 'Microsoft.Cache/redisEnterprise/databases@2025-07-01' = if (deployRedis) {
  name: 'default'
  parent: managedRedis
  properties: {
    clientProtocol: 'Encrypted'
    clusteringPolicy: 'OSSCluster'
    evictionPolicy: 'NoEviction'
    modules: []
    port: 10000
  }
}

output deploymentEnabled bool = deployRedis
output redisClusterName string = managedRedisName
output redisPort int = 10000
output redisPublicNetworkAccess string = publicNetworkAccess
output redisSku string = redisSkuName
output redisResourceId string = deployRedis ? managedRedis.id : ''
output redisDatabaseResourceId string = deployRedis ? defaultDatabase.id : ''
