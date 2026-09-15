package in.craves.integration.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "craves.providers.shiprocket.pickup-provisioning")
public class ShiprocketPickupProvisioningProperties {
    /**
     * Separate account mutation gate from shipment creation. Pickup onboarding can therefore be
     * enabled and verified before SHIPROCKET_CREATE_ENABLED is allowed to create a delivery.
     */
    private boolean enabled = false;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }
}
