package in.craves.integration.fleet.trip;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Craves riders in Delivery Intelligence (the owner's rule of 11 Nov 2026: every order's riders are recorded there). The
 * order's assignment lists each rider it was offered to as a candidate (ATTEMPTED, DECLINED, SKIPPED, or ACCEPTED for the
 * rider who is its courier) and, while a rider is its courier, names craves_fleet and that rider. So the dashboard shows
 * who was asked, and the delivery's outcome is scored like a courier's (DeliveryFeedbackProcessor needs the assignment).
 * trip_offer stays the record; this copies it, in a savepoint, so a failure here is logged and never fails an accept.
 * Routing ranks couriers on an assignment of its own (DeliveryIntelligenceService.assign): a rider's is made only once a
 * rider is the courier, and forgotten before a courier is booked in their place.
 */
@Component
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetIntelligence {
    private static final Logger LOGGER = LoggerFactory.getLogger(FleetIntelligence.class);
    static final String SCORING_VERSION = "CRAVES_RIDERS_V1";

    private final JdbcTemplate jdbc;
    private final TransactionTemplate savepoint;

    public FleetIntelligence(JdbcTemplate jdbc, PlatformTransactionManager transactions) {
        this.jdbc = jdbc;
        this.savepoint = new TransactionTemplate(transactions);
        this.savepoint.setPropagationBehavior(TransactionDefinition.PROPAGATION_NESTED);
    }

    /** Brings the order's assignment up to date with its riders' offers. Call it again at any time: it only adds what is new. */
    public void record(UUID chefSubOrderId) {
        try {
            savepoint.executeWithoutResult(status -> write(chefSubOrderId));
        } catch (RuntimeException exception) {
            LOGGER.error("CRAVES_ALERT alert=FLEET_INTELLIGENCE_NOT_RECORDED chefSubOrderId={} reason={}", chefSubOrderId, exception.getMessage());
        }
    }

    /**
     * Before routing books a courier for an order a rider held: the rider's assignment makes way for the courier's ranking,
     * and record() lists the riders on that one once the courier is booked.
     */
    public void forget(UUID chefSubOrderId) {
        try {
            savepoint.executeWithoutResult(status -> {
                jdbc.update("UPDATE delivery_schema.delivery_job j SET assignment_id = NULL FROM delivery_schema.delivery_assignment a "
                    + "WHERE j.chef_sub_order_id = ? AND a.id = j.assignment_id AND a.scoring_version = ?", chefSubOrderId, SCORING_VERSION);
                jdbc.update("DELETE FROM delivery_schema.delivery_assignment WHERE chef_sub_order_id = ? AND scoring_version = ?",
                    chefSubOrderId, SCORING_VERSION);
            });
        } catch (RuntimeException exception) {
            LOGGER.error("CRAVES_ALERT alert=FLEET_INTELLIGENCE_NOT_FORGOTTEN chefSubOrderId={} reason={}", chefSubOrderId, exception.getMessage());
        }
    }

    private void write(UUID chefSubOrderId) {
        // The rider's trip that is the order's delivery job: a rider is its courier.
        List<Map<String, Object>> held = jdbc.queryForList("""
            SELECT t.id AS trip_id, t.rider_id, j.id AS job_id FROM delivery_schema.delivery_job j
            JOIN fleet_schema.trip t ON t.chef_sub_order_id = j.chef_sub_order_id AND t.id::text = j.provider_delivery_id
            WHERE j.chef_sub_order_id = ? AND j.provider_id = 'craves_fleet' AND t.rider_id IS NOT NULL""", chefSubOrderId);
        UUID assignment = jdbc.queryForList("SELECT id FROM delivery_schema.delivery_assignment WHERE chef_sub_order_id = ? FOR UPDATE",
            UUID.class, chefSubOrderId).stream().findFirst().orElse(null);
        if (assignment == null) {
            if (held.isEmpty()) {
                return; // no courier yet: routing makes the assignment when it ranks couriers, and the riders join it then
            }
            // The order's context as routing stores it (AssignmentRequest), which the outcome score reads.
            assignment = UUID.randomUUID();
            if (jdbc.update("""
                INSERT INTO delivery_schema.delivery_assignment (id, chef_sub_order_id, order_id, strategy, status, scoring_version,
                  selected_provider_id, request_context)
                SELECT ?, c.chef_sub_order_id, c.order_id, 'GREEDY', 'ASSIGNED', ?, 'craves_fleet',
                       jsonb_build_object('chefSubOrderId', c.payload -> 'chefSubOrderId', 'orderId', c.payload -> 'orderId',
                         'distanceKm', c.payload -> 'distanceKm', 'orderHour', c.payload -> 'orderHour',
                         'dayOfWeek', c.payload -> 'dayOfWeek', 'area', c.payload -> 'area', 'candidates', '[]'::jsonb)
                FROM delivery_schema.delivery_command c WHERE c.chef_sub_order_id = ?""", assignment, SCORING_VERSION, chefSubOrderId) != 1) {
                LOGGER.warn("FLEET_INTELLIGENCE_NO_COMMAND chefSubOrderId={}", chefSubOrderId);
                return;
            }
        }
        // One candidate per offer, with the offer's id, after those already there. No score is invented: riders are not ranked
        // by Delivery Intelligence, and no pickup time is promised, so the outcome score counts completion only.
        jdbc.update("""
            INSERT INTO delivery_schema.delivery_assignment_candidate (id, assignment_id, provider_id, agent_id, candidate_rank,
              pickup_distance_km, quoted_cost, currency, predicted_success_probability, combined_score, stored_avg, momentum,
              exploration_sample, provider_quality_score, proximity_score, final_score, status, provider_metadata, created_at)
            SELECT o.id, ?, 'craves_fleet', o.rider_id::text,
                   (SELECT COALESCE(MAX(candidate_rank), 0) FROM delivery_schema.delivery_assignment_candidate WHERE assignment_id = ?)
                     + row_number() OVER (ORDER BY o.offered_at, o.id),
                   o.pickup_distance_m / 1000.0, o.pay_paise / 100.0, 'INR', 0, 0, 0, 'INSUFFICIENT_DATA', 0, 0, 0, 0, 'ATTEMPTED',
                   jsonb_build_object('round', o.round, 'reason', o.reason), o.offered_at
            FROM fleet_schema.trip_offer o JOIN fleet_schema.trip t ON t.id = o.trip_id
            WHERE t.chef_sub_order_id = ?
              AND NOT EXISTS (SELECT 1 FROM delivery_schema.delivery_assignment_candidate c WHERE c.id = o.id)""",
            assignment, assignment, chefSubOrderId);
        // ACCEPTED only for the rider who is the courier; a rider who accepted and lost the order reads FAILED.
        jdbc.update("""
            UPDATE delivery_schema.delivery_assignment_candidate c SET status = s.status, updated_at = now()
            FROM (SELECT o.id, CASE WHEN o.state = 'ACCEPTED' AND o.trip_id = CAST(? AS uuid) THEN 'ACCEPTED'
                                    WHEN o.state = 'ACCEPTED' THEN 'FAILED'
                                    WHEN o.state = 'DECLINED' THEN 'DECLINED'
                                    WHEN o.state IN ('WITHDRAWN', 'LOST') THEN 'SKIPPED'
                                    ELSE 'ATTEMPTED' END AS status
                  FROM fleet_schema.trip_offer o JOIN fleet_schema.trip t ON t.id = o.trip_id WHERE t.chef_sub_order_id = ?) s
            WHERE c.id = s.id AND c.assignment_id = ? AND c.status <> s.status""",
            held.isEmpty() ? null : held.get(0).get("trip_id").toString(), chefSubOrderId, assignment);
        if (!held.isEmpty()) {
            Map<String, Object> rider = held.get(0);
            jdbc.update("""
                UPDATE delivery_schema.delivery_assignment SET status = 'ASSIGNED', selected_provider_id = 'craves_fleet', selected_agent_id = ?,
                  selected_candidate_id = (SELECT o.id FROM fleet_schema.trip_offer o WHERE o.trip_id = ? AND o.state = 'ACCEPTED'),
                  updated_at = now() WHERE id = ?""", rider.get("rider_id").toString(), rider.get("trip_id"), assignment);
            jdbc.update("UPDATE delivery_schema.delivery_job SET assignment_id = ?, assigned_agent_id = ? WHERE id = ?", assignment,
                rider.get("rider_id").toString(), rider.get("job_id"));
        }
    }
}
