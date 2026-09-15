package in.craves.integration.delivery.feedback;

import in.craves.integration.delivery.InternalRequestAuthorizer;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class DeliveryFeedbackController {
    private final DeliveryFeedbackWorker worker;
    private final DeliveryFeedbackRepository repository;
    private final InternalRequestAuthorizer authorizer;
    public DeliveryFeedbackController(DeliveryFeedbackWorker worker, DeliveryFeedbackRepository repository,
                                      InternalRequestAuthorizer authorizer) {
        this.worker=worker; this.repository=repository; this.authorizer=authorizer;
    }
    @GetMapping("/internal/v1/delivery-intelligence/feedback/readiness")
    public Map<String, Object> readiness(@RequestHeader("X-Craves-Internal-Secret") String secret) {
        authorizer.requireValid(secret);
        var result = new LinkedHashMap<String, Object>(repository.health());
        result.put("enabled", worker.enabled());
        result.put("lastSuccessfulPoll", worker.lastSuccessfulPoll());
        result.put("scoringVersion", "OBSERVED_TERMINAL_V1");
        result.put("automaticComponents", java.util.List.of("completion", "observed_pickup_timeliness"));
        return result;
    }
}
