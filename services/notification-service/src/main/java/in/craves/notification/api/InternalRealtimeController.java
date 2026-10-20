package in.craves.notification.api;

import in.craves.notification.delivery.RealtimePushSender;
import in.craves.notification.email.VerificationEmailRequest;
import in.craves.notification.email.VerificationEmailTransport;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Rider realtime calls from integration-service: offer pushes (PLAN F11) and ops alerts such as SOS. */
@RestController
@RequestMapping("/internal/v1")
public class InternalRealtimeController {
    private static final Logger LOGGER = LoggerFactory.getLogger(InternalRealtimeController.class);
    private static final Pattern KIND = Pattern.compile("[A-Z][A-Z_]{1,39}");
    private static final int MAX_TTL_SECONDS = 600;
    private static final int MAX_PUSH_BYTES = 3500; // FCM refuses messages over 4 KB

    private final ObjectProvider<RealtimePushSender> push;
    private final VerificationEmailTransport email;
    private final List<String> opsAlertEmails;
    private final String configuredKey;

    public InternalRealtimeController(ObjectProvider<RealtimePushSender> push, VerificationEmailTransport email,
                                      @Value("${craves.notification.ops-alert.emails:}") String opsAlertEmails,
                                      @Value("${craves.internal.service-key:}") String configuredKey) {
        this.push = push;
        this.email = email;
        this.opsAlertEmails = Arrays.stream(opsAlertEmails.split(",")).map(String::trim).filter(value -> !value.isEmpty()).toList();
        if (!this.opsAlertEmails.stream().allMatch(VerificationEmailRequest::validEmail)) {
            throw new IllegalStateException("CRAVES_OPS_ALERT_EMAILS holds an invalid address");
        }
        this.configuredKey = configuredKey;
    }

    public record RealtimePushRequest(String app, String token, Map<String, String> data, NotificationText notification,
                                      Integer ttlSeconds, String collapseKey) {
    }

    public record NotificationText(String title, String body) {
    }

    public record OpsAlertRequest(String kind, String title, String body, Map<String, String> data) {
    }

    @PostMapping("/push/realtime")
    public ResponseEntity<Map<String, Object>> realtime(
        @RequestHeader(value = "X-Craves-" + "Internal-Key", required = false) String providedKey,
        @RequestBody RealtimePushRequest request
    ) {
        requireKey(providedKey);
        RealtimePushSender sender = push.getIfAvailable();
        if (sender == null) {
            return error(HttpStatus.SERVICE_UNAVAILABLE, "PUSH_DISABLED", null);
        }
        String problem = problem(request);
        if (problem != null) {
            return error(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", problem);
        }
        RealtimePushSender.Result result = sender.send(new RealtimePushSender.Push(
            request.app(), request.token(), request.data(), request.notification().title(), request.notification().body(),
            request.ttlSeconds(), request.collapseKey()
        ));
        return result.messageId() != null
            ? ResponseEntity.ok(Map.of("messageId", result.messageId()))
            : error(HttpStatus.BAD_GATEWAY, result.errorCode(), null);
    }

    @PostMapping("/ops-alerts")
    public ResponseEntity<Map<String, Object>> opsAlert(
        @RequestHeader(value = "X-Craves-" + "Internal-Key", required = false) String providedKey,
        @RequestBody OpsAlertRequest request
    ) {
        requireKey(providedKey);
        if (request.kind() == null || !KIND.matcher(request.kind()).matches() || !text(request.title(), 200)
            || !text(request.body(), 2000) || (request.data() != null && !validData(request.data()))) {
            return error(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "kind, title and body are required; data is at most 20 short strings");
        }
        List<String> recipients = email.configured() ? opsAlertEmails : List.of();
        VerificationEmailTransport.Outcome outcome = recipients.isEmpty() ? null : email.sendPlainText(
            recipients, ("Craves " + request.kind() + ": " + request.title()).replaceAll("[\\r\\n]+", " "), emailText(request));
        // Also a log line in the CRAVES_ALERT format (infra/monitoring), so the alert is visible even when email is not.
        LOGGER.warn("CRAVES_ALERT alert=OPS_ALERT kind={} recipients={} outcome={}", request.kind(), recipients.size(), outcome);
        if (outcome == null) {
            return error(HttpStatus.SERVICE_UNAVAILABLE, "OPS_ALERT_NOT_CONFIGURED", null);
        }
        if (outcome != VerificationEmailTransport.Outcome.ACCEPTED) {
            return error(HttpStatus.BAD_GATEWAY, "OPS_ALERT_FAILED", null);
        }
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of("recipients", recipients.size()));
    }

    private void requireKey(String providedKey) {
        if (configuredKey == null || configuredKey.isBlank() || providedKey == null
            || !MessageDigest.isEqual(configuredKey.getBytes(StandardCharsets.UTF_8), providedKey.getBytes(StandardCharsets.UTF_8))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Internal key is invalid");
        }
    }

    static String problem(RealtimePushRequest request) {
        if (request.app() == null || !RealtimePushSender.APP_PACKAGES.containsKey(request.app())) {
            return "app must be one of " + RealtimePushSender.APP_PACKAGES.keySet();
        }
        if (!text(request.token(), 4096)) {
            return "token is required";
        }
        if (request.ttlSeconds() == null || request.ttlSeconds() < 1 || request.ttlSeconds() > MAX_TTL_SECONDS) {
            return "ttlSeconds must be 1 to " + MAX_TTL_SECONDS;
        }
        if (request.notification() == null || !text(request.notification().title(), 100) || !text(request.notification().body(), 500)) {
            return "notification.title (up to 100) and notification.body (up to 500) are required";
        }
        if (request.collapseKey() != null && !text(request.collapseKey(), 64)) {
            return "collapseKey is at most 64 characters";
        }
        if (request.data() == null || !validData(request.data()) || !text(request.data().get("type"), 64)) {
            return "data needs a type and at most 20 short strings";
        }
        // FCM reserves these keys; title and body carry the notification text the app posts.
        if (request.data().keySet().stream().anyMatch(key -> key.equals("from") || key.equals("message_type")
            || key.startsWith("google") || key.startsWith("gcm") || key.equals("title") || key.equals("body"))) {
            return "data must not use from, message_type, title, body or keys starting with google or gcm";
        }
        int bytes = utf8(request.notification().title()) + utf8(request.notification().body())
            + request.data().entrySet().stream().mapToInt(entry -> utf8(entry.getKey()) + utf8(entry.getValue())).sum();
        return bytes > MAX_PUSH_BYTES ? "notification and data together are over " + MAX_PUSH_BYTES + " bytes" : null;
    }

    private static boolean validData(Map<String, String> data) {
        return data.size() <= 20 && data.entrySet().stream()
            .allMatch(entry -> text(entry.getKey(), 64) && entry.getValue() != null && entry.getValue().length() <= 1000);
    }

    private static String emailText(OpsAlertRequest request) {
        StringBuilder text = new StringBuilder(request.body()).append('\n');
        if (request.data() != null) {
            new TreeMap<>(request.data()).forEach((key, value) -> text.append('\n').append(key).append(": ").append(value));
        }
        return text.toString();
    }

    private static boolean text(String value, int max) {
        return value != null && !value.isBlank() && value.length() <= max;
    }

    private static int utf8(String value) {
        return value.getBytes(StandardCharsets.UTF_8).length;
    }

    private static ResponseEntity<Map<String, Object>> error(HttpStatus status, String code, String message) {
        return ResponseEntity.status(status).body(message == null ? Map.of("code", code) : Map.of("code", code, "message", message));
    }
}
