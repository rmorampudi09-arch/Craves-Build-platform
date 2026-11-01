package in.craves.notification.delivery;

import com.google.firebase.ErrorCode;
import com.google.firebase.messaging.AndroidConfig;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.Message;
import com.google.firebase.messaging.MessagingErrorCode;
import java.time.Clock;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * Rider offer pushes (PLAN F11): one high-priority FCM data message, sent while the caller waits, never after the
 * offer expires. Data-only on purpose: a notification payload would be shown by Android itself while the app is in
 * the background, so the rider app's FirebaseMessagingService could not ring, de-duplicate or open the offer. The app
 * posts the visible notification (channel rider_offers) from data.title and data.body.
 */
@Component
@ConditionalOnProperty(prefix = "craves.notification.delivery", name = "realtime-push-enabled", havingValue = "true")
public class RealtimePushSender {
    /** FCM refuses a token that belongs to another app in the same Firebase project. */
    public static final Map<String, String> APP_PACKAGES = Map.of("rider", "com.cravesapp.rider");
    static final long MIN_TTL_MILLIS = 1000;
    /** The caller waits for the answer, so one attempt never holds it longer than this. */
    static final long MAX_WAIT_MILLIS = 10_000;
    private static final ExecutorService SENDS = Executors.newVirtualThreadPerTaskExecutor();

    private final FirebaseMessaging messaging;
    private final Clock clock;

    @Autowired
    public RealtimePushSender(FirebaseMessaging messaging) {
        this(messaging, Clock.systemUTC());
    }

    RealtimePushSender(FirebaseMessaging messaging, Clock clock) {
        this.messaging = messaging;
        this.clock = clock;
    }

    public record Push(String app, String token, Map<String, String> data, String title, String body,
                       int ttlSeconds, String collapseKey) {
    }

    /** Exactly one of messageId and errorCode is set. */
    public record Result(String messageId, String errorCode) {
    }

    public Result send(Push push) {
        long deadline = clock.millis() + push.ttlSeconds() * 1000L;
        Result first = attempt(push, deadline);
        if (!"FCM_UNAVAILABLE".equals(first.errorCode())) {
            return first;
        }
        // One immediate retry, only while the offer is still open; attempt() refuses once it is not.
        Result second = attempt(push, deadline);
        return "EXPIRED".equals(second.errorCode()) ? first : second;
    }

    private Result attempt(Push push, long deadline) {
        long left = deadline - clock.millis();
        if (left < MIN_TTL_MILLIS) {
            return new Result(null, "EXPIRED");
        }
        Message message = message(push, left);
        long wait = Math.min(left, MAX_WAIT_MILLIS);
        Future<String> sending = SENDS.submit(() -> messaging.send(message));
        try {
            return new Result(sending.get(wait, TimeUnit.MILLISECONDS), null);
        } catch (TimeoutException | InterruptedException exception) {
            // Also stops the SDK's own 503 back-off, so nothing goes out after the offer has expired.
            sending.cancel(true);
            if (exception instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            return new Result(null, wait == left ? "EXPIRED" : "FCM_TIMEOUT");
        } catch (ExecutionException exception) {
            return new Result(null, exception.getCause() instanceof FirebaseMessagingException fcm ? code(fcm) : "FCM_ERROR");
        }
    }

    Message message(Push push, long ttlMillis) {
        Map<String, String> data = new HashMap<>(push.data());
        data.put("title", push.title());
        data.put("body", push.body());
        AndroidConfig.Builder android = AndroidConfig.builder()
            .setPriority(AndroidConfig.Priority.HIGH)
            .setTtl(ttlMillis)
            .setRestrictedPackageName(APP_PACKAGES.get(push.app()));
        if (StringUtils.hasText(push.collapseKey())) {
            android.setCollapseKey(push.collapseKey());
        }
        return Message.builder().setToken(push.token()).putAllData(data).setAndroidConfig(android.build()).build();
    }

    static String code(FirebaseMessagingException exception) {
        MessagingErrorCode code = exception.getMessagingErrorCode();
        if (code == null) {
            ErrorCode base = exception.getErrorCode();
            return base == ErrorCode.UNAVAILABLE || base == ErrorCode.INTERNAL || base == ErrorCode.DEADLINE_EXCEEDED
                ? "FCM_UNAVAILABLE" : "FCM_ERROR";
        }
        return switch (code) {
            case UNREGISTERED -> "TOKEN_UNREGISTERED";
            // The request itself is validated by the controller, so these mean a bad token or another app's token.
            case INVALID_ARGUMENT, SENDER_ID_MISMATCH -> "TOKEN_INVALID";
            case UNAVAILABLE, INTERNAL -> "FCM_UNAVAILABLE";
            case QUOTA_EXCEEDED -> "FCM_QUOTA_EXCEEDED";
            default -> "FCM_ERROR";
        };
    }
}
