package in.craves.auth.email;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.auth.exception.AuthException;
import in.craves.auth.security.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth/email-verification")
public class EmailVerificationController {
    private final EmailVerificationService service;
    private final ObjectMapper mapper;
    public EmailVerificationController(EmailVerificationService service,ObjectMapper mapper) { this.service=service; this.mapper=mapper; }
    @GetMapping public EmailVerificationState state(Authentication authentication) { return service.state(user(authentication)); }
    @PostMapping(value="/challenges",consumes="application/json") @ResponseStatus(HttpStatus.ACCEPTED)
    public EmailVerificationState issue(Authentication authentication,HttpServletRequest request) {
        CurrentUser user=user(authentication);
        JsonNode body=body(request,Set.of("email","requestId"));
        return service.issue(user,text(body,"email"),uuid(body,"requestId"));
    }
    @PostMapping(value="/verify",consumes="application/json")
    public EmailVerificationState verify(Authentication authentication,HttpServletRequest request) {
        CurrentUser user=user(authentication);
        JsonNode body=body(request,Set.of("challengeId","code"));
        return service.verify(user,uuid(body,"challengeId"),text(body,"code"));
    }
    @PostMapping(value="/resend",consumes="application/json") @ResponseStatus(HttpStatus.ACCEPTED)
    public EmailVerificationState resend(Authentication authentication,HttpServletRequest request) {
        CurrentUser user=user(authentication);
        JsonNode body=body(request,Set.of("challengeId","requestId"));
        return service.resend(user,uuid(body,"challengeId"),uuid(body,"requestId"));
    }
    private JsonNode body(HttpServletRequest request,Set<String> expected) {
        try {
            if (request.getContentLengthLong()>4096) throw new IllegalArgumentException();
            byte[] bytes=request.getInputStream().readNBytes(4097);
            if (bytes.length>4096) throw new IllegalArgumentException();
            var parser=mapper.getFactory().createParser(bytes);
            parser.enable(com.fasterxml.jackson.core.JsonParser.Feature.STRICT_DUPLICATE_DETECTION);
            JsonNode body=mapper.readTree(parser);
            if (parser.nextToken()!=null || body==null || !body.isObject()) throw new IllegalArgumentException();
            Set<String> actual=new HashSet<>(); body.fieldNames().forEachRemaining(actual::add);
            if (!actual.equals(expected)) throw new IllegalArgumentException();
            return body;
        } catch (Exception ignored) { throw AuthException.badRequest("EMAIL_REQUEST_INVALID","The verification request is invalid"); }
    }
    private static CurrentUser user(Authentication authentication) {
        if (authentication==null || !(authentication.getPrincipal() instanceof CurrentUser user))
            throw AuthException.unauthorized("AUTHENTICATION_REQUIRED","Authentication is required");
        return user;
    }
    private static String text(JsonNode body,String field) {
        if (!body.path(field).isTextual()) throw AuthException.badRequest("EMAIL_REQUEST_INVALID","The verification request is invalid");
        return body.path(field).textValue();
    }
    private static UUID uuid(JsonNode body,String field) {
        try {
            String value=text(body,field);
            UUID id=UUID.fromString(value);
            if (!id.toString().equalsIgnoreCase(value)) throw new IllegalArgumentException();
            return id;
        } catch (Exception ignored) { throw AuthException.badRequest("EMAIL_REQUEST_INVALID","The verification request is invalid"); }
    }
}
