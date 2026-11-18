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
    private boolean reconciliationEnabled = false;
    private boolean webhookProcessingEnabled = false;
    private boolean trackingReconciliationEnabled = false;
    private boolean statusPublisherEnabled = false;
    private boolean borzoPidgeHandoffEnabled = false;
    /** Journal every courier booking attempt before the call (provider_create_attempt, V191); off keeps today's behaviour. */
    private boolean bookingJournalEnabled = false;
    /** With the journal on, how a Borzo refusal is read: verify (refused, then one lookup), trust (refused) or unknown (as today). */
    private String borzoRefusals = "verify";
    /** Cancel a cancelled order's courier whatever the fleet flag, confirmed by fetching it (CourierCancel); off keeps today's behaviour. */
    private boolean courierCancelEnabled = false;
    /** Record what each courier charges for a booking, and open the courier-billing admin routes (CourierCharges); off keeps today's behaviour. */
    private boolean courierChargeEnabled = false;
    /** Courier status rank guard (DeliveryStatusUpdateService): off (as today), shadow (logs what it would refuse) or enforce. */
    private String statusRankGuard = "off";
    /** off | shadow | enforce: read a Pidge booking back before a final status from its callback is applied (README). */
    private String webhookVerifyFetch = "off";
    /** Re-send due commands nobody is working on and cap the wait on couriers (DeliveryCommandSweeper); off keeps today's behaviour. */
    private boolean sweeperEnabled = false;
    /** Courier capabilities (README, "Courier capabilities"): off keeps today's routing and handoff. */
    private boolean courierCapabilitiesEnabled = false;
    /** How long a command must be due and untouched before the sweeper re-sends it. */
    private int sweeperMarginSeconds = 15;
    /** A command still without a courier this long after its promised ready time is ended and a person is told. */
    private int courierWaitCapMinutes = 20;
    /**
     * Webhook-first courier tracking: a job is polled only after its quiet period with no callback and no poll, and at
     * least every trackingSafetyPollSeconds while callbacks arrive; off keeps the poll every trackingPollSeconds.
     */
    private boolean webhookFirstTrackingEnabled = false;
    /** Webhook-first only: the quiet period before a rider is assigned, from assignment to pickup, and after pickup. */
    private int trackingQuietSearchingSeconds = 120;
    private int trackingQuietAssignedSeconds = 180;
    private int trackingQuietPickedUpSeconds = 300;
    /** Webhook-first only: callbacks never put a job's poll off for longer than this after its last poll. */
    private int trackingSafetyPollSeconds = 900;
    /** Sum courier API calls per day in provider_api_usage and alert on high usage and HTTP 429 (IntegrationAlertMonitor); off: neither. */
    private boolean providerApiUsageEnabled = false;
    /** Courier id -> calls allowed per day in India; none or 0 means counted but never alerted. */
    private java.util.Map<String, Integer> providerApiDailyCaps = new java.util.HashMap<>(java.util.Map.of("borzo", 5000));
    /** The share of a courier's daily cap at which COURIER_API_USAGE_HIGH is raised, once a day. */
    private int providerApiUsageAlertPercent = 70;
    private String fullyQualifiedNamespace = "";
    private String connectionString = "";
    private String topicName = "craves-domain-events";
    private String chefAcceptedSubscriptionName = "integration-service-chef-accepted";
    private String queueName = "delivery-command";
    private int leadTimeMinutes = 10;
    /** R16 10: move a habitually late kitchen's dispatch later by its median lateness (DeliveryCommandScheduler). */
    private boolean readyCorrectionEnabled = false;
    /** R16 18: start when riders free near the kitchen would meet the food (DeliveryCommandScheduler; needs a live ranking model). */
    private boolean foodTimedDispatchEnabled = false;
    private int quoteTimeoutSeconds = 4;
    private int maxProviderAttempts = 3;
    private int maxDeliveryAttempts = 5;
    private int maxConcurrentMessages = 4;
    private int prefetchCount = 8;
    private int maxAutoLockRenewMinutes = 5;
    private int outboxBatchSize = 20;
    private long outboxPublishIntervalMs = 5000;
    private int reconciliationBatchSize = 20;
    private long reconciliationIntervalMs = 15000;
    private int maxReconciliationAttempts = 20;
    private int reconciliationRetryBaseSeconds = 30;
    private int reconciliationStaleMinutes = 10;
    private int webhookBatchSize = 20;
    private long webhookProcessingIntervalMs = 2000;
    private int maxWebhookAttempts = 10;
    private int webhookRetryBaseSeconds = 5;
    private int webhookStaleMinutes = 5;
    private int trackingBatchSize = 20;
    private long trackingReconciliationIntervalMs = 15000;
    private int trackingPollSeconds = 60;
    private int maxTrackingAttempts = 20;
    private int trackingRetryBaseSeconds = 30;
    private int trackingStaleMinutes = 5;

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
        if (reconciliationBatchSize < 1 || reconciliationBatchSize > 500) {
            throw new IllegalStateException("Delivery reconciliationBatchSize must be between 1 and 500");
        }
        if (reconciliationIntervalMs < 1000) {
            throw new IllegalStateException("Delivery reconciliationIntervalMs must be at least 1000");
        }
        if (maxReconciliationAttempts < 1 || maxReconciliationAttempts > 100) {
            throw new IllegalStateException("Delivery maxReconciliationAttempts must be between 1 and 100");
        }
        if (reconciliationRetryBaseSeconds < 1 || reconciliationRetryBaseSeconds > 3600) {
            throw new IllegalStateException(
                "Delivery reconciliationRetryBaseSeconds must be between 1 and 3600"
            );
        }
        if (reconciliationStaleMinutes < 1 || reconciliationStaleMinutes > 120) {
            throw new IllegalStateException("Delivery reconciliationStaleMinutes must be between 1 and 120");
        }
        if (!java.util.Set.of("verify", "trust", "unknown").contains(borzoRefusals)) {
            throw new IllegalStateException("Delivery borzoRefusals must be verify, trust or unknown");
        }
        if (!java.util.Set.of("off", "shadow", "enforce").contains(statusRankGuard)) {
            throw new IllegalStateException("Delivery statusRankGuard must be off, shadow or enforce");
        }
        if (!java.util.Set.of("off", "shadow", "enforce").contains(webhookVerifyFetch)) {
            throw new IllegalStateException("Delivery webhookVerifyFetch must be off, shadow or enforce");
        }
        if (sweeperMarginSeconds < 5 || sweeperMarginSeconds > 3600) {
            throw new IllegalStateException("Delivery sweeperMarginSeconds must be between 5 and 3600");
        }
        if (courierWaitCapMinutes < 1 || courierWaitCapMinutes > 1440) {
            throw new IllegalStateException("Delivery courierWaitCapMinutes must be between 1 and 1440");
        }
        validateBatch(webhookBatchSize, "webhookBatchSize");
        validateInterval(webhookProcessingIntervalMs, "webhookProcessingIntervalMs");
        validateAttempts(maxWebhookAttempts, "maxWebhookAttempts");
        validateRetry(webhookRetryBaseSeconds, "webhookRetryBaseSeconds");
        validateStale(webhookStaleMinutes, "webhookStaleMinutes");
        validateBatch(trackingBatchSize, "trackingBatchSize");
        validateInterval(trackingReconciliationIntervalMs, "trackingReconciliationIntervalMs");
        if (trackingPollSeconds < 10 || trackingPollSeconds > 3600) {
            throw new IllegalStateException("Delivery trackingPollSeconds must be between 10 and 3600");
        }
        validateRetry(trackingQuietSearchingSeconds, "trackingQuietSearchingSeconds");
        validateRetry(trackingQuietAssignedSeconds, "trackingQuietAssignedSeconds");
        validateRetry(trackingQuietPickedUpSeconds, "trackingQuietPickedUpSeconds");
        if (trackingSafetyPollSeconds < 60 || trackingSafetyPollSeconds > 7200) {
            throw new IllegalStateException("Delivery trackingSafetyPollSeconds must be between 60 and 7200");
        }
        if (providerApiUsageAlertPercent < 1 || providerApiUsageAlertPercent > 100) {
            throw new IllegalStateException("Delivery providerApiUsageAlertPercent must be between 1 and 100");
        }
        validateAttempts(maxTrackingAttempts, "maxTrackingAttempts");
        validateRetry(trackingRetryBaseSeconds, "trackingRetryBaseSeconds");
        validateStale(trackingStaleMinutes, "trackingStaleMinutes");

        if (enabled || statusPublisherEnabled) {
            if (!StringUtils.hasText(connectionString) && !StringUtils.hasText(fullyQualifiedNamespace)) {
                throw new IllegalStateException(
                    "SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE or SERVICE_BUS_CONNECTION_STRING is required when delivery messaging is enabled"
                );
            }
            requireText(topicName, "topicName");
            requireText(chefAcceptedSubscriptionName, "chefAcceptedSubscriptionName");
            requireText(queueName, "queueName");
        }
    }

    private static void validateBatch(int value, String name) {
        if (value < 1 || value > 500) {
            throw new IllegalStateException("Delivery " + name + " must be between 1 and 500");
        }
    }

    private static void validateInterval(long value, String name) {
        if (value < 1000) {
            throw new IllegalStateException("Delivery " + name + " must be at least 1000");
        }
    }

    private static void validateAttempts(int value, String name) {
        if (value < 1 || value > 100) {
            throw new IllegalStateException("Delivery " + name + " must be between 1 and 100");
        }
    }

    private static void validateRetry(int value, String name) {
        if (value < 1 || value > 3600) {
            throw new IllegalStateException("Delivery " + name + " must be between 1 and 3600");
        }
    }

    private static void validateStale(int value, String name) {
        if (value < 1 || value > 120) {
            throw new IllegalStateException("Delivery " + name + " must be between 1 and 120");
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
    public boolean isReconciliationEnabled() { return reconciliationEnabled; }
    public void setReconciliationEnabled(boolean reconciliationEnabled) { this.reconciliationEnabled = reconciliationEnabled; }
    public boolean isWebhookProcessingEnabled() { return webhookProcessingEnabled; }
    public void setWebhookProcessingEnabled(boolean webhookProcessingEnabled) { this.webhookProcessingEnabled = webhookProcessingEnabled; }
    public boolean isTrackingReconciliationEnabled() { return trackingReconciliationEnabled; }
    public void setTrackingReconciliationEnabled(boolean trackingReconciliationEnabled) { this.trackingReconciliationEnabled = trackingReconciliationEnabled; }
    public boolean isStatusPublisherEnabled() { return statusPublisherEnabled; }
    public void setStatusPublisherEnabled(boolean statusPublisherEnabled) { this.statusPublisherEnabled = statusPublisherEnabled; }
    public boolean isBorzoPidgeHandoffEnabled() { return borzoPidgeHandoffEnabled; }
    public void setBorzoPidgeHandoffEnabled(boolean enabled) { this.borzoPidgeHandoffEnabled = enabled; }
    public boolean isBookingJournalEnabled() { return bookingJournalEnabled; }
    public void setBookingJournalEnabled(boolean bookingJournalEnabled) { this.bookingJournalEnabled = bookingJournalEnabled; }
    public boolean isCourierCancelEnabled() { return courierCancelEnabled; }
    public void setCourierCancelEnabled(boolean courierCancelEnabled) { this.courierCancelEnabled = courierCancelEnabled; }
    public boolean isCourierChargeEnabled() { return courierChargeEnabled; }
    public void setCourierChargeEnabled(boolean courierChargeEnabled) { this.courierChargeEnabled = courierChargeEnabled; }
    public boolean isSweeperEnabled() { return sweeperEnabled; }
    public boolean isCourierCapabilitiesEnabled() { return courierCapabilitiesEnabled; }
    public void setCourierCapabilitiesEnabled(boolean courierCapabilitiesEnabled) { this.courierCapabilitiesEnabled = courierCapabilitiesEnabled; }
    public void setSweeperEnabled(boolean sweeperEnabled) { this.sweeperEnabled = sweeperEnabled; }
    public int getSweeperMarginSeconds() { return sweeperMarginSeconds; }
    public void setSweeperMarginSeconds(int sweeperMarginSeconds) { this.sweeperMarginSeconds = sweeperMarginSeconds; }
    public int getCourierWaitCapMinutes() { return courierWaitCapMinutes; }
    public void setCourierWaitCapMinutes(int courierWaitCapMinutes) { this.courierWaitCapMinutes = courierWaitCapMinutes; }
    public String getStatusRankGuard() { return statusRankGuard; }
    /** Trimmed and lower-cased; unset or blank is off. */
    public void setStatusRankGuard(String statusRankGuard) {
        this.statusRankGuard = StringUtils.hasText(statusRankGuard) ? statusRankGuard.trim().toLowerCase(java.util.Locale.ROOT) : "off";
    }
    public String getWebhookVerifyFetch() { return webhookVerifyFetch; }
    /** Trimmed and lower-cased; unset or blank is off. */
    public void setWebhookVerifyFetch(String webhookVerifyFetch) {
        this.webhookVerifyFetch = StringUtils.hasText(webhookVerifyFetch) ? webhookVerifyFetch.trim().toLowerCase(java.util.Locale.ROOT) : "off";
    }
    public boolean isWebhookFirstTrackingEnabled() { return webhookFirstTrackingEnabled; }
    public void setWebhookFirstTrackingEnabled(boolean webhookFirstTrackingEnabled) { this.webhookFirstTrackingEnabled = webhookFirstTrackingEnabled; }
    public int getTrackingQuietSearchingSeconds() { return trackingQuietSearchingSeconds; }
    public void setTrackingQuietSearchingSeconds(int trackingQuietSearchingSeconds) { this.trackingQuietSearchingSeconds = trackingQuietSearchingSeconds; }
    public int getTrackingQuietAssignedSeconds() { return trackingQuietAssignedSeconds; }
    public void setTrackingQuietAssignedSeconds(int trackingQuietAssignedSeconds) { this.trackingQuietAssignedSeconds = trackingQuietAssignedSeconds; }
    public int getTrackingQuietPickedUpSeconds() { return trackingQuietPickedUpSeconds; }
    public void setTrackingQuietPickedUpSeconds(int trackingQuietPickedUpSeconds) { this.trackingQuietPickedUpSeconds = trackingQuietPickedUpSeconds; }
    public int getTrackingSafetyPollSeconds() { return trackingSafetyPollSeconds; }
    public void setTrackingSafetyPollSeconds(int trackingSafetyPollSeconds) { this.trackingSafetyPollSeconds = trackingSafetyPollSeconds; }
    public boolean isProviderApiUsageEnabled() { return providerApiUsageEnabled; }
    public void setProviderApiUsageEnabled(boolean providerApiUsageEnabled) { this.providerApiUsageEnabled = providerApiUsageEnabled; }
    public java.util.Map<String, Integer> getProviderApiDailyCaps() { return providerApiDailyCaps; }
    public void setProviderApiDailyCaps(java.util.Map<String, Integer> providerApiDailyCaps) { this.providerApiDailyCaps = providerApiDailyCaps; }
    public int getProviderApiUsageAlertPercent() { return providerApiUsageAlertPercent; }
    public void setProviderApiUsageAlertPercent(int providerApiUsageAlertPercent) { this.providerApiUsageAlertPercent = providerApiUsageAlertPercent; }
    public String getBorzoRefusals() { return borzoRefusals; }
    public void setBorzoRefusals(String borzoRefusals) { this.borzoRefusals = borzoRefusals; }
    public String getFullyQualifiedNamespace() { return fullyQualifiedNamespace; }
    public void setFullyQualifiedNamespace(String fullyQualifiedNamespace) { this.fullyQualifiedNamespace = fullyQualifiedNamespace; }
    public String getConnectionString() { return connectionString; }
    public void setConnectionString(String connectionString) { this.connectionString = connectionString; }
    public String getTopicName() { return topicName; }
    public void setTopicName(String topicName) { this.topicName = topicName; }
    public String getChefAcceptedSubscriptionName() { return chefAcceptedSubscriptionName; }
    public void setChefAcceptedSubscriptionName(String chefAcceptedSubscriptionName) { this.chefAcceptedSubscriptionName = chefAcceptedSubscriptionName; }
    public String getQueueName() { return queueName; }
    public void setQueueName(String queueName) { this.queueName = queueName; }
    public int getLeadTimeMinutes() { return leadTimeMinutes; }
    public void setLeadTimeMinutes(int leadTimeMinutes) { this.leadTimeMinutes = leadTimeMinutes; }
    public boolean isReadyCorrectionEnabled() { return readyCorrectionEnabled; }
    public void setReadyCorrectionEnabled(boolean readyCorrectionEnabled) { this.readyCorrectionEnabled = readyCorrectionEnabled; }
    public boolean isFoodTimedDispatchEnabled() { return foodTimedDispatchEnabled; }
    public void setFoodTimedDispatchEnabled(boolean foodTimedDispatchEnabled) { this.foodTimedDispatchEnabled = foodTimedDispatchEnabled; }
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
    public void setMaxAutoLockRenewMinutes(int maxAutoLockRenewMinutes) { this.maxAutoLockRenewMinutes = maxAutoLockRenewMinutes; }
    public int getOutboxBatchSize() { return outboxBatchSize; }
    public void setOutboxBatchSize(int outboxBatchSize) { this.outboxBatchSize = outboxBatchSize; }
    public long getOutboxPublishIntervalMs() { return outboxPublishIntervalMs; }
    public void setOutboxPublishIntervalMs(long outboxPublishIntervalMs) { this.outboxPublishIntervalMs = outboxPublishIntervalMs; }
    public int getReconciliationBatchSize() { return reconciliationBatchSize; }
    public void setReconciliationBatchSize(int reconciliationBatchSize) { this.reconciliationBatchSize = reconciliationBatchSize; }
    public long getReconciliationIntervalMs() { return reconciliationIntervalMs; }
    public void setReconciliationIntervalMs(long reconciliationIntervalMs) { this.reconciliationIntervalMs = reconciliationIntervalMs; }
    public int getMaxReconciliationAttempts() { return maxReconciliationAttempts; }
    public void setMaxReconciliationAttempts(int maxReconciliationAttempts) { this.maxReconciliationAttempts = maxReconciliationAttempts; }
    public int getReconciliationRetryBaseSeconds() { return reconciliationRetryBaseSeconds; }
    public void setReconciliationRetryBaseSeconds(int reconciliationRetryBaseSeconds) { this.reconciliationRetryBaseSeconds = reconciliationRetryBaseSeconds; }
    public int getReconciliationStaleMinutes() { return reconciliationStaleMinutes; }
    public void setReconciliationStaleMinutes(int reconciliationStaleMinutes) { this.reconciliationStaleMinutes = reconciliationStaleMinutes; }
    public int getWebhookBatchSize() { return webhookBatchSize; }
    public void setWebhookBatchSize(int webhookBatchSize) { this.webhookBatchSize = webhookBatchSize; }
    public long getWebhookProcessingIntervalMs() { return webhookProcessingIntervalMs; }
    public void setWebhookProcessingIntervalMs(long webhookProcessingIntervalMs) { this.webhookProcessingIntervalMs = webhookProcessingIntervalMs; }
    public int getMaxWebhookAttempts() { return maxWebhookAttempts; }
    public void setMaxWebhookAttempts(int maxWebhookAttempts) { this.maxWebhookAttempts = maxWebhookAttempts; }
    public int getWebhookRetryBaseSeconds() { return webhookRetryBaseSeconds; }
    public void setWebhookRetryBaseSeconds(int webhookRetryBaseSeconds) { this.webhookRetryBaseSeconds = webhookRetryBaseSeconds; }
    public int getWebhookStaleMinutes() { return webhookStaleMinutes; }
    public void setWebhookStaleMinutes(int webhookStaleMinutes) { this.webhookStaleMinutes = webhookStaleMinutes; }
    public int getTrackingBatchSize() { return trackingBatchSize; }
    public void setTrackingBatchSize(int trackingBatchSize) { this.trackingBatchSize = trackingBatchSize; }
    public long getTrackingReconciliationIntervalMs() { return trackingReconciliationIntervalMs; }
    public void setTrackingReconciliationIntervalMs(long trackingReconciliationIntervalMs) { this.trackingReconciliationIntervalMs = trackingReconciliationIntervalMs; }
    public int getTrackingPollSeconds() { return trackingPollSeconds; }
    public void setTrackingPollSeconds(int trackingPollSeconds) { this.trackingPollSeconds = trackingPollSeconds; }
    public int getMaxTrackingAttempts() { return maxTrackingAttempts; }
    public void setMaxTrackingAttempts(int maxTrackingAttempts) { this.maxTrackingAttempts = maxTrackingAttempts; }
    public int getTrackingRetryBaseSeconds() { return trackingRetryBaseSeconds; }
    public void setTrackingRetryBaseSeconds(int trackingRetryBaseSeconds) { this.trackingRetryBaseSeconds = trackingRetryBaseSeconds; }
    public int getTrackingStaleMinutes() { return trackingStaleMinutes; }
    public void setTrackingStaleMinutes(int trackingStaleMinutes) { this.trackingStaleMinutes = trackingStaleMinutes; }
}
