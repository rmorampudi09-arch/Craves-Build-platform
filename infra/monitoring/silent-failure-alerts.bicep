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

@description('Phone numbers to page: national numbers without the country code (India: 10 digits). Empty pages nobody and creates no paging group.')
param pagePhoneNumbers array = []

@description('Country calling code of pagePhoneNumbers, without the plus sign.')
param pagePhoneCountryCode string = '91'

@description('Also ring each number with a voice call. False sends an SMS only.')
param pageVoiceCall bool = false

// code -> [audit #, severity (0 critical .. 4 verbose), description]
var logAlerts = [
  { code: 'STUCK_ORDER', severity: 1, text: '#13 Non-terminal order with no transition for 90 minutes (order-service sweeper)' }
  { code: 'CHEF_ACCEPTANCE_OVERDUE', severity: 1, text: '#4 Order still awaiting the chef more than 2 minutes past its deadline' }
  { code: 'OUTBOX_BLOCKED_EVENT_TYPE', severity: 2, text: '#1 Order outbox rows of an event type that is not enabled for publication' }
  { code: 'OUTBOX_DEAD_LETTERED', severity: 1, text: '#2 Outbox row dead-lettered (attempts exhausted or lease expired on the final attempt)' }
  { code: 'REFUND_STALLED', severity: 1, text: '#3 Refund REQUESTED for more than 10 minutes' }
  { code: 'DELIVERY_COMMAND_STALLED', severity: 1, text: '#5 Delivery command WAITING_FOR_PROVIDER for more than 10 minutes' }
  { code: 'DELIVERY_COMMAND_SWEPT', severity: 2, text: 'Command sweeper: a due delivery command had no Service Bus message and was sent one. Many at once, or sent=false: check the delivery-command queue and its consumer' }
  { code: 'DELIVERY_COURIER_WAIT_CAP', severity: 1, text: 'Command sweeper: an order had no courier past its promised ready time plus the courier wait cap (capMinutes= on the line) and its delivery command has stopped. Book a courier by hand or cancel the order' }
  { code: 'DELIVERY_HANDOFF_NO_COURIER', severity: 1, text: 'Borzo was cancelled and Pidge refused or cancelled the fallback booking: the order has no courier until ops books one or cancels it' }
  { code: 'DELIVERY_HANDOFF_STALLED', severity: 1, text: 'Borzo was cancelled and the Pidge fallback booking is still unresolved about 10 minutes later (it keeps retrying)' }
  { code: 'COURIER_ACCOUNT_REFUSED', severity: 1, text: 'Booking journal: a courier refused a booking for its key, contract or balance; orders go to the next courier until it is fixed' }
  { code: 'COURIER_ORPHAN_BOOKING_FOUND', severity: 1, text: 'Booking journal: a courier holds a booking the order does not use. Craves cancels or adopts it and logs COURIER_STRAY_BOOKING_UNSETTLED if it cannot. orderHasJob=false with commandStatus=DEAD_LETTER: it is the order\'s only courier, keep it' }
  { code: 'COURIER_REJECTED_BOOKING_EXISTS', severity: 1, text: 'Booking journal: a booking recorded as refused or not found exists at the courier. Handle as an orphan booking and set CRAVES_DELIVERY_BORZO_REFUSALS=unknown' }
  { code: 'COURIER_STRAY_BOOKING_UNSETTLED', severity: 1, text: 'Booking journal: a courier holds a booking the order does not use, and Craves could neither cancel it nor make it the order\'s delivery (reason= says why). Settle it with the courier' }
  { code: 'COURIER_CANCEL_UNCONFIRMED', severity: 1, text: 'An order was cancelled (or ops cancelled its delivery) and the courier still shows the booking live, or has picked up (reason= says why). Cancel it with the courier' }
  { code: 'COURIER_ENDED_DELIVERY', severity: 1, text: 'Status rank guard (enforce): a courier cancelled or failed a booking Craves did not cancel, for an order that is not cancelled. An ops delivery exception case is open; book another courier or cancel the order' }
  { code: 'COURIER_WEBHOOK_VERIFY_DISAGREED', severity: 2, text: 'Callback status read-back (enforce): a Pidge callback carried a final status that Pidge\'s API did not hold; the status from the API was used. Compare the order in Pidge\'s dashboard with the job' }
  { code: 'COURIER_WEBHOOK_VERIFY_FAILED', severity: 2, text: 'Callback status read-back (enforce): a Pidge callback with a final status was dead-lettered because Pidge\'s API could not be read. Check Pidge\'s API and credentials; the tracking poll sets the job\'s status' }
  { code: 'COURIER_UNRESOLVED_BOOKING', severity: 1, text: 'Booking journal: a courier booking has been unresolved for over 10 minutes (answer lost and not found either way)' }
  { code: 'FLEET_DOUBLE_HOLD', severity: 1, text: 'A Craves rider holds an order that a courier booking (source=COURIER_JOB or STRAY_BOOKING) or a second rider (SECOND_RIDER) holds too. Call the rider and cancel the booking holderRef= names with holder=, or cancel the trip' }
  { code: 'FLEET_SWEEPER_CAUGHT', severity: 2, text: 'Fleet stage sweeper: an order riders were deciding on had no dispatch look when one was due (mode=on: its delivery command was sent a message; mode=shadow: logged only). Many at once: check the delivery-command queue and its consumer. sent=false with commandStatus=COMPLETED, DEAD_LETTER or NONE: the order has an open rider stage no command will run; assign a rider or cancel it from the ops queue' }
  { code: 'COURIER_API_USAGE_HIGH', severity: 2, text: 'Courier API usage: a courier\'s calls today reached the alert share of its daily cap (provider=, calls=, cap=). Past the cap the courier refuses quotes and bookings' }
  { code: 'COURIER_API_RATE_LIMITED', severity: 2, text: 'Courier API usage: a courier answered HTTP 429 (provider=, count=); it is refusing calls' }
  { code: 'COURIER_REJECTED_RATE', severity: 2, text: 'Booking journal: a courier refused over 20% of at least 3 bookings in 15 minutes' }
  { code: 'NO_CAPABLE_COURIER', severity: 1, text: 'Courier capabilities: no courier left in the chain can carry an order (a hot-food box after Borzo\'s window), so its command was ended (commandId=, chefSubOrderId=). Book a courier by hand or cancel the order' }
  { code: 'COURIER_BREAKER_OPEN', severity: 2, text: 'Shared courier breaker: a courier failed 3 bookings or 5 quotes in a row over all replicas (provider=, failed=), so new orders skip it until a probe succeeds' }
  { code: 'PROVIDER_CIRCUIT_OPEN', severity: 2, text: 'Handbook 104: a delivery provider failed 5 quotes in a row, so its quotes are skipped for 30 seconds (integration ProviderGuard)' }
  { code: 'PAYOUT_STALLED', severity: 1, text: '#7 Chef payout RESERVED for more than 10 minutes' }
  { code: 'LEDGER_OUTBOX_BACKLOG', severity: 3, text: '#8 ledger_outbox rows unpublished for over an hour (no publisher exists yet)' }
  { code: 'SCHEDULER_LAG', severity: 1, text: '#10 A worker job stopped ticking for more than 3 intervals' }
  { code: 'INTERNAL_CALL_REJECTED', severity: 2, text: 'CH-03 An enforced internal route rejected a caller' }
  { code: 'INTERNAL_CALL_SIGNATURE_INVALID', severity: 3, text: 'CH-03 Monitor mode: an internal call carried an invalid signature' }
  { code: 'INTERNAL_CALL_CONFIG_INVALID', severity: 2, text: 'CH-03 Internal call keys are misconfigured; calls fall back to unsigned' }
]

