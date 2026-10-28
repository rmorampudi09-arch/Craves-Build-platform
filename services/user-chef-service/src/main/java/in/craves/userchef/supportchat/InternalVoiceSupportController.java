package in.craves.userchef.supportchat;

import com.fasterxml.jackson.databind.node.ArrayNode;
import in.craves.userchef.exception.AppErrorHandler;
import in.craves.userchef.security.InternalRequestAuthorizer;
import in.craves.userchef.supportchat.SupportChatController.SupportCaseRef;
import in.craves.userchef.supportchat.VoiceSupportService.Caller;
import in.craves.userchef.supportchat.VoiceSupportService.CallerContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Called by voice-support-gateway (the phone line) with the shared internal secret. {@code context} identifies the
 * caller by number and returns their latest orders; {@code tickets} opens a support case for them.
 * Never published through APIM.
 */
@RestController
@RequestMapping("/internal/v1/support/voice")
public class InternalVoiceSupportController {
    private static final String INTERNAL_HEADER = "X-Craves-Internal-Secret";

    private final VoiceSupportService voice;
    private final InternalRequestAuthorizer authorizer;

    public InternalVoiceSupportController(VoiceSupportService voice, InternalRequestAuthorizer authorizer) {
        this.voice = voice;
        this.authorizer = authorizer;
    }

    @GetMapping(value = "/context", produces = "application/json")
    public ResponseEntity<ContextResponse> context(
        @RequestHeader(name = INTERNAL_HEADER, required = false) String suppliedSecret,
        @RequestParam String phone
    ) {
        authorizer.requireValid(suppliedSecret);
        CallerContext context = voice.context(phone);
        Caller caller = context.caller();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new ContextResponse(
            caller == null ? null : new CallerResponse(
                caller.firstName(), caller.role(), caller.applicationStatus(), caller.reviewStatus()),
            context.orders()));
    }

    @PostMapping(value = "/tickets", produces = "application/json")
    public ResponseEntity<SupportCaseRef> ticket(
        @RequestHeader(name = INTERNAL_HEADER, required = false) String suppliedSecret,
        @Valid @RequestBody TicketRequest request
    ) {
        authorizer.requireValid(suppliedSecret);
        SupportCaseRef ticket = voice.openTicket(
            request.phone(), request.subject(), request.details(), request.callerName(), request.language());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ticket);
    }

    /** Same error body as {@link AppErrorHandler}, plus Retry-After, which that handler cannot set. */
    @ExceptionHandler(SupportChatLimiter.Limited.class)
    public ResponseEntity<AppErrorHandler.ErrorBody> rateLimited(SupportChatLimiter.Limited limited) {
        return ResponseEntity.status(429)
            .header("Retry-After", Integer.toString(limited.retryAfterSeconds()))
            .contentType(MediaType.APPLICATION_JSON)
            .body(new AppErrorHandler.ErrorBody(
                "VOICE_TICKET_RATE_LIMITED",
                limited.daily() ? "This number has reached today's ticket limit." : "Too many tickets. Please wait a moment.",
                Instant.now(),
                List.of()));
    }

    /** The caller's identity id never leaves this service: the phone line only needs a name and a role. */
    public record CallerResponse(String firstName, String role, String applicationStatus, String reviewStatus) {
    }

    public record ContextResponse(CallerResponse caller, ArrayNode orders) {
    }

    public record TicketRequest(
        @NotBlank @Size(max = 20) String phone,
        @NotBlank @Size(max = 200) String subject,
        @NotBlank @Size(max = 2000) String details,
        @Size(max = 120) String callerName,
        @Size(max = 40) String language
    ) {
    }
}
