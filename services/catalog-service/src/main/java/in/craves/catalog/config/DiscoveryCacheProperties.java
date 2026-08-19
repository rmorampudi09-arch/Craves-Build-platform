package in.craves.catalog.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "craves.discovery.cache")
public class DiscoveryCacheProperties {
    private boolean enabled = false;
    private long ttlSeconds = 120;
    private long failureBackoffSeconds = 30;
    private String keyPrefix = "craves:catalog:discovery";

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public long getTtlSeconds() {
        return ttlSeconds;
    }

    public void setTtlSeconds(long ttlSeconds) {
        this.ttlSeconds = Math.max(10, Math.min(ttlSeconds, 900));
    }

    public long getFailureBackoffSeconds() {
        return failureBackoffSeconds;
    }

    public void setFailureBackoffSeconds(long failureBackoffSeconds) {
        this.failureBackoffSeconds = Math.max(5, Math.min(failureBackoffSeconds, 300));
    }

    public String getKeyPrefix() {
        return keyPrefix;
    }

    public void setKeyPrefix(String keyPrefix) {
        if (keyPrefix != null && !keyPrefix.isBlank()) {
            this.keyPrefix = keyPrefix.trim();
        }
    }
}
