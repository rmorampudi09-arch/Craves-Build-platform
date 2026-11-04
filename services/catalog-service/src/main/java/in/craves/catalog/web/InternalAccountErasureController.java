package in.craves.catalog.web;

import in.craves.catalog.exception.ApiException;
import in.craves.catalog.exception.AppErrorHandler.ApiErrorResponse;
import in.craves.catalog.security.InternalCatalogAuthorizer;
import in.craves.catalog.service.AccountErasureService;
import in.craves.catalog.service.AccountErasureService.Scope;
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

/** Private calls from the auth-service deletion coordinator. Catalog has no blockers; prepare closes the kitchen to new orders. */
@RestController
@RequestMapping("/internal/v1/account-erasure")
public class InternalAccountErasureController {
    private static final String SERVICE = "catalog";

    private final AccountErasureService service;
    private final InternalCatalogAuthorizer authorizer;

    public InternalAccountErasureController(AccountErasureService service, InternalCatalogAuthorizer authorizer) {
        this.service = service;
        this.authorizer = authorizer;
    }

    /** /blockers is sent no requestId. Fields are checked in the methods, so a missing one is a 400 like an unreadable one. */
    public record ErasureRequest(UUID requestId, UUID identityId, Scope scope) {
    }

    @PostMapping("/blockers")
    public Map<String, Object> blockers(
        @RequestHeader(value = InternalCatalogAuthorizer.HEADER_NAME, required = false) String internalKey,
        @RequestBody ErasureRequest request
    ) {
        authorizer.requireAuthorized(internalKey);
        requireFields(request, false);
        return Map.of("service", SERVICE, "blockers", List.of());
    }

    @PostMapping("/prepare")
    public Map<String, Object> prepare(
        @RequestHeader(value = InternalCatalogAuthorizer.HEADER_NAME, required = false) String internalKey,
        @RequestBody ErasureRequest request
    ) {
        authorizer.requireAuthorized(internalKey);
        requireFields(request, true);
        return Map.of("service", SERVICE, "status", "DONE", "counts", service.prepare(request.identityId(), request.scope(), request.requestId()));
    }

    @PostMapping
    public Map<String, Object> erase(
        @RequestHeader(value = InternalCatalogAuthorizer.HEADER_NAME, required = false) String internalKey,
        @RequestBody ErasureRequest request
    ) {
        authorizer.requireAuthorized(internalKey);
        requireFields(request, true);
        return Map.of("service", SERVICE, "status", "DONE", "counts", service.erase(request.identityId(), request.scope(), request.requestId()));
    }

    /** An unknown scope or an unreadable id: the caller's mistake, and the body never echoes what was sent. */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ApiErrorResponse> unreadable() {
        return ResponseEntity.badRequest().body(new ApiErrorResponse(Instant.now(), "ACCOUNT_ERASURE_REQUEST_INVALID", invalidMessage(), List.of()));
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
