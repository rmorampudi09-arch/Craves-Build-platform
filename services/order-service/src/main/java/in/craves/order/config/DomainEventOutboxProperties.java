package in.craves.order.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "craves.domain-events.outbox")
public class DomainEventOutboxProperties {
    private boolean enabled = false;
    private long fixedDelayMs = 5000;
    private int batchSize = 20;
    private int maxAttempts = 10;
    private int retryBaseDelaySeconds = 5;
    private int staleLockSeconds = 300;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public long getFixedDelayMs() {
        return fixedDelayMs;
    }

    public void setFixedDelayMs(long fixedDelayMs) {
        this.fixedDelayMs = fixedDelayMs;
    }

    public int getBatchSize() {
        return batchSize;
    }

    public void setBatchSize(int batchSize) {
        this.batchSize = batchSize;
    }

    public int getMaxAttempts() {
        return maxAttempts;
    }

    public void setMaxAttempts(int maxAttempts) {
        this.maxAttempts = maxAttempts;
    }

    public int getRetryBaseDelaySeconds() {
        return retryBaseDelaySeconds;
    }

    public void setRetryBaseDelaySeconds(int retryBaseDelaySeconds) {
        this.retryBaseDelaySeconds = retryBaseDelaySeconds;
    }

    public int getStaleLockSeconds() {
        return staleLockSeconds;
    }

    public void setStaleLockSeconds(int staleLockSeconds) {
        this.staleLockSeconds = staleLockSeconds;
    }
}
