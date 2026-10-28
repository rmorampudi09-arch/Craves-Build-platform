# Craves riders at scale: the fleet core

29 Oct 2026 · Phase 5 · for Gopi, and for whoever runs or grows the rider fleet.

This covers how the core of the rider fleet grows from a Hyderabad pilot to 500,000 riders: live rider state, dispatch, payments and the models to come. Two things don't change at any size:

- the promises in `DISPATCH.md` §1;
- Postgres as the system of record.

Here is what Phase 5 built, all switched off, and what each later stage waits for. The backend detail is in `BACKEND.md`, "The fleet engine". The steps for people are in `GO-LIVE.md` §9 and `infra/fleet-engine/README.md`.

Numbers marked *measured* come from the engine's benchmarks (`EngineBenchmarkTest`):

- **Machine:** 2 shared vCPUs (Xeon, 2.1 GHz), with Redis 7.0 on the same machine.
- **Run:** Java 21, `mvn test -Dfleet.bench=true -Dtest=EngineBenchmarkTest` in `services/fleet-engine`: the median of 5 runs after 3 warm-up runs.
- **Engine CPU** is the JVM's own CPU time per event or order (Lettuce's I/O threads included, Redis's not). That is what sizes the engine's replicas; throughput on this machine is lower, because Redis shares its two vCPUs.

Production on Azure will differ. Numbers marked *estimate* are arithmetic on stated assumptions. Check both against the live figures (§12) before acting on them.

## 1. The short answer

- **Today.** Dispatch is Java on Postgres: one `/locations` call runs up to 5 statements in a transaction, and each order runs a SQL ranking. That is right for a pilot. It has three walls:
  - every phone call is a Postgres transaction;
  - ranking cost grows with the riders near a kitchen;
  - two orders asked at once can both choose the same rider, and the second loses a round.
- **Built in Phase 5, off.**
  - **The fleet engine** (`services/fleet-engine`, Java 21 and Spring Boot like every Craves service) keeps every online rider in Redis and ranks riders for orders by the same rules, per map block, in parallel. It ranks 200 riders in 17 µs, and a rider event costs it 11 µs of CPU while the rider waits and 20 µs when they move, so one vCPU keeps up with 50,000 to 90,000 events a second (*measured*).
  - **integration-service** feeds it after each commit.
  - **In shadow**, the engine only compares its ranking with Java's.
  - **Live**, dispatch asks it first and falls back to its own ranking after 300 ms.
  - **Postgres keeps the last word:** dispatch still writes every offer, and one ACTIVE offer per rider still holds.
- **At 500,000 riders,** in stages, each with a trigger (§13):
  - location ingest moves to an edge service writing to Event Hubs (Kafka);
  - GPS history leaves Postgres for a data lake;
  - the engine gets its own sharded Redis and more instances.
- **For riders:** the same rules, offers faster, and no lost rounds from two orders choosing the same rider. No new rider feature is part of this.

## 2. Scalability bottleneck audit

What breaks first, where and why, and what fixes it.

