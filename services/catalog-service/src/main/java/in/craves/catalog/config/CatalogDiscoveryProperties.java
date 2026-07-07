package in.craves.catalog.config;

import java.math.BigDecimal;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "craves.discovery")
public class CatalogDiscoveryProperties {
    private BigDecimal defaultRadiusKm = BigDecimal.valueOf(10);
    private BigDecimal maxRadiusKm = BigDecimal.valueOf(15);

    public BigDecimal getDefaultRadiusKm() {
        return defaultRadiusKm;
    }

    public void setDefaultRadiusKm(BigDecimal defaultRadiusKm) {
        this.defaultRadiusKm = defaultRadiusKm;
    }

    public BigDecimal getMaxRadiusKm() {
        return maxRadiusKm;
    }

    public void setMaxRadiusKm(BigDecimal maxRadiusKm) {
        this.maxRadiusKm = maxRadiusKm;
    }
}
