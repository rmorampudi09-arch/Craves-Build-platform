package in.craves.notification.delivery;

import jakarta.annotation.PostConstruct;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@ConfigurationProperties(prefix = "craves.notification.delivery")
public class NotificationDeliveryProperties {
    private boolean workerEnabled = false;
    private boolean pushEnabled = false;
    private boolean realtimePushEnabled = false;
    private boolean emailEnabled = false;
    private int batchSize = 50;
    private int maxAttempts = 8;
    private int staleLockMinutes = 5;
    private int retryBaseSeconds = 30;
    private long fixedDelayMs = 5000;
    private String firebaseServiceAccountJsonBase64 = "";
    private String acsEmailConnectionString = "";
    private String acsEmailSenderAddress = "";
    private String acsEmailReplyToAddress = "support@craves.in";
    private String authInternalBaseUrl = "";
    private String authInternalServiceSecret = "";
    /** Craves team mailboxes a TEAM_ALERT may be sent to (comma-separated, such as Waitlist@craves.in); empty = none. */
    private String teamEmailAddresses = "";

    @PostConstruct
    void validate() {
        if (batchSize < 1 || batchSize > 500 || maxAttempts < 1 || maxAttempts > 100) {
            throw new IllegalStateException("Notification delivery batch or attempt limits are invalid");
        }
        if (staleLockMinutes < 1 || staleLockMinutes > 120 || retryBaseSeconds < 1 || retryBaseSeconds > 3600) {
            throw new IllegalStateException("Notification delivery lease or retry settings are invalid");
        }
        if (fixedDelayMs < 1000) {
            throw new IllegalStateException("Notification delivery delay must be at least 1000 ms");
        }
        if ((pushEnabled || realtimePushEnabled) && !StringUtils.hasText(firebaseServiceAccountJsonBase64)) {
            throw new IllegalStateException("Firebase service account secret is required when push delivery is enabled");
        }
        if (emailEnabled && (!StringUtils.hasText(acsEmailConnectionString)
            || !StringUtils.hasText(acsEmailSenderAddress))) {
            throw new IllegalStateException("ACS Email connection string and sender address are required");
        }
        if (StringUtils.hasText(acsEmailReplyToAddress) && !acsEmailReplyToAddress.contains("@")) {
            throw new IllegalStateException("ACS Email reply-to address is invalid");
        }
        if (workerEnabled && !pushEnabled && !emailEnabled) {
            throw new IllegalStateException("At least one provider channel must be enabled with the delivery worker");
        }
        if (teamEmails().stream().anyMatch(address -> !address.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+"))) {
            throw new IllegalStateException("CRAVES_NOTIFICATION_TEAM_EMAIL_ADDRESSES holds an invalid address");
        }
    }

    private java.util.List<String> teamEmails() {
        return java.util.Arrays.stream(teamEmailAddresses == null ? new String[0] : teamEmailAddresses.split(","))
            .map(value -> value.trim().toLowerCase(java.util.Locale.ROOT)).filter(value -> !value.isEmpty()).toList();
    }

    /** True only for an address on the configured team list, compared without case or surrounding spaces. */
    public boolean isTeamEmailAddress(String address) {
        return address != null && teamEmails().contains(address.trim().toLowerCase(java.util.Locale.ROOT));
    }

    public String getTeamEmailAddresses() { return teamEmailAddresses; }
    public void setTeamEmailAddresses(String value) { this.teamEmailAddresses = value; }

    public boolean isWorkerEnabled() { return workerEnabled; }
    public void setWorkerEnabled(boolean value) { this.workerEnabled = value; }
    public boolean isPushEnabled() { return pushEnabled; }
    public void setPushEnabled(boolean value) { this.pushEnabled = value; }
    public boolean isRealtimePushEnabled() { return realtimePushEnabled; }
    public void setRealtimePushEnabled(boolean value) { this.realtimePushEnabled = value; }
    public boolean isEmailEnabled() { return emailEnabled; }
    public void setEmailEnabled(boolean value) { this.emailEnabled = value; }
    public int getBatchSize() { return batchSize; }
    public void setBatchSize(int value) { this.batchSize = value; }
    public int getMaxAttempts() { return maxAttempts; }
    public void setMaxAttempts(int value) { this.maxAttempts = value; }
    public int getStaleLockMinutes() { return staleLockMinutes; }
    public void setStaleLockMinutes(int value) { this.staleLockMinutes = value; }
    public int getRetryBaseSeconds() { return retryBaseSeconds; }
    public void setRetryBaseSeconds(int value) { this.retryBaseSeconds = value; }
    public long getFixedDelayMs() { return fixedDelayMs; }
    public void setFixedDelayMs(long value) { this.fixedDelayMs = value; }
    public String getFirebaseServiceAccountJsonBase64() { return firebaseServiceAccountJsonBase64; }
    public void setFirebaseServiceAccountJsonBase64(String value) { this.firebaseServiceAccountJsonBase64 = value; }
    public String getAcsEmailConnectionString() { return acsEmailConnectionString; }
    public void setAcsEmailConnectionString(String value) { this.acsEmailConnectionString = value; }
    public String getAcsEmailSenderAddress() { return acsEmailSenderAddress; }
    public void setAcsEmailSenderAddress(String value) { this.acsEmailSenderAddress = value; }
    public String getAcsEmailReplyToAddress() { return acsEmailReplyToAddress; }
    public void setAcsEmailReplyToAddress(String value) { this.acsEmailReplyToAddress = value; }
    public String getAuthInternalBaseUrl() { return authInternalBaseUrl; }
    public void setAuthInternalBaseUrl(String value) { this.authInternalBaseUrl = value; }
    public String getAuthInternalServiceSecret() { return authInternalServiceSecret; }
    public void setAuthInternalServiceSecret(String value) { this.authInternalServiceSecret = value; }
}
