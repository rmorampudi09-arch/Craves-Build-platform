package in.craves.userchef.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "craves.document-store")
public class DocumentStoreProperties {
    private String endpointValue;
    private String container = "documents";
    private long maxFileSizeBytes = 10 * 1024 * 1024;

    public String getEndpointValue() {
        return endpointValue;
    }

    public void setEndpointValue(String endpointValue) {
        this.endpointValue = endpointValue;
    }

    public String getContainer() {
        return container;
    }

    public void setContainer(String container) {
        this.container = container;
    }

    public long getMaxFileSizeBytes() {
        return maxFileSizeBytes;
    }

    public void setMaxFileSizeBytes(long maxFileSizeBytes) {
        this.maxFileSizeBytes = maxFileSizeBytes;
    }
}
