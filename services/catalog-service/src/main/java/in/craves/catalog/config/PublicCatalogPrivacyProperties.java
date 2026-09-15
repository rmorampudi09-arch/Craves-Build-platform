package in.craves.catalog.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "craves.public-catalog")
public class PublicCatalogPrivacyProperties {
    private boolean privacyEnforcementEnabled = false;

    public boolean isPrivacyEnforcementEnabled() {
        return privacyEnforcementEnabled;
    }

    public void setPrivacyEnforcementEnabled(boolean privacyEnforcementEnabled) {
        this.privacyEnforcementEnabled = privacyEnforcementEnabled;
    }
}
