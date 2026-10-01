# Pidge Routing And Delivery Intelligence Configuration Receipt

Recorded 2026-10-02, Asia/Calcutta. User approved live delivery investigation,
Pidge priority through existing delivery intelligence and temporary Borzo
disablement. Repository `C:\mscratch`, branch `KUSHIRAVI-app-build`.

## Confirmed Failure

| Evidence | Value |
| --- | --- |
| Checkout/order UUID | `05b31712-f30e-4bb5-a922-2da7ae0943e9` |
| Delivery command UUID | `b3089845-6dc8-3f73-9672-af829b169692` |
| Chef sub-order UUID | `78110b83-cce9-4fe8-981e-36c3a2ce25a3` |
| Command state | `DEAD_LETTER` |
| Processing attempts | `5` |
| Last error | `503 SERVICE_UNAVAILABLE "Delivery intelligence is disabled"` |
| Persisted delivery jobs / assignments / Pidge bookings | `0 / 0 / 0` |

Application logs and read-only database state independently linked this exact
command to the supplied order. The delivery-command consumer was enabled and
Pidge was already active/production-ready, but the intelligence enable flag was
absent and its configuration defaulted off. Retrying the command could not solve
that configuration failure. No provider delivery was recorded for this order.

The Order Service's delivery-status consumer was also absent/off, with no running
receiver in its current revision. Its existing topic subscription and receiver
permission were already present; the consumer needed enabling so future provider
statuses could reach the customer order projection.

## Applied Changes

Existing Azure resource group: `rg-craves-prodlow-centralindia`.
Subscription: `721906c9-4a72-4606-830b-d3e7ace093ff`.

### Integration Service

- App: `ca-craves-integration-service-pr`.
- Before revision: `ca-craves-integration-service-pr--f-b618d10428a0`.
- Live revision: `ca-craves-integration-service-pr--pidge-1002`.
- Same immutable image:
  `cravesrm09prodlow6bf632.azurecr.io/craves/integration-service@sha256:84c06314f147e326adfb6a23cf27fbdfd8950b8863c829b1d5558a1039c44763`.
- Only template changes: revision suffix and the two environment bindings:
  `CRAVES_DELIVERY_INTELLIGENCE_ENABLED=true`, `BORZO_API_ENABLED=false`.
- Both flags previously absent; configured defaults were false. Delivery
  commands, Pidge API/create, prerequisites, credentials and worker settings
  were retained, not newly invented or silently bypassed.

### Provider Registry

Used existing authenticated POST `/internal/v1/delivery-intelligence/providers`
with the stored Borzo record and `active: false`. This is not a vendor booking
endpoint. Preserved fields:

```json
{
  "providerId": "borzo",
  "displayName": "Borzo",
  "adapterType": "BORZO_BUSINESS_API_1_8",
  "active": false,
  "serviceAreas": [],
  "capabilities": {
    "QUOTE": true,
    "TRACK": true,
    "CANCEL": true,
    "WEBHOOK": true,
    "CREATE_DELIVERY": true,
    "THERMOBOX_REQUEST": true,
    "RIDER_LEVEL_CANDIDATES": false
  }
}
```

Post-change registry readback: Pidge true; Borzo, Delhivery, Porter, Shadowfax and
Shiprocket false. Pidge's stored record was not rewritten. With Pidge the only
active provider, new quotes/assignments use Pidge through the unchanged
intelligence engine. No new priority score, direct-create bypass, pricing rule,
partner performance data or algorithm strategy was introduced.

There were no nonterminal Borzo jobs in the inspected database at the change.
Existing records, callbacks and audit history were not deleted or cancelled.
Borzo disablement is temporary and requires an explicit later restoration.

### Order Service

- App: `ca-craves-order-service-prodlow`.
- Before revision: `ca-craves-order-service-prodlow--cart-preview-v112`.
- Live revision: `ca-craves-order-service-prodlow--delivery-1002`.
- Same immutable image:
  `cravesrm09prodlow6bf632.azurecr.io/craves/order-service@sha256:0314c09d17699db325d3f6b61e60deb3dd08abfb8424f84232cdd20c35aa1a01`.
- Only template changes: revision suffix and
  `CRAVES_DELIVERY_STATUS_CONSUMER_ENABLED=true`.
- Existing namespace: `sb-craves-prodlow-kmqgfy.servicebus.windows.net`.
- Existing topic: `craves-domain-events`.
- Existing subscription: `order-service-delivery-status-changed`.
- Existing Service Bus Data Receiver role retained. No permission added.
- Existing subscription filter retained:
  `eventType IN ('DELIVERY_STATUS_CHANGED','DELIVERY_TELEMETRY_UPDATED') OR event_type IN ('DELIVERY_STATUS_CHANGED','DELIVERY_TELEMETRY_UPDATED')`.
- Actual new-revision log confirmed `DELIVERY_STATUS_CHANGED processor started`
  and receiver `onLinkRemoteOpen` / mediator activation on that subscription.

## Verification

- Both live revisions Healthy / Provisioned, one ready replica and 100% traffic.
- Integration replica Running, ready true, restart count zero at final check.
- Both HTTPS `/actuator/health` requests returned UP.
- Protected Pidge readiness: productionReady true, catalogActive true,
  environment PRODUCTION, blockers empty.
