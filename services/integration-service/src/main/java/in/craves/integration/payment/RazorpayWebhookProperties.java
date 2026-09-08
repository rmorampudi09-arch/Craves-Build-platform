package in.craves.integration.payment;

import jakarta.annotation.PostConstruct;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "craves.razorpay.webhook")
public class RazorpayWebhookProperties {
    private boolean workerEnabled = false;
    private int batchSize = 40;
    private long fixedDelayMs = 1000;
    private int maxAttempts = 12;
    private int staleMinutes = 5;
    private int retryBaseSeconds = 5;

    @PostConstruct
    void validate() {
        if (batchSize < 1 || batchSize > 200) {
            throw new IllegalStateException("Razorpay webhook batchSize must be between 1 and 200");
        }
        if (fixedDelayMs < 250) {
            throw new IllegalStateException("Razorpay webhook fixedDelayMs must be at least 250");
        }
        if (maxAttempts < 1 || maxAttempts > 50) {
            throw new IllegalStateException("Razorpay webhook maxAttempts must be between 1 and 50");
        }
        if (staleMinutes < 1 || staleMinutes > 60) {
            throw new IllegalStateException("Razorpay webhook staleMinutes must be between 1 and 60");
        }
        if (retryBaseSeconds < 1 || retryBaseSeconds > 600) {
            throw new IllegalStateException("Razorpay webhook retryBaseSeconds must be between 1 and 600");
        }
    }

    public boolean isWorkerEnabled() { return workerEnabled; }
    public void setWorkerEnabled(boolean workerEnabled) { this.workerEnabled = workerEnabled; }
    public int getBatchSize() { return batchSize; }
    public void setBatchSize(int batchSize) { this.batchSize = batchSize; }
    public long getFixedDelayMs() { return fixedDelayMs; }
    public void setFixedDelayMs(long fixedDelayMs) { this.fixedDelayMs = fixedDelayMs; }
    public int getMaxAttempts() { return maxAttempts; }
    public void setMaxAttempts(int maxAttempts) { this.maxAttempts = maxAttempts; }
    public int getStaleMinutes() { return staleMinutes; }
    public void setStaleMinutes(int staleMinutes) { this.staleMinutes = staleMinutes; }
    public int getRetryBaseSeconds() { return retryBaseSeconds; }
    public void setRetryBaseSeconds(int retryBaseSeconds) { this.retryBaseSeconds = retryBaseSeconds; }
}
