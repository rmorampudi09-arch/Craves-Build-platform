# Platform resilience release (#496): seven backend services from main (2026-10-15)

#496 changes runtime code in all seven Java services: auth, catalog, integration, notification, order, subscription,
user-chef. Production needs **no new setting, secret or key** for this deploy:

- Internal-call signing (CH-03) stays in monitor mode. With no keys set, calls go out unsigned and receivers only log.
- The idempotency filter acts only on requests that send an `Idempotency-Key` header. No current client sends one to a
  path it covers.
- The Service Bus session consumers stay off.

## Changes that are on by default

| Where | Change | Watch for |
|---|---|---|
| all 7 | Unknown routes and `/actuator/*` except `health`/`info` now return 403 | anything scraping `/actuator/metrics` or `/actuator/prometheus` (none found in the repo) |
| all 7 | Scheduled jobs run on named pools; a lag watchdog logs `CRAVES_ALERT` lines | log noise only |
| catalog, integration, order, subscription, user-chef | Outbound RestClient timeouts: connect 2s, read 30s (before: none) | timeouts to slow partners in logs |
| order, user-chef | A notification row stuck in `PROCESSING` for over 5 minutes is sent again; one at the attempt limit becomes `DEAD` | **old stuck rows would be sent late**: check them in step 1 |
| order | A status update that lost a race returns 409 instead of overwriting | 409s in chef/admin flows |
| order | V39 adds two stored generated columns: **rewrites `customer_order` under an exclusive lock** | size checked in step 1 |
| integration | V150 builds a plain index on `delivery_outbox`; outbox writes wait while it builds | size checked in step 1 |
| integration, order | Alert monitors every 5 minutes; idempotency filter on keyed `/api` writes | `CRAVES_ALERT` lines |

Migrations: order V38, V39, V40; integration V150, V151; user-chef V19. All are additive. They stay after an image
rollback, and the old code works with them.

Images are tagged with the **full merged commit SHA**. Run the commands in Azure Cloud Shell (Bash), one line at a time.
**(Enter is yours)** marks a production write. Stop at the first surprise and send the output to Claude.

## 0. Variables, code, rollback images, what is live

```bash
export RG=rg-craves-prodlow-centralindia ACR=cravesrm09prodlow6bf632 SHA=<MERGED_SHA_FULL_40_CHARS>; export TAG=$SHA PGH=pg-craves-prodlow-kmqgfy.postgres.database.azure.com APPS="ca-craves-notification-service-p ca-craves-subscription-service-p ca-craves-catalog-service-prodlo ca-craves-user-chef-service-prod ca-craves-auth-service-prodlow ca-craves-integration-service-pr ca-craves-order-service-prodlow"; echo "$TAG" | grep -qE '^[0-9a-f]{40}$' && echo "SHA ok" || echo "SHA must be the full 40-character commit"
```
```bash
rm -rf ~/c9 && git clone -q --filter=blob:none https://github.com/rmorampudi09-arch/Craves-Build-platform.git ~/c9 && cd ~/c9 && git checkout -q --detach $SHA && git rev-parse HEAD
```
The next command prints each live image, which is its rollback image (paste these into the release notes). It also says whether that image was
built from a commit on main:
```bash
for a in $APPS; do img=$(az containerapp show -g $RG -n $a --query 'properties.template.containers[0].image' -o tsv); t=${img##*:}; if echo "$t" | grep -qE '^[0-9a-f]{40}$' && git -C ~/c9 merge-base --is-ancestor "$t" HEAD 2>/dev/null; then echo "OK    $a $img"; else echo "CHECK $a $img"; fi; done
```
Expect `OK` for auth, user-chef and order (7ee75e7c), and probably catalog. A `CHECK` line means production runs code that
may not be on main. Rebuilding that service could remove live code (see `docs/runbooks/live-runtime-safety.md`, rule 4).
**Do not deploy that service.** Send the line to Claude to compare first.

Read-only database helper (never writes; reads the password from Key Vault without printing it):
```bash
psqlro() { PGPASSWORD="$(az keyvault secret show --vault-name kvcravesprodlowkmqgfy -n pg-pass --query value -o tsv)" PGSSLMODE=require PGOPTIONS='-c default_transaction_read_only=on' psql -h "$PGH" -U cravesadmin -d "$1" -c "$2"; }
```

## 1. Before: migrations, table sizes, stuck notifications (read-only)

Where the tables live:
```bash
psqlro craves_business_db "SELECT n.nspname AS schema, c.relname AS table FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = 'r' AND (c.relname LIKE '%flyway_schema_history' OR c.relname IN ('notification_outbox','delivery_outbox','customer_order')) ORDER BY 1, 2;"
```
Migration heads. Expect order V37, integration V149, and `t` everywhere:
```bash
psqlro craves_business_db "SELECT 'order' svc, version, success FROM order_schema.flyway_schema_history WHERE installed_rank = (SELECT max(installed_rank) FROM order_schema.flyway_schema_history) UNION ALL SELECT 'integration', version, success FROM payment_schema.flyway_schema_history WHERE installed_rank = (SELECT max(installed_rank) FROM payment_schema.flyway_schema_history);"
```
For user-chef (expect V18 on top), run the same query on its `flyway_schema_history`, using the schema the first list showed.

