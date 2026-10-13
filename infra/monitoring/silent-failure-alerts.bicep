// CH-04: pages for the audit's silent-failure inventory. Services log one `CRAVES_ALERT alert=<CODE> ...` line per
// finding; each rule below counts those lines in the Container Apps console logs. Off by default: nothing is
// created (or billed) until deployAlerts=true. See README.md in this folder.
@description('Create the action group and alert rules. False deploys nothing.')
param deployAlerts bool = false

param location string = resourceGroup().location

@description('Resource ID of the Log Analytics workspace that receives Container Apps console logs.')
param logAnalyticsWorkspaceId string

@description('Resource ID of the Service Bus namespace (for the dead-letter alert). Empty skips that alert.')
param serviceBusNamespaceId string = ''

@description('Who gets paged.')
param alertEmail string

param namePrefix string = 'craves-prodlow'

// code -> [audit #, severity (0 critical .. 4 verbose), description]
var logAlerts = [
  { code: 'STUCK_ORDER', severity: 1, text: '#13 Non-terminal order with no transition for 90 minutes (order-service sweeper)' }
  { code: 'CHEF_ACCEPTANCE_OVERDUE', severity: 1, text: '#4 Order still awaiting the chef more than 2 minutes past its deadline' }
  { code: 'OUTBOX_BLOCKED_EVENT_TYPE', severity: 2, text: '#1 Order outbox rows of an event type that is not enabled for publication' }
  { code: 'OUTBOX_DEAD_LETTERED', severity: 1, text: '#2 Outbox row dead-lettered (attempts exhausted or lease expired on the final attempt)' }
  { code: 'REFUND_STALLED', severity: 1, text: '#3 Refund REQUESTED for more than 10 minutes' }
  { code: 'DELIVERY_COMMAND_STALLED', severity: 1, text: '#5 Delivery command WAITING_FOR_PROVIDER for more than 10 minutes' }
  { code: 'PAYOUT_STALLED', severity: 1, text: '#7 Chef payout RESERVED for more than 10 minutes' }
  { code: 'LEDGER_OUTBOX_BACKLOG', severity: 3, text: '#8 ledger_outbox rows unpublished for over an hour (no publisher exists yet)' }
  { code: 'SCHEDULER_LAG', severity: 1, text: '#10 A worker job stopped ticking for more than 3 intervals' }
  { code: 'INTERNAL_CALL_REJECTED', severity: 2, text: 'CH-03 An enforced internal route rejected a caller' }
  { code: 'INTERNAL_CALL_SIGNATURE_INVALID', severity: 3, text: 'CH-03 Monitor mode: an internal call carried an invalid signature' }
  { code: 'INTERNAL_CALL_CONFIG_INVALID', severity: 2, text: 'CH-03 Internal call keys are misconfigured; calls fall back to unsigned' }
  { code: 'ADMIN_SECOND_FACTOR_MISSING', severity: 3, text: 'CH-09 Administrator signed in without an authenticator code (monitor) or was refused (enforce)' }
]

resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = if (deployAlerts) {
  name: '${namePrefix}-oncall'
  location: 'global'
  properties: {
    groupShortName: 'cravesops'
    enabled: true
    emailReceivers: [
      {
        name: 'oncall'
        emailAddress: alertEmail
        useCommonAlertSchema: true
      }
    ]
  }
}

resource logRules 'Microsoft.Insights/scheduledQueryRules@2022-06-15' = [for alert in logAlerts: if (deployAlerts) {
  name: '${namePrefix}-${toLower(replace(alert.code, '_', '-'))}'
  location: location
  properties: {
    displayName: 'Craves ${alert.code}'
    description: alert.text
    severity: alert.severity
    enabled: true
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    scopes: [
      logAnalyticsWorkspaceId
    ]
    criteria: {
      allOf: [
        {
          query: 'ContainerAppConsoleLogs_CL | where Log_s contains "CRAVES_ALERT alert=${alert.code} " | project TimeGenerated, ContainerAppName_s, Log_s'
          timeAggregation: 'Count'
          dimensions: [
            {
              name: 'ContainerAppName_s'
              operator: 'Include'
              values: [
                '*'
              ]
            }
          ]
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    autoMitigate: true
    actions: {
      actionGroups: [
        actionGroup.id
      ]
    }
  }
}]

// #6 Dead-letter queues filling (they can hold personal data).
resource deadLetterAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = if (deployAlerts && !empty(serviceBusNamespaceId)) {
  name: '${namePrefix}-servicebus-dead-letters'
  location: 'global'
  properties: {
    description: '#6 Active messages in a Service Bus dead-letter queue'
    severity: 1
    enabled: true
    scopes: [
      serviceBusNamespaceId
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'deadLettered'
          criterionType: 'StaticThresholdCriterion'
          metricName: 'DeadletteredMessages'
          metricNamespace: 'Microsoft.ServiceBus/namespaces'
          timeAggregation: 'Maximum'
          operator: 'GreaterThan'
          threshold: 0
          dimensions: [
            {
              name: 'EntityName'
              operator: 'Include'
              values: [
                '*'
              ]
            }
          ]
        }
      ]
    }
    autoMitigate: true
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
}

output deployed bool = deployAlerts
