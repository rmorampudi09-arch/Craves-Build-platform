package in.craves.catalog.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "craves.pickup-provisioning")
public class PickupProvisioningProperties {
    private boolean enabled = false;
    private String integrationBaseUrl = "";
    private String internalServiceKey = "";
    private int batchSize = 10;
    private int maxAttempts = 12;
    private int staleMinutes = 5;
    private long fixedDelayMs = 15000;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getIntegrationBaseUrl() { return integrationBaseUrl; }
    public void setIntegrationBaseUrl(String integrationBaseUrl) { this.integrationBaseUrl = integrationBaseUrl; }
    public String getInternalServiceKey() { return internalServiceKey; }
    public void setInternalServiceKey(String internalServiceKey) { this.internalServiceKey = internalServiceKey; }
    public int getBatchSize() { return batchSize; }
    public void setBatchSize(int batchSize) { this.batchSize = batchSize; }
    public int getMaxAttempts() { return maxAttempts; }
    public void setMaxAttempts(int maxAttempts) { this.maxAttempts = maxAttempts; }
    public int getStaleMinutes() { return staleMinutes; }
    public void setStaleMinutes(int staleMinutes) { this.staleMinutes = staleMinutes; }
    public long getFixedDelayMs() { return fixedDelayMs; }
    public void setFixedDelayMs(long fixedDelayMs) { this.fixedDelayMs = fixedDelayMs; }
}
