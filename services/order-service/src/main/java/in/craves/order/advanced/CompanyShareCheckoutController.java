package in.craves.order.advanced;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.order.security.CravesPrincipal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** M24d: the company share a checkout carries, for the customer who owns it and for Finance (internal secret) to charge the person the rest. Always on, so switching it off never hides a reserved share from Finance. */
@RestController
public class CompanyShareCheckoutController {
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final String key;

    public CompanyShareCheckoutController(JdbcTemplate db, ObjectMapper json, @Value("${CRAVES_INTERNAL_SERVICE_KEY:}") String key) {
        this.db = db;
        this.json = json;
        this.key = key;
    }

    @GetMapping("/api/v1/checkout/{id}/company-share")
    public JsonNode customerCheckoutCompanyShare(@AuthenticationPrincipal CravesPrincipal actor, @PathVariable UUID id) {
        if (actor == null || !Boolean.TRUE.equals(db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM order_schema.checkout WHERE id = ? AND customer_identity_id = ?)", Boolean.class, id, actor.identityId()))) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Checkout not found");
        }
        return CompanyShareCheckout.read(db, json, id);
    }

    @GetMapping("/internal/v1/payments/checkout/{id}/company-share")
    public JsonNode financeCheckoutCompanyShare(@PathVariable UUID id, @RequestHeader(name = "X-Craves-Internal-Secret", required = false) String supplied) {
        if (key.isBlank() || supplied == null || !MessageDigest.isEqual(key.getBytes(StandardCharsets.UTF_8), supplied.getBytes(StandardCharsets.UTF_8))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        // 404 for an unknown checkout, so Finance can tell it from a checkout without a company share (state NONE).
        if (!Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM order_schema.checkout WHERE id = ?)", Boolean.class, id))) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Checkout not found");
        }
        return CompanyShareCheckout.read(db, json, id);
    }
}
