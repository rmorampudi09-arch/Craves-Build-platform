package in.craves.subscription.capacity;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(
    prefix = "craves.subscription.capacity",
    name = "projection-scheduler-enabled",
    havingValue = "true"
)
public class CapacityProjectionWorker {
    private static final Logger LOGGER = LoggerFactory.getLogger(CapacityProjectionWorker.class);

    private final CapacityService service;

    public CapacityProjectionWorker(CapacityService service) {
        this.service = service;
    }

    @Scheduled(fixedDelayString = "${craves.subscription.capacity.projection-fixed-delay-ms:60000}")
    public void extendProjection() {
        int processed = service.extendProjectionBatch();
        if (processed > 0) {
            LOGGER.info("Subscription capacity projection extended subscriptions={}", processed);
        }
    }
}
