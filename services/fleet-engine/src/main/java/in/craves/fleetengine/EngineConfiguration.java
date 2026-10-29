package in.craves.fleetengine;

import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

/** The engine's beans: its settings from FLEET_ENGINE_*, the runner, and the readiness check on Redis. */
@Configuration
public class EngineConfiguration {
    @Bean
    EngineSettings engineSettings(Environment env) {
        return EngineSettings.from(env::getProperty);
    }

    @Bean
    EngineRunner engineRunner(EngineSettings settings, MeterRegistry registry) {
        return new EngineRunner(settings, registry);
    }

    /** "fleetRedis" in the readiness group (application.yml): not ready while Redis doesn't answer; the engine keeps retrying. */
    @Bean
    HealthIndicator fleetRedisHealthIndicator(EngineRunner runner) {
        return () -> runner.ready() ? Health.up().build() : Health.down().withDetail("redis", "not answering").build();
    }
}
