# Silent-failure alerts (CH-04)

Services report problems as one log line each: `CRAVES_ALERT alert=<CODE> key=value ...`.
`silent-failure-alerts.bicep` turns those lines into Azure Monitor pages, with one scheduled query rule per code
over `ContainerAppConsoleLogs_CL`, plus a metric alert on Service Bus dead-letter queues.

The module is off by default. With `deployAlerts=false` it creates nothing and costs nothing.

```bash
az deployment group create -g rg-craves-prodlow-centralindia \
  -f infra/monitoring/silent-failure-alerts.bicep \
  -p deployAlerts=true \
     logAnalyticsWorkspaceId=<workspace resource id> \
     serviceBusNamespaceId=<service bus namespace resource id> \
     alertEmail=oncall@craves.in
```

## Coverage of the audit's silent-failure inventory

| # | Alert code | Emitted by | Status |
|---|---|---|---|
| 1 | `OUTBOX_BLOCKED_EVENT_TYPE` | order domain-event outbox worker | Ready |
| 2 | `OUTBOX_DEAD_LETTERED` | every outbox worker (order, integration, user-chef, notification) | Ready |
| 3 | `REFUND_STALLED` | integration `IntegrationAlertMonitor` | Ready |
| 4 | `CHEF_ACCEPTANCE_OVERDUE` | order `OrderAlertMonitor` | Ready |
| 5 | `DELIVERY_COMMAND_STALLED` | integration `IntegrationAlertMonitor` | Ready |
| 6 | Service Bus `DeadletteredMessages` | Azure metric | Ready (needs `serviceBusNamespaceId`) |
| 7 | `PAYOUT_STALLED` | integration `IntegrationAlertMonitor` | Ready |
| 8 | `LEDGER_OUTBOX_BACKLOG` | integration `IntegrationAlertMonitor` | Ready. It fires until a ledger publisher exists, so it is severity 3 |
| 9 | Payment reconciler mismatches | — | Blocked: no payment reconciler exists yet (F1-09) |
| 10 | `SCHEDULER_LAG` | `SchedulerLagWatchdog` in every service with worker pools | Ready |
| 11 | Ledger drift | — | Blocked: no daily ledger reconciliation job exists yet |
| 12 | Rider silent on task | — | Blocked: no rider tracking ingest exists yet (F3-01) |
| 13 | `STUCK_ORDER` | order `OrderAlertMonitor` (the catch-all sweeper) | Ready |

The CH-03 internal-call codes (`INTERNAL_CALL_*`) use the same rules.

## Tuning

- `CRAVES_MONITORING_ENABLED=false` turns off the order and integration monitors.
- `CRAVES_MONITORING_STUCK_ORDER_MINUTES` sets the stuck-order threshold (default 90).
- `CRAVES_MONITORING_LOOKBACK_DAYS` sets how far back rows count (default 7), so years-old rows do not page forever.

The sweeper only reports. It never cancels or refunds. `PAYMENT_PENDING` is excluded, because an abandoned checkout
is normal. Scheduled and meal-plan orders count from their service time.
