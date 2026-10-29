package in.craves.fleetengine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;
import org.junit.jupiter.api.Test;

class EngineSettingsTest {
    @Test
    void settingsAreCheckedAtStartWithEveryProblemNamed() {
        IllegalStateException e = assertThrows(IllegalStateException.class,
            () -> EngineSettings.from(Map.of("FLEET_ENGINE_RIDER_PARTITIONS", "0", "FLEET_ENGINE_HOLD_MS", "x")::get));
        assertTrue(e.getMessage().contains("FLEET_ENGINE_REDIS_URL"));
        assertTrue(e.getMessage().contains("FLEET_ENGINE_RIDER_PARTITIONS"));
        assertTrue(e.getMessage().contains("FLEET_ENGINE_HOLD_MS"));
    }

    @Test
    void theRedisUrlIntegrationServiceUsesWorksAsItIs() {
        EngineSettings s = EngineSettings.from(Map.of(
            "FLEET_ENGINE_REDIS_URL", "rediss://:s3cret@amr-craves.centralindia.redis.azure.net:10000\n",
            "FLEET_ENGINE_INSTANCE", "a")::get);
        assertEquals("rediss://:s3cret@amr-craves.centralindia.redis.azure.net:10000", s.redisUrl()); // a secret store's newline
        assertEquals(16, s.riderPartitions());
        assertEquals(16, s.dispatchPartitions());
        assertEquals(5_000, s.dispatch().holdMs());
        assertEquals("craves:fleet:", s.prefix());
        assertEquals("a", s.instance());
    }

    @Test
    void aBadUrlIsRefusedWithoutRepeatingItAndProductionNeedsTls() {
        IllegalStateException bad = assertThrows(IllegalStateException.class,
            () -> EngineSettings.from(Map.of("FLEET_ENGINE_REDIS_URL", "http://user:s3cret@host")::get));
        assertFalse(bad.getMessage().contains("s3cret"));
        IllegalStateException clear = assertThrows(IllegalStateException.class, () -> EngineSettings.from(Map.of(
            "FLEET_ENGINE_REDIS_URL", "redis://:k3y@host:10000", "CRAVES_ENVIRONMENT", "prodlow")::get));
        assertTrue(clear.getMessage().contains("rediss://"));
        assertFalse(clear.getMessage().contains("k3y"));
        assertEquals("redis://127.0.0.1:6379", EngineSettings.from(Map.of("FLEET_ENGINE_REDIS_URL", "redis://127.0.0.1:6379")::get)
            .redisUrl(), "plain Redis is fine outside production");
        IllegalStateException noHost = assertThrows(IllegalStateException.class,
            () -> EngineSettings.from(Map.of("FLEET_ENGINE_REDIS_URL", "rediss://:k3y@")::get));
        assertTrue(noHost.getMessage().contains("host"), "a URL Lettuce can't connect to stops the start, not a retry loop");
        assertFalse(noHost.getMessage().contains("k3y"));
    }

    @Test
    void aBlockMustSwitchToGreedyBeforeItSheds() {
        IllegalStateException e = assertThrows(IllegalStateException.class, () -> EngineSettings.from(Map.of(
            "FLEET_ENGINE_REDIS_URL", "redis://127.0.0.1:6379", "FLEET_ENGINE_QUEUE_SIZE", "512", "FLEET_ENGINE_OVERLOAD_QUEUE", "1000")::get));
        assertTrue(e.getMessage().contains("FLEET_ENGINE_OVERLOAD_QUEUE"));
    }
}
