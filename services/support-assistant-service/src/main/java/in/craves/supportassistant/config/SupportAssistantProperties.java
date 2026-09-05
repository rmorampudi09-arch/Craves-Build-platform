package in.craves.supportassistant.config;

import java.time.Duration;
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
        private int maxOutputTokens = 500;
        private Duration tokenTimeout = Duration.ofSeconds(5);
        private Duration requestTimeout = Duration.ofSeconds(20);

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public String getEndpoint() { return endpoint; }
        public void setEndpoint(String endpoint) { this.endpoint = endpoint; }
        public String getDeployment() { return deployment; }
        public void setDeployment(String deployment) { this.deployment = deployment; }
        public int getMaxOutputTokens() { return maxOutputTokens; }
        public void setMaxOutputTokens(int maxOutputTokens) { this.maxOutputTokens = Math.max(64, Math.min(maxOutputTokens, 1200)); }
        public Duration getTokenTimeout() { return tokenTimeout; }
        public void setTokenTimeout(Duration tokenTimeout) { this.tokenTimeout = tokenTimeout; }
        public Duration getRequestTimeout() { return requestTimeout; }
        public void setRequestTimeout(Duration requestTimeout) { this.requestTimeout = requestTimeout; }
    }

    public static class Downstream {
        private String orderBaseUrl;
        private String userChefBaseUrl;
        public String getOrderBaseUrl() { return orderBaseUrl; }
        public void setOrderBaseUrl(String orderBaseUrl) { this.orderBaseUrl = orderBaseUrl; }
        public String getUserChefBaseUrl() { return userChefBaseUrl; }
        public void setUserChefBaseUrl(String userChefBaseUrl) { this.userChefBaseUrl = userChefBaseUrl; }
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
}
