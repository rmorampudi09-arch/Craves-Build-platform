package in.craves.subscription.credit;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/** The refunds switch. Off: declined and paused days are added at the end, exactly as before. */
@Component
@ConfigurationProperties(prefix = "craves.subscription.refund-choice")
public class DayCreditProperties {
    private boolean enabled = false;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }
}
