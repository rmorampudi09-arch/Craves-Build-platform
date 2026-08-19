package in.craves.integration.resilience;

import jakarta.annotation.PostConstruct;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "craves.http-client")
public class IntegrationHttpClientProperties {
    private int connectTimeoutSeconds = 5;
    private int readTimeoutSeconds = 20;

    @PostConstruct
    void validate() {
        if (connectTimeoutSeconds < 1 || connectTimeoutSeconds > 60) {
            throw new IllegalStateException("Integration HTTP connectTimeoutSeconds must be between 1 and 60");
        }
        if (readTimeoutSeconds < 1 || readTimeoutSeconds > 120) {
            throw new IllegalStateException("Integration HTTP readTimeoutSeconds must be between 1 and 120");
        }
    }

    public int getConnectTimeoutSeconds() { return connectTimeoutSeconds; }
    public void setConnectTimeoutSeconds(int connectTimeoutSeconds) { this.connectTimeoutSeconds = connectTimeoutSeconds; }
    public int getReadTimeoutSeconds() { return readTimeoutSeconds; }
    public void setReadTimeoutSeconds(int readTimeoutSeconds) { this.readTimeoutSeconds = readTimeoutSeconds; }
}
