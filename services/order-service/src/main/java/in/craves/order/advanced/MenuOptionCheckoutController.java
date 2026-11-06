package in.craves.order.advanced;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** M24c: the option prices a checkout was frozen at, for Finance (internal secret). Always on, so switching options off never hides them. */
@RestController
public class MenuOptionCheckoutController {
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final String key;

    public MenuOptionCheckoutController(JdbcTemplate db, ObjectMapper json, @Value("${CRAVES_INTERNAL_SERVICE_KEY:}") String key) {
        this.db = db;
        this.json = json;
        this.key = key;
    }

    @GetMapping("/internal/v1/payments/checkout/{id}/menu-options")
    public JsonNode financeCheckoutMenuOptions(@PathVariable UUID id, @RequestHeader(name = "X-Craves-Internal-Secret", required = false) String supplied) {
        if (key.isBlank() || supplied == null || !MessageDigest.isEqual(key.getBytes(StandardCharsets.UTF_8), supplied.getBytes(StandardCharsets.UTF_8))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        // 404 for an unknown checkout, so Finance can tell it from a checkout without options ({"lines": []}).
        if (!Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM order_schema.checkout WHERE id = ?)", Boolean.class, id))) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Checkout not found");
        }
        return MenuOptionCheckout.read(db, json, id);
    }
}
