# Autoscaling (production, subscription 34eefd95)

`apply-autoscale.sh` sets how far each part of Craves grows and shrinks on its own. Check it offline with
`bash infra/autoscale/test-apply-autoscale.sh`.

## What was already there (read live, 15 Nov 2026)
- All 14 container apps scale on HTTP traffic: a new replica for every 50 requests in flight per replica
  (advanced: 80), checked every 30 s, scaled back after 300 s. Min 2 / max 10 replicas; voice, admin and
  delivery-intel min 1 / max 3. Each app has its own Consumption environment (limit 100 cores each), zone-redundant.
- Postgres (auth, integration, referral: D2ds_v5; business: D4ds_v5) has storage auto-grow on.
- APIM Premium (1 unit) and Service Bus Premium (1 messaging unit) had no autoscale.
- The release pipeline (`templates/release.yml` in Azure DevOps) changes only the image and `CRAVES_BUILD_SHA`,
  so scale settings made here stay in place across releases.

## What the script adds
| Part | Before | After |
|---|---|---|
| web, auth, catalog, order, user-chef | HTTP rule, 2–10 | HTTP rule + CPU rule (70 %), 2–20 |
| voice | HTTP rule, 1–3 | HTTP rule + CPU rule, 2–6 (a restart no longer drops every live call) |
| integration, notification, subscription, referral, referral-members, advanced | HTTP rule, 2–10 | HTTP rule + CPU rule, 2–10 |
| admin, delivery-intel | HTTP rule, 1–3 | HTTP rule + CPU rule, 1–3 |
| APIM | 1 unit, fixed | 1–2 units: +1 when Capacity > 70 % for 10 min, −1 when < 30 % for 30 min |
| Service Bus | 1 unit, fixed | 1–4 units (1→2→4): up when CPU > 75 % or memory > 60 % for 10 min, down when CPU < 25 % and memory < 30 % for 30 min |

Why a CPU rule: Java and server-side rendering use up a 1-vCPU (web: 0.5) replica before 50 requests are in
flight, so the HTTP rule alone reacts late. Memory is not used as a trigger: the JVM holds its heap, so memory
looks high all the time.

Why these maximums: every replica opens its own database connections (Hikari pool per replica: catalog 2,
order 3, user-chef 2, notification 2, subscription 2, auth 3, integration 8, advanced 8, referral 8,
referral-members 2). At full scale the business server sees about 260 connections and the others at most 100,
far under the default `max_connections` of these sizes. More app replicas than this would only move the
bottleneck to the database CPU.

## Browse path for 5,000 people (`apply-browse-5k.sh`, 15 Nov 2026)
Every public catalog request (kitchen lists, kitchen, menu, nearby) first asks integration which chefs may sell, and
integration asks user-chef (`docs/finance/CATALOG_SELLING_ELIGIBILITY.md`). One page view therefore loads three
services and two databases. The first load test (600 requests/s) found catalog and user-chef queueing on 2 database
connections per replica at under 30 % CPU, and integration (max 10) and user-chef (max 20) at their caps.

| App | Before | After |
|---|---|---|
| user-chef | 2–20 replicas, 2 DB connections each | 4–20, 8 connections, graceful shutdown |
| integration | 2–10 replicas, 8 DB connections each | 4–20, graceful shutdown |
| catalog | 2–20 replicas, 2 DB connections each | 4–20, 8 connections, graceful shutdown |
| web | 2–20 replicas, 0.5 vCPU / 1 GiB | 4–20, 1 vCPU / 2 GiB (applied by hand with the same canary steps) |

