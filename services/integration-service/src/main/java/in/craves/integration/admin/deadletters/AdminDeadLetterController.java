package in.craves.integration.admin.deadletters;

import in.craves.integration.security.CravesPrincipal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Handbook 105, read-only first: the failed and dead-lettered delivery webhooks, Cashfree webhooks and delivery commands,
 * so operations can see what is stuck and why without database access. Raw payloads are never returned (they hold
 * addresses, phone numbers and payment details), only their size. Every read needs X-Admin-Reason and writes an audit
 * row. Replaying is a later, separate step. Off unless CRAVES_DEAD_LETTER_CONSOLE_ENABLED=true (then 404).
 */
@RestController
@RequestMapping("/api/v1/admin/operations/dead-letters")
public class AdminDeadLetterController {
    static final String[] DELIVERY_ROLES = {"PLATFORM_ADMIN", "OPERATIONS_ADMIN", "SUPPORT_ADMIN", "AUDIT_ADMIN"};
    static final String[] PAYMENT_ROLES = {"PLATFORM_ADMIN", "PAYMENTS_ADMIN", "SUPPORT_ADMIN", "AUDIT_ADMIN"};
    private static final Pattern PROVIDER = Pattern.compile("[a-z0-9_-]{1,80}");

    public enum Source { DELIVERY_WEBHOOK, CASHFREE_WEBHOOK, DELIVERY_COMMAND }

    public enum Status { DEAD_LETTER, FAILED }

    /** kind: the command type, or the provider's normalized status for a delivery webhook. */
    public record DeadLetter(UUID id, Source source, String provider, String kind, String status, int attemptCount,
        OffsetDateTime firstSeenAt, OffsetDateTime lastChangedAt, OffsetDateTime nextAttemptAt, String providerEventId,
        UUID deliveryJobId, UUID orderId, UUID chefSubOrderId, String lastError, Integer payloadBytes) {}

    public record DeadLetterPage(Source source, Status status, long total, int limit, int offset, List<DeadLetter> items) {}

    private final DeadLetterRepository repository;
    private final boolean enabled;

    public AdminDeadLetterController(DeadLetterRepository repository,
        @Value("${CRAVES_DEAD_LETTER_CONSOLE_ENABLED:false}") boolean enabled) {
        this.repository = repository;
        this.enabled = enabled;
    }

    @GetMapping
    public ResponseEntity<DeadLetterPage> listDeadLetters(Authentication authentication,
        @RequestParam Source source, @RequestParam(defaultValue = "DEAD_LETTER") Status status,
        @RequestParam(required = false) String provider,
        @RequestParam(defaultValue = "50") int limit, @RequestParam(defaultValue = "0") int offset,
        @RequestHeader(value = "X-Admin-Reason", required = false) String reason,
        @RequestHeader(value = "X-Correlation-ID", required = false) String correlationHeader) {
        if (!enabled) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "The dead-letter console is switched off");
        CravesPrincipal actor = require(authentication, source == Source.CASHFREE_WEBHOOK ? PAYMENT_ROLES : DELIVERY_ROLES);
        if (limit < 1 || limit > 100) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "limit must be between 1 and 100");
        if (offset < 0 || offset > 10_000) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "offset must be between 0 and 10000");
        if (provider != null && (source == Source.CASHFREE_WEBHOOK || !PROVIDER.matcher(provider).matches())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "provider must be a delivery provider id such as borzo or pidge");
        }
        String why = reason(reason);
        UUID correlationId = correlationId(correlationHeader);
        repository.audit(actor.identityId(), source, why, correlationId);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("X-Correlation-ID", correlationId.toString())
            .body(repository.page(source, status, provider, limit, offset));
    }

    private static CravesPrincipal require(Authentication authentication, String[] roles) {
        if (authentication == null || !(authentication.getPrincipal() instanceof CravesPrincipal principal)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Craves access token is required");
        }
        if (!principal.hasAnyRole(roles)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "An admin role for this source is required");
        return principal;
    }

    private static String reason(String value) {
        String normalized = value == null ? "" : value.replace('\n', ' ').replace('\r', ' ').trim();
        if (normalized.length() < 10 || normalized.length() > 500) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "X-Admin-Reason must contain 10 to 500 characters");
        }
        return normalized;
    }

    private static UUID correlationId(String value) {
        if (value == null || value.isBlank()) return UUID.randomUUID();
        try {
            return UUID.fromString(value.trim());
        } catch (IllegalArgumentException notAUuid) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "X-Correlation-ID must be a UUID");
        }
    }
}
