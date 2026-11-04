package in.craves.order.erasure;

import in.craves.order.erasure.AccountErasureDtos.BlockersRequest;
import in.craves.order.erasure.AccountErasureDtos.BlockersResponse;
import in.craves.order.erasure.AccountErasureDtos.ErasureRequest;
import in.craves.order.erasure.AccountErasureDtos.ErasureResponse;
import in.craves.order.exception.OrderApiException;
import in.craves.order.web.ApiDtos.ApiErrorResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
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

    private final AccountErasureService service;
    private final byte[] configuredKey;

    public AccountErasureController(
        AccountErasureService service,
        @Value("${CRAVES_INTERNAL_SERVICE_KEY:}") String configuredKey
    ) {
        this.service = service;
        this.configuredKey = configuredKey == null
            ? new byte[0] : configuredKey.getBytes(StandardCharsets.UTF_8);
    }

    @PostMapping("/blockers")
    public BlockersResponse blockers(
        @RequestHeader(value = INTERNAL_HEADER, required = false) String providedKey,
        @RequestBody BlockersRequest request
    ) {
        requireInternal(providedKey);
        requireFields(request.identityId(), request.scope());
        return new BlockersResponse(AccountErasureDtos.SERVICE, service.blockers(request.identityId(), request.scope()));
    }

    /** Only subscription and catalog have work at this step; every other service answers DONE with nothing. */
    @PostMapping("/prepare")
    public ErasureResponse prepare(
        @RequestHeader(value = INTERNAL_HEADER, required = false) String providedKey,
        @RequestBody ErasureRequest request
    ) {
        requireInternal(providedKey);
        requireFields(request.requestId(), request.identityId(), request.scope());
        return ErasureResponse.done(Map.of());
    }

    @PostMapping
    public ResponseEntity<ErasureResponse> erase(
        @RequestHeader(value = INTERNAL_HEADER, required = false) String providedKey,
        @RequestBody ErasureRequest request
    ) {
        requireInternal(providedKey);
        requireFields(request.requestId(), request.identityId(), request.scope());
        ErasureResponse response = service.erase(request.identityId(), request.scope(), request.requestId());
        return ResponseEntity.status("DONE".equals(response.status()) ? HttpStatus.OK : HttpStatus.CONFLICT).body(response);
    }

    /** An unknown scope or an unreadable id is the caller's mistake, answered in this service's usual error body. */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ApiErrorResponse> unreadableBody() {
        return ResponseEntity.badRequest().body(new ApiErrorResponse(
            "INVALID_ERASURE_REQUEST", "Request body is not valid: check identityId, requestId and scope"));
    }

    private void requireInternal(String providedKey) {
        byte[] provided = providedKey == null
            ? new byte[0] : providedKey.getBytes(StandardCharsets.UTF_8);
        if (configuredKey.length == 0 || !MessageDigest.isEqual(configuredKey, provided)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
    }

    private static void requireFields(Object... fields) {
        for (Object field : fields) {
            if (field == null) {
                throw OrderApiException.badRequest("INVALID_ERASURE_REQUEST", "requestId, identityId and scope are required");
            }
        }
    }
}
