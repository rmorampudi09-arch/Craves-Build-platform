package in.craves.integration.payment;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
public class RazorpayWebhookInboxService {
    private static final int MAX_PAYLOAD_BYTES = 1_048_576;

    private final JdbcTemplate jdbcTemplate;
    private final RazorpayPaymentClient paymentClient;
    private final RazorpayWebhookProperties workerProperties;

    public RazorpayWebhookInboxService(
        JdbcTemplate jdbcTemplate,
        RazorpayPaymentClient paymentClient,
        RazorpayWebhookProperties workerProperties
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.paymentClient = paymentClient;
        this.workerProperties = workerProperties;
    }

    @Transactional
    public boolean accept(String signature, String eventId, String rawBody) {
        String eventIdentity = validate(signature, eventId, rawBody);
        int inserted = jdbcTemplate.update(
            "INSERT INTO payment_schema.razorpay_webhook_delivery " +
                "(id, event_identity, webhook_signature, raw_payload, processing_status, next_attempt_at, first_seen_at, last_seen_at) " +
                "VALUES (?, ?, ?, ?, 'RECEIVED', now(), now(), now()) ON CONFLICT (event_identity) DO NOTHING",
            UUID.randomUUID(), eventIdentity, signature.trim(), rawBody
        );
        if (inserted == 1) {
            return true;
        }

        String existingPayload = jdbcTemplate.query(
            "SELECT raw_payload FROM payment_schema.razorpay_webhook_delivery WHERE event_identity = ?",
            (rs, rowNum) -> rs.getString("raw_payload"),
            eventIdentity
        ).stream().findFirst().orElseThrow();
        if (!MessageDigest.isEqual(
            existingPayload.getBytes(StandardCharsets.UTF_8),
            rawBody.getBytes(StandardCharsets.UTF_8)
        )) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Razorpay event identity was reused with different content");
        }
        jdbcTemplate.update(
            "UPDATE payment_schema.razorpay_webhook_delivery SET last_seen_at = now() WHERE event_identity = ?",
            eventIdentity
        );
        return false;
    }

    @Transactional
    public List<WorkItem> claimBatch() {
        UUID lockToken = UUID.randomUUID();
        String sql = """
            WITH candidates AS (
                SELECT id
                  FROM payment_schema.razorpay_webhook_delivery
                 WHERE (
                    processing_status IN ('RECEIVED', 'FAILED') AND next_attempt_at <= now()
                 ) OR (
                    processing_status = 'PROCESSING'
                    AND processing_started_at < now() - (? * INTERVAL '1 minute')
                 )
                 ORDER BY next_attempt_at, first_seen_at
                 FOR UPDATE SKIP LOCKED
                 LIMIT ?
            )
            UPDATE payment_schema.razorpay_webhook_delivery d
               SET processing_status = 'PROCESSING',
                   lock_token = ?,
                   processing_started_at = now(),
                   attempt_count = attempt_count + 1,
                   last_error = NULL
              FROM candidates c
             WHERE d.id = c.id
            RETURNING d.id, d.event_identity, d.webhook_signature, d.raw_payload, d.attempt_count
            """;
        return jdbcTemplate.query(
            sql,
            (rs, rowNum) -> new WorkItem(
                rs.getObject("id", UUID.class),
                lockToken,
                rs.getString("event_identity"),
                rs.getString("webhook_signature"),
                rs.getString("raw_payload"),
                rs.getInt("attempt_count")
            ),
            workerProperties.getStaleMinutes(), workerProperties.getBatchSize(), lockToken
        );
    }

    public void complete(WorkItem item) {
        jdbcTemplate.update(
            "UPDATE payment_schema.razorpay_webhook_delivery " +
                "SET processing_status = 'COMPLETED', completed_at = now(), lock_token = NULL, processing_started_at = NULL " +
                "WHERE id = ? AND lock_token = ?",
            item.id(), item.lockToken()
        );
    }

    public void fail(WorkItem item, Throwable error) {
        boolean dead = item.attemptCount() >= workerProperties.getMaxAttempts();
        long delaySeconds = Math.min(
            3600L,
            (long) workerProperties.getRetryBaseSeconds() * (1L << Math.min(10, Math.max(0, item.attemptCount() - 1)))
        );
        jdbcTemplate.update(
            "UPDATE payment_schema.razorpay_webhook_delivery " +
                "SET processing_status = ?, next_attempt_at = now() + (? * INTERVAL '1 second'), last_error = ?, " +
                "lock_token = NULL, processing_started_at = NULL WHERE id = ? AND lock_token = ?",
            dead ? "DEAD_LETTER" : "FAILED",
            dead ? 0L : delaySeconds,
            safe(error),
            item.id(),
            item.lockToken()
        );
    }

    public long countNonTerminal() {
        Long value = jdbcTemplate.queryForObject(
            "SELECT count(*) FROM payment_schema.razorpay_webhook_delivery WHERE processing_status IN ('RECEIVED','PROCESSING','FAILED')",
            Long.class
        );
        return value == null ? 0L : value;
    }

    public long countDeadLetters() {
        Long value = jdbcTemplate.queryForObject(
            "SELECT count(*) FROM payment_schema.razorpay_webhook_delivery WHERE processing_status = 'DEAD_LETTER'",
            Long.class
        );
        return value == null ? 0L : value;
    }

    private String validate(String signature, String eventId, String rawBody) {
        if (!StringUtils.hasText(signature)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "X-Razorpay-Signature is required");
        }
        if (signature.trim().length() > 512) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Razorpay webhook signature is too long");
        }
        if (rawBody == null || rawBody.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Razorpay webhook payload is empty");
        }
        if (rawBody.getBytes(StandardCharsets.UTF_8).length > MAX_PAYLOAD_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Razorpay webhook payload is too large");
        }
        if (!paymentClient.verifyWebhook(rawBody, signature)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid Razorpay webhook signature");
        }
        String identity = StringUtils.hasText(eventId) ? eventId.trim() : derivedEventIdentity(rawBody);
        if (identity.length() > 180) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Razorpay event identity is too long");
        }
        return identity;
    }

    static String derivedEventIdentity(String rawBody) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(rawBody.getBytes(StandardCharsets.UTF_8));
            return "derived-" + HexFormat.of().formatHex(digest);
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private static String safe(Throwable error) {
        String value = error == null ? "Unknown Razorpay webhook processing failure" : error.getMessage();
        if (!StringUtils.hasText(value)) {
            value = error.getClass().getSimpleName();
        }
        value = value.replace('\n', ' ').replace('\r', ' ').trim();
        return value.length() > 1000 ? value.substring(0, 1000) : value;
    }

    public record WorkItem(
        UUID id,
        UUID lockToken,
        String eventIdentity,
        String signature,
        String rawPayload,
        int attemptCount
    ) {}
}
