package in.craves.integration.admin.deliveryintelligence;

import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.OrderInvestigationResponse;
import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.OverviewResponse;
import in.craves.integration.security.CravesPrincipal;
import java.util.UUID;
import java.time.OffsetDateTime;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/admin/operations/delivery-intelligence")
public class AdminDeliveryIntelligenceController {
    private static final int MIN_HOURS = 0;
    private static final int MAX_HOURS = 8760;
    private static final int MIN_LIMIT = 5;
    private static final int MAX_LIMIT = 100;
    private final DeliveryIntelligenceReadRepository repository;

    public AdminDeliveryIntelligenceController(DeliveryIntelligenceReadRepository repository) {
        this.repository = repository;
    }

    @GetMapping("/overview")
    public ResponseEntity<OverviewResponse> overview(
        Authentication authentication,
        @RequestParam(defaultValue = "24") int hours,
        @RequestParam(defaultValue = "30") int limit,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to,
        @RequestParam(defaultValue = "0") int offset,
        @RequestParam(defaultValue = "0") int attentionOffset,
        @RequestParam(defaultValue = "desc") String sort
    ) {
        requireAdmin(authentication);
        if (hours < MIN_HOURS || hours > MAX_HOURS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "hours must be between 0 (all time) and 8760");
        }
        if (limit < MIN_LIMIT || limit > MAX_LIMIT) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "limit must be between 5 and 100");
        }
        if (offset < 0 || attentionOffset < 0 || !(sort.equals("asc") || sort.equals("desc"))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid pagination or sort order");
        }
        if (from != null && to != null && !from.isBefore(to)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "from must be earlier than to");
        }
        return noStore(repository.overview(hours, limit, from, to, offset, attentionOffset, sort));
    }

    @GetMapping("/orders/{reference}")
    public ResponseEntity<OrderInvestigationResponse> investigate(
        Authentication authentication,
        @PathVariable String reference,
        @RequestHeader(value = "X-Correlation-ID", required = false) String correlationHeader
    ) {
        CravesPrincipal principal = requireAdmin(authentication);
        String safeReference = validateReference(reference);
        UUID correlationId = correlationId(correlationHeader);
        OrderInvestigationResponse result = repository.investigate(safeReference, correlationId);
        repository.recordInvestigationAudit(principal.identityId(), result.orderId(), correlationId);
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .header("X-Correlation-ID", correlationId.toString())
            .body(result);
    }

    private static CravesPrincipal requireAdmin(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof CravesPrincipal principal)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Craves access token is required");
        }
        if (!principal.hasAnyRole(
            "ADMIN",
            "PLATFORM_ADMIN",
            "SUPPORT_ADMIN",
            "PAYMENTS_ADMIN",
            "OPERATIONS_ADMIN",
            "AUDIT_ADMIN"
        )) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Active Craves admin role is required");
        }
        return principal;
    }

    private static String validateReference(String value) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isEmpty() || normalized.length() > 200 || normalized.indexOf('\r') >= 0 || normalized.indexOf('\n') >= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid delivery reference");
        }
        return normalized;
    }

    private static UUID correlationId(String value) {
        if (value == null || value.isBlank()) {
            return UUID.randomUUID();
        }
        try {
            return UUID.fromString(value.trim());
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "X-Correlation-ID must be a UUID");
        }
    }

    private static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
