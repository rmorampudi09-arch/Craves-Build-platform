package in.craves.integration.operations;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "craves.admin-operations")
public class AdminOperationsProperties {
    private boolean retryReleaseEnabled = false;
    private int listLimit = 100;

    public boolean isRetryReleaseEnabled() { return retryReleaseEnabled; }
    public void setRetryReleaseEnabled(boolean value) { this.retryReleaseEnabled = value; }
    public int getListLimit() { return Math.max(1, Math.min(listLimit, 500)); }
    public void setListLimit(int value) { this.listLimit = value; }
}