| # | Where | What it does today | Where it breaks | Fixed by | Trigger |
|---|---|---|---|---|---|
| 1 | Location ingest: `POST /locations` (APIM, then integration-service, then Postgres) | Up to 5 statements in one transaction per call. Each phone calls every 10 s while it waits for offers (the server's `nextPollSec`, 5 to 30 s) and every 15 s on a trip, with a fix taken every 3 s. The Postgres pool is 8 connections on 1 replica (blueprint E3). | Each call holds a pooled connection for its statements, so the pool tops out somewhere around 1,000 to 1,500 calls a second. That is roughly 10,000 to 15,000 riders at the 10 s poll. The Burstable Postgres (B1ms, 1 vCore) likely runs out of CPU before that (*estimate*; the proven load target is 20 calls a second). | **Built:** the PING rides on the same 5 statements, so the engine adds no write. **Stage 6:** an ingest edge writes fixes to Event Hubs and Redis, and Postgres sees only shift and trip changes. | 5,000 riders online, or `/locations` p99 over 200 ms, or Postgres CPU over 60% at peak |
| 2 | Ranking each order (`FleetDispatcher.nearbyRiders`, `standings`) | A bounding-box query; then, for fair turns, 3 standing queries per rider in the band, and one test-mode query per rider while test mode is on | Cost grows with the riders near a kitchen: fine for tens, slow for hundreds in a 5 km radius | **Built:** the engine ranks from Redis: a GEO set per block and one hash per rider, 17 µs for 200 riders (*measured*) | Live, once shadow passes (`GO-LIVE.md` §9) |
| 3 | Two orders at the same moment | Each order ranks alone. Both pick the nearest rider, and Postgres takes the first insert (`ON CONFLICT ... DO NOTHING`). | The second order loses its best rider and waits a round. This grows with order density. | **Built:** one actor per block ranks the orders waiting there together; live replies hold their riders for 5 s; joint sharing out (§7) | Live once shadow passes; joint after 5% of peak orders changed in shadow, and 14 days' notice |
| 4 | Postgres writes | `trip_track` keeps every on-trip fix; plus offers, trips and the ledger | At 500,000 riders, with a third on trips and a fix every 3 s, `trip_track` takes about 55,000 rows a second. That is beyond one Postgres (*estimate*). | **Built:** daily partitions, 90-day retention. **Stage 8:** history goes to Event Hubs Capture and a data lake. | 2,000 `trip_track` rows a second, sustained |
| 5 | Redis (`amr-craves-prodlow-kmqgfy`) | Shared with auth's token-revocation keys. The template that made it (`infra/prodlow-rebuild/main.bicep`) sets Balanced B0 (0.5 GB, the smallest Balanced size), the OSS clustering policy, VolatileLRU eviction and high availability off. | Memory: near full, VolatileLRU drops keys that have an expiry, least recently used first, and auth's revocation keys are among them (`infra/redis/README.md`, "Why NoEviction"). Shards: integration-service's standalone client reaches one shard's keys only. No replica: a restart loses everything in it. | **Built:** streams trimmed by age to 2 minutes; rider keys expire after 30 minutes; the engine logs the shard count at start; all it keeps rebuilds within minutes | Engine memory over 100 MB, used memory over 50%, or more than 1 shard (§13, stage 5) |
| 6 | Streams | 16 rider and 16 dispatch Redis Streams | Each stream lives on one shard, so its rate is one shard's, and retention is RAM. | **Stage 7:** Event Hubs (Kafka) for rider events | 20,000 rider events a second, sustained, or a replay longer than 2 minutes needed |
| 7 | The engine | A rider event costs 11 to 20 µs of CPU, 50,000 to 90,000 a second per vCPU, and a block actor ranks about 1,700 orders a second in batches of 16 (*measured*) | CPU and Redis round trips per instance | Instances share partitions through leases: up to 16 per family at 16 partitions | Rider event lag p99 over 1 s, or CPU over 70% (§13, stage 4) |
| 8 | Gateway (APIM, `api.craves.in`) | Every rider call | Microsoft publishes no fixed requests per second for an APIM unit, so measure it with APIM's Capacity metric [5] | **Stage 6:** location uploads go to the ingest edge behind Front Door, with the same token checks | APIM capacity over 60% at peak |
| 9 | Offer pushes (FCM through notification-service) | One push per offer, with a TTL | No limit near this scale | Nothing to do | |
| 10 | Payouts | A weekly bank file and daily withdrawals, each approved by two people and uploaded by hand | People's time, and the bank's file limits | §9 | §9 |

## 3. Topology: gateway, ingest, stream, memory, compute, storage

### As built (Phase 5)

```text
 Rider app (native location service + outbox: fixes kept offline up to an hour, 20 sent a call)
   │  HTTPS POST /locations every 10 s waiting for offers (5–30 s, set by the server), every 15 s on a trip;
   │  trip steps; accept / decline
   ▼
 GATEWAY   APIM api.craves.in (TLS, RIDER JWT or shift credential, rate limits)
   ▼
 INGEST    integration-service (Java): 5 statements in Postgres per call; after commit, FleetEngineFeed queues
   │       a PING (bounded queue, one sender thread, Lettuce async: one round trip per batch)
   ▼
 STREAM    Redis Streams  craves:fleet:rq:{rq0..15}  rider events  (partition = hash(rider) mod 16)
                          craves:fleet:dq:{dq0..15}  dispatch requests (partition = hash(kitchen block) mod 16)
   ▼
 COMPUTE   fleet-engine (Java) × 1–4: partition leases; newest-wins Lua writes; one actor per 0.05° block
   │       ranks the orders waiting there together (first come; jointly with the switch); live: holds + reply
   ▼
 MEMORY    Redis  r:{rider} hash · g:{block} GEO set · holds in the rider hash · reply:{request} (30 s)
   ▲
   │  live: dispatch reads the reply within 300 ms, else ranks riders itself
   │
 STORAGE   Postgres (system of record): shifts, trips, offers (one ACTIVE per rider), pay, ledger, payouts
           → offer push (FCM) and the next /locations answer
```

### At 500,000 riders (stages 5 to 9)

```text
 Rider app ──► Front Door ──► ingest edge (Java, stateless, N replicas; JWT / shift credential checked)
                                  ├──► Event Hubs (Kafka) rider-fixes, 32–100 partitions by rider ──► engine readers
                                  ├──► Event Hubs Capture ──► data lake (Parquet) ──► model training, disputes
                                  └──► integration-service only when a shift or trip changes (low rate)
 fleet-engine per region: partitions by rider (state) and by block (dispatch) ──► its own Redis cluster
 integration-service ──► Postgres: shifts, trips, offers, pay, ledger (system of record)
```

| Hop | Protocol and payload | Pilot (200 riders) | 500,000 riders | Latency budget |
|---|---|---|---|---|
| Phone → gateway | HTTPS JSON, up to 20 fixes | 20 calls/s | 166,667 fixes/s (one every 3 s) | the phone's call, not offer time |
| Ingest → stream | XADD of protobuf (a one-fix PING is 128 bytes, *measured*) | 20/s | Event Hubs, batched per edge replica | < 5 ms after commit |
| Stream → engine | XREAD BLOCK per partition, 512 entries at a time | 20/s | 4–6 instances of 1 vCPU (*estimate*) | event lag p99 < 1 s |
| Dispatch → engine → reply | XADD request; Lua holds; SET reply PX 30 s; GET polled every 5 ms | a few/min | about 280 orders/s at peak (*estimate*: 2 orders an hour per online rider at peak) | p99 < 50 ms; dispatch gives up at 300 ms |
| Dispatch → Postgres | INSERT `trip_offer` guarded by the ACTIVE-offer index | per order | per order | as today |

### The feed

`FleetEngineFeed` in integration-service is the only writer of rider events today.

- **PING:** each `/locations` call, built from the statements the call runs anyway (`BACKEND.md`, "Statement budget").
- **REFRESH:** the rider read again from Postgres after offers, an accept, a decline, a trip's end with pay and again once that pay is credited, shift start and end, a break, heading home, a changed choice or an ops status change. It also runs for every rider on a shift every 5 minutes. The rest (an offer withdrawn or lost to another rider, a trip cancelled without pay, ops moves) reaches the engine with the rider's next call, and live dispatch checks the engine's riders against Postgres anyway ("Live").
- **OFFLINE:** sent instead of REFRESH once a rider has no working shift.

It sends only after the change commits, so the engine never sees state that was rolled back. The home spot goes out only while heading home uses it. Every event carries the database time it describes (`at_ms`), and the engine keeps the newest of each part. That makes order of arrival, duplicates and replays harmless. Callers only queue. When 10,000 events are already waiting, the next one is dropped and counted, never waited for.

### Streams

- **Partitions.** 16 rider partitions (the rider id, hashed with FNV-1a and finished with fmix32) and 16 dispatch partitions (the kitchen's block, hashed the same way). The `{rq<p>}` and `{dq<p>}` hash tags keep each stream whole on one Redis shard.
- **Trimming.** Entries are trimmed by age (`XADD ... MINID ~`, 2 minutes on Redis's own clock, read from the entry ids), not by count. So the streams' memory follows the event rate: 165 bytes an entry, *measured*. A stream expires 3 minutes after its last write, so none outlives the feed being switched off.
- **The shared connection.** integration-service's Redis connection also carries auth's checks, so the feed never queues behind it: nothing is sent while it is down, a command not answered in time is cancelled, and after a failure one caller at a time asks again, after 5 s.
- **Leases.** Each engine instance holds leases on its fair share of partitions (6-second leases, renewed every 2 s), counting as alive the instances heard from within one lease time. A Redis stall shorter than a lease costs no partition, and a lease that still names the instance is taken straight back. A taker starts reading 60 s back on rider partitions, which applying newest-wins makes harmless, and 2 s back on dispatch partitions.

### Live state

- **One hash per rider** (`r:{rider}`, 808 bytes with its standing, a hold and its block index, *measured*). It holds the newest fix, the state, the standing and any hold.
- **Lock-free writes.** One Lua script applies an event to the hash: the fix wins by fix time, the state and standing win by `at_ms`. Every write is atomic per key, with no locks and no read-modify-write races. OFFLINE leaves only its time in the hash, so an older event that arrives after it (two after-commit hooks racing, two readers overlapping at a takeover) can't bring the rider back.
- **Block index.** Each rider is indexed in the GEO set of their 0.05° block (`g:{block}`). That key is in another hash slot than the rider's hash, so the script can't write it: the script returns the old and new block, and the same batch then moves the index entry. Every read checks an entry against the rider's hash, so an entry left behind is harmless, and it is removed when found.
- **Only real moves touch the index.** The script asks for a new index position only when the block changes, when the rider is 50 m or more from where the index has them, or once a minute. A read searches 100 m past the radius and then measures from the rider's own newest fix, so a waiting rider's ping costs one Redis command instead of four. Where the index has a rider is stamped on their hash only once the index write has landed, so a rider whose index write failed is indexed again by their next event; a rare race at a block border heals within the minute.
- **One write per batch.** A rider event reader holds its own connection's commands and sends each batch together, which takes a third off the engine's CPU per event (`RedisSetup.Conn.holdWrites`). While it waits it sends again every 20 ms, so a command a cluster node redirects is never left waiting.
- **Holds.** A compare-and-set script on the rider hash. Two block actors never hold one rider for 5 s at once, without a lock between them.

### Live

Dispatch sends a LIVE request to the kitchen block's stream and polls `reply:{request}`:

1. The block's actor ranks the order with the others waiting there.
2. It holds the first riders for this request for 5 s, unless dispatch has stopped waiting by then: a late solve holds nobody.
3. It writes the reply, up to 50 riders in hearing order: held ones first, then spares not held elsewhere.
4. Dispatch keeps the riders Postgres still lets hear of an order (one query: ACTIVE, on a working shift, no break, no trip, no open offer), filters by test mode, applies the cost guard, and inserts the offers in Postgres. A few seconds' lag in the engine's state so never costs an order its round.

Without a reply in 300 ms, dispatch ranks riders itself. After 5 failures in a row it stops asking for 30 s.

## 4. Technology choices

| Need | Chosen | Why | Its limit | Not chosen, and why |
|---|---|---|---|---|
| Live rider state | Redis hashes on the existing Azure Managed Redis | Sub-millisecond; one atomic Lua write per rider, so no locks; TTLs clean up; the cache already exists | RAM, and one shard's CPU per key range | **Aerospike or Cassandra:** another stateful system to run and pay for, with no need yet. Postgres and Redis cover it. |
| Geo index | A GEO set per 0.05° block (about 5.5 × 5.3 km in Hyderabad) | Built into Redis, so nothing to add; blocks shard dispatch too | A fixed size, and cells narrow north of the tropics (fine across India, 8–37° N) | **H3 or S2 now:** a library on both sides for no gain at one resolution. H3 comes with a v2 contract when demand maps need several resolutions (§10). |
| Event transport | Redis Streams | Already there; sub-ms; partitioned by hash tags; replay within the trim | RAM-bound retention (2 minutes); a stream's rate is one shard's | **Kafka or Redpanda run by Craves:** brokers to operate. **Event Hubs (Kafka protocol)** comes at stage 7. |
| Wire format | Protobuf (proto3), hand-coded in integration-service and in the engine, both tested against shared golden bytes | Small (a one-fix PING is 128 bytes); the engine decodes the contract's PING in 194 ns (*measured*); fields can be added without breaking either side | Hand-written codecs must keep matching (the goldens catch any drift) | **JSON:** larger and slower to parse. **Generated code:** a protobuf library in both services for six small messages. protoc's code reads the same bytes (§5), so switching later, or a Kafka consumer in another language, changes nothing on the wire. |
| Engine language | Java 21 and Spring Boot 3.5, its own service | Craves's one backend stack: the same build, image, probes, lock file and release pipeline as every service. A virtual thread per block actor and stream reader. Lettuce, the Redis client Spring Boot already ships, and no other dependency. | A JVM per replica: about half a minute to start on half a vCPU, and 1 GiB of memory | **Go:** Phase 5's first draft. It was lighter, but a second language and toolchain for one service. **Inside integration-service:** it would share that service's memory, pools and deploys with payments and trips. |
| Matching | Exact assignment (augmenting paths, then Hungarian) within a size limit, greedy beyond it or under load | Milliseconds at block scale: 40 orders × 200 riders in 3.0 ms (*measured*); fairest first | Exact work grows as slots² × (riders + slots), capped at 20 million | **OR-Tools or a VRP solver:** a dependency for routes Craves doesn't run yet (one order per trip, offers one at a time). |
| System of record | Postgres (existing) | Correctness in one place: one ACTIVE offer per rider, pay locked on the offer, the ledger | Write rate (§2, rows 1 and 4) | **The engine deciding offers:** its state is a cache, so the last word stays where the money is. |
| Compute | Azure Container Apps, the existing environment | Same as every Craves service; per-app scale | Core quota per environment | **AKS:** a cluster to run. |
| Service events | Service Bus (existing) for domain events such as an order ready for pickup | Already wired | Not built for GPS rates | |
| Logs and metrics | Log Analytics: `FLEET_ENGINE_STATS` once a minute, `FLEET_ENGINE_SHADOW` per order; Micrometer at `/actuator/metrics` | No new service needed | Minute resolution in the logs | |

## 5. The event schema

`contracts/proto/craves/fleet/v1/fleet.proto` is the source of truth. Both sides test against its golden bytes and partition vectors in `testdata`. Code that protoc generates from the file decodes the same six golden messages with no unknown field and writes them back byte for byte (checked by hand on 28 Oct 2026).

```proto
message RiderEvent {                   // stream rq:{rq<p>}, p = hash32(rider_id) mod 16
  enum Kind { KIND_UNSPECIFIED = 0; PING = 1; REFRESH = 2; OFFLINE = 3; }
  bytes rider_id = 1; Kind kind = 2;
  int64 at_ms = 3;                     // database time of the facts: the newest wins
  repeated Fix fixes = 4;              // PING: the call's usable fixes
  RiderState state = 5;                // PING, REFRESH
  Standing standing = 6;               // REFRESH: the day so far, for fair turns
}
message Fix { double lat = 1; double lng = 2; int64 at_ms = 3; bool mock = 4; float accuracy_m = 5; }
message RiderState {                   // what FleetDispatcher.nearbyRiders reads
  bytes shift_id = 1; int64 shift_ends_ms = 2; bool active = 3; bool on_trip = 4;
  int64 offered_until_ms = 5; int64 break_until_ms = 6; bool cannot_ring = 7;
  int32 max_pickup_m = 8; int32 max_drop_m = 9; bool has_home = 10; double home_lat = 11; double home_lng = 12;
  int64 heading_home_until_ms = 13; bool test_allowed = 14; int64 seen_ms = 15; Fix last_fix = 16;
  int64 offered_from_ms = 17;
}
message Standing { int32 ist_day = 1; int64 earned_paise = 2; int64 online_seconds = 3; bool accruing = 4;
                   int64 free_since_ms = 5; }
message DispatchRequest {              // stream dq:{dq<p>}, p = hash32(kitchen block) mod 16
  enum Mode { MODE_UNSPECIFIED = 0; SHADOW = 1; LIVE = 2; }
  bytes request_id = 1; Mode mode = 2; bytes order_id = 3; int64 at_ms = 4; int64 deadline_ms = 5;
  double kitchen_lat = 6; double kitchen_lng = 7; double drop_lat = 8; double drop_lng = 9; int32 drop_m = 10;
  Policy policy = 11; repeated bytes exclude = 12; repeated Candidate java_ranked = 13; int32 round = 14;
}
message Policy { int32 radius_m = 1; int32 detour_percent = 2; int32 offers_at_once = 3; int32 fair_band_m = 4;
                 int32 offer_seconds = 5; bool rider_choices = 6; bool joint = 7; }
message Candidate { bytes rider_id = 1; double straight_line_m = 2; double lat = 3; double lng = 4; bool in_band = 5;
                    int64 per_hour_paise = 6; int64 free_since_ms = 7; int32 home_nearer_m = 8; bool held = 9; }
message DispatchReply {                // SET reply:{<request id hex>} PX 30000
  enum Solver { SOLVER_UNSPECIFIED = 0; SINGLE = 1; EXACT = 2; GREEDY = 3; }
  bytes request_id = 1; repeated Candidate riders = 2; int32 batch_orders = 3; Solver solver = 4; int64 solved_at_ms = 5;
}
```

Rules that keep it safe:

- **Newest wins, per part.** The fix wins by fix time; the state and the standing win by `at_ms`. An OFFLINE newer than the state removes the rider. Replays and duplicates change nothing.
- **Evolution.** Add fields with new numbers and never reuse one. Both decoders skip unknown fields, so a newer writer never breaks an older reader. A meaning that changes needs a `v2` package and both sides moving together.
- **Partitions and blocks** are part of the contract: `vectors.json` pins them for both sides.

## 6. Capacity

Assumptions (*estimate*):

- up to the large-city row, one rider event per call, a call every 10 s;
- at the 500,000 target, every fix (one every 3 s) is its own event. That is the brief's figure and the worst case: today's app sends a trip's 3-second fixes together every 15 s;
- 2 orders an hour per online rider at peak;
- engine CPU per event, from the benchmarks above: 11 µs for a waiting rider, 20 µs for one whose index moves.

| Stage | Riders online | Rider events/s | Peak orders/s | Redis memory | Engine instances | Transport |
|---|---|---|---|---|---|---|
| Pilot | 200 | 20 | 0.1 | < 1 MB | 1 | Redis Streams on the shared cache |
| City | 5,000 | 500 | 3 | 4 MB state + 10 MB streams | 1 | Redis Streams on the shared cache |
| Large city | 50,000 | 5,000 | 30 | 40 MB state + 99 MB streams | 1–2 | Redis Streams on the engine's own cache (stage 5) |
| National | 500,000 at a fix every 3 s | 166,667 | 280 | 404 MB state (streams move out) | 4–6 of 1 vCPU, behind a sharded cache | Event Hubs (stage 7) |
| Beyond the brief | 5,000,000 at a fix every 3 s | 1,666,667 | 2,800 | 4.0 GB state | about 40 of 1 vCPU, with 64 partitions a family | Event Hubs Premium or Dedicated (stage 7) |

### Memory

Here is how the memory column is worked out:

- **State:** riders × 808 bytes (*measured*: hash, standing, hold and block index).
- **Streams:** events per second × 120 s kept × 165 bytes per entry (*measured* for a one-fix PING; a trip's call with 5 fixes is about 300 bytes).

At the national row, two minutes of streams would be 3.3 GB. That is why stage 7 moves rider events to Event Hubs and Redis keeps only state.

The shared cache's 0.5 GB holds the pilot and a city with room to spare, and it must stay far from full (§8). The engine gets its own cache before memory, rather than CPU, sets the pace (stage 5).

**Throughput at the national row** (*estimate*):

- **Engine CPU.** With the mix below (a third of riders moving, their index moving every third fix), an event averages 12.5 µs: 166,667 events/s is about 2.1 vCPUs, and 3.3 if every event moved its rider's index. That is 4 instances of 1 vCPU at 50 to 80%, and 6 leave room for a failover.
- **Redis CPU.** An event costs 1 Redis command (the apply script) while the rider stays within 50 m of where the block index has them, and 4 when it moves them (GEOADD and PEXPIRE on the block's index, then the stamp on the rider's hash). With two thirds of riders waiting (re-indexed once a minute) and a third on trips at 20 km/h (re-indexed every third fix), that is about 1.4 an event, or 240,000 commands a second (*estimate*). That needs a cache with several shards, such as a Compute Optimized size, whose vCPU-to-shard ratio Microsoft lists for illustration only [1].
- **Event Hubs.** At this rate, Standard needs batching. Each edge replica packs about 100 fixes into one Event Hubs event, which gives about 1,700 events and 20 MB a second: about 20 throughput units, within Standard's 40 and 32 partitions [3]. Premium raises partitions to 100 per event hub.
- **Dispatch is not the limit.** 280 orders a second spread over hundreds of blocks, and one block actor ranks about 1,700 a second, at about 0.5 ms of CPU an order.
- **At 5 million riders** the same arithmetic gives 21 to 33 vCPUs of engine (about 40 instances of 1 vCPU, which needs 64 partitions a family, since an instance needs a partition to work), about 2.4 million Redis commands a second (a cache with many shards, or several caches by region), and about 200 MB a second into Event Hubs (Premium or Dedicated, sized by a load test). The design doesn't change; only the numbers do.

## 7. Matching

This is the vehicle-routing problem sharded by space.

- **Blocks own orders.** Every order goes to the stream of its kitchen's 0.05° block, so one engine instance, and inside it one virtual thread, owns each block. That actor ranks the orders waiting in its block together: whatever arrived while it worked forms the next batch, up to 64. Blocks run in parallel and share nothing while they rank. With joint off, a batch is served first come: each order, in arrival order, takes its first riders not taken by an earlier one. That alone ends the lost round of §2, row 3.
- **Riders cross borders.** An order looks at every block its radius touches. Two actors may both want a rider near a border. The hold, a compare-and-set on the rider's own hash, gives the rider to the first for 5 s, and the second takes the next rider.
- **The rules are dispatch's.** `Rules.rank` is ported from `FleetDispatcher` and checked against its numbers, distances included (bit-identical at city scale). That covers who may hear of an order (shift, break, trip, open offer, heard from in 45 s, a real fix under 3 minutes old, a phone that can ring, distance choices, heading home) and the order they hear in (nearest first, or fair turns in the band). Declines, ratings and history play no part.
- **Joint sharing out,** with `CRAVES_FLEET_ENGINE_JOINT` and 14 days' notice, works in this order:
  1. every order gets one rider before any order gets a second, and as many orders as possible get one (augmenting paths);
  2. riders join in fair-turn order, so among those ways the fairest riders are chosen (a matroid greedy), then more riders inside the fair bands;
  3. the riders chosen are re-seated for the shortest rides, each order keeping its count (the Hungarian method);
  4. the places left go to the other riders by the fewest metres, again every order once before any twice (a min-cost matching). Without fair turns, that one matching does all of it.
- **Time limits.** The exact method runs while its estimated work stays within 20,000,000: slots² × (riders + slots), plus orders × riders² for the augmenting paths when there are fair bands. Above that, or with 128 or more orders queued in a block, a greedy method shares out instead: still every order once before any twice, fair-turn riders first, then the orders with the fewest riders to choose from. A live request past its deadline is skipped, because dispatch has already ranked it itself.
- **Not built yet** (`DISPATCH.md` §9): offers timed to the food, which wait for the prep-time model (§10), and two orders on one trip, which wait for their own trigger and use the same model to know when the cooking leaves room.

## 8. Failures, backpressure and degradation

| Failure | What happens | Riders and customers notice |
|---|---|---|
| An engine instance dies | Its leases lapse within 6 s, and the others take its partitions at their next round (2 s) and replay a minute of rider events. Live requests meanwhile fall back after at most 300 ms. | Nothing |
| Every engine instance is down | After 5 failures, dispatch stops asking for 30 s and logs `CRAVES_ALERT alert=FLEET_ENGINE_PAUSED`; Java ranks riders. | Nothing; offers as before Phase 5 |
| Redis restarts or is patched (high availability is off in its template, so there is no replica and its data is lost) | The feed drops events (counted), live falls back, the engine reports not ready. Lettuce reconnects by itself and refreshes the cluster's slot map on a redirect and every 30 s, so a node that moved is found at once. Afterwards pings rebuild online riders within the minute, and the 5-minute sweep restores standings. | Nothing from the engine |
| The cache nears full | VolatileLRU would drop keys that have an expiry, auth's revocation keys among them. So this is prevented, not handled: streams trimmed by age, an expiry on every other engine key, and Used Memory Percentage under 50% before each step (`GO-LIVE.md` §9) | Prevented |
| integration-service or Postgres down | No dispatch, as today: Phase 5 adds no dependency on that path | As today |
| A bad engine release | `CRAVES_FLEET_ENGINE_MODE=off`: dispatch is Java's with integration-service's next revision | Nothing |
| A zone goes down | Redis has no replica, so it may be down until Azure restores it, and live falls back as when the engine is down. The engine's replicas restart on another zone's nodes if the environment has zone redundancy (check before stage 9). | Nothing from the engine |
| The region goes down | Craves runs only in Central India today, so dispatch stops with everything else. Stage 9 adds a second region. | As today |
| A phone goes offline | The native outbox keeps fixes up to an hour and sends 20 a call. Each fix is timed by the database clock (`ageMs`). The engine keeps the newest by fix time. With no real fix for 3 minutes, a rider is not offered orders (Java and the engine alike). | Nothing new |

**Backpressure, from the phone in.** Each point bounds what it takes and sheds the rest, so nothing waits forever:

| Point | Bound |
|---|---|
| The phone | 20 fixes a call; kept for an hour |
| The gateway | Rate limits |
| integration-service's pool | 8 connections |
| The feed's queue | 10,000 events, then drop and count |
| The streams | 2 minutes by age |
| A block's queue | 512 requests: shed past that, and greedy matching from 128 |
| The engine's input | A request out of bounds (a negative number of riders, a radius past 50 km) is dropped as malformed; a batch that throws is dropped and logged, and every other block carries on |
| Live dispatch | 300 ms, then the 30 s pause |

**The degradation ladder.** Each rung is safe on its own:

1. Joint exact matching (switch on)
2. Joint greedy (a busy or big block)
3. First come in the engine (joint off)
4. Java's own ranking (engine slow, down or paused)
5. Couriers: Borzo, then Pidge (no rider took it)
6. The ops queue

## 9. Payments at scale

The money design in `BACKEND.md` ("Money") is already built to grow. These rules stay at every size:

- pay is credited only after the trip's commit, idempotent by `business_event_key`;
- the ledger is append-only and every journal balances;
- `RIDER_PAYABLE` equals pay minus payouts that reached a bank and stayed there;
- a person approves every payout file;
- no money moves by itself: `CRAVES_FLEET_PAYOUT_EXECUTION_ENABLED` stays false and RazorpayX is not used.

| What | Today | At scale | Trigger |
|---|---|---|---|
| Credits | One transaction per trip once it ends, from `FleetTripPayFinalized`: a `rider_earning` row and a journal per pay line, with the money job retrying | 500,000 riders × about 15 trips a day is about 7.5 million trip credits a day, about 3 pay lines each: about 90 credits a second on average and 300 at peak (*estimate*). That fits Postgres with `rider_earning` and the journal partitioned by month. | Credit lag past 5 minutes |
| Balances | Computed by query on demand | A per-rider running balance, written in the credit's own transaction and checked nightly against the ledger | A balance query over 50 ms |
| Payout files | One weekly file and one daily withdrawal file; maker and checker; uploaded by hand | Split into files of the bank's row limit, each approved the same way | The bank's per-file limit (ask the bank) |
| Paying riders the same day | A daily withdrawal, paid by 13:00 | Payouts through a bank API (IMPS or UPI), with the payout id as the idempotency key so nothing is ever sent twice; failures pause the account as today | Ops spends more than a day a week on files, and the CA, the lawyer and the bank agree; it needs its own review |
| Reconciliation | Daily, by hand: every UTR matched to a payout | Import the bank statement (CSV or MT940) and match UTR and amount automatically; a person handles only the mismatches | 500 payouts a week |
| TDS | Per credit, at the CA's rate, off until set | The same, with Form 16A figures from the ledger | |
| Fraud | Maker and checker; the checker looks at every payout account changed in the last 7 days; a failed payout pauses the account | The same rules, as rules a person reads; no hidden scores (`DISPATCH.md` §10) | |

## 10. Models

Models predict food and roads, never people. Craves builds no rider score of any kind (`DISPATCH.md` §10). Every model:

- starts in shadow, with its predictions compared to what happened for two weeks;
- goes live behind its own switch;
- can be turned off, after which dispatch uses today's rules.

| Model | Predicts | Data already captured | Used for | Served as | Starts when |
|---|---|---|---|---|---|
| Prep time | Minutes from the chef accepting to the food being ready, per kitchen (p50 and p80) | The chef's accept time (order-service), `chef_ready.ready_at`, `trip.arrived_kitchen_at`, `trip.chef_handed_over_at`, items count, hour and weekday | Offers timed to the food, and the wait shown to riders (`DISPATCH.md` §9) | A table of kitchen × hour of the week in Redis, read by the engine; retrained weekly by quantile gradient boosting | `DISPATCH.md` §9's trigger (most kitchens over 10 minutes' median wait for two weeks), with about 2,000 orders that have a ready tap |
| Travel time | Minutes from one block to another by hour of the week | `trip_track` (on-trip fixes), trip events (picked up, arrived), the Ola road distance | The offer's estimated minutes (today (pickup m + drop m) ÷ 333, rounded up, + 5) and customer ETAs | A median speed per block pair and hour, plus a small correction model | 1,000 delivered trips |
| Demand | Orders per block per 15 minutes | Orders (order-service) and their kitchens | Ops slot planning. Riders may be shown busy times as information only: no surge to stay, no penalty. | A seasonal model by weekday × hour × block, with holidays | 8 weeks of orders |

- **Pipeline.** Today the data is in Postgres. From stage 8, Event Hubs Capture lands it in the data lake as Parquet.
  - A scheduled job trains the models and writes versioned tables, published like rate cards.
  - The engine reads them; no model runs in the dispatch path, so there is no Python there and no added latency.
  - Weekly error reports cover each kitchen and block, with an alert when error drifts past the shadow baseline.
- **Data protection.** Trip positions are kept 90 days (blueprint E6). Models train on aggregates by block and hour, never on a person, and no personal data goes into a model.

## 11. Switches and settings

### Switches

All are off by default. People flip them in the order of `GO-LIVE.md` §9.

| Switch | Off | On |
|---|---|---|
| integration-service `CRAVES_FLEET_ENGINE_MODE` | `off`: nothing is written to Redis | `shadow`: the engine compares and logs. `live` (with the dispatch policy live and road ranking off): dispatch asks the engine first. |
| integration-service `CRAVES_FLEET_ENGINE_JOINT` | Orders asked together in a block are served first come: each takes its first riders not taken by an earlier one | Orders asked together in a block are shared out together: a rules change, so 14 days' notice first |
| `infra/fleet-engine` `deployEngine` | No app | The engine's container app |

### Settings

The integration-service side is in `BACKEND.md` ("Flags and settings"); the engine side is in `services/fleet-engine/README.md`. Three must match on both sides:

- the rider partitions (16);
- the dispatch partitions (16);
- the key prefix (`craves:fleet:`).

The engine reads the same Redis URL as integration-service (`FLEET_ENGINE_REDIS_URL`).

## 12. Watching the engine

| Line or metric | Where | Healthy |
|---|---|---|
| `FLEET_ENGINE_FEED pings=… refreshes=… offline=… shadows=… failed=… dropped=… queued=…` | integration-service, once a minute while there is traffic | `failed` and `dropped` 0; `queued` near 0 |
| `FLEET_ENGINE_STARTED … redisShards=…` | engine, at start (`NAME key=value`, as every engine line) | `redisShards=1` while integration-service's Redis client is standalone |
| `FLEET_ENGINE_STATS` | engine, once a minute, each figure for that minute | `riderEventLagP99Ms` under 1,000; `replyP99Ms` under 50; `expired`, `shed`, `malformed` and `failed` near 0; `jointChanged` for `CRAVES_FLEET_ENGINE_JOINT` (`GO-LIVE.md` §9, step 6). Percentiles are bucket bounds (1, 2, 5, 10, 20, 50, 100 ms and up); anything past 10 s reads 10,000. |
| `FLEET_ENGINE_SHADOW … agree=…`: `same`, `same_set` or `differ` | engine, per ranked order and round | `differ` under 2% of first rounds, each one explained |
| `FLEET_ENGINE_FALLBACK`, `FLEET_ENGINE_FOUND_NOBODY`, `FLEET_ENGINE_STALE` | integration-service | A few a day at most; FOUND_NOBODY none; STALE now and then (a rider who changed in the last seconds) |
| `CRAVES_ALERT alert=FLEET_ENGINE_PAUSED` | integration-service | Never; when it appears, read the engine's log |
| Used Memory Percentage | the cache, in the portal (an Azure Monitor alert at 50% is worth adding) | Under 50% |
| `/actuator/metrics` | engine, Micrometer (`fleet.engine.*`), inside the container | for a scraper, when one is added |

A Log Analytics query for the minute figures:

```kusto
ContainerAppConsoleLogs_CL
| where ContainerAppName_s == "ca-craves-fleet-engine-prodlow" and Log_s has "FLEET_ENGINE_STATS"
| extend lag = todouble(extract('riderEventLagP99Ms=([0-9]+)', 1, Log_s)), reply = todouble(extract('replyP99Ms=([0-9]+)', 1, Log_s))
| summarize max(lag), max(reply) by bin(TimeGenerated, 15m)
```

## 13. When to grow

| Stage | Trigger, measured | Change | Who |
|---|---|---|---|
| 1. Shadow | The engine is deployed and logs `redisShards=1` | `CRAVES_FLEET_ENGINE_MODE=shadow` | A person (`GO-LIVE.md` §9) |
| 2. Live | Shadow passes (`GO-LIVE.md` §9: 7 days, 100 ranked orders, `differ` under 2%) and the dispatch policy is live | `CRAVES_FLEET_ENGINE_MODE=live` | A person |
| 3. Joint | `jointChanged` (orders whose riders sharing out together would change, against first come; counted in shadow and live) on 5% of peak orders for two weeks | `CRAVES_FLEET_ENGINE_JOINT=true` after 14 days' notice | A person, with the lawyer |
| 4. More engine instances | Rider event lag p99 over 1 s, or engine CPU over 70% | `replicas` 2–4 in the template; past 4, a higher cap in the template; past 16, more partitions (16 to 64) on both sides, since an instance needs a partition to work | A person; partition counts change on both sides together, in shadow |
| 5. The engine's own Redis | Engine memory over 100 MB, used memory over 50%, or a shard count over 1 | A cache of the engine's own (Compute Optimized, OSS clustering, high availability on; VolatileLRU suits it, since a dropped rider key comes back with the next ping), and a second Redis connection in integration-service for it: in cluster mode (`spring.data.redis.cluster.nodes`), or plain with the Enterprise clustering policy, which looks unsharded to clients [1] | Engineering, then a person |
| 6. Ingest edge | 5,000 riders online, `/locations` p99 over 200 ms, Postgres CPU over 60% at peak, or APIM capacity over 60% | A Java ingest service behind Front Door (Spring Boot on virtual threads, like the engine): the same token checks; fixes to streams or Event Hubs; integration-service only for shift and trip changes | Engineering |
| 7. Event Hubs for rider events | 20,000 rider events a second, or a replay longer than 2 minutes needed | Event Hubs Standard (about 20 TUs, batched) or Premium; the engine reads it with a Kafka client (its first dependency, by case) | Engineering |
| 8. GPS history off Postgres | 2,000 `trip_track` rows a second | Event Hubs Capture to the data lake; Azure Data Explorer for queries and disputes; Postgres keeps trip events | Engineering |
| 9. A second region | A second city far from Central India, or an availability target past one region | The engine per region (its state rebuilds from pings within a minute); Postgres geo-replica; Front Door routing | Engineering and Gopi |

## Sources

1. Microsoft, "Azure Managed Redis architecture": sharding, clustering policies, vCPU-to-shard ratios (illustrative), single-shard small instances. https://learn.microsoft.com/azure/redis/architecture
2. Microsoft, "What is Azure Managed Redis?": sizes per tier (Balanced from 0.5 GB) and client connections per size. https://learn.microsoft.com/azure/redis/overview
3. Microsoft, "Azure Event Hubs quotas and limits": Standard 1 MB/s or 1,000 events/s per TU, 40 TUs, 32 partitions; Premium 100 partitions per event hub, 16 PUs. https://learn.microsoft.com/azure/event-hubs/event-hubs-quotas
4. Microsoft, "Quotas for Azure Container Apps": cores per environment. https://learn.microsoft.com/azure/container-apps/quotas
5. Microsoft, "Capacity of an Azure API Management instance". https://learn.microsoft.com/azure/api-management/api-management-capacity
6. Craves: `DISPATCH.md` (the rules and promises), `BACKEND.md` (the code paths), `GO-LIVE.md` §9 (the steps), `services/fleet-engine` (benchmarks: `EngineBenchmarkTest`), `infra/prodlow-rebuild/main.bicep` (the cache's settings) and `infra/redis/README.md` (why revocation keys must not be evicted).
