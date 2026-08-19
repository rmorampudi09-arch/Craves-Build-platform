package in.craves.order.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "craves.delivery-telemetry-consumer")
public class DeliveryTelemetryConsumerProperties {
    private boolean enabled;
    private String fullyQualifiedNamespace = "";
    private String connectionString = "";
    private String topicName = "craves-domain-events";
    private String subscriptionName = "order-service-delivery-telemetry-updated";
    private int maxConcurrentMessages = 4;
    private int prefetchCount = 8;
    private int maxDeliveryAttempts = 5;
    private int liveLocationMaxAgeSeconds = 300;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getFullyQualifiedNamespace() { return fullyQualifiedNamespace; }
    public void setFullyQualifiedNamespace(String fullyQualifiedNamespace) { this.fullyQualifiedNamespace = fullyQualifiedNamespace; }
    public String getConnectionString() { return connectionString; }
    public void setConnectionString(String connectionString) { this.connectionString = connectionString; }
    public String getTopicName() { return topicName; }
    public void setTopicName(String topicName) { this.topicName = topicName; }
    public String getSubscriptionName() { return subscriptionName; }
    public void setSubscriptionName(String subscriptionName) { this.subscriptionName = subscriptionName; }
    public int getMaxConcurrentMessages() { return maxConcurrentMessages; }
    public void setMaxConcurrentMessages(int maxConcurrentMessages) { this.maxConcurrentMessages = maxConcurrentMessages; }
    public int getPrefetchCount() { return prefetchCount; }
    public void setPrefetchCount(int prefetchCount) { this.prefetchCount = prefetchCount; }
    public int getMaxDeliveryAttempts() { return maxDeliveryAttempts; }
    public void setMaxDeliveryAttempts(int maxDeliveryAttempts) { this.maxDeliveryAttempts = maxDeliveryAttempts; }
    public int getLiveLocationMaxAgeSeconds() { return liveLocationMaxAgeSeconds; }
    public void setLiveLocationMaxAgeSeconds(int liveLocationMaxAgeSeconds) { this.liveLocationMaxAgeSeconds = liveLocationMaxAgeSeconds; }

    public int validatedMaxConcurrentMessages() {
        return maxConcurrentMessages > 0 ? maxConcurrentMessages : 4;
    }

    public int validatedPrefetchCount() {
        return Math.max(0, prefetchCount);
    }

    public int validatedMaxDeliveryAttempts() {
        return maxDeliveryAttempts > 0 ? maxDeliveryAttempts : 5;
    }

    public int validatedLiveLocationMaxAgeSeconds() {
        return liveLocationMaxAgeSeconds > 0 ? liveLocationMaxAgeSeconds : 300;
    }

    public Duration maxAutoLockRenewDuration() {
        return Duration.ofMinutes(5);
    }
}
