package in.craves.advanced.platform.erasure;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import in.craves.advanced.platform.erasure.AccountErasureService.Scope;
import in.craves.advanced.platform.security.InternalSecret;
import in.craves.advanced.platform.web.ApiProblem;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.core.env.Environment;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Private calls from the auth-service deletion coordinator. Security lets the path through without a token; the shared secret
 * in {@code X-Craves-Internal-Secret} is the only protection, so with no secret configured the endpoints answer 503.
 */
@RestController
@RequestMapping("/internal/v1/account-erasure")
public class AccountErasureController {
    // Extra fields are ignored (the service reads strictly elsewhere): the one caller is trusted and may send the same body to every call.
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record BlockersRequest(@NotNull UUID identityId, @NotNull Scope scope) { }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ErasureRequest(@NotNull UUID requestId, @NotNull UUID identityId, @NotNull Scope scope) { }

    public record Blocker(String code, String detail) { }

    public record BlockersResponse(String service, List<Blocker> blockers) { }

    public record ErasureResponse(String service, String status, Map<String, Integer> counts) { }

    private static final String HEADER = InternalSecret.HEADER;

    private final AccountErasureService erasure;
    private final Environment environment;

    public AccountErasureController(AccountErasureService erasure, Environment environment) {
        this.erasure = erasure;
        this.environment = environment;
    }

    /** Nothing in the advanced features stops a person's data being erased, so there are never blockers. */
    @PostMapping("/blockers")
    public ResponseEntity<BlockersResponse> blockers(@RequestHeader(value = HEADER, required = false) String secret,
                                                     @Valid @RequestBody BlockersRequest request) {
        requireSecret(secret);
        return reply(new BlockersResponse(AccountErasureService.SERVICE, List.of()));
    }

    /** Only subscription and catalog have work at this step; every other service answers DONE with nothing. */
    @PostMapping("/prepare")
    public ResponseEntity<ErasureResponse> prepare(@RequestHeader(value = HEADER, required = false) String secret,
                                                   @Valid @RequestBody ErasureRequest request) {
        requireSecret(secret);
        return reply(new ErasureResponse(AccountErasureService.SERVICE, "DONE", Map.of()));
    }

    // Not "erase": springdoc would then rename the taste-data contract's `erase` operation to `erase_1`.
    @PostMapping
    public ResponseEntity<ErasureResponse> eraseAccount(@RequestHeader(value = HEADER, required = false) String secret,
                                                 @Valid @RequestBody ErasureRequest request) {
        requireSecret(secret);
        return reply(new ErasureResponse(AccountErasureService.SERVICE, "DONE",
                erasure.erase(request.requestId(), request.identityId(), request.scope())));
    }

    private void requireSecret(String given) {
        InternalSecret.require(environment, given);
    }

    private static <T> ResponseEntity<T> reply(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