Sizes. The V39 rewrite and the V150 index block writes to these tables while they run. If either table is over
about 1 GB, send the numbers to Claude and plan a quiet hour for order and integration:
```bash
psqlro craves_business_db "SELECT 'customer_order' t, count(*), pg_size_pretty(pg_total_relation_size('order_schema.customer_order')) FROM order_schema.customer_order UNION ALL SELECT 'delivery_outbox', count(*), pg_size_pretty(pg_total_relation_size('payment_schema.delivery_outbox')) FROM payment_schema.delivery_outbox;"
```
Stuck notifications that the new code would send again:
```bash
psqlro craves_business_db "SELECT status, count(*), min(updated_at) AS oldest FROM order_schema.notification_outbox WHERE status = 'PROCESSING' AND updated_at < now() - interval '5 minutes' GROUP BY status;"
```
Run the same query on the user-chef schema's `notification_outbox`. If any rows come back that are older than about an hour, those customers or chefs would get a late
message. Send the counts to Claude before deploying order or user-chef.

## 2. Build the images (no production change)

```bash
cd ~/c9 && for s in notification subscription catalog user-chef auth integration order; do az acr build -r $ACR -t craves/$s-service:$TAG services/$s-service --no-logs -o none && echo "built $s" || { echo "BUILD FAILED: $s"; break; }; done
```

## 3. Deploy, one service at a time, lowest risk first

Skip any service that printed `CHECK` in step 0. For each app, in this order: notification, subscription, catalog,
user-chef, auth, integration, order.

**(Enter is yours)**, image only (settings and secrets stay). Set `A` and `S` for each service in turn:
```bash
A=ca-craves-notification-service-p S=notification; az containerapp update -g $RG -n $A --image $ACR.azurecr.io/craves/$S-service:$TAG -o none && az containerapp revision list -g $RG -n $A --query "[?properties.active].{name:name,health:properties.healthState,traffic:properties.trafficWeight,image:properties.template.containers[0].image}" -o table
```
Re-run the revision list until the new revision is Healthy with traffic 100. Then check the logs:
```bash
az containerapp logs show -g $RG -n $A --tail 300 --format text | grep -E 'CRAVES_ALERT|LIVE_RUNTIME_LOCK|ERROR' | tail -20
```
A `LIVE_RUNTIME_LOCK` line means the build lacks live code. The old revision keeps serving: roll back (step 5) and send
the line to Claude. A few `CRAVES_ALERT INTERNAL_CALL_*` INFO lines are expected (monitor mode).

Smoke tests after each service:
- **auth:** sign in once with a phone OTP, as a customer and as a chef.
- **user-chef:** open the chef profile and kitchen.
- **catalog:** load the home and kitchen pages.
- **integration:** a small test payment. Delivery status still updates.
- **order:** do this last. First check that no rollout is running (`latest` equals `ready`):
  ```bash
  az containerapp show -g $RG -n ca-craves-order-service-prodlow --query "{latest:properties.latestRevisionName,ready:properties.latestReadyRevisionName}" -o jsonc
  ```
  Then deploy. Place a small order, accept it in the chef app, and watch the status and the delivery handoff update.

## 4. After: migrations (read-only)

```bash
psqlro craves_business_db "SELECT version, description, success FROM order_schema.flyway_schema_history ORDER BY installed_rank DESC LIMIT 4;"
```
```bash
psqlro craves_business_db "SELECT version, description, success FROM payment_schema.flyway_schema_history ORDER BY installed_rank DESC LIMIT 3;"
```
Expect order V40, V39 and V38 `t` on top of V37. Expect integration V151 and V150 `t`. For user-chef, the same query on its schema should show V19 `t`. If a
lock timeout or a failed migration shows up, the new revision never became ready and the old one keeps serving. Send
the output to Claude.

## 5. Rollback (image only, per service, in reverse order)

```bash
az containerapp update -g $RG -n <APP> --image <ROLLBACK IMAGE FROM STEP 0>
```
The migrations stay. They only add columns, a constraint value, an index and two tables, and the old code works with
them.

## 6. Tell Claude

Send the merged SHA and the new revision names. Claude then opens the small PR that records `{"source": "<SHA>"}` for
auth, user-chef and order in `docs/admin/explorer/backend-release.json`. That turns "Explorer release contracts" green.

These are separate later steps, each on its own, and each needs Claude to prepare it:
- the CH-04 alert rules (`infra/monitoring/silent-failure-alerts.bicep`, `deployAlerts=true`);
- internal-call signing:
  1. Set receiver `caller-keys` first.
  2. Then set caller `signing-key`.
  3. Set `enforced-paths` last.
- the ordered Service Bus sessions: run `create-order-session-subscriptions.sh`, then set the two session flags.
