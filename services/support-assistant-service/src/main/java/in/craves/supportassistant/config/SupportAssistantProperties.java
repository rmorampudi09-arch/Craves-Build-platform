package in.craves.supportassistant.config;

import java.time.Duration;
import java.util.List;
import java.util.Locale;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "craves.support-assistant")
public class SupportAssistantProperties {
    private final Ai ai = new Ai();
    private final Downstream downstream = new Downstream();
    private final Knowledge knowledge = new Knowledge();

    public Ai getAi() { return ai; }
    public Downstream getDownstream() { return downstream; }
    public Knowledge getKnowledge() { return knowledge; }

    public static class Ai {
        private boolean enabled;
        private String endpoint;
        private String deployment;
        private String tokenScope = "https://cognitiveservices.azure.com/.default";
        private int maxOutputTokens = 500;
        private Duration tokenTimeout = Duration.ofSeconds(5);
        private Duration requestTimeout = Duration.ofSeconds(20);

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public String getEndpoint() { return endpoint; }
        public void setEndpoint(String endpoint) { this.endpoint = endpoint; }
        public String getDeployment() { return deployment; }
        public void setDeployment(String deployment) { this.deployment = deployment; }
        public String getTokenScope() { return tokenScope; }
        public void setTokenScope(String tokenScope) {
            this.tokenScope = tokenScope == null ? "" : tokenScope.trim();
        }
        public int getMaxOutputTokens() { return maxOutputTokens; }
        public void setMaxOutputTokens(int maxOutputTokens) {
            this.maxOutputTokens = Math.max(64, Math.min(maxOutputTokens, 1200));
        }
        public Duration getTokenTimeout() { return tokenTimeout; }
        public void setTokenTimeout(Duration tokenTimeout) {
            this.tokenTimeout = boundedDuration(tokenTimeout, Duration.ofSeconds(1), Duration.ofSeconds(15), Duration.ofSeconds(5));
        }
        public Duration getRequestTimeout() { return requestTimeout; }
        public void setRequestTimeout(Duration requestTimeout) {
            this.requestTimeout = boundedDuration(requestTimeout, Duration.ofSeconds(2), Duration.ofSeconds(45), Duration.ofSeconds(20));
        }
    }

    public static class Downstream {
        private String orderBaseUrl;
        private String userChefBaseUrl;
        private Duration requestTimeout = Duration.ofSeconds(5);
        private List<String> allowedHosts = List.of("api.craves.in");

        public String getOrderBaseUrl() { return orderBaseUrl; }
        public void setOrderBaseUrl(String orderBaseUrl) { this.orderBaseUrl = orderBaseUrl; }
        public String getUserChefBaseUrl() { return userChefBaseUrl; }
        public void setUserChefBaseUrl(String userChefBaseUrl) { this.userChefBaseUrl = userChefBaseUrl; }
        public Duration getRequestTimeout() { return requestTimeout; }
        public void setRequestTimeout(Duration requestTimeout) {
            this.requestTimeout = boundedDuration(requestTimeout, Duration.ofSeconds(1), Duration.ofSeconds(15), Duration.ofSeconds(5));
        }
        public List<String> getAllowedHosts() { return allowedHosts; }
        public void setAllowedHosts(List<String> allowedHosts) {
            if (allowedHosts == null) {
                this.allowedHosts = List.of();
                return;
            }
            this.allowedHosts = allowedHosts.stream()
                .filter(value -> value != null && !value.isBlank())
                .map(value -> value.trim().toLowerCase(Locale.ROOT))
                .distinct()
                .limit(16)
                .toList();
        }
    }

    public static class Knowledge {
        private int maxResults = 5;
        private int maxChunkCharacters = 1800;
        public int getMaxResults() { return maxResults; }
        public void setMaxResults(int maxResults) { this.maxResults = Math.max(1, Math.min(maxResults, 8)); }
        public int getMaxChunkCharacters() { return maxChunkCharacters; }
        public void setMaxChunkCharacters(int maxChunkCharacters) {
            this.maxChunkCharacters = Math.max(400, Math.min(maxChunkCharacters, 3000));
        }
    }

    private static Duration boundedDuration(Duration value, Duration minimum, Duration maximum, Duration fallback) {
        if (value == null || value.isNegative() || value.isZero()) {
            return fallback;
        }
        if (value.compareTo(minimum) < 0) return minimum;
        if (value.compareTo(maximum) > 0) return maximum;
        return value;
    }
}
