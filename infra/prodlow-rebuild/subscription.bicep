targetScope = 'subscription'

@description('Azure region for the low-cost Craves rebuild.')
param location string = 'centralindia'

@description('Environment name used in resource names and tags.')
param environmentName string = 'prodlow'

@description('Project prefix used in resource names and tags.')
param projectName string = 'craves'

@description('Resource group to create or reuse for this rebuild.')
param resourceGroupName string = 'rg-craves-prodlow-centralindia'

@description('Globally unique Azure Container Registry name. Lowercase letters and numbers only.')
param acrName string

@description('PostgreSQL administrator login.')
param postgresAdminLogin string = 'cravesadmin'

@secure()
@description('PostgreSQL administrator password. Store this in Azure DevOps secret variable POSTGRES_ADMIN_PASSWORD.')
param postgresAdminPassword string

@description('API Management publisher email.')
param apimPublisherEmail string = 'contact@craves.in'

@description('API Management publisher name.')
param apimPublisherName string = 'Craves'

@description('Monthly budget cap in INR for the starter environment.')
param monthlyBudgetAmount int = 12500

@description('Budget notification recipients. Use owner emails only; do not put secrets here.')
param budgetContactEmails array = [
  'rmorampudi09@gmail.com'
]

@description('Budget period start. Keep as the first day of the current month in UTC.')
param budgetStartDate string = '2026-09-01T00:00:00Z'

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: {
    project: projectName
    environment: environmentName
    managedBy: 'azure-devops-bicep'
    budgetCapInr: string(monthlyBudgetAmount)
  }
}

resource monthlyBudget 'Microsoft.Consumption/budgets@2023-11-01' = {
  name: '${projectName}-${environmentName}-monthly-${monthlyBudgetAmount}-inr'
  properties: {
    category: 'Cost'
    amount: monthlyBudgetAmount
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: budgetStartDate
      endDate: '2036-12-31T00:00:00Z'
    }
    notifications: {
      Actual_50_Percent: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 50
        thresholdType: 'Actual'
        contactEmails: budgetContactEmails
        contactRoles: [
          'Owner'
          'Contributor'
        ]
      }
      Actual_80_Percent: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 80
        thresholdType: 'Actual'
        contactEmails: budgetContactEmails
        contactRoles: [
          'Owner'
          'Contributor'
        ]
      }
      Forecasted_100_Percent: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 100
        thresholdType: 'Forecasted'
        contactEmails: budgetContactEmails
        contactRoles: [
          'Owner'
          'Contributor'
        ]
      }
    }
  }
}

module foundation 'main.bicep' = {
  name: '${projectName}-${environmentName}-foundation'
  scope: rg
  params: {
    location: location
    environmentName: environmentName
    projectName: projectName
    acrName: acrName
    postgresAdminLogin: postgresAdminLogin
    postgresAdminPassword: postgresAdminPassword
    apimPublisherEmail: apimPublisherEmail
    apimPublisherName: apimPublisherName
  }
}

output resourceGroupName string = rg.name
output budgetName string = monthlyBudget.name
output frontDoorHostName string = foundation.outputs.frontDoorHostName
output webContainerAppFqdn string = foundation.outputs.webContainerAppFqdn
output apiManagementName string = foundation.outputs.apiManagementName
output postgresServerName string = foundation.outputs.postgresServerName
