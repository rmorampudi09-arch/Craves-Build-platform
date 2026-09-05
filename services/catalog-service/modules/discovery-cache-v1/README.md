# Craves Catalog Discovery Cache v1

## Scope

Optional Redis cache-aside acceleration for public nearby kitchen/menu discovery. The database remains authoritative and correctness does not depend on Redis.

## Runtime files

- `src/main/java/in/craves/catalog/config/DiscoveryCacheProperties.java`
- `src/main/java/in/craves/catalog/service/DiscoveryCacheService.java`
- `src/main/java/in/craves/catalog/web/NearbyDiscoveryController.java`
- `src/main/java/in/craves/catalog/web/KitchenController.java`
- `src/main/java/in/craves/catalog/web/KitchenScheduleController.java`
- `src/main/resources/application.yml`

## Behavior

Cache is disabled by default. When enabled, responses are stored using a short TTL and a generation-scoped SHA-256 cache key. Kitchen/menu/schedule mutations increment the generation, immediately making older keys unreachable without scanning Redis.

If Redis is unavailable, the cache is bypassed for a short backoff period and the authoritative PostgreSQL/PostGIS query is executed. No customer action is blocked because of cache failure.

## Environment variables

```text
CRAVES_DISCOVERY_CACHE_ENABLED=false
CRAVES_DISCOVERY_CACHE_TTL_SECONDS=120
CRAVES_DISCOVERY_CACHE_FAILURE_BACKOFF_SECONDS=30
CRAVES_DISCOVERY_CACHE_KEY_PREFIX=craves:catalog:discovery
CRAVES_REDIS_HEALTH_ENABLED=false
```

Do not enable the cache until the approved production Redis endpoint/runtime Spring Redis settings are already present. This module does not provision Redis.

## Metrics

```text
craves.discovery.cache.hit
craves.discovery.cache.miss
craves.discovery.cache.error
craves.discovery.cache.invalidation
```

## Privacy

The public-privacy feature flag is part of every discovery cache key. Turning privacy enforcement on cannot reuse a cache entry created while privacy enforcement was off.

## Test

```bash
cd services/catalog-service
mvn -B -ntp clean verify
```

Key tests include `DiscoveryCacheServiceTest` and discovery/controller validation tests.

## Production validation

After later enabling cache, verify cache hit ratio, Catalog p95 latency, PostgreSQL query rate, Redis error count and stale-data behavior after a chef updates menu availability or schedule.

## Rollback

Set `CRAVES_DISCOVERY_CACHE_ENABLED=false`. No database rollback is required.
