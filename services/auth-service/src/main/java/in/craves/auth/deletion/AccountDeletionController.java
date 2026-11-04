package in.craves.auth.deletion;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.auth.deletion.DeletionModel.Scope;
import in.craves.auth.deletion.DeletionModel.Via;
import in.craves.auth.exception.AuthException;
import in.craves.auth.security.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import java.util.HashSet;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The signed-in person asks for, looks at, or cancels ("keep my account") their own account deletion. */
@RestController
@RequestMapping("/api/v1/auth/me/deletion")
public class AccountDeletionController {
    private final AccountDeletionService service;
    private final ObjectMapper mapper;

    public AccountDeletionController(AccountDeletionService service, ObjectMapper mapper) {
        this.service = service;
        this.mapper = mapper;
    }

    @PostMapping(consumes = "application/json")
    public ResponseEntity<DeletionView> request(Authentication authentication, HttpServletRequest http) {
        CurrentUser user = user(authentication);
        service.requireEnabled();
        JsonNode body = body(http);
        var result = service.request(user, enumValue(Scope.class, body.get("scope")),
            body.has("via") ? enumValue(Via.class, body.get("via")) : Via.APP);
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK).body(result.view());
    }

    @GetMapping
    public DeletionView current(Authentication authentication) {
        return service.current(user(authentication).identityId());
    }

    @DeleteMapping
    public DeletionView keep(Authentication authentication) {
        return service.keep(user(authentication));
    }

    private JsonNode body(HttpServletRequest http) {
        try {
            if (http.getContentLengthLong() > 4096) throw new IllegalArgumentException();
            byte[] bytes = http.getInputStream().readNBytes(4097);
            if (bytes.length > 4096) throw new IllegalArgumentException();
            var parser = mapper.getFactory().createParser(bytes);
            parser.enable(com.fasterxml.jackson.core.JsonParser.Feature.STRICT_DUPLICATE_DETECTION);
            JsonNode body = mapper.readTree(parser);
            if (parser.nextToken() != null || body == null || !body.isObject()) throw new IllegalArgumentException();
            Set<String> actual = new HashSet<>();
            body.fieldNames().forEachRemaining(actual::add);
            if (!actual.contains("scope") || !Set.of("scope", "via").containsAll(actual)) throw new IllegalArgumentException();
            return body;
        } catch (Exception ignored) {
            throw invalid();
        }
    }

    private static <E extends Enum<E>> E enumValue(Class<E> type, JsonNode value) {
        try {
            if (value == null || !value.isTextual()) throw new IllegalArgumentException();
            return Enum.valueOf(type, value.textValue());
        } catch (IllegalArgumentException ignored) {
            throw invalid();
        }
    }

    private static AuthException invalid() {
        return AuthException.badRequest("ACCOUNT_DELETION_REQUEST_INVALID", "The account deletion request is invalid");
    }

    private static CurrentUser user(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof CurrentUser user)) {
            throw AuthException.unauthorized("AUTHENTICATION_REQUIRED", "Authentication is required");
        }
        return user;
    }
}
