package in.craves.integration.delivery.pidge;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** The claim commits before any provider call, and survives process or worker-lease loss. */
@Repository
public class PidgeBookingRepository {
    private final JdbcTemplate jdbc;
    public PidgeBookingRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean claim(String reference) {
        return jdbc.update("""
            INSERT INTO delivery_schema.pidge_booking (client_reference, state)
            VALUES (?, 'ATTEMPTING') ON CONFLICT (client_reference) DO NOTHING
            """, reference) == 1;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordCreated(String reference, String id) {
        int updated = jdbc.update("""
            UPDATE delivery_schema.pidge_booking SET provider_order_id=?, state='CREATED', updated_at=now()
            WHERE client_reference=? AND (provider_order_id IS NULL OR provider_order_id=?)
            """, id, reference, id);
        if (updated != 1) throw new IllegalStateException("Pidge booking journal identity mismatch");
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void mark(String reference, String state) {
        jdbc.update("UPDATE delivery_schema.pidge_booking SET state=?, updated_at=now() WHERE client_reference=?", state, reference);
    }

    public Optional<Booking> find(String reference) {
        return jdbc.query("SELECT provider_order_id, state FROM delivery_schema.pidge_booking WHERE client_reference=?",
            (rs, row) -> new Booking(rs.getString(1), rs.getString(2)), reference).stream().findFirst();
    }

    public List<String> webhookOrderIds(String reference, Instant notBefore) {
        return jdbc.queryForList("""
            SELECT DISTINCT raw_payload->>'id' FROM delivery_schema.delivery_webhook_inbox
            WHERE provider_id='pidge' AND received_at>=? AND raw_payload->'dd_channel'->>'order_id'=?
                AND raw_payload->>'id' IS NOT NULL
            LIMIT 2
            """, String.class, java.sql.Timestamp.from(notBefore.minusSeconds(120)), reference);
    }
    public record Booking(String id, String state) {}
}
