package in.craves.integration.erasure;

import in.craves.integration.delivery.InternalRequestAuthorizer;
import in.craves.integration.erasure.AccountErasureDtos.BlockersRequest;
import in.craves.integration.erasure.AccountErasureDtos.BlockersResponse;
import in.craves.integration.erasure.AccountErasureDtos.ErasureRequest;
import in.craves.integration.erasure.AccountErasureDtos.ErasureResponse;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Private calls from the auth-service deletion coordinator; nothing else may reach them. */
@RestController
// Always JSON: this service also has an XML converter, which a caller with no Accept header would otherwise get.
@RequestMapping(value = "/internal/v1/account-erasure", produces = MediaType.APPLICATION_JSON_VALUE)
public class AccountErasureController {
    private static final String INTERNAL_HEADER = "X-Craves-Internal-Secret";

    private final AccountErasureService service;
    private final InternalRequestAuthorizer authorizer;

    public AccountErasureController(AccountErasureService service, InternalRequestAuthorizer authorizer) {
        this.service = service;
        this.authorizer = authorizer;
    }

    @PostMapping("/blockers")
    public BlockersResponse blockers(
        @RequestHeader(value = INTERNAL_HEADER, required = false) String internalKey,
        @RequestBody BlockersRequest request
    ) {
        authorizer.requireValid(internalKey);
        requireFields(request.identityId(), request.scope());
        return new BlockersResponse(AccountErasureDtos.SERVICE, service.blockers(request.identityId(), request.scope()));
    }

    /** Only subscription and catalog have work at this step; every other service answers DONE with nothing. */
    @PostMapping("/prepare")
    public ErasureResponse prepare(
        @RequestHeader(value = INTERNAL_HEADER, required = false) String internalKey,
        @RequestBody ErasureRequest request
    ) {
        authorizer.requireValid(internalKey);
        requireFields(request.requestId(), request.identityId(), request.scope());
        return ErasureResponse.done(Map.of());
    }

    @PostMapping
    public ResponseEntity<ErasureResponse> erase(
        @RequestHeader(value = INTERNAL_HEADER, required = false) String internalKey,
        @RequestBody ErasureRequest request
    ) {
        authorizer.requireValid(internalKey);
        requireFields(request.requestId(), request.identityId(), request.scope());
        ErasureResponse response = service.erase(request.identityId(), request.scope(), request.requestId());
        return ResponseEntity.status("DONE".equals(response.status()) ? HttpStatus.OK : HttpStatus.CONFLICT).body(response);
    }

    /** An unknown scope or an unreadable id is the caller's mistake; the body never echoes what was sent. */
    @ExceptionHandler({HttpMessageNotReadableException.class, InvalidErasureRequest.class})
    ResponseEntity<ProblemDetail> invalidRequest() {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
            HttpStatus.BAD_REQUEST, "Check requestId, identityId and scope");
        problem.setTitle("Invalid account erasure request");
        return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_PROBLEM_JSON).body(problem);
    }

    private static void requireFields(Object... fields) {
        for (Object field : fields) {
            if (field == null) {
                throw new InvalidErasureRequest();
            }
        }
    }

    private static final class InvalidErasureRequest extends RuntimeException {
    }
}
