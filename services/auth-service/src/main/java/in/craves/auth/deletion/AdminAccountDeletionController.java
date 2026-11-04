package in.craves.auth.deletion;

import static java.nio.charset.StandardCharsets.UTF_8;

import in.craves.auth.admin.InternalAdminRoles;
import in.craves.auth.deletion.AccountErasureClient.Blocker;
import in.craves.auth.deletion.DeletionModel.DeletionRequest;
import in.craves.auth.deletion.DeletionModel.DeletionStep;
import in.craves.auth.deletion.DeletionModel.RequestStatus;
import in.craves.auth.exception.AuthException;
import in.craves.auth.repository.AuthIdentityRoleRepository;
import in.craves.auth.security.CurrentUser;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Craves staff review account deletion requests: the queue, one request with its steps and what is open now, and the
 * decision (approve or reject). Every read and every decision writes one auth_audit row with ids, codes and counts only.
 */
@RestController
@RequestMapping("/api/v1/admin/account-deletions")
public class AdminAccountDeletionController {
    private static final String[] READERS = {InternalAdminRoles.PLATFORM_ADMIN, InternalAdminRoles.SUPPORT_ADMIN,
        InternalAdminRoles.COMPLIANCE_ADMIN, InternalAdminRoles.AUDIT_ADMIN};
    private static final String[] REVIEWERS = {InternalAdminRoles.PLATFORM_ADMIN, InternalAdminRoles.COMPLIANCE_ADMIN};
    private static final int DEFAULT_LIMIT = 25;
    private static final int MAX_LIMIT = 100;

    public record Summary(UUID requestId, UUID identityId, String scope, String status, String via, Instant requestedAt,
                          Instant dueAt, UUID reviewedBy, Instant reviewedAt, String reviewNote) {
        static Summary of(DeletionRequest request) {
            return new Summary(request.id(), request.identityId(), request.scope().name(), request.status().name(), request.via().name(),
                request.requestedAt(), request.dueAt(), request.reviewedBy(), request.reviewedAt(), request.reviewNote());
        }
    }

    public record Page(List<Summary> items, String nextCursor) {}

    public record StepRow(String phase, String service, String status, int attempts, String lastError, Instant completedAt) {
        static StepRow of(DeletionStep step) {
            return new StepRow(step.phase().name(), step.service(), step.status().name(), step.attempts(), step.lastError(), step.completedAt());
        }
    }

    public record Detail(Summary request, String phoneLast4, List<String> roles, List<StepRow> steps, List<Blocker> blockers) {}

    public record ReviewRequest(String reason) {}

    /** The 409 body of an approval refused for open items. */
    public record OpenItems(String code, String message, List<Blocker> blockers) {}

    private final AccountDeletionService service;
    private final AccountDeletionRepository deletions;
    private final AuthIdentityRoleRepository roles;

    public AdminAccountDeletionController(AccountDeletionService service, AccountDeletionRepository deletions, AuthIdentityRoleRepository roles) {
        this.service = service;
        this.deletions = deletions;
        this.roles = roles;
    }

