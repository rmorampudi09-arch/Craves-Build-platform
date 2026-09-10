package in.craves.catalog.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.catalog.config.DiscoveryCacheProperties;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Service
public class DiscoveryCacheService {
    private static final Logger log = LoggerFactory.getLogger(DiscoveryCacheService.class);

    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;
    private final DiscoveryCacheProperties properties;
    private final Counter hitCounter;
    private final Counter missCounter;
    private final Counter errorCounter;
    private final Counter invalidationCounter;

    private volatile long suppressedUntilEpochMillis;

    public DiscoveryCacheService(
        StringRedisTemplate redis,
        ObjectMapper objectMapper,
        DiscoveryCacheProperties properties,
        MeterRegistry meterRegistry
    ) {
        this.redis = redis;
        this.objectMapper = objectMapper;
        this.properties = properties;
        this.hitCounter = meterRegistry.counter("craves.discovery.cache.hit");
        this.missCounter = meterRegistry.counter("craves.discovery.cache.miss");
        this.errorCounter = meterRegistry.counter("craves.discovery.cache.error");
        this.invalidationCounter = meterRegistry.counter("craves.discovery.cache.invalidation");
    }

    public <T> T getOrLoad(String logicalKey, Class<T> responseType, Supplier<T> loader) {
        if (!cacheAvailable()) {
            return loader.get();
        }

        String key;
        try {
            key = versionedKey(logicalKey);
            String cached = redis.opsForValue().get(key);
            if (cached != null) {
                try {
                    T value = objectMapper.readValue(cached, responseType);
                    hitCounter.increment();
                    return value;
                } catch (JsonProcessingException malformedCacheEntry) {
                    errorCounter.increment();
                    log.warn("Ignoring malformed discovery cache entry key={}", key);
                    redis.delete(key);
                }
            }
            missCounter.increment();
        } catch (RuntimeException redisFailure) {
            suppress(redisFailure);
            return loader.get();
        }

        T loaded = loader.get();
        if (!cacheAvailable()) {
            return loaded;
        }

        try {
            String serialized = objectMapper.writeValueAsString(loaded);
            redis.opsForValue().set(
                key,
                serialized,
                Duration.ofSeconds(properties.getTtlSeconds())
            );
        } catch (JsonProcessingException serializationFailure) {
            errorCounter.increment();
            log.warn("Discovery response could not be serialized for cache type={}", responseType.getSimpleName());
        } catch (RuntimeException redisFailure) {
            suppress(redisFailure);
        }
        return loaded;
    }

    public void invalidateAllDiscovery() {
        if (!properties.isEnabled()) {
            return;
        }
        try {
            redis.opsForValue().increment(generationKey());
            invalidationCounter.increment();
            suppressedUntilEpochMillis = 0L;
        } catch (RuntimeException redisFailure) {
            suppress(redisFailure);
        }
    }

    public boolean isEnabled() {
        return properties.isEnabled();
    }

    private boolean cacheAvailable() {
        return properties.isEnabled() && System.currentTimeMillis() >= suppressedUntilEpochMillis;
    }

    private String versionedKey(String logicalKey) {
        String generation = redis.opsForValue().get(generationKey());
        if (generation == null || generation.isBlank()) {
            generation = "0";
        }
        return properties.getKeyPrefix() + ":v" + generation + ":" + sha256(logicalKey);
    }

    private String generationKey() {
        return properties.getKeyPrefix() + ":generation";
    }

    private void suppress(RuntimeException failure) {
        errorCounter.increment();
        suppressedUntilEpochMillis = System.currentTimeMillis()
            + Duration.ofSeconds(properties.getFailureBackoffSeconds()).toMillis();
        log.warn(
            "Discovery cache temporarily bypassed for {} seconds because Redis is unavailable: {}",
            properties.getFailureBackoffSeconds(),
            failure.getClass().getSimpleName()
        );
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is not available", impossible);
        }
    }
}