- Service Bus delivery queue: Active, active 0, scheduled 0, dead letters 1.
  Original dead-letter message remains; no messages drained or re-enqueued.
- Order delivery-status subscription: Active, active 0, dead letters 0.
- An existing unrelated FAILED command row was seen, but no active/scheduled
  delivery queue work. It was not replayed, edited or claimed as recovered.
- First safe probe with an unavailable Pidge candidate returned HTTP 503 with
  production error detail redacted. It was not counted as proof of the cause.
- Subsequent deliberate unknown-provider/unavailable-candidate probe used the
  existing order's routing context, no price and no vendor API. HTTP 400 is the
  post-enable unknown-provider rejection rather than the disabled-engine 503.
  Database recheck confirmed zero assignments/jobs/Pidge bookings for that order,
  and the original command remained DEAD_LETTER. No fake success was persisted.
- No live chargeable quote, new delivery, dispatch, payment, refund, wallet top-up,
  artificial provider callback or customer order state change was performed.

### Unrelated-Configuration Guards

Compared full same-view service templates after removing only the specifically
changed flag bindings and revision suffix, and sorting environment bindings.
All remaining values/secret references/container settings were identical.
App configuration fingerprints were also unchanged. Private values were hashed
in memory, not printed or persisted in this receipt.

| Guard | Matching before/after SHA-256 |
| --- | --- |
| Integration template, excluding two flags/suffix | `7BC2307980CAE75AFDDCA4D8E3DB7E55A8F49A37B325585AA2B17D0D3E1F380C` |
| Integration app configuration | `D8FBE127C133E7046F38EDA9EFA80AB095BA5879ADB54FBACF45AD2C3575930E` |
| Order template, excluding one flag/suffix | `E2290A1543A2B2EC625C8898F8F6C6086A72ED4FC0BDE9C8B6D6AC4D5C36A5E4` |
| Order app configuration | `65D3A57EFBDC69E06B26C080AF401A654FF6017954FFC280432440EA903DC2EB` |

Database diagnosis used read-only JDBC transactions, bounded statement/lock
timeouts and existing Key Vault bindings in process memory. A temporary firewall
rule `delivery-probe-20261002`, limited to this computer's single IPv4 address,
was added and removed. Final rules returned to only the prior AllowAzureServices
rule; no broad new firewall opening or resource tier change remains.

An initial overlong revision suffix was rejected before deployment; corrected
to the shorter suffix above. One container-exec observation failed transiently;
it is not counted as verification. Subsequent independent replica status,
health, control-plane response and processor logs are the successful evidence.
No error-detail exposure or security control was weakened to inspect a response.

## Next Genuine Order Test

The configuration failure is corrected; full real rider booking and delivery
acceptance still require the user's next genuine order. Provider readiness does
not guarantee a rider or serviceable route at the next dispatch time.

1. Place and pay for a new genuine order in the existing app.
2. Have the Chef accept it and use the existing readiness workflow. Dispatch
   follows the existing preparation/lead-time policy, not necessarily payment time.
3. Record the new order UUID. Check a delivery command, Pidge candidate/assignment,
   provider booking ID and completed command; ensure no Borzo create/quote.
4. Verify provider callbacks/outbox, Order Service consumption and app tracking
   agree. Check pickup and delivery with genuine provider events.
5. If no eligible Pidge quote is available, inspect the existing provider-wait
   state; do not invent a rider, silently reactivate Borzo or fake delivery.

The old order has not been rebooked or recovered. Its original dead letter is
retained for an explicitly authorized, stale-order-aware recovery decision.
Do not replay it merely to make a dashboard look successful or risk duplicate
pickup, payment or delivery charges. No financial remedy is claimed here.

## Local Checkpoint And Rollback

- Local configuration receipt tag: `KUSHIRAVI-delivery-pidge-routing-v1`.
  Resolve the documentation commit with `git rev-parse
  KUSHIRAVI-delivery-pidge-routing-v1^{}`. No GitHub push or original branch edit.
- App source/UI unchanged: `com.cravesapp`, versionCode 30 / versionName 1.19,
  source `bb6e81d23623b023bf9c8c6ab22d5a9856b8e695`, tag `KUSHIRAVI-app-v1.19`.
  No APK build/install/version increment; archived APK/source ZIP untouched.
- Backend binaries unchanged. No new compilation or unit-test run is claimed;
  verification here is live configuration, health, registry, messaging and safe
  negative diagnostics, not complete end-to-end delivery acceptance.

Git checkout alone cannot roll back cloud configuration. If expressly required,
restore the prior inactive/absent intelligence and order-consumer flag bindings
or the recorded prior revisions. Preserve DLQ/history and current provider jobs.
Restore only Borzo's prior active state through the authenticated registration
API while retaining the recorded fields. Borzo's prior API environment binding
was absent/default false, not true. Never enable its live API automatically as a
rollback shortcut. Do not disturb existing Pidge credentials or other providers.

No Azure Portal/store/signing/manual deployment steps remain for this fix.
Only the genuine new-order acceptance above remains with the user.
