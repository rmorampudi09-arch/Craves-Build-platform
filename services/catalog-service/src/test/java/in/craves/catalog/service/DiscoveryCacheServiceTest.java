package in.craves.catalog.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.catalog.config.DiscoveryCacheProperties;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

class DiscoveryCacheServiceTest {
    private StringRedisTemplate redis;
    private ValueOperations<String, String> values;
    private DiscoveryCacheProperties properties;

    @SuppressWarnings("unchecked")
    @BeforeEach
    void setUp() {
        redis = mock(StringRedisTemplate.class);
        values = mock(ValueOperations.class);
        when(redis.opsForValue()).thenReturn(values);
        properties = new DiscoveryCacheProperties();
    }

    @Test
    void disabledCacheNeverTouchesRedis() {
        DiscoveryCacheService service = service();
        AtomicInteger loads = new AtomicInteger();

        TestPayload result = service.getOrLoad(
            "kitchens|17.4|78.4",
            TestPayload.class,
            () -> new TestPayload("database-" + loads.incrementAndGet())
        );

        assertThat(result.value()).isEqualTo("database-1");
        verify(redis, never()).opsForValue();
    }

    @Test
    void enabledCacheReturnsExistingGenerationScopedEntryWithoutCallingLoader() {
        properties.setEnabled(true);
        when(values.get(anyString())).thenAnswer(invocation -> {
            String key = invocation.getArgument(0, String.class);
            return key.endsWith(":generation") ? "7" : "{\"value\":\"cached\"}";
        });
        DiscoveryCacheService service = service();
        AtomicInteger loads = new AtomicInteger();

        TestPayload result = service.getOrLoad(
            "menu-items|17.4|78.4|VEG",
            TestPayload.class,
            () -> new TestPayload("database-" + loads.incrementAndGet())
        );

        assertThat(result.value()).isEqualTo("cached");
        assertThat(loads.get()).isZero();
    }

    @Test
    void redisFailureFallsBackToAuthoritativeLoader() {
        properties.setEnabled(true);
        when(values.get(anyString())).thenThrow(new IllegalStateException("redis unavailable"));
        DiscoveryCacheService service = service();

        TestPayload result = service.getOrLoad(
            "kitchens|17.4|78.4",
            TestPayload.class,
            () -> new TestPayload("database")
        );

        assertThat(result.value()).isEqualTo("database");
    }

    @Test
    void invalidationAdvancesGenerationWithoutScanningKeys() {
        properties.setEnabled(true);
        DiscoveryCacheService service = service();

        service.invalidateAllDiscovery();

        verify(values).increment("craves:catalog:discovery:generation");
    }

    private DiscoveryCacheService service() {
        return new DiscoveryCacheService(
            redis,
            new ObjectMapper(),
            properties,
            new SimpleMeterRegistry()
        );
    }

    public record TestPayload(String value) {
    }
}
