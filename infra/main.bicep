@description('Deployment location')
param location string = resourceGroup().location

@description('Environment name: dev, stage, prod')
param environmentName string = 'dev'

@description('Project prefix')
param projectName string = 'craves'

@secure()
param postgresAdminPassword string

var suffix = '${projectName}-${environmentName}'

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'law-${suffix}'
  location: location
  properties: { sku: { name: 'PerGB2018' }, retentionInDays: 30 }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${suffix}'
  location: location
  kind: 'web'
  properties: { Application_Type: 'web', WorkspaceResourceId: logAnalytics.id }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: toLower(replace('st${projectName}${environmentName}${uniqueString(resourceGroup().id)}','-',''))
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: { allowBlobPublicAccess: false, minimumTlsVersion: 'TLS1_2' }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-${suffix}-${uniqueString(resourceGroup().id)}'
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: 'pg-${suffix}-${uniqueString(resourceGroup().id)}'
  location: location
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    administratorLogin: 'cravesadmin'
    administratorLoginPassword: postgresAdminPassword
    version: '16'
    storage: { storageSizeGB: 32 }
    backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' }
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  name: 'craves_app_db'
  parent: postgres
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

output keyVaultName string = keyVault.name
output postgresServerName string = postgres.name
output storageAccountName string = storage.name
output appInsightsName string = appInsights.name
