// The fleet-timers queue (docs/riders/DISPATCH.md "Timers"; integration-service FleetTimers, CRAVES_FLEET_TIMERS).
// One queue on the Service Bus namespace production already has. Nothing in the repo or a pipeline deploys this file:
// a signed-in person runs it once, by hand, in production subscription 34eefd95 (README.md beside this file).
targetScope = 'resourceGroup'

@description('The existing production Service Bus namespace, the one that holds the delivery-command queue. No default: look it up, do not guess.')
param serviceBusNamespaceName string

@description('The queue. integration-service reads the name from SERVICE_BUS_FLEET_TIMERS_QUEUE (default fleet-timers).')
param queueName string = 'fleet-timers'

resource serviceBus 'Microsoft.ServiceBus/namespaces@2022-10-01-preview' existing = {
  name: serviceBusNamespaceName
}

resource fleetTimers 'Microsoft.ServiceBus/namespaces/queues@2022-10-01-preview' = {
  name: queueName
  parent: serviceBus
  properties: {
    // Off, unlike the command queues: a timer for the same trip is sent again and again and must never be dropped as a
    // duplicate. A repeated, late or early timer changes nothing it should not (FleetTimers.onTimer).
    requiresDuplicateDetection: false
    // A timer is worth nothing minutes after its time: the stage's sweeper has long since looked. Expired ones are
    // dropped, not dead-lettered.
    defaultMessageTimeToLive: 'PT10M'
    deadLetteringOnMessageExpiration: false
    lockDuration: 'PT1M'
    maxDeliveryCount: 10
  }
}

output queueId string = fleetTimers.id
