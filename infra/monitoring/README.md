# Silent-failure alerts (CH-04)

Services report problems as one log line each: `CRAVES_ALERT alert=<CODE> key=value ...`.
`silent-failure-alerts.bicep` turns those lines into Azure Monitor pages, with one scheduled query rule per code
over `ContainerAppConsoleLogs_CL`, plus a metric alert on Service Bus dead-letter queues.

The module is off by default. With `deployAlerts=false` it creates nothing and costs nothing.

```bash
# Production is subscription 34eefd95; never deploy to the idle rg-craves-prodlow-centralindia (AGENTS.md).
az deployment group create -g <monitoring resource group in subscription 34eefd95> \
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

The courier booking journal (integration, `CRAVES_DELIVERY_BOOKING_JOURNAL_ENABLED`) adds `COURIER_ACCOUNT_REFUSED`
(`BorzoApiClient`), `COURIER_ORPHAN_BOOKING_FOUND` and `COURIER_REJECTED_BOOKING_EXISTS`
(`DeliveryCreateReconciliationWorker`, `DeliveryCommandCompletionService`, `DeliveryCommandWorker`, `CourierStrayBookings`),
`COURIER_STRAY_BOOKING_UNSETTLED` (`CourierStrayBookings`), and `COURIER_UNRESOLVED_BOOKING` and
`COURIER_REJECTED_RATE` (`IntegrationAlertMonitor`). What each means and what to do is in
`services/integration-service/docs/delivery-orchestration/README.md`, "Booking journal".

Courier cancel for cancelled orders (integration `CourierCancel`, `CRAVES_DELIVERY_COURIER_CANCEL_ENABLED`) adds
`COURIER_CANCEL_UNCONFIRMED`; see the same README, "Courier cancel for cancelled orders".

The command sweeper (integration `DeliveryCommandSweeper`, `CRAVES_DELIVERY_COMMAND_SWEEPER_ENABLED`) adds
`DELIVERY_COMMAND_SWEPT` and `DELIVERY_COURIER_WAIT_CAP`; see the same README, "Command sweeper and courier wait cap".

The fleet stage sweeper (integration `FleetStageSweeper`, `CRAVES_FLEET_STAGE_SWEEPER`) adds `FLEET_SWEEPER_CAUGHT` (email, not
paged); see `docs/riders/BACKEND.md`, "Dispatch chain" step 5a.

The status rank guard (integration `DeliveryStatusUpdateService`, `CRAVES_DELIVERY_STATUS_RANK_GUARD=enforce`) adds
`COURIER_ENDED_DELIVERY`; see the same README, "Status rank guard".

The courier API call count (integration `IntegrationAlertMonitor`, `CRAVES_DELIVERY_PROVIDER_API_USAGE_ENABLED`) adds
`COURIER_API_USAGE_HIGH` (once per courier per day) and `COURIER_API_RATE_LIMITED`; see the same README, "Courier API
usage".

Courier capabilities (integration `DeliveryCommandWorker`, `CRAVES_DELIVERY_COURIER_CAPABILITIES_ENABLED`) add
`NO_CAPABLE_COURIER`, logged once when a command is ended because no courier can carry the order; it pages. The same
flag logs `DELIVERY_COURIER_WAIT_CAP ... was=RETAINED_BORZO` for a Borzo search kept past the wait cap. See the same
README, "Courier capabilities".

The shared courier breaker (integration `CourierBreaker`, `CRAVES_COURIER_BREAKER_ENABLED`) adds `COURIER_BREAKER_OPEN`,
logged once when a courier's breaker opens for every replica; see the same README, "Shared courier breaker". It emails
and does not page.

The double-hold check (integration `IntegrationAlertMonitor`, `CRAVES_FLEET_DOUBLE_HOLD_ALERT_ENABLED`) adds
`FLEET_DOUBLE_HOLD`: an order a Craves rider holds that a courier booking or a second rider holds too; see
`docs/riders/BACKEND.md`, the flags table.

The Borzo-to-Pidge handoff (integration `BorzoPidgeHandoffWorker`) adds `DELIVERY_HANDOFF_NO_COURIER` (Borzo cancelled and
Pidge refused or cancelled the fallback, so the order needs a person) and `DELIVERY_HANDOFF_STALLED` (the Pidge fallback
is still unresolved about 10 minutes later; it keeps retrying). Both are logged once per order.

The delivery-quote circuit breaker (integration `ProviderGuard`, handbook 104, off unless
`CRAVES_PROVIDER_RESILIENCE_ENABLED=true`) adds `PROVIDER_CIRCUIT_OPEN`: one provider gave no answer, timed out, answered
5xx or 429, or quoted slower than the deadline 5 times in a row, so its quotes are skipped for 30 seconds, then one probe
is let through. It is logged once when the circuit opens; a failed probe keeps it open without another alert line.

## Phone paging (fix program 1-14)

Every rule emails `alertEmail`. With `pagePhoneNumbers` set, a second action group, `<namePrefix>-page`, also sends an
SMS to each number (and a voice call with `pageVoiceCall=true`) for the alerts below. With `pagePhoneNumbers` empty (the
default) the paging group is not created and every rule keeps the email group only, exactly as before. Merging a change
to this folder deploys nothing: no pipeline or workflow reads it, and the rules exist only after the command below.

| The fix program asks for a page on | Rule that pages | Logged by |
|---|---|---|
| Double assignment | `FLEET_DOUBLE_HOLD` | `IntegrationAlertMonitor` (with `CRAVES_FLEET_DOUBLE_HOLD_ALERT_ENABLED`) |
| The NO_SUPPLY rate | None yet: nothing logs a `CRAVES_ALERT` for it. `FleetDispatcher` logs `FLEET_STAGE_CLOSED … outcome=NO_SUPPLY` per order, and no rate or threshold is defined | — |
| Stuck commands | `DELIVERY_COMMAND_STALLED` | `IntegrationAlertMonitor`, `DeliveryCreateReconciliationWorker` |
| Dead letters | `OUTBOX_DEAD_LETTERED` and the Service Bus `DeadletteredMessages` metric alert | every outbox worker; Azure metric |
| ORPHAN_SUSPECT over 10 min | `COURIER_UNRESOLVED_BOOKING` | `IntegrationAlertMonitor`, `DeliveryCreateReconciliationWorker` |
| TERMINAL_CONFLICT | None yet: no delivery code logs it (the status rank guard records `STALE_RANK` only) | — |
| Courier-side cancels | `COURIER_ENDED_DELIVERY` | `DeliveryStatusUpdateService` |
| A courier's REJECTED rate over 20% in 15 min | `COURIER_REJECTED_RATE` | `IntegrationAlertMonitor` |
| No courier can carry an order (fix program 2-1) | `NO_CAPABLE_COURIER` | `DeliveryCommandWorker` (with `CRAVES_DELIVERY_COURIER_CAPABILITIES_ENABLED`) |

To page on another code, add it to `pagedCodes` in the template. Severities are unchanged.

**How often a phone rings.** Rules are evaluated every 5 minutes over the last 15 (`evaluationFrequency` `PT5M`,
`windowSize` `PT15M`) with `autoMitigate: true`, so a rule pages once per container app when it fires, stays quiet while the problem
lasts, and sends one more message when it resolves. The monitor codes are logged again every 5 minutes while their
problem lasts, so they stay fired until it is fixed. A code logged once per event (`COURIER_ENDED_DELIVERY`,
`OUTBOX_DEAD_LETTERED`) resolves after its line leaves the window, and a second event from the same app before then
does not page again: read the email or the logs for the count. `muteActionsDuration` is not set, since it applies to
rules that do not auto-resolve. Azure also limits how often one number is messaged or called
([Azure Monitor service limits](https://learn.microsoft.com/azure/azure-monitor/service-limits)).

**Owner decisions before switching it on.** Nothing here is deployed until the owner runs the command.

- Cost: Azure bills alert rules, and each SMS and voice call, per the
  [Azure Monitor price list](https://azure.microsoft.com/pricing/details/monitor/) for the country code. Check the
  India rates first.
- India: Azure lists country code 91 for both SMS and voice; voice calls to India come from a USA number. Azure sends
  the SMS from its own sender, not Craves's DLT-registered MSG91 sender, so delivery depends on the carrier and on the
  phone's do-not-disturb setting. Test it on the real phone (below) before relying on it; if SMS does not arrive, use
  `pageVoiceCall=true`.
- Who is paged, and whether by SMS only or SMS and voice call. Numbers stay out of this repo: keep the parameters file
  outside it.

**Deploy.** Put the numbers in a file outside the repo, for example `~/craves-paging.parameters.json`:

```json
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "pagePhoneNumbers": { "value": ["<10-digit number>", "<10-digit number>"] },
    "pageVoiceCall": { "value": false }
  }
}
```

```bash
az deployment group create -g <monitoring resource group in subscription 34eefd95> \
  -f infra/monitoring/silent-failure-alerts.bicep \
  -p @"$HOME/craves-paging.parameters.json" \
  -p deployAlerts=true \
     logAnalyticsWorkspaceId=<workspace resource id> \
     serviceBusNamespaceId=<service bus namespace resource id> \
     alertEmail=<on-call email>
