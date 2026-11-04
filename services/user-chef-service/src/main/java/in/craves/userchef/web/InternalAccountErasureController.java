package in.craves.userchef.web;

import in.craves.userchef.exception.ApiException;
import in.craves.userchef.exception.AppErrorHandler.ErrorBody;
import in.craves.userchef.security.InternalRequestAuthorizer;
import in.craves.userchef.service.AccountErasureService;
import in.craves.userchef.service.AccountErasureService.Scope;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Private calls from the auth-service deletion coordinator, with the shared internal secret. Never published through APIM.
 * user-chef has no blockers and nothing to prepare: only erase does work.
 */
@RestController
@RequestMapping("/internal/v1/account-erasure")
public class InternalAccountErasureController {
    private static final String INTERNAL_HEADER = "X-Craves-Internal-Secret";
    private static final String SERVICE = "user-chef";

    private final AccountErasureService service;
    private final InternalRequestAuthorizer authorizer;

    public InternalAccountErasureController(AccountErasureService service, InternalRequestAuthorizer authorizer) {
        this.service = service;
        this.authorizer = authorizer;
    }

    /** /blockers is sent no requestId. Fields are checked in the methods, so a missing one is a 400 like an unreadable one. */
    public record ErasureRequest(UUID requestId, UUID identityId, Scope scope) {
    }

    @PostMapping(value = "/blockers", produces = "application/json")
    public Map<String, Object> blockers(
        @RequestHeader(name = INTERNAL_HEADER, required = false) String suppliedSecret,
        @RequestBody ErasureRequest request
    ) {
        authorizer.requireValid(suppliedSecret);
        requireFields(request, false);
        return Map.of("service", SERVICE, "blockers", List.of());
    }

    @PostMapping(value = "/prepare", produces = "application/json")
    public Map<String, Object> prepare(
        @RequestHeader(name = INTERNAL_HEADER, required = false) String suppliedSecret,
        @RequestBody ErasureRequest request
    ) {
        authorizer.requireValid(suppliedSecret);
        requireFields(request, true);
        return Map.of("service", SERVICE, "status", "DONE", "counts", Map.of());
    }

    @PostMapping(produces = "application/json")
    public Map<String, Object> erase(
        @RequestHeader(name = INTERNAL_HEADER, required = false) String suppliedSecret,
        @RequestBody ErasureRequest request
    ) {
        authorizer.requireValid(suppliedSecret);
        requireFields(request, true);
        return Map.of("service", SERVICE, "status", "DONE",
            "counts", service.erase(request.identityId(), request.scope(), request.requestId()));
    }

    /** An unknown scope or an unreadable id: the caller's mistake, and the body never echoes what was sent. */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ErrorBody> unreadable() {
        return ResponseEntity.badRequest().body(new ErrorBody("ACCOUNT_ERASURE_REQUEST_INVALID", invalidMessage(), Instant.now(), List.of()));
    }

    private static void requireFields(ErasureRequest request, boolean needsRequestId) {
        if (request == null || request.identityId() == null || request.scope() == null || (needsRequestId && request.requestId() == null)) {
            throw ApiException.badRequest("ACCOUNT_ERASURE_REQUEST_INVALID", invalidMessage());
        }
    }

    private static String invalidMessage() {
        return "Check requestId, identityId and scope (CUSTOMER, CHEF or ALL)";
    }
}
