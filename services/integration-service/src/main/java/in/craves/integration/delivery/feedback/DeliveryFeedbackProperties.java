package in.craves.integration.delivery.feedback;

import jakarta.annotation.PostConstruct;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "craves.delivery-feedback")
public class DeliveryFeedbackProperties {
    private boolean enabled = true;
    private int batchSize = 50;
    private int maxAttempts = 8;
    @PostConstruct
    public void validate() {
        if (batchSize < 1 || batchSize > 200 || maxAttempts < 1 || maxAttempts > 20)
            throw new IllegalStateException("Delivery feedback batch/attempt limits are invalid");
    }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean value) { enabled = value; }
    public int getBatchSize() { return batchSize; }
    public void setBatchSize(int value) { batchSize = value; }
    public int getMaxAttempts() { return maxAttempts; }
    public void setMaxAttempts(int value) { maxAttempts = value; }
}