    /** Oldest request first. The cursor is the last item's {@code requestedAt|id}, base64url; null {@code nextCursor} is the end. */
    @GetMapping
    public ResponseEntity<Page> list(
        Authentication authentication,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) String cursor,
        @RequestParam(required = false) Integer limit,
        @RequestHeader(value = "X-Correlation-ID", required = false) String correlationHeader
    ) {
        service.requireEnabled();
        CurrentUser admin = require(authentication, READERS);
        UUID correlationId = correlationId(correlationHeader);
        RequestStatus filter = status == null || status.isBlank() ? null : status(status);
        Instant afterRequestedAt = null;
        UUID afterId = null;
        if (cursor != null && !cursor.isBlank()) {
            try {
                String[] parts = new String(Base64.getUrlDecoder().decode(cursor), UTF_8).split("\\|", -1);
                if (parts.length != 2) throw new IllegalArgumentException();
                afterRequestedAt = Instant.parse(parts[0]);
                afterId = UUID.fromString(parts[1]);
            } catch (RuntimeException ignored) {
                throw invalidQuery();
            }
        }
        int size = limit == null ? DEFAULT_LIMIT : Math.max(1, Math.min(limit, MAX_LIMIT));
        List<DeletionRequest> rows = deletions.page(filter, afterRequestedAt, afterId, size + 1);
        boolean more = rows.size() > size;
        List<DeletionRequest> shown = more ? rows.subList(0, size) : rows;
        DeletionRequest last = more ? shown.get(size - 1) : null;
        deletions.audit(null, "ACCOUNT_DELETION_READ", admin.identityId(),
            "status=" + (filter == null ? "ANY" : filter) + ";count=" + shown.size(), correlationId);
        return ok(new Page(shown.stream().map(Summary::of).toList(),
            last == null ? null : Base64.getUrlEncoder().withoutPadding().encodeToString((last.requestedAt() + "|" + last.id()).getBytes(UTF_8))),
            correlationId);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Detail> detail(
        Authentication authentication,
        @PathVariable UUID id,
        @RequestHeader(value = "X-Correlation-ID", required = false) String correlationHeader
    ) {
        service.requireEnabled();
        CurrentUser admin = require(authentication, READERS);
        UUID correlationId = correlationId(correlationHeader);
        DeletionRequest request = deletions.find(id).orElseThrow(AccountDeletionService::noRequest);
        List<StepRow> steps = deletions.steps(id).stream().map(StepRow::of).toList();
        List<Blocker> blockers = service.blockers(request.identityId(), request.scope());
        deletions.audit(request.identityId(), "ACCOUNT_DELETION_READ", admin.identityId(),
            "requestId=" + id + ";scope=" + request.scope() + ";status=" + request.status() + ";steps=" + steps.size()
                + ";blockers=" + blockers.size(), correlationId);
        return ok(new Detail(Summary.of(request), phoneLast4(request.identityId()), roles.findRoleCodesByIdentityId(request.identityId()),
            steps, blockers), correlationId);
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<?> approve(
        Authentication authentication,
        @PathVariable UUID id,
        @RequestBody ReviewRequest body,
        @RequestHeader(value = "X-Correlation-ID", required = false) String correlationHeader
    ) {
        service.requireEnabled();
        CurrentUser admin = require(authentication, REVIEWERS);
        UUID correlationId = correlationId(correlationHeader);
        String reason = normalizeReason(body.reason());
        try {
            return ok(Summary.of(service.approve(admin, id, reason, correlationId)), correlationId);
        } catch (AccountDeletionService.OpenItemsException open) {
            return ResponseEntity.status(HttpStatus.CONFLICT).cacheControl(CacheControl.noStore())
                .header("X-Correlation-ID", correlationId.toString()).body(new OpenItems(open.getCode(), open.getMessage(), open.blockers()));
        }
    }

    /** The reason is shown to the person. */
    @PostMapping("/{id}/reject")
    public ResponseEntity<Summary> reject(
        Authentication authentication,
        @PathVariable UUID id,
        @RequestBody ReviewRequest body,
        @RequestHeader(value = "X-Correlation-ID", required = false) String correlationHeader
    ) {
        service.requireEnabled();
        CurrentUser admin = require(authentication, REVIEWERS);
        UUID correlationId = correlationId(correlationHeader);
        String reason = normalizeReason(body.reason());
        return ok(Summary.of(service.reject(admin, id, reason, correlationId)), correlationId);
    }

    /** The last 4 digits, so staff can tell two people apart; null once the account is erased (the phone is then the tombstone). */
    private String phoneLast4(UUID identityId) {
        String phone = deletions.contact(identityId).phone();
        boolean erased = phone != null && phone.equals(identityId.toString().replace("-", ""));
        return phone == null || phone.length() < 4 || erased ? null : phone.substring(phone.length() - 4);
    }

    private static <T> ResponseEntity<T> ok(T body, UUID correlationId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("X-Correlation-ID", correlationId.toString()).body(body);
    }

    private static CurrentUser require(Authentication authentication, String... allowed) {
        if (authentication == null || !(authentication.getPrincipal() instanceof CurrentUser user)) {
            throw AuthException.unauthorized("AUTHENTICATION_REQUIRED", "Craves access token is required");
        }
        if (!user.hasAnyRole(allowed)) {
            throw AuthException.forbidden("ADMIN_ROLE_REQUIRED", "A Craves administrator role for account deletion is required");
        }
        return user;
    }

    private static String normalizeReason(String value) {
        String normalized = value == null ? "" : value.replace('\n', ' ').replace('\r', ' ').trim();
        if (normalized.length() < 10 || normalized.length() > 500) {
            throw AuthException.badRequest("ADMIN_REASON_INVALID", "reason must contain 10 to 500 characters");
        }
        return normalized;
    }

    private static UUID correlationId(String value) {
        if (value == null || value.isBlank()) return UUID.randomUUID();
        try {
            return UUID.fromString(value.trim());
        } catch (IllegalArgumentException error) {
            throw AuthException.badRequest("CORRELATION_ID_INVALID", "X-Correlation-ID must be a UUID");
        }
    }

    private static RequestStatus status(String value) {
        try {
            return RequestStatus.valueOf(value);
        } catch (IllegalArgumentException error) {
            throw invalidQuery();
        }
    }

    private static AuthException invalidQuery() {
        return AuthException.badRequest("ACCOUNT_DELETION_QUERY_INVALID", "status, cursor or limit is invalid");
    }
}
