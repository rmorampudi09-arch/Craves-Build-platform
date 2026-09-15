package in.craves.integration.admin.deliveryintelligence;

import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceHistoryModels.OverviewResponse;
import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.OrderInvestigationResponse;
import in.craves.integration.security.CravesPrincipal;
import java.time.OffsetDateTime;
import java.util.Locale;
import java.util.UUID;
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
    private static final int MAX_HOURS = 720;
    private static final int MIN_LIMIT = 5;
    private static final int MAX_LIMIT = 100;

    private final DeliveryIntelligenceReadRepository repository;
    private final DeliveryIntelligenceHistoryReadRepository historyRepository;

    public AdminDeliveryIntelligenceController(
        DeliveryIntelligenceReadRepository repository,
        DeliveryIntelligenceHistoryReadRepository historyRepository
    ) {
        this.repository = repository;
        this.historyRepository = historyRepository;
    }

    @GetMapping("/overview")
    public ResponseEntity<OverviewResponse> overview(
        Authentication authentication,
        @RequestParam(defaultValue = "24") int hours,
        @RequestParam(defaultValue = "30") int limit,
        @RequestParam(defaultValue = "desc") String sort,
        @RequestParam(defaultValue = "0") int offset,
        @RequestParam(defaultValue = "0") int attentionOffset,
        @RequestParam(required = false)
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
        @RequestParam(required = false)
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to
    ) {
        requireAdmin(authentication);
        if (hours < MIN_HOURS || hours > MAX_HOURS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "hours must be between 0 and 720");
        }
        if (limit < MIN_LIMIT || limit > MAX_LIMIT) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "limit must be between 5 and 100");
        }
        if (offset < 0 || attentionOffset < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "pagination offsets must not be negative");
        }

        String normalizedSort = sort == null ? "desc" : sort.trim().toLowerCase(Locale.ROOT);
        if (!normalizedSort.equals("asc") && !normalizedSort.equals("desc")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "sort must be asc or desc");
        }

        boolean hasFrom = from != null;
        boolean hasTo = to != null;
        if (hasFrom != hasTo) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "from and to must be supplied together");
        }
        if (hours > 0 && (hasFrom || hasTo)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "from/to are only supported when hours=0");
        }
        if (hasFrom && !from.isBefore(to)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "from must be before to");
        }

        return noStore(historyRepository.overview(
            hours,
            limit,
            normalizedSort,
            offset,
            attentionOffset,
            from,
            to
        ));
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