// The alerts that page a phone as well as the email (fix program 1-14). The Service Bus dead-letter alert below pages too.
var pagedCodes = [
  'DELIVERY_COMMAND_STALLED'
  'OUTBOX_DEAD_LETTERED'
  'COURIER_UNRESOLVED_BOOKING'
  'COURIER_ENDED_DELIVERY'
  'COURIER_REJECTED_RATE'
  'NO_CAPABLE_COURIER'
  'FLEET_DOUBLE_HOLD'
]

var paging = deployAlerts && !empty(pagePhoneNumbers)

var pagePhones = [for (number, i) in pagePhoneNumbers: {
  name: 'page-${i + 1}'
  countryCode: pagePhoneCountryCode
  phoneNumber: number
}]

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

resource pageGroup 'Microsoft.Insights/actionGroups@2023-01-01' = if (paging) {
  name: '${namePrefix}-page'
  location: 'global'
  properties: {
    groupShortName: 'cravespage'
    enabled: true
    smsReceivers: pagePhones
    voiceReceivers: pageVoiceCall ? pagePhones : []
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
      actionGroups: paging && contains(pagedCodes, alert.code) ? [
        actionGroup.id
        pageGroup.id
      ] : [
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
    actions: paging ? [
      {
        actionGroupId: actionGroup.id
      }
      {
        actionGroupId: pageGroup.id
      }
    ] : [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
}

output deployed bool = deployAlerts
