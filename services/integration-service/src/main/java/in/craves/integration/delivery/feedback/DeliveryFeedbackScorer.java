package in.craves.integration.delivery.feedback;

import in.craves.integration.delivery.DeliveryOutcomeScorer.ScoredOutcome;
import in.craves.integration.delivery.DeliveryMetricsRepository.OutcomeContext;
import in.craves.integration.delivery.DeliveryIntelligenceModels.OutcomeStatus;
import in.craves.integration.delivery.feedback.DeliveryFeedbackRepository.Evidence;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class DeliveryFeedbackScorer {
    public OutcomeContext context(Evidence e) {
        var c = e.context();
        if (c == null || !c.isObject() || !e.providerId().equals(e.selectedProviderId())
            || !e.orderId().toString().equals(c.path("orderId").asText())
            || !e.subOrderId().toString().equals(c.path("chefSubOrderId").asText())
            || !c.path("distanceKm").isNumber() || !Double.isFinite(c.path("distanceKm").asDouble())
            || c.path("distanceKm").asDouble() < 0 || !c.path("area").isTextual()
            || c.path("area").asText().isBlank() || c.path("area").asText().length() > 160
            || !c.path("orderHour").isIntegralNumber() || c.path("orderHour").asInt() < 0
            || c.path("orderHour").asInt() > 23 || !c.path("dayOfWeek").isIntegralNumber()
            || c.path("dayOfWeek").asInt() < 0 || c.path("dayOfWeek").asInt() > 6
            || e.terminalAt() == null || e.bookedAt() == null || e.terminalAt().isBefore(e.bookedAt()))
            throw new IllegalStateException("Delivery evidence does not match its assignment");
        OutcomeStatus status = switch (e.status()) {
            case "DELIVERED" -> OutcomeStatus.DELIVERED;
            case "FAILED", "RETURNED" -> OutcomeStatus.FAILED;
            default -> throw new IllegalStateException("Outcome is not attributable to provider performance");
        };
        return new OutcomeContext(e.id(), e.subOrderId(), e.orderId(), e.providerId(), status,
            c.path("distanceKm").asDouble(), c.path("area").asText(),
            c.path("orderHour").asInt(), c.path("dayOfWeek").asInt());
    }

    public ScoredOutcome score(Evidence e) {
        boolean delivered = "DELIVERED".equals(e.status());
        Map<String, Double> breakdown = new LinkedHashMap<>();
        breakdown.put("completion", delivered ? 100.0 : 0.0);
        double weight = 0.30;
        double weighted = delivered ? 30.0 : 0.0;
        // Exact PICKED_UP events only. delivery_job.picked_up_at can be inferred from a
        // later status, so it is deliberately not used as timing evidence.
        if (delivered && e.promisedPickupMinutes() != null && Double.isFinite(e.promisedPickupMinutes())
            && e.promisedPickupMinutes() > 0 && e.pickupAt() != null && e.bookedAt() != null
            && !e.pickupAt().isBefore(e.bookedAt()) && !e.pickupAt().isAfter(e.terminalAt())) {
            double actual = Duration.between(e.bookedAt(), e.pickupAt()).toMillis() / 60000.0;
            double promised = e.promisedPickupMinutes();
            double delay = Math.max(0, actual - promised * 1.10);
            double timing = 100 * Math.exp(-delay / Math.max(promised, 1));
            breakdown.put("pickup_timeliness", round(timing));
            weighted += 0.15 * timing;
            weight += 0.15;
        }
        // No final charge, confirmed complaint/rating or contractually comparable delivery
        // promise is present in canonical callbacks. These components remain absent.
        breakdown.put("observed_weight", round(weight));
        breakdown.put("automatic_feedback_version", 1.0);
        return new ScoredOutcome(round(weighted / weight), Map.copyOf(breakdown));
    }
    private static double round(double value) { return Math.round(value * 100.0) / 100.0; }
}
