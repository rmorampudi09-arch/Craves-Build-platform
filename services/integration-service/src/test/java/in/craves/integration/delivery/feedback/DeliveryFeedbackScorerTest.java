package in.craves.integration.delivery.feedback;

import static org.assertj.core.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.delivery.feedback.DeliveryFeedbackRepository.Evidence;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class DeliveryFeedbackScorerTest {
    final DeliveryFeedbackScorer scorer = new DeliveryFeedbackScorer();
    final Instant booked = Instant.parse("2026-09-12T12:00:00Z");
    Evidence evidence(String status, Double promise, Instant pickup) {
        UUID order=UUID.randomUUID(), sub=UUID.randomUUID();
        var context=new ObjectMapper().createObjectNode().put("orderId",order.toString())
            .put("chefSubOrderId",sub.toString()).put("distanceKm",4.0).put("area","Madhapur")
            .put("orderHour",18).put("dayOfWeek",5);
        return new Evidence(UUID.randomUUID(),sub,order,"pidge",status,booked,booked.plusSeconds(3600),
            context,"pidge",promise,pickup);
    }
    @Test void completionAloneDoesNotInventMissingMeasurements() {
        var score=scorer.score(evidence("DELIVERED",null,null));
        assertThat(score.compositeScore()).isEqualTo(100);
        assertThat(score.breakdown()).containsEntry("observed_weight",0.30)
            .doesNotContainKeys("pickup_timeliness","delivery_timeliness","cost_efficiency","customer_rating_component");
    }
    @Test void lateObservedPickupChangesPerformanceScore() {
        var timely=scorer.score(evidence("DELIVERED",10.0,booked.plusSeconds(600)));
        var late=scorer.score(evidence("DELIVERED",10.0,booked.plusSeconds(2400)));
        assertThat(timely.compositeScore()).isEqualTo(100);
        assertThat(late.compositeScore()).isLessThan(70);
        assertThat(late.breakdown()).containsEntry("observed_weight",0.45);
    }
    @Test void failedAndReturnedDeliveriesAreFailures() {
        for (String status : new String[]{"FAILED","RETURNED"}) {
            var e=evidence(status,10.0,booked.plusSeconds(600));
            assertThat(scorer.context(e).status().name()).isEqualTo("FAILED");
            assertThat(scorer.score(e).compositeScore()).isZero();
        }
    }
    @Test void inferredOrInvalidPickupTimingIsExcluded() {
        for (Instant pickup : new Instant[]{null,booked.minusSeconds(1),booked.plusSeconds(4000)})
            assertThat(scorer.score(evidence("DELIVERED",10.0,pickup)).breakdown()).doesNotContainKey("pickup_timeliness");
        for (Double promise : new Double[]{null,0.0,-1.0,Double.NaN,Double.POSITIVE_INFINITY})
            assertThat(scorer.score(evidence("DELIVERED",promise,booked.plusSeconds(600))).breakdown())
                .doesNotContainKey("pickup_timeliness");
    }
    @Test void invalidOrMismatchedAssignmentCannotTrain() {
        var e=evidence("DELIVERED",null,null);
        ((com.fasterxml.jackson.databind.node.ObjectNode)e.context()).put("orderId",UUID.randomUUID().toString());
        assertThatThrownBy(()->scorer.context(e)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(()->scorer.context(evidence("CANCELLED",null,null))).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(()->scorer.context(evidence("IN_TRANSIT",null,null))).isInstanceOf(IllegalStateException.class);
    }
    @Test void invalidLimitsFailStartup() {
        var p=new DeliveryFeedbackProperties(); p.setBatchSize(1000000);
        assertThatThrownBy(p::validate).isInstanceOf(IllegalStateException.class);
    }
}
