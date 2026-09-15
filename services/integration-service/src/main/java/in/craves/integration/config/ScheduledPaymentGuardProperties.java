package in.craves.integration.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class ScheduledPaymentGuardProperties {
    private final boolean enabled;

    public ScheduledPaymentGuardProperties(
        @Value("${CRAVES_SCHEDULED_PAYMENT_GUARD_ENABLED:false}") boolean enabled
    ) {
        this.enabled = enabled;
    }

    public boolean enabled() {
        return enabled;
    }
}
