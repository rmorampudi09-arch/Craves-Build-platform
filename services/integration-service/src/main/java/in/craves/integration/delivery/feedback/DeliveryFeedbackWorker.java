package in.craves.integration.delivery.feedback;

import in.craves.integration.config.DeliveryIntelligenceProperties;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class DeliveryFeedbackWorker {
    private static final Logger log = LoggerFactory.getLogger(DeliveryFeedbackWorker.class);
    private final DeliveryFeedbackRepository repository;
    private final DeliveryFeedbackProcessor processor;
    private final DeliveryFeedbackProperties properties;
    private final DeliveryIntelligenceProperties intelligence;
    private volatile Instant lastSuccessfulPoll;
    public DeliveryFeedbackWorker(DeliveryFeedbackRepository repository, DeliveryFeedbackProcessor processor,
                                  DeliveryFeedbackProperties properties, DeliveryIntelligenceProperties intelligence) {
        this.repository=repository; this.processor=processor; this.properties=properties; this.intelligence=intelligence;
    }
    public boolean enabled() { return properties.isEnabled() && intelligence.isEnabled(); }
    public Instant lastSuccessfulPoll() { return lastSuccessfulPoll; }

    @Scheduled(fixedDelay = 2000, scheduler = "deliveryFeedbackScheduler")
    public void run() {
        if (!enabled()) return;
        // One claim at a time avoids expiring the last leases in a slow batch.
        // Dedicated scheduler + bounded work avoids starving delivery status/dispatch tasks.
        try {
            for (int i=0; i<properties.getBatchSize(); i++) {
                var claims = repository.claim(1, properties.getMaxAttempts());
                lastSuccessfulPoll = Instant.now();
                if (claims.isEmpty()) return;
                var claim = claims.getFirst();
                try { processor.process(claim); }
                catch (RuntimeException ex) {
                    repository.failed(claim, properties.getMaxAttempts());
                    log.warn("Delivery outcome feedback deferred: deliveryJobId={}, attempt={}, errorType={}",
                        claim.id(), claim.attempt(), ex.getClass().getSimpleName());
                }
            }
        } catch (RuntimeException ex) {
            log.warn("Delivery feedback polling deferred: errorType={}", ex.getClass().getSimpleName());
        }
    }
}
