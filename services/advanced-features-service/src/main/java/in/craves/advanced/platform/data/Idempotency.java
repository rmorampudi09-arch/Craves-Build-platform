package in.craves.advanced.platform.data;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.advanced.platform.web.ApiProblem;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.regex.Pattern;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Idempotency-Key support for create-style requests. The first request with a key runs; a retry with the same key
 * and body gets the stored response; the same key with a different body is refused (422).
 */
@Component
public class Idempotency {
    public record Outcome<T>(T body, boolean replayed) { }

    private static final Pattern KEY = Pattern.compile("[A-Za-z0-9._:-]{8,128}");
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public Idempotency(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public <T> Outcome<T> run(String scope, UUID actor, String key, Object request, Class<T> type, Supplier<T> action) {
        if (key == null || key.isBlank()) return new Outcome<>(action.get(), false);
        if (!KEY.matcher(key).matches()) throw ApiProblem.badRequest("INVALID_IDEMPOTENCY_KEY", "Idempotency-Key must be 8-128 safe characters");
        String hash = hash(request);
        try {
            jdbc.update("INSERT INTO adv_platform.idempotency_record (scope, actor_id, idem_key, request_hash, state) VALUES (?,?,?,?, 'IN_PROGRESS')",
                    scope, actor, key, hash);
        } catch (DuplicateKeyException duplicate) {
            List<Object[]> rows = jdbc.query("SELECT request_hash, state, response::text FROM adv_platform.idempotency_record WHERE scope=? AND actor_id=? AND idem_key=?",
                    (rs, i) -> new Object[]{rs.getString(1), rs.getString(2), rs.getString(3)}, scope, actor, key);
            if (rows.isEmpty()) throw ApiProblem.conflict("IDEMPOTENT_REQUEST_IN_PROGRESS", "Retry shortly");
            Object[] row = rows.get(0);
            if (!hash.equals(row[0])) throw ApiProblem.unprocessable("IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was used for a different request");
            if (!"COMPLETED".equals(row[1])) throw ApiProblem.conflict("IDEMPOTENT_REQUEST_IN_PROGRESS", "The first request with this key is still running");
            try {
                return new Outcome<>(json.readValue((String) row[2], type), true);
            } catch (JsonProcessingException ex) {
                throw new IllegalStateException("Stored idempotent response is unreadable", ex);
            }
        }
        try {
            T body = action.get();
            jdbc.update("UPDATE adv_platform.idempotency_record SET state='COMPLETED', response=CAST(? AS jsonb), completed_at=now() WHERE scope=? AND actor_id=? AND idem_key=?",
                    json.writeValueAsString(body), scope, actor, key);
            return new Outcome<>(body, false);
        } catch (RuntimeException | JsonProcessingException ex) {
            jdbc.update("DELETE FROM adv_platform.idempotency_record WHERE scope=? AND actor_id=? AND idem_key=? AND state='IN_PROGRESS'", scope, actor, key);
            if (ex instanceof RuntimeException runtime) throw runtime;
            throw new IllegalStateException(ex);
        }
    }

    private String hash(Object request) {
        try {
            byte[] bytes = json.writeValueAsBytes(request);
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (JsonProcessingException | NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }

    @Scheduled(fixedDelayString = "PT1H", initialDelayString = "PT5M")
    public void purgeExpired() {
        try {
            jdbc.update("DELETE FROM adv_platform.idempotency_record WHERE created_at < now() - interval '48 hours'");
        } catch (RuntimeException ignored) {
            // The platform schema may not be migrated yet; the next run retries.
        }
    }

    public static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }
}
