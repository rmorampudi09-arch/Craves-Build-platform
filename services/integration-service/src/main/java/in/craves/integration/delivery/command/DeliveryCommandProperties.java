package in.craves.integration.delivery.command;

import jakarta.annotation.PostConstruct;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@ConfigurationProperties(prefix = "craves.delivery-command")
public class DeliveryCommandProperties {
    private boolean enabled = false;
    private String fullyQualifiedNamespace = "";
    private String connectionString = "";
    private String topicName = "craves-domain-events";
    private String chefAcceptedSubscriptionName = "integration-service-chef-accepted";
    private String queueName = "delivery-command";
    private int leadTimeMinutes = 10;
    private int quoteTimeoutSeconds = 4;
    private int maxProviderAttempts = 3;
    private int maxDeliveryAttempts = 5;
    private int maxConcurrentMessages = 4;
    private int prefetchCount = 8;
    private int maxAutoLockRenewMinutes = 5;
    private int outboxBatchSize = 20;
    private long outboxPublishIntervalMs = 5000;

    @PostConstruct
    void validate() {
        if (leadTimeMinutes < 0 || leadTimeMinutes > 120) {
            throw new IllegalStateException("Delivery command leadTimeMinutes must be between 0 and 120");
        }
        if (quoteTimeoutSeconds < 1 || quoteTimeoutSeconds > 30) {
            throw new IllegalStateException("Delivery command quoteTimeoutSeconds must be between 1 and 30");
        }
        if (maxProviderAttempts < 1 || maxProviderAttempts > 10) {
            throw new IllegalStateException("Delivery command maxProviderAttempts must be between 1 and 10");
        }
        if (maxDeliveryAttempts < 1 || maxDeliveryAttempts > 20) {
            throw new IllegalStateException("Delivery command maxDeliveryAttempts must be between 1 and 20");
        }
        if (maxConcurrentMessages < 1 || maxConcurrentMessages > 64) {
            throw new IllegalStateException("Delivery command maxConcurrentMessages must be between 1 and 64");
        }
        if (prefetchCount < 0 || prefetchCount > 1000) {
            throw new IllegalStateException("Delivery command prefetchCount must be between 0 and 1000");
        }
        if (maxAutoLockRenewMinutes < 1 || maxAutoLockRenewMinutes > 60) {
            throw new IllegalStateException("Delivery command maxAutoLockRenewMinutes must be between 1 and 60");
        }
        if (outboxBatchSize < 1 || outboxBatchSize > 500) {
            throw new IllegalStateException("Delivery command outboxBatchSize must be between 1 and 500");
        }
        if (outboxPublishIntervalMs < 1000) {
            throw new IllegalStateException("Delivery command outboxPublishIntervalMs must be at least 1000");
        }
        if (enabled) {
            if (!StringUtils.hasText(connectionString) && !StringUtils.hasText(fullyQualifiedNamespace)) {
                throw new IllegalStateException(
                    "SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE or SERVICE_BUS_CONNECTION_STRING is required when delivery commands are enabled"
                );
            }
            requireText(topicName, "topicName");
            requireText(chefAcceptedSubscriptionName, "chefAcceptedSubscriptionName");
            requireText(queueName, "queueName");
        }
    }

    private static void requireText(String value, String field) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalStateException("Delivery command " + field + " is required");
        }
    }

    public Duration quoteTimeout() { return Duration.ofSeconds(quoteTimeoutSeconds); }
    public Duration maxAutoLockRenewDuration() { return Duration.ofMinutes(maxAutoLockRenewMinutes); }

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getFullyQualifiedNamespace() { return fullyQualifiedNamespace; }
    public void setFullyQualifiedNamespace(String fullyQualifiedNamespace) { this.fullyQualifiedNamespace = fullyQualifiedNamespace; }
    public String getConnectionString() { return connectionString; }
    public void setConnectionString(String connectionString) { this.connectionString = connectionString; }
    public String getTopicName() { return topicName; }
    public void setTopicName(String topicName) { this.topicName = topicName; }
    public String getChefAcceptedSubscriptionName() { return chefAcceptedSubscriptionName; }
    public void setChefAcceptedSubscriptionName(String chefAcceptedSubscriptionName) {
        this.chefAcceptedSubscriptionName = chefAcceptedSubscriptionName;
    }
    public String getQueueName() { return queueName; }
    public void setQueueName(String queueName) { this.queueName = queueName; }
    public int getLeadTimeMinutes() { return leadTimeMinutes; }
    public void setLeadTimeMinutes(int leadTimeMinutes) { this.leadTimeMinutes = leadTimeMinutes; }
    public int getQuoteTimeoutSeconds() { return quoteTimeoutSeconds; }
    public void setQuoteTimeoutSeconds(int quoteTimeoutSeconds) { this.quoteTimeoutSeconds = quoteTimeoutSeconds; }
    public int getMaxProviderAttempts() { return maxProviderAttempts; }
    public void setMaxProviderAttempts(int maxProviderAttempts) { this.maxProviderAttempts = maxProviderAttempts; }
    public int getMaxDeliveryAttempts() { return maxDeliveryAttempts; }
    public void setMaxDeliveryAttempts(int maxDeliveryAttempts) { this.maxDeliveryAttempts = maxDeliveryAttempts; }
    public int getMaxConcurrentMessages() { return maxConcurrentMessages; }
    public void setMaxConcurrentMessages(int maxConcurrentMessages) { this.maxConcurrentMessages = maxConcurrentMessages; }
    public int getPrefetchCount() { return prefetchCount; }
    public void setPrefetchCount(int prefetchCount) { this.prefetchCount = prefetchCount; }
    public int getMaxAutoLockRenewMinutes() { return maxAutoLockRenewMinutes; }
    public void setMaxAutoLockRenewMinutes(int maxAutoLockRenewMinutes) {
        this.maxAutoLockRenewMinutes = maxAutoLockRenewMinutes;
    }
    public int getOutboxBatchSize() { return outboxBatchSize; }
    public void setOutboxBatchSize(int outboxBatchSize) { this.outboxBatchSize = outboxBatchSize; }
    public long getOutboxPublishIntervalMs() { return outboxPublishIntervalMs; }
    public void setOutboxPublishIntervalMs(long outboxPublishIntervalMs) {
        this.outboxPublishIntervalMs = outboxPublishIntervalMs;
    }
}
