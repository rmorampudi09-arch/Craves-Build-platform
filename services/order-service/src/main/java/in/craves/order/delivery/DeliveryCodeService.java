package in.craves.order.delivery;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The 4-digit code a Craves rider checks at the door. Never log it, put it in an event or give it to chefs or admins. */
@Service
public class DeliveryCodeService {
    // Provider id of Craves' own riders (PLAN F5); Borzo and Pidge riders never get this code.
    public static final String CRAVES_FLEET_PROVIDER_ID = "craves_fleet";
    public static final int MAX_FAILED_ATTEMPTS = 5;
    private static final Set<String> CARRYING_STATUSES = Set.of("PICKED_UP", "IN_TRANSIT", "AT_DROPOFF");
    private static final SecureRandom RANDOM = new SecureRandom();

    private final JdbcTemplate jdbc;

    public DeliveryCodeService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Idempotent: an order keeps its first code. */
    public void ensureCode(UUID orderId) {
        jdbc.update(
            """
                INSERT INTO order_schema.order_delivery_code (order_id, code)
                VALUES (?, ?)
                ON CONFLICT (order_id) DO NOTHING
                """,
            orderId,
            String.format("%04d", RANDOM.nextInt(10_000))
        );
    }

    /** The code only while a Craves rider carries the order and it is not yet used; otherwise null. */
    public String codeForCustomer(UUID orderId, String providerId, String deliveryStatus) {
        if (!CRAVES_FLEET_PROVIDER_ID.equals(providerId) || !CARRYING_STATUSES.contains(deliveryStatus)) {
            return null;
        }
        return jdbc.query(
            "SELECT code FROM order_schema.order_delivery_code WHERE order_id = ? AND verified_at IS NULL",
            (resultSet, rowNumber) -> resultSet.getString("code"),
            orderId
        ).stream().findFirst().orElse(null);
    }

    @Transactional
    public Verification verify(UUID orderId, String code) {
        Stored stored = jdbc.query(
            """
                SELECT code, failed_attempts, verified_at IS NOT NULL AS verified
                FROM order_schema.order_delivery_code
                WHERE order_id = ?
                FOR UPDATE
                """,
            (resultSet, rowNumber) -> new Stored(
                resultSet.getString("code"),
                resultSet.getInt("failed_attempts"),
                resultSet.getBoolean("verified")
            ),
            orderId
        ).stream().findFirst().orElse(null);
        if (stored == null) {
            return new Verification(Outcome.NOT_FOUND, 0);
        }
        if (stored.verified()) {
            return new Verification(Outcome.VERIFIED, 0);
        }
        if (stored.failedAttempts() >= MAX_FAILED_ATTEMPTS) {
            return new Verification(Outcome.LOCKED, 0);
        }
        byte[] given = code == null ? new byte[0] : code.getBytes(StandardCharsets.UTF_8);
        if (MessageDigest.isEqual(stored.code().getBytes(StandardCharsets.UTF_8), given)) {
            jdbc.update("UPDATE order_schema.order_delivery_code SET verified_at = now() WHERE order_id = ?", orderId);
            return new Verification(Outcome.VERIFIED, 0);
        }
        jdbc.update(
            "UPDATE order_schema.order_delivery_code SET failed_attempts = failed_attempts + 1 WHERE order_id = ?",
            orderId
        );
        return new Verification(Outcome.INVALID, MAX_FAILED_ATTEMPTS - stored.failedAttempts() - 1);
    }

    public enum Outcome { NOT_FOUND, VERIFIED, LOCKED, INVALID }

    public record Verification(Outcome outcome, int attemptsLeft) {
    }

    private record Stored(String code, int failedAttempts, boolean verified) {
    }
}
