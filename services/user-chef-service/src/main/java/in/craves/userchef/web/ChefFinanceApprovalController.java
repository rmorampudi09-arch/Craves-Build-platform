package in.craves.userchef.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/** Approval already includes document review. Never manufactures tax declarations or bank verification. */
@RestController
public class ChefFinanceApprovalController {
    public record Approval(UUID chefId, UUID applicationId, String stateCode, Instant reviewedAt) {}
    public record Snapshot(UUID requestId, Instant evaluatedAt, boolean complete, List<Approval> approvals) {}
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final String key;
    public ChefFinanceApprovalController(JdbcTemplate jdbc, ObjectMapper json,
            @Value("${CRAVES_BANK_INTERNAL_KEY:}") String key) {
        this.jdbc = jdbc; this.json = json; this.key = key;
    }
    @PostMapping(path = ChefFinanceApprovalProtocol.PATH, consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<byte[]> read(HttpServletRequest request) {
        if (key == null || key.length() < 32 || key.length() > 512) return failure(HttpStatus.SERVICE_UNAVAILABLE);
        try {
            String time = request.getHeader(ChefFinanceApprovalProtocol.TIME);
            if (time == null || !time.matches("[0-9]{10}")
                    || Math.abs(Instant.now().getEpochSecond() - Long.parseLong(time)) > 15) return failure(HttpStatus.UNAUTHORIZED);
            byte[] body = request.getInputStream().readNBytes(257);
            if (body.length > 256 || !ChefFinanceApprovalProtocol.matches(
                    ChefFinanceApprovalProtocol.sign(key, "POST", time, body),
                    request.getHeader(ChefFinanceApprovalProtocol.SIGNATURE))) return failure(HttpStatus.UNAUTHORIZED);
            var node = json.reader().with(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                .with(com.fasterxml.jackson.core.JsonParser.Feature.STRICT_DUPLICATE_DETECTION).readTree(body);
            if (node == null || !node.isObject() || node.size() != 1 || !node.path("requestId").isTextual())
                return failure(HttpStatus.BAD_REQUEST);
            UUID id = UUID.fromString(node.path("requestId").asText());
            if (!id.toString().equals(node.path("requestId").asText())) return failure(HttpStatus.BAD_REQUEST);
            List<Approval> rows = jdbc.query("SELECT identity_id,id,state,COALESCE(reviewed_at,updated_at) FROM chef_application " +
                "WHERE status='APPROVED' " +
                "ORDER BY identity_id LIMIT ?", (rs,n) -> new Approval(rs.getObject(1,UUID.class),
                    rs.getObject(2,UUID.class), stateCode(rs.getString(3)), rs.getTimestamp(4).toInstant()),
                ChefFinanceApprovalProtocol.MAX_CHEFS + 1);
            boolean complete = rows.size() <= ChefFinanceApprovalProtocol.MAX_CHEFS;
            var snapshot = new Snapshot(id, Instant.now(), complete, complete ? List.copyOf(rows) : List.of());
            byte[] response = json.writeValueAsBytes(snapshot);
            if (response.length > ChefFinanceApprovalProtocol.MAX_BYTES) return failure(HttpStatus.SERVICE_UNAVAILABLE);
            String responseTime = Long.toString(snapshot.evaluatedAt().getEpochSecond());
            return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON)
                .header("Cache-Control", "no-store, private").header("Pragma", "no-cache")
                .header(ChefFinanceApprovalProtocol.TIME, responseTime)
                .header(ChefFinanceApprovalProtocol.SIGNATURE,
                    ChefFinanceApprovalProtocol.sign(key, "RESPONSE", responseTime, response)).body(response);
        } catch (IllegalArgumentException | com.fasterxml.jackson.core.JsonProcessingException ex) { return failure(HttpStatus.BAD_REQUEST); }
        catch (Exception ex) { return failure(HttpStatus.SERVICE_UNAVAILABLE); }
    }
    static String stateCode(String state) {
        if (state == null) return "UNSUPPORTED";
        return switch (state.trim().toUpperCase(Locale.ROOT)) {
            case "36", "TS", "TG", "TELANGANA" -> "36";
            default -> "UNSUPPORTED";
        };
    }
    private static ResponseEntity<byte[]> failure(HttpStatus status) {
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_JSON)
            .header("Cache-Control", "no-store, private").header("Pragma", "no-cache")
            .body("{\"code\":\"CHEF_APPROVAL_AUTHORITY_UNAVAILABLE\"}".getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }
}
