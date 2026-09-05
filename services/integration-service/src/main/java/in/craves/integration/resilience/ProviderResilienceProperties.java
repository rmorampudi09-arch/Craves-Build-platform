package in.craves.integration.resilience;

import jakarta.annotation.PostConstruct;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "craves.provider-resilience")
public class ProviderResilienceProperties {
    private boolean enabled = false;
    private int slidingWindowSize = 20;
    private int minimumNumberOfCalls = 10;
    private float failureRateThreshold = 50.0f;
    private int openStateSeconds = 30;
    private int halfOpenCalls = 3;
    private int maxConcurrentCallsPerProvider = 20;

    @PostConstruct
    void validate() {
        if (slidingWindowSize < 5 || slidingWindowSize > 1000) {
            throw new IllegalStateException("Provider resilience slidingWindowSize must be between 5 and 1000");
        }
        if (minimumNumberOfCalls < 1 || minimumNumberOfCalls > slidingWindowSize) {
            throw new IllegalStateException("Provider resilience minimumNumberOfCalls must be between 1 and slidingWindowSize");
        }
        if (failureRateThreshold < 1.0f || failureRateThreshold > 100.0f) {
            throw new IllegalStateException("Provider resilience failureRateThreshold must be between 1 and 100");
        }
        if (openStateSeconds < 1 || openStateSeconds > 3600) {
            throw new IllegalStateException("Provider resilience openStateSeconds must be between 1 and 3600");
        }
        if (halfOpenCalls < 1 || halfOpenCalls > 100) {
            throw new IllegalStateException("Provider resilience halfOpenCalls must be between 1 and 100");
        }
        if (maxConcurrentCallsPerProvider < 1 || maxConcurrentCallsPerProvider > 1000) {
            throw new IllegalStateException("Provider resilience maxConcurrentCallsPerProvider must be between 1 and 1000");
        }
    }

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public int getSlidingWindowSize() { return slidingWindowSize; }
    public void setSlidingWindowSize(int slidingWindowSize) { this.slidingWindowSize = slidingWindowSize; }
    public int getMinimumNumberOfCalls() { return minimumNumberOfCalls; }
    public void setMinimumNumberOfCalls(int minimumNumberOfCalls) { this.minimumNumberOfCalls = minimumNumberOfCalls; }
    public float getFailureRateThreshold() { return failureRateThreshold; }
    public void setFailureRateThreshold(float failureRateThreshold) { this.failureRateThreshold = failureRateThreshold; }
    public int getOpenStateSeconds() { return openStateSeconds; }
    public void setOpenStateSeconds(int openStateSeconds) { this.openStateSeconds = openStateSeconds; }
    public int getHalfOpenCalls() { return halfOpenCalls; }
    public void setHalfOpenCalls(int halfOpenCalls) { this.halfOpenCalls = halfOpenCalls; }
    public int getMaxConcurrentCallsPerProvider() { return maxConcurrentCallsPerProvider; }
    public void setMaxConcurrentCallsPerProvider(int maxConcurrentCallsPerProvider) {
        this.maxConcurrentCallsPerProvider = maxConcurrentCallsPerProvider;
    }
}