Catalog also reuses the signed "which chefs may sell" answer for up to 2 seconds per replica (#673), so integration
and user-chef no longer see one call per page view (about 10 calls a second at 1,250 requests a second).

Result on 15 Nov 2026 with all of the above (four generators, 11:48–12:01 UTC): 622,391 requests and no errors over
100 a second, a jump to 1,000 within one minute, 1,000 for 5 minutes and 1,250 (about 6,250 people) for 3 minutes.
Median 11–12 ms, p95 78–90 ms, p99 about 0.8 s (1.2 s in the jump minute); the web page p95 13–16 ms. Peaks: catalog
20 replicas (its cap) at 19 % CPU, integration and user-chef 4 replicas, web 4 replicas at 14 % CPU, business database
13 % CPU and 186 connections, APIM 45 % of one unit.

Settings are environment variables on the apps (`SPRING_DATASOURCE_HIKARI_MAX_POOL_SIZE`, `SERVER_SHUTDOWN`,
`SPRING_LIFECYCLE_TIMEOUTPERSHUTDOWNPHASE`); releases keep them. Worst case at full scale: business DB about 500 of its
1,718 connections, integration DB 160 of 859. `scripts/release/check-db-connection-budget.py` still describes the old
prodlow server and does not see these values.
```bash
bash infra/autoscale/apply-browse-5k.sh                                   # plan, changes nothing
CONFIRM_AUTOSCALE_WRITE=true bash infra/autoscale/apply-browse-5k.sh apply  # user-chef, integration, catalog in turn
bash infra/autoscale/test-apply-browse-5k.sh                              # offline check
```
The rollout is the same as above; the new revision must match the live one in image, scale rules and every other
setting before any traffic moves. Load test: `loadtest/browse5k.js` on four generators (see the file header).

## What does not scale on its own
- **Postgres compute.** Scale up by hand (e.g. business D4ds_v5 → D8ds_v5) when the CPU alert (> 85 %) keeps firing;
  with same-zone HA this is a short failover, so pick a quiet hour.
- **Azure Managed Redis** (Balanced_B5): scale by hand if memory or server load stays high.
- **Front Door**: global, scales by itself.

## How load spreads
Front Door (edge, WAF) → APIM (one gateway for every API) → each service's replicas, spread across availability
zones by Container Apps' own load balancer → Postgres, Redis and Service Bus. Background work goes through
Service Bus topics, where every replica of a consumer takes messages in turn. Scheduled jobs run on every
replica: jobs that must run once claim their work with a database lock, and a few (such as the rider position
feed) simply repeat on each replica, so every extra replica adds a little background load.

## Run it (Cloud Shell, as ravitejamm6@gmail.com)
```bash
C=<merge sha>; D=~/autoscale/$C; mkdir -p $D && cd $D \
 && curl -fsSL https://codeload.github.com/rmorampudi09-arch/Craves-Build-platform/tar.gz/$C \
  | tar -xz --strip-components=1 --wildcards '*/infra/autoscale/*'
bash infra/autoscale/apply-autoscale.sh                                    # plan, changes nothing
CONFIRM_AUTOSCALE_WRITE=true bash infra/autoscale/apply-autoscale.sh apps  # all apps, one at a time
CONFIRM_AUTOSCALE_WRITE=true bash infra/autoscale/apply-autoscale.sh apps ca-craves-admin-prod   # or just some
CONFIRM_AUTOSCALE_WRITE=true bash infra/autoscale/apply-autoscale.sh capacity                    # APIM + Service Bus
```
Each app rolls out like a release: new revision with the new scale settings → Healthy → 10 % for 2 minutes →
100 % → old revision deactivated. It refuses an app whose traffic is split, and stops at the first problem with
traffic still on the old revision. Each finished app prints its rollback line:
`CONFIRM_AUTOSCALE_WRITE=true bash infra/autoscale/apply-autoscale.sh rollback <app> <old> <new>`.
Running it again changes nothing that is already in place. Press Enter in Cloud Shell every 10 minutes while it
runs (20-minute idle timeout).

To undo the capacity autoscale: delete `as-apim-craves-prod` / `as-sb-craves-prod` in the shared resource group
(the units then stay where they are at that moment).

## Cost
Extra replicas and units cost only while they run. One APIM Premium unit is the expensive one; it is added only
after 10 minutes above 70 % and removed after 30 minutes below 30 %.
