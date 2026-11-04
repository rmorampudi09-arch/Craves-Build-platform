package in.craves.auth.deletion;

import jakarta.annotation.PostConstruct;
import java.net.URI;
import java.time.Duration;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/** Account deletion settings. Everything is off or blank by default, so auth starts with nothing set. */
@Component
@ConfigurationProperties(prefix = "craves.account-deletion")
public class AccountDeletionProperties {
    /** Where one service listens and the secret that proves auth is calling (referral has no credential: it is signed). */
    public static class Service {
        private String baseUrl = "";
        private String credential = "";
        public String getBaseUrl() { return baseUrl; }
        public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
        public String getCredential() { return credential; }
        public void setCredential(String credential) { this.credential = credential; }
    }

    private boolean enabled = false;
    private boolean workerEnabled = false;
    private Duration workerDelay = Duration.ofMinutes(1);
    private int waitDays = 30;
    private int reminderDays = 7;
    private Duration callTimeout = Duration.ofSeconds(20);
    private String referralHmacKeyBase64 = "";
    private Map<String, Service> services = new LinkedHashMap<>();

    @PostConstruct
    void validate() {
        if (!enabled && !workerEnabled) return;
        for (String name : AccountErasureClient.ERASE_ORDER) {
            Service service = services.get(name);
            if (service == null || !isServiceOrigin(service.baseUrl))
                throw new IllegalStateException("Account deletion base URL for " + name + " must be https");
            if (!"referral".equals(name) && isBlank(service.credential))
                throw new IllegalStateException("Account deletion credential for " + name + " is required");
        }
        try {
            if (Base64.getDecoder().decode(referralHmacKeyBase64).length < 32) throw new IllegalArgumentException();
        } catch (IllegalArgumentException error) {
            throw new IllegalStateException("Account deletion referral HMAC key must be base64 of at least 32 bytes");
        }
        if (callTimeout.isZero() || callTimeout.isNegative())
            throw new IllegalStateException("Account deletion call timeout must be positive");
    }

    /** https, or http on this machine (tests); a bare origin with no credentials, path or query. */
    private static boolean isServiceOrigin(String value) {
        try {
            URI uri = URI.create(value);
            boolean local = "http".equals(uri.getScheme())
                && List.of("localhost", "127.0.0.1", "[::1]").contains(uri.getHost());
            return ("https".equals(uri.getScheme()) || local) && uri.getHost() != null && uri.getRawUserInfo() == null
                && uri.getRawQuery() == null && uri.getRawFragment() == null
                && (uri.getRawPath() == null || uri.getRawPath().isEmpty() || uri.getRawPath().equals("/"));
        } catch (RuntimeException error) { return false; }
    }

    private static boolean isBlank(String value) { return value == null || value.isBlank(); }

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public boolean isWorkerEnabled() { return workerEnabled; }
    public void setWorkerEnabled(boolean workerEnabled) { this.workerEnabled = workerEnabled; }
    public Duration getWorkerDelay() { return workerDelay; }
    public void setWorkerDelay(Duration workerDelay) { this.workerDelay = workerDelay; }
    public int getWaitDays() { return waitDays; }
    public void setWaitDays(int waitDays) { this.waitDays = waitDays; }
    public int getReminderDays() { return reminderDays; }
    public void setReminderDays(int reminderDays) { this.reminderDays = reminderDays; }
    public Duration getCallTimeout() { return callTimeout; }
    public void setCallTimeout(Duration callTimeout) { this.callTimeout = callTimeout; }
    public String getReferralHmacKeyBase64() { return referralHmacKeyBase64; }
    public void setReferralHmacKeyBase64(String referralHmacKeyBase64) { this.referralHmacKeyBase64 = referralHmacKeyBase64; }
    public Map<String, Service> getServices() { return services; }
    public void setServices(Map<String, Service> services) { this.services = services; }
}
