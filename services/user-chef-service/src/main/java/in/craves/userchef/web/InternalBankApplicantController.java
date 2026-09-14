package in.craves.userchef.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** Read-only private lookup. The bank number never enters User/Chef storage. */
@RestController
public class InternalBankApplicantController {
    private static final String PATH = "/internal/v1/chef-bank/identity";
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final String secret;
    public InternalBankApplicantController(JdbcTemplate jdbc, ObjectMapper json,
            @Value("${CRAVES_BANK_INTERNAL_KEY:}") String secret) {
        this.jdbc = jdbc; this.json = json; this.secret = secret;
    }
    public record Identity(UUID chefId, UUID applicationId, String name, String email, String phone,
                           String status, Instant updatedAt) {}
    @PostMapping(PATH)
    public Identity read(@RequestBody byte[] body,
            @RequestHeader(value="X-Craves-Bank-Time", required=false) String timestamp,
            @RequestHeader(value="X-Craves-Bank-Signature", required=false) String signature) {
        verify(secret, body, timestamp, signature, Instant.now());
        UUID chef;
        try {
            var node = json.readTree(body);
            if (!node.isObject() || node.size() != 1 || !node.path("chefId").isTextual()) throw new IllegalArgumentException();
            chef = UUID.fromString(node.path("chefId").asText());
        } catch (Exception e) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid identity request"); }
        var rows = jdbc.query("SELECT id,identity_id,first_name,last_name,email,phone_number,status,updated_at FROM chef_application WHERE identity_id=?",
                (rs,n) -> new Identity(rs.getObject("identity_id",UUID.class), rs.getObject("id",UUID.class),
                        (rs.getString("first_name") + " " + rs.getString("last_name")).trim(),
                        rs.getString("email"),rs.getString("phone_number"),rs.getString("status"),
                        rs.getTimestamp("updated_at").toInstant()), chef);
        if (rows.size() != 1) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Applicant not available");
        return rows.getFirst();
    }
    public static void verify(String secret, byte[] body, String timestamp, String signature, Instant now) {
        if (secret == null || secret.length() < 32)
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Private bank identity lookup is not configured");
        try {
            if (body == null || body.length > 2048 || timestamp == null || !timestamp.matches("[0-9]{1,12}")
                    || signature == null || !signature.matches("[0-9a-f]{64}")) throw new IllegalArgumentException();
            long time = Long.parseLong(timestamp);
            if (time < now.getEpochSecond() - 300 || time > now.getEpochSecond() + 30) throw new IllegalArgumentException();
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));
            mac.update(("POST\n" + PATH + "\n" + timestamp + "\n").getBytes(StandardCharsets.UTF_8));
            if (!MessageDigest.isEqual(mac.doFinal(body), HexFormat.of().parseHex(signature))) throw new IllegalArgumentException();
        } catch (Exception e) { throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid private bank identity signature"); }
    }
}
