# Craves fleet engine

The rider dispatch engine for Craves riders, in Java 21 and Spring Boot like the other Craves services. The design, the numbers and the switches are in [`docs/riders/SCALE.md`](../../docs/riders/SCALE.md); this page is for running it.

## What it does

- **Live rider state.** It reads the rider events integration-service writes to Redis Streams on every `/locations` call and every change (an offer, a trip, a break, a shift). It keeps each online rider's position, availability and fair-turn standing in Redis. Every write is one Lua script on that rider's key: newest wins, no locks.
- **Matching.** It ranks riders for orders by Craves's rules, ported from `FleetDispatcher` and tested against the same numbers: free declines, fair turns within a band, the riders' distance limits and heading home.
  - Each 0.05° block (about 5.5 km) has one actor: a virtual thread with a bounded queue. All blocks run in parallel.
  - An actor ranks the orders waiting in its block together and shares the riders out, so no rider is proposed twice. It uses the Hungarian method, and falls back to greedy past a size limit or under load.
- **Shadow or live.**
  - In shadow it only compares its choices with the Java dispatcher's, and logs `FLEET_ENGINE_SHADOW`.
  - Live, it holds the chosen riders for a few seconds and writes a reply. integration-service then makes the offers in Postgres, which keeps the last word: one ACTIVE offer per rider.
- **Input it can't use** (a request out of bounds, a batch that throws) is counted and dropped, and the other blocks and partitions carry on. Lettuce follows a Redis failover and the cluster's slot map by itself, and the engine reconnects after Redis restarts.
- **Logs.** One line per event, `NAME key=value …`, as the other Craves services log. `FLEET_ENGINE_STATS` comes once a minute, each figure covering that minute (`docs/riders/SCALE.md`, "Watching the engine").

**Dependencies:** Spring Boot (web, actuator) and Lettuce, the Redis client Spring Boot already ships. The protobuf codec (`wire/Wire.java`) is hand-written, and checked against `protoc` with the golden files in `contracts/proto/craves/fleet/v1/testdata`.

## Run it

```bash
cd services/fleet-engine
mvn -B -ntp verify                                   # needs redis-server on PATH: the tests start their own, one node and a 3-node cluster
FLEET_ENGINE_REDIS_URL=redis://localhost:6379 mvn spring-boot:run
curl localhost:8080/actuator/health/readiness        # UP once Redis answers
curl localhost:8080/actuator/metrics/fleet.engine.dispatch.requests
docker build -t fleet-engine .
```

Without `redis-server`, the Redis tests are skipped rather than failed. CI installs it, so they always run there.

## Settings

| Variable | Default | What |
|---|---|---|
| `FLEET_ENGINE_REDIS_URL` | (required) | `rediss://:<access key>@<host>:10000` in production: the same value as integration-service's `SPRING_DATA_REDIS_URL`, so both use one secret. It must be `rediss://` (TLS) when `CRAVES_ENVIRONMENT` starts with `prod`. A single node or a cluster is detected by itself. |
| `CRAVES_ENVIRONMENT` | empty | `prodlow` in production (`infra/fleet-engine/main.bicep`). It turns on the TLS check above and the live runtime lock. |
| `FLEET_ENGINE_RIDER_PARTITIONS`, `_DISPATCH_PARTITIONS` | `16` | Must equal integration-service's `CRAVES_FLEET_ENGINE_RIDER_PARTITIONS` and `_DISPATCH_PARTITIONS`. |
| `FLEET_ENGINE_KEY_PREFIX` | `craves:fleet:` | Must equal `CRAVES_FLEET_ENGINE_KEY_PREFIX`. |
| `FLEET_ENGINE_HOLD_MS` | `5000` | How long a live reply's riders are kept for their order. |
| `FLEET_ENGINE_EXACT_LIMIT` | `20000000` | Above this estimate of a batch's work, riders are shared out greedily. The estimate is slots² × (riders + slots), plus orders × riders² with fair bands. |
| `FLEET_ENGINE_MAX_BATCH`, `_QUEUE_SIZE`, `_OVERLOAD_QUEUE` | `64`, `512`, `128` | Orders ranked together; orders a block may queue before new ones are shed; queued orders that switch the block to greedy. |
| `FLEET_ENGINE_REPLY_RIDERS` | `50` | The most riders a live reply lists. |
| `FLEET_ENGINE_RIDER_TTL_MS` | `1800000` | How long a quiet rider's state is kept. |
| `FLEET_ENGINE_LEASE_MS`, `_REPLAY_MS` | `6000`, `60000` | The partition lease length; how far back a reader that takes over a partition starts. |
| `FLEET_ENGINE_INSTANCE` | the host name | This instance's name in the leases (on Container Apps, the replica's name). |
| `JAVA_TOOL_OPTIONS` | `-XX:MaxRAMPercentage=70 -XX:+ExitOnOutOfMemoryError` | Set in the image, as for the other services: about 700 MiB of heap in the 1 GiB container. |

A bad value stops the start, with every problem named. The Redis URL is never logged, because it holds the access key.

## Where things are

| Package (`in.craves.fleetengine`) | Does |
|---|---|
| `wire` | The protobuf events of `contracts/proto/craves/fleet/v1/fleet.proto`, hand-encoded; partitions and blocks |
| (root) | Settings, the Redis connection (`RedisSetup`: TLS with SNI, cluster or not), start and stop (`EngineRunner`), the minute's stats line |
| `live` | The live state in Redis: newest-wins writes, the block index, holds, replies |
| `lease` | Partition leases, shared fairly among instances |
| `ingest` | Stream readers (XREAD BLOCK) and the rider event writer |
| `rules`, `geo` | Craves's dispatch rules and distances, as integration-service computes them |
| `assign` | Sharing riders out among orders ranked together: exact, or greedy under load |
| `dispatch` | The block actors, live replies and shadow comparisons |
| `support` | Latency histograms for the stats line |
