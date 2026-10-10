package in.craves.userchef.supportchat;

import in.craves.userchef.exception.ApiException;
import in.craves.userchef.exception.AppErrorHandler;
import in.craves.userchef.security.CurrentUser;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** In-app support chat for customers and chefs. The client keeps the history and sends it each turn. */
@RestController
@RequestMapping("/api/v1/support/chat")
public class SupportChatController {
    static final int MAX_MESSAGES = 20;
    static final int MAX_MESSAGE_CHARS = 2000;

    private final SupportAssistant assistant;
    private final SupportChatLimiter limiter;

    public SupportChatController(SupportAssistant assistant, SupportChatLimiter limiter) {
        this.assistant = assistant;
        this.limiter = limiter;
    }

    @PostMapping
    public SupportChatResponse chat(
        @AuthenticationPrincipal CurrentUser user,
        @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
        @RequestBody SupportChatRequest request
    ) {
        String role = contextRole(user, request == null ? null : request.contextRole());
        validate(request);
        String channel = channel(request.channel());
        if (!assistant.available()) {
            throw SupportAssistant.unavailable();
        }
        limiter.admit(user.identityId());
        return assistant.reply(user, role, channel, authorization, request.orderId(), request.messages());
    }

    /** Same error body as {@link AppErrorHandler}, plus Retry-After, which that handler cannot set. */
    @ExceptionHandler(SupportChatLimiter.Limited.class)
    public ResponseEntity<AppErrorHandler.ErrorBody> rateLimited(SupportChatLimiter.Limited limited) {
        return ResponseEntity.status(429)
            .header("Retry-After", Integer.toString(limited.retryAfterSeconds()))
            .body(new AppErrorHandler.ErrorBody(
                "SUPPORT_CHAT_RATE_LIMITED",
                limited.daily()
                    ? "You've reached today's chat limit. Please email support@craves.in."
                    : "Too many messages. Please wait a moment.",
                Instant.now(),
                List.of()));
    }

    /** CUSTOMER or CHEF, and only a role the caller actually holds. */
    static String contextRole(CurrentUser user, String requested) {
        if (user == null || user.identityId() == null) {
            throw ApiException.unauthorized("AUTHENTICATION_REQUIRED", "Sign in to chat with support.");
        }
        String role = requested == null || requested.isBlank()
            ? (user.hasRole("CUSTOMER") ? "CUSTOMER" : "CHEF")
            : requested.trim().toUpperCase(Locale.ROOT);
        if (!(role.equals("CUSTOMER") || role.equals("CHEF")) || !user.hasRole(role)) {
            throw ApiException.forbidden("SUPPORT_CHAT_ROLE_REQUIRED", "Support chat needs a customer or chef account.");
        }
        return role;
    }

    static void validate(SupportChatRequest request) {
        List<ChatMessage> messages = request == null ? null : request.messages();
        if (messages == null || messages.isEmpty() || messages.size() > MAX_MESSAGES) {
            throw invalid("Send between 1 and " + MAX_MESSAGES + " messages.");
        }
        for (ChatMessage message : messages) {
            if (message == null || !("user".equals(message.role()) || "assistant".equals(message.role()))) {
                throw invalid("Each message needs a role of user or assistant.");
            }
            if (message.content() == null || message.content().isBlank() || message.content().length() > MAX_MESSAGE_CHARS) {
                throw invalid("Each message must be 1 to " + MAX_MESSAGE_CHARS + " characters.");
            }
        }
        if (!"user".equals(messages.get(messages.size() - 1).role())) {
            throw invalid("The last message must be from the user.");
        }
    }

    /** WEB or APP, so navigation help matches where the user is chatting; null when the client didn't say. */
    static String channel(String requested) {
        if (requested == null || requested.isBlank()) {
            return null;
        }
        String channel = requested.trim().toUpperCase(Locale.ROOT);
        if (!channel.equals("WEB") && !channel.equals("APP")) {
            throw invalid("channel must be WEB or APP.");
        }
        return channel;
    }

    private static ApiException invalid(String message) {
        return ApiException.badRequest("SUPPORT_CHAT_INVALID", message);
    }

    public record SupportChatRequest(String contextRole, String channel, UUID orderId, List<ChatMessage> messages) {
    }

    public record ChatMessage(String role, String content) {
    }

    public record SupportChatResponse(String reply, SupportCaseRef supportCase) {
    }

    public record SupportCaseRef(UUID id, String caseNumber) {
    }
}
