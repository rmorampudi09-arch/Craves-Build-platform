package in.craves.integration.delivery.feedback;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class DeliveryFeedbackRepository {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    public DeliveryFeedbackRepository(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc; this.mapper = mapper;
    }

    @Transactional(timeout = 10)
    public List<Claim> claim(int limit, int maxAttempts) {
        UUID token = UUID.randomUUID();
        // Exhausted crash leases become visible dead letters; never endlessly recycled.
        jdbc.update("""
            WITH due AS (
                SELECT delivery_job_id FROM delivery_schema.delivery_outcome_feedback
                WHERE status IN ('PENDING','RETRY','PROCESSING') AND available_at <= now()
                  AND attempt_count >= ? ORDER BY available_at, delivery_job_id
                LIMIT ? FOR UPDATE SKIP LOCKED
            ) UPDATE delivery_schema.delivery_outcome_feedback f
              SET status='DEAD_LETTER', lease_token=NULL, result_code='ATTEMPTS_EXHAUSTED', completed_at=now()
              FROM due WHERE f.delivery_job_id=due.delivery_job_id
            """, maxAttempts, limit);
        return jdbc.query("""
            WITH due AS (
                SELECT delivery_job_id FROM delivery_schema.delivery_outcome_feedback
                WHERE status IN ('PENDING','RETRY','PROCESSING') AND available_at <= now()
                  AND attempt_count < ? ORDER BY available_at, delivery_job_id
                LIMIT ? FOR UPDATE SKIP LOCKED
            ) UPDATE delivery_schema.delivery_outcome_feedback f
              SET status='PROCESSING', attempt_count=attempt_count+1,
                  available_at=now()+interval '120 seconds', lease_token=?, result_code=NULL
              FROM due WHERE f.delivery_job_id=due.delivery_job_id
              RETURNING f.delivery_job_id, f.lease_token, f.attempt_count
            """, (rs, n) -> new Claim(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getInt(3)),
            maxAttempts, limit, token);
    }

    public boolean lock(Claim claim) {
        jdbc.execute("SET LOCAL lock_timeout = '2s'");
        jdbc.execute("SET LOCAL statement_timeout = '8s'");
        return !jdbc.queryForList("""
            SELECT delivery_job_id FROM delivery_schema.delivery_outcome_feedback
            WHERE delivery_job_id=? AND lease_token=? AND status='PROCESSING'
              AND available_at > now() FOR UPDATE
            """, UUID.class, claim.id(), claim.token()).isEmpty();
    }

    public Evidence evidence(UUID id) {
        return jdbc.query("""
            SELECT j.id, j.chef_sub_order_id, j.order_id, j.provider_id, j.status,
                   j.booked_at, j.last_status_observed_at, a.request_context,
                   a.selected_provider_id, c.pickup_eta_minutes,
                   (SELECT min(e.occurred_at) FROM delivery_schema.delivery_event e
                    WHERE e.delivery_job_id=j.id AND e.provider_id=j.provider_id AND e.applied
                      AND e.normalized_status='PICKED_UP') AS pickup_observed_at
            FROM delivery_schema.delivery_job j
            LEFT JOIN delivery_schema.delivery_assignment a ON a.id=j.assignment_id
              AND a.order_id=j.order_id AND a.chef_sub_order_id=j.chef_sub_order_id
            LEFT JOIN delivery_schema.delivery_assignment_candidate c ON c.id=a.selected_candidate_id
              AND c.assignment_id=a.id AND c.provider_id=j.provider_id AND c.status='ACCEPTED'
            WHERE j.id=?
            """, (rs, n) -> new Evidence(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class),
                rs.getObject(3, UUID.class), rs.getString(4), rs.getString(5), instant(rs.getTimestamp(6)),
                instant(rs.getTimestamp(7)), json(rs.getString(8)), rs.getString(9),
                rs.getObject(10, Double.class), instant(rs.getTimestamp(11))), id).stream().findFirst().orElseThrow();
    }

    public void complete(Claim claim, String status, String result) {
        int changed = jdbc.update("""
            UPDATE delivery_schema.delivery_outcome_feedback
            SET status=?, result_code=?, scoring_version='OBSERVED_TERMINAL_V1',
                completed_at=now(), lease_token=NULL
            WHERE delivery_job_id=? AND lease_token=? AND status='PROCESSING'
            """, status, result, claim.id(), claim.token());
        if (changed != 1) throw new IllegalStateException("Feedback lease was lost");
    }

    @Transactional(timeout = 10)
    public void failed(Claim claim, int maxAttempts) {
        jdbc.update("""
            UPDATE delivery_schema.delivery_outcome_feedback
            SET status=?, result_code='PROCESSING_FAILED', lease_token=NULL,
                available_at=now()+make_interval(secs => ?),
                completed_at=CASE WHEN ? THEN now() ELSE NULL END
            WHERE delivery_job_id=? AND lease_token=? AND status='PROCESSING'
            """, claim.attempt() >= maxAttempts ? "DEAD_LETTER" : "RETRY",
            Math.min(300, 1 << Math.min(9, claim.attempt())), claim.attempt() >= maxAttempts,
            claim.id(), claim.token());
    }

    public Map<String, Object> health() {
        // Bounded index reads; completed history is never scanned on a health request.
        return jdbc.queryForMap("""
            SELECT (SELECT count(*) FROM (SELECT 1 FROM delivery_schema.delivery_outcome_feedback
                       WHERE status IN ('PENDING','RETRY','PROCESSING') LIMIT 10001) q) AS outstanding_capped,
                   (SELECT count(*) FROM (SELECT 1 FROM delivery_schema.delivery_outcome_feedback
                       WHERE status='DEAD_LETTER' LIMIT 10001) q) AS dead_letters_capped,
                   (SELECT min(available_at) FROM delivery_schema.delivery_outcome_feedback
                       WHERE status IN ('PENDING','RETRY','PROCESSING')) AS oldest_available_at,
                   EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='delivery_outcome_feedback_capture'
                       AND tgrelid='delivery_schema.delivery_job'::regclass AND tgenabled='O') AS capture_enabled
            """);
    }
    private JsonNode json(String value) {
        try { return value == null ? mapper.nullNode() : mapper.readTree(value); }
        catch (Exception ex) { throw new IllegalStateException("Invalid assignment context"); }
    }
    private static Instant instant(Timestamp value) { return value == null ? null : value.toInstant(); }
    public record Claim(UUID id, UUID token, int attempt) {}
    public record Evidence(UUID id, UUID subOrderId, UUID orderId, String providerId, String status,
                           Instant bookedAt, Instant terminalAt, JsonNode context, String selectedProviderId,
                           Double promisedPickupMinutes, Instant pickupAt) {}
}
