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

/** M24a: the promotion a checkout carries, for the customer who owns it and for Finance (internal secret) to charge the net amount. Always on, so switching promotions off never hides a reserved discount from Finance. */
@RestController
public class PromotionCheckoutController {
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final String key;

    public PromotionCheckoutController(JdbcTemplate db, ObjectMapper json, @Value("${CRAVES_INTERNAL_SERVICE_KEY:}") String key) {
        this.db = db;
        this.json = json;
        this.key = key;
    }

    @GetMapping("/api/v1/checkout/{id}/promotion")
    public JsonNode customerCheckoutPromotion(@AuthenticationPrincipal CravesPrincipal actor, @PathVariable UUID id) {
        if (actor == null || !Boolean.TRUE.equals(db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM order_schema.checkout WHERE id = ? AND customer_identity_id = ?)", Boolean.class, id, actor.identityId()))) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Checkout not found");
        }
        return PromotionCheckout.read(db, json, id);
    }

    @GetMapping("/internal/v1/payments/checkout/{id}/promotion")
    public JsonNode financeCheckoutPromotion(@PathVariable UUID id, @RequestHeader(name = "X-Craves-Internal-Secret", required = false) String supplied) {
        if (key.isBlank() || supplied == null || !MessageDigest.isEqual(key.getBytes(StandardCharsets.UTF_8), supplied.getBytes(StandardCharsets.UTF_8))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        return PromotionCheckout.read(db, json, id);
    }
}
