package in.craves.integration.admin.deliveryexceptions;

import in.craves.integration.admin.deliveryexceptions.DeliveryExceptionService.Action;
import in.craves.integration.admin.deliveryexceptions.DeliveryExceptionService.CaseDetail;
import in.craves.integration.admin.deliveryexceptions.DeliveryExceptionService.CasePage;
import in.craves.integration.admin.deliveryexceptions.DeliveryExceptionService.Reason;
import in.craves.integration.admin.deliveryexceptions.DeliveryExceptionService.Status;
import in.craves.integration.security.CravesPrincipal;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** M25 delivery exceptions console. Off unless CRAVES_DELIVERY_EXCEPTIONS_ENABLED=true (then 404 on every route). */
@RestController
@RequestMapping("/api/v1/admin/operations/delivery-exceptions")
public class AdminDeliveryExceptionController {
    static final String[] READ_ROLES = {"PLATFORM_ADMIN", "OPERATIONS_ADMIN", "SUPPORT_ADMIN", "AUDIT_ADMIN"};
    // Support and audit admins only read (Auth defines both roles as read-only).
    static final String[] WRITE_ROLES = {"PLATFORM_ADMIN", "OPERATIONS_ADMIN"};

    public record OpenDeliveryExceptionRequest(UUID deliveryJobId, Reason reason, String note) {}
    public record DeliveryExceptionActionRequest(Action action, Integer expectedVersion, String note, UUID assigneeId, String providerId) {}

    private final DeliveryExceptionService service;
    private final boolean enabled;

    public AdminDeliveryExceptionController(DeliveryExceptionService service,
        @Value("${CRAVES_DELIVERY_EXCEPTIONS_ENABLED:false}") boolean enabled) {
        this.service = service;
        this.enabled = enabled;
    }

    @GetMapping
    public ResponseEntity<CasePage> listDeliveryExceptions(Authentication authentication,
        @RequestParam(required = false) Status status, @RequestParam(required = false) UUID orderId,
        @RequestParam(defaultValue = "30") int limit, @RequestParam(defaultValue = "0") int offset) {
        require(authentication, READ_ROLES);
        if (limit < 1 || limit > 100) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "limit must be between 1 and 100");
        if (offset < 0 || offset > 10_000) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "offset must be between 0 and 10000");
        return noStore(HttpStatus.OK, service.list(status, orderId, limit, offset));
    }

    @GetMapping("/{caseId}")
    public ResponseEntity<CaseDetail> getDeliveryException(Authentication authentication, @PathVariable UUID caseId) {
        require(authentication, READ_ROLES);
        return noStore(HttpStatus.OK, service.detail(caseId));
    }

    @PostMapping
    public ResponseEntity<CaseDetail> openDeliveryException(Authentication authentication,
        @RequestBody OpenDeliveryExceptionRequest request) {
        CravesPrincipal actor = require(authentication, WRITE_ROLES);
        if (request == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Request body is required");
        return noStore(HttpStatus.CREATED, service.open(actor.identityId(), request.deliveryJobId(), request.reason(), request.note()));
    }

    @PostMapping("/{caseId}/actions")
    public ResponseEntity<CaseDetail> actOnDeliveryException(Authentication authentication, @PathVariable UUID caseId,
        @RequestBody DeliveryExceptionActionRequest request) {
        CravesPrincipal actor = require(authentication, WRITE_ROLES);
        if (request == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Request body is required");
        return noStore(HttpStatus.OK, service.act(actor.identityId(), caseId, request.action(), request.expectedVersion(),
            request.note(), request.assigneeId(), request.providerId()));
    }

    private CravesPrincipal require(Authentication authentication, String[] roles) {
        if (!enabled) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        if (authentication == null || !(authentication.getPrincipal() instanceof CravesPrincipal principal)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Craves access token is required");
        }
        if (!principal.hasAnyRole(roles)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Operations admin role is required");
        return principal;
    }

    private static <T> ResponseEntity<T> noStore(HttpStatus status, T body) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(body);
    }
}
