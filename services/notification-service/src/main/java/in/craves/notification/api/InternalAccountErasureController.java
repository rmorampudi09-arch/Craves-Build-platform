package in.craves.notification.api;

import in.craves.notification.erasure.AccountErasureService;
import in.craves.notification.erasure.AccountErasureService.Scope;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Map;
import java.util.UUID;
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

/** Private calls from the auth-service deletion coordinator. Notification has no blockers and nothing to do before erase. */
@RestController
@RequestMapping("/internal/v1/account-erasure")
public class InternalAccountErasureController {
    private static final String SERVICE = "notification";

    private final AccountErasureService service;
    private final String configuredKey;

    public InternalAccountErasureController(AccountErasureService service,
                                            @Value("${craves.internal.service-key:}") String configuredKey) {
        this.service = service;
        this.configuredKey = configuredKey;
    }

    /** /blockers is sent no requestId. Fields are checked in the methods, so a missing one is a 400 like an unreadable one. */
    public record ErasureRequest(UUID requestId, UUID identityId, Scope scope) {
    }

    @PostMapping("/blockers")
    public Map<String, Object> blockers(
        @RequestHeader(value = "X-Craves-" + "Internal-Key", required = false) String providedKey,
        @RequestBody ErasureRequest request
    ) {
        requireKey(providedKey);
        requireFields(request.identityId(), request.scope());
        return Map.of("service", SERVICE, "blockers", List.of());
    }

    @PostMapping("/prepare")
    public Map<String, Object> prepare(
        @RequestHeader(value = "X-Craves-" + "Internal-Key", required = false) String providedKey,
        @RequestBody ErasureRequest request
    ) {
        requireKey(providedKey);
        requireFields(request.requestId(), request.identityId(), request.scope());
        return Map.of("service", SERVICE, "status", "DONE", "counts", Map.of());
    }

    @PostMapping
    public Map<String, Object> erase(
        @RequestHeader(value = "X-Craves-" + "Internal-Key", required = false) String providedKey,
        @RequestBody ErasureRequest request
    ) {
        requireKey(providedKey);
        requireFields(request.requestId(), request.identityId(), request.scope());
        return Map.of("service", SERVICE, "status", "DONE",
            "counts", service.erase(request.identityId(), request.scope(), request.requestId()));
    }

    /** An unknown scope, an unreadable id or a missing field: the caller's mistake, and the body never echoes what was sent. */
    @ExceptionHandler({HttpMessageNotReadableException.class, InvalidRequest.class})
    ResponseEntity<Map<String, Object>> invalidRequest() {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("code", "INVALID_REQUEST",
            "message", "Check requestId, identityId and scope (CUSTOMER, CHEF or ALL)"));
    }

    private static void requireFields(Object... fields) {
        for (Object field : fields) {
            if (field == null) {
                throw new InvalidRequest();
            }
        }
    }

    private static final class InvalidRequest extends RuntimeException {
    }

    private void requireKey(String providedKey) {
        if (configuredKey == null || configuredKey.isBlank() || providedKey == null
            || !MessageDigest.isEqual(configuredKey.getBytes(StandardCharsets.UTF_8), providedKey.getBytes(StandardCharsets.UTF_8))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Internal key is invalid");
        }
    }
}