```

Run it with `what-if` in place of `create` first: it should list only the action groups and alert rules. Each number
gets an SMS saying it was added to the group.

**Test a page without an incident.** In the Azure portal: Monitor → Alerts → Action groups → `<namePrefix>-page` →
Test, pick a sample type and the SMS (and Voice) notification. The phone gets a message marked as a test; no rule
fires. To test a whole rule, an operator writes one line in the alert format with a marker, for example
`CRAVES_ALERT alert=COURIER_REJECTED_RATE drill=true`, to a container app's console log (from `az containerapp exec`,
`echo` the line to `/proc/1/fd/1`; not yet tried in production). The rule pages within about 5 minutes and resolves by
itself. The line changes no data.

**Exit test (fix program 1-14): "Each alert fires once in a drill."** For each paging rule in the table, and the
Service Bus dead-letter alert, cause or write its line once, and record that the phone was paged once and the alert
resolved. The two rows marked "None yet" cannot pass until their alert exists.

**Roll back.** Run the same command without the parameters file (or with `pagePhoneNumbers=[]`): every rule goes back to
the email group only. The deployment is incremental, so then delete the unused group:
`az monitor action-group delete -g <resource group> -n <namePrefix>-page`. A person can also stop SMS to their own phone
at once by replying `STOP` to one.

## Tuning

- `CRAVES_MONITORING_ENABLED=false` turns off the order and integration monitors.
- `CRAVES_MONITORING_STUCK_ORDER_MINUTES` sets the stuck-order threshold (default 90).
- `CRAVES_MONITORING_LOOKBACK_DAYS` sets how far back rows count (default 7), so years-old rows do not page forever.

The sweeper only reports. It never cancels or refunds. `PAYMENT_PENDING` is excluded, because an abandoned checkout
is normal. Scheduled and meal-plan orders count from their service time.
