package in.craves.subscription.erasure;

import in.craves.subscription.erasure.AccountErasureDtos.BlockersRequest;
import in.craves.subscription.erasure.AccountErasureDtos.BlockersResponse;
import in.craves.subscription.erasure.AccountErasureDtos.ErasureRequest;
import in.craves.subscription.erasure.AccountErasureDtos.ErasureResponse;
import in.craves.subscription.exception.GlobalExceptionHandler.ApiError;
import in.craves.subscription.order.OccurrenceOrderProperties;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Private calls from the auth-service deletion coordinator; nothing else may reach them. */
@RestController
@RequestMapping("/internal/v1/account-erasure")
public class AccountErasureController {
    private static final String INTERNAL_HEADER = "X-Craves-Internal-Secret";

    private final OccurrenceOrderProperties properties;
    private final AccountErasureService service;

    public AccountErasureController(OccurrenceOrderProperties properties, AccountErasureService service) {
        this.properties = properties;
        this.service = service;
    }

    @PostMapping("/blockers")
    public BlockersResponse blockers(
        @RequestHeader(value = INTERNAL_HEADER, required = false) String internalAccess,
        @Valid @RequestBody BlockersRequest request
    ) {
        requireInternal(internalAccess);
        return new BlockersResponse(AccountErasureDtos.SERVICE, service.blockers(request.identityId(), request.scope()));
    }

    @PostMapping("/prepare")
    public ErasureResponse prepare(
        @RequestHeader(value = INTERNAL_HEADER, required = false) String internalAccess,
        @Valid @RequestBody ErasureRequest request
    ) {
        requireInternal(internalAccess);
        return service.prepare(request.identityId(), request.scope(), request.requestId());
    }

    /** Undoes prepare's closing of the chef's plans when the person keeps their account. */
    @PostMapping("/release")
    public ErasureResponse release(
        @RequestHeader(value = INTERNAL_HEADER, required = false) String internalAccess,
        @Valid @RequestBody ErasureRequest request
    ) {
        requireInternal(internalAccess);
        return service.release(request.identityId(), request.scope(), request.requestId());
    }

    @PostMapping
    public ResponseEntity<ErasureResponse> erase(
        @RequestHeader(value = INTERNAL_HEADER, required = false) String internalAccess,
        @Valid @RequestBody ErasureRequest request
    ) {
        requireInternal(internalAccess);
        ErasureResponse response = service.erase(request.identityId(), request.scope(), request.requestId());
        return ResponseEntity.status("DONE".equals(response.status()) ? HttpStatus.OK : HttpStatus.CONFLICT).body(response);
    }

    /** An unknown scope or an unreadable id is the caller's mistake; the shared handler would turn it into a 500. */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ApiError> unreadableBody(HttpServletRequest request) {
        return ResponseEntity.badRequest().body(new ApiError(
            Instant.now(), "VALIDATION_FAILED", "Request body is not valid: check identityId, requestId and scope",
            request.getRequestURI(), List.of()
        ));
    }

    private void requireInternal(String internalAccess) {
        if (!properties.validInternalAccess(internalAccess)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid internal service credential");
        }
    }
}
