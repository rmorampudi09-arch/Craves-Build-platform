package in.craves.order.web;

import in.craves.order.security.CravesPrincipal;
import in.craves.order.service.OrderHistoryService;
import in.craves.order.web.OrderHistoryDtos.OrderPageResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Recent orders of one customer or chef for the Craves voice support line. User-chef-service calls this after it
 * has matched the caller's phone number to an account; the same page the customer or chef sees in the app is
 * returned, through the same {@link OrderHistoryService} path. Read only.
 */
@RestController
@RequestMapping("/internal/v1/support/orders")
public class InternalSupportOrderController {
    static final int MAX_LIMIT = 10;

    private final OrderHistoryService orderHistory;
    private final byte[] configuredKey;

    public InternalSupportOrderController(
        OrderHistoryService orderHistory,
        @Value("${CRAVES_INTERNAL_SERVICE_KEY:}") String configuredKey
    ) {
        this.orderHistory = orderHistory;
        this.configuredKey = configuredKey == null
            ? new byte[0] : configuredKey.getBytes(StandardCharsets.UTF_8);
    }

    @GetMapping
    public ResponseEntity<OrderPageResponse> recent(
        @RequestParam UUID identityId,
        @RequestParam String role,
        @RequestParam(defaultValue = "5") int limit,
        @RequestHeader(value = "X-Craves-Internal-Secret", required = false) String providedKey
    ) {
        byte[] provided = providedKey == null
            ? new byte[0] : providedKey.getBytes(StandardCharsets.UTF_8);
        if (configuredKey.length == 0 || !MessageDigest.isEqual(configuredKey, provided)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        String normalizedRole = role == null ? "" : role.trim().toUpperCase(Locale.ROOT);
        if (!normalizedRole.equals("CUSTOMER") && !normalizedRole.equals("CHEF")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "role must be CUSTOMER or CHEF");
        }
        if (limit < 1 || limit > MAX_LIMIT) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "limit must be between 1 and " + MAX_LIMIT);
        }
        CravesPrincipal principal = new CravesPrincipal(identityId, null, Set.of(normalizedRole));
        OrderPageResponse page = normalizedRole.equals("CHEF")
            ? orderHistory.listChefOrders(principal, limit, null, null)
            : orderHistory.listCustomerOrders(principal, limit, null, null);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(page);
    }
}
