# Fleet replay and shadow (PLAN F15)

Two ways to see what Craves riders would have done, before any rider gets a real order:

- **Replay** (now): recorded orders and their recorded Borzo and Pidge quotes go through the fleet stage's decisions with a synthetic rider pool, and a report comes out. Nothing is offered, pushed, booked or written.
- **Shadow** (after customer launch, decided by people): the real dispatch chain plans the fleet stage for each new order and only logs `FLEET_SHADOW`; Borzo and Pidge run as before.

## Replay

The replay is a test-scope runner in integration-service: `FleetReplay` (the logic) and `FleetReplayRunner` (reads the database, writes the files), both under `src/test/java/in/craves/integration/fleet/dispatch`. It is not part of the service and never runs in CI: it runs only when named, with `FLEET_REPLAY_JDBC_URL` set.

### What it reads

From the integration database, read-only (the runner sets `default_transaction_read_only = on` on its one connection):

| Data | Table |
|---|---|
| Orders: dispatch time, kitchen and drop coordinates, area | `delivery_schema.delivery_command` (`QUOTE_AND_CREATE`, payload `deliveryRequest`) |
| 3PL quotes per order (rupees) | `delivery_schema.delivery_assignment` and `delivery_assignment_candidate.quoted_cost` |
| Which courier was booked | `delivery_schema.delivery_job.provider_id` |
| Rider pay and dispatch values | `fleet_schema.rate_card` (in force, else the draft) and `fleet_schema.dispatch_policy` (in force, else the newest draft) |

Orders count when their dispatch started on the IST dates given and their kitchen is inside the pilot circle.

### What it does per order, in time order

1. Synthetic riders (seeded, start at random points in the circle) are on shift during the given IST hours. A rider who takes an order is busy for the trip's estimated minutes (`FleetDispatcher.estMinutes`) and then waits at the drop.
2. Eligible riders: on shift, free, inside the policy radius of the kitchen. The 3 nearest that pass the cost guard get the offer, as in `FleetDispatcher`.
3. Pay is locked per rider with `FleetPay.quote`: drop km = straight line × 1.3 (no Ola call), pickup km = straight line × the policy's detour.
4. The cost guard compares pay + the per-order overhead with the cheapest recorded quote + the premium. No recorded quote: riders may go.
5. Each offered rider accepts with the accept rate (declining is free); the first to accept takes it.

Outcomes: `OFFERED` (a rider took it), `DECLINED`, `COST_GUARD`, `NO_RIDERS`.

### Output

`fleet-replay-<from>-<to>.md` and `.csv` in `FLEET_REPLAY_OUT`.

- CSV, one line per order: dispatch time (IST), area, drop distance, eligible riders, fleet eligible, outcome, cost guard PASS or FAIL, pickup distance, rider pay, fleet cost (pay + overhead), 3PL price (the booked courier's quote, else the cheapest), booked provider, saving. Money in paise.
- Markdown: settings and versions used, outcome counts, money (3PL for every order, 3PL price of the orders riders took, rider pay + overhead for them, paid rider-hours × C_h, net saving or loss), and the break-even line from PLAN:

  u\* = C_h ÷ (P_eff − v), with P_eff the mean 3PL price of the orders riders took and v the mean rider pay + per-order overhead. The report sets u (replayed orders per paid rider-hour) beside it and the PLAN gate, u ≥ 1.2 × u\*.

### How to run it

On a machine with Maven, against a restored copy of the integration database or a read-only login (never a write login on production):

```bash
export FLEET_REPLAY_JDBC_URL='jdbc:postgresql://<host>:5432/<integration db>?sslmode=require'
export FLEET_REPLAY_DB_USER='<read-only user>' FLEET_REPLAY_DB_PASSWORD='<password>'
export FLEET_REPLAY_FROM=2026-10-01 FLEET_REPLAY_TO=2026-10-19      # IST dates, inclusive
export FLEET_REPLAY_CENTER='17.4483,78.3915'                        # pilot area centre (lat,lng)
export FLEET_REPLAY_RADIUS_KM=5 FLEET_REPLAY_RIDERS=5               # defaults 5 km and 5 riders
export FLEET_REPLAY_SHIFT_HOURS='11-15,19-23'                       # IST hours on shift (default)
export FLEET_REPLAY_ACCEPT_RATE=1 FLEET_REPLAY_HOURLY_COST_PAISE=4000 FLEET_REPLAY_SEED=1
export FLEET_REPLAY_OUT=target/fleet-replay                         # default
mvn -B -f services/integration-service/pom.xml test -Dtest=FleetReplayRunner -Dsurefire.failIfNoSpecifiedTests=false
```

`FLEET_REPLAY_HOURLY_COST_PAISE` is C_h, the fixed cost per paid rider-hour (slot fee and support; PLAN uses ₹40). Run it again with other rider counts, hours or accept rates to compare; the seed keeps runs repeatable. Share the markdown; the CSV is for a spreadsheet. The report holds no names or phone numbers, only order ids and areas.

### Limits

Straight-line distances (×1.3 for the drop), riders who never go offline mid-hours, no kitchen waiting or slot top-ups, and 3PL prices without failed or cancelled trips (so P_eff is a floor). Test mode is ignored: every kitchen in the circle is replayed.

## Shadow mode: a people-only step after customer launch

Shadow is the dispatch chain's own mode: `dispatch_policy.mode = 'shadow'`. With it, each new order runs the real fleet-stage planning (real riders on shift, real distances, the live 3PL quote for the cost guard) and logs one line, then routing carries on with Borzo and Pidge exactly as with `off`:

```text
FLEET_SHADOW chefSubOrderId=<id> offers=<n> payPaise=[...] dropDistanceM=<m> courierQuotePaise=<paise> outcome=OFFER|NO_RIDERS|COST_GUARD
```

It stays `off`. Agents never change it. A person switches it only after the customer launch, and only when:

1. The customer launch is live and stable, and this replay has been read for the pilot area.
2. Riders are onboarded and go online (shift and location ingest are deployed), `CRAVES_FLEET_ENABLED=true` and test mode stays on.
3. A new `dispatch_policy` version with `mode = 'shadow'` is published through `FleetPolicyStore.publishDispatchPolicy` (or the same SQL by a person): its `effective_from` must be at least 14 days after publishing and its values inside the declared ranges, so riders get the notice the terms promise. Nothing in the code or migrations switches it.
4. Ops reads `FLEET_SHADOW` lines in the integration-service logs (Log Analytics) for a week and compares them with the replay.

`live` comes later and separately: only after order-service accepts the `craves_fleet` hand-over (docs/riders/BACKEND.md, step 5 of the dispatch chain) and after another 14-day notice.
