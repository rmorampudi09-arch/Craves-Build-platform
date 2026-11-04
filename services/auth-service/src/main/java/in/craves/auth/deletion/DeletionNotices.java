package in.craves.auth.deletion;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.auth.deletion.DeletionModel.DeletionRequest;
import in.craves.auth.deletion.DeletionModel.Scope;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Sends the person's deletion notices through notification-service. Never throws: a notice that cannot be sent
 * is logged with the request id, the event, the channel and the HTTP status only, never a phone, email or name.
 */
@Component
public class DeletionNotices {
    private static final Logger log = LoggerFactory.getLogger(DeletionNotices.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final DateTimeFormatter DAY =
        DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH).withZone(ZoneId.of("Asia/Kolkata"));
    private static final String SCHEDULED_TITLE = "Account deletion scheduled";
    private static final String[] APP_AND_PUSH = {"IN_APP", "PUSH"};

    /** The body of POST /internal/v1/notifications (notification-service CreateNotificationRequest). */
    private record Notice(String requestKey, String sourceService, String eventType, UUID userId, String userRole,
                          String channel, String templateCode, String address, String title, String body,
                          String targetType, UUID targetId) {}

    private final AccountDeletionProperties properties;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NEVER).version(HttpClient.Version.HTTP_1_1).build();

    public DeletionNotices(AccountDeletionProperties properties) { this.properties = properties; }

    public void requested(DeletionRequest request, boolean needsReview) {
        if (needsReview) tell(request, "requested", APP_AND_PUSH, null, "Deletion request sent",
            () -> "Craves will finish it once your payouts are settled.");
        else scheduled(request, "requested");
    }

    public void approved(DeletionRequest request) { scheduled(request, "approved"); }

    public void rejected(DeletionRequest request) {
        tell(request, "rejected", APP_AND_PUSH, null, "Deletion request not approved", request::reviewNote);
    }

    public void reminder(DeletionRequest request) {
        tell(request, "reminder", APP_AND_PUSH, null, "Account deletion in 7 days", () ->
            "Your Craves account will be deleted on " + DAY.format(request.dueAt()) + ". Tap Keep my account if you want to keep it.");
    }

    public void completed(DeletionRequest request, String phone, String verifiedEmailOrNull) {
        switch (request.scope()) {
            case ALL -> {
                String body = "Your Craves account has been deleted. Thank you for using Craves.";
                tell(request, "completed", new String[] {"SMS"}, phone, "Craves account deleted", () -> body);
                if (verifiedEmailOrNull != null)
                    tell(request, "completed", new String[] {"EMAIL"}, verifiedEmailOrNull, "Craves account deleted", () -> body);
            }
            case CUSTOMER -> tell(request, "completed", new String[] {"IN_APP"}, null, "Customer details deleted",
                () -> "Your customer details have been deleted. Your chef account is unchanged.");
            case CHEF -> tell(request, "completed", new String[] {"IN_APP"}, null, "Chef account deleted",
                () -> "Your chef account has been deleted. You can still order on Craves.");
        }
    }

    private void scheduled(DeletionRequest request, String event) {
        tell(request, event, APP_AND_PUSH, null, SCHEDULED_TITLE, () ->
            "Your Craves account will be deleted on " + DAY.format(request.dueAt()) + ". Open the app and tap Keep my account to stop it.");
    }

    /** One POST per channel. The body is built lazily so that a missing date is logged like any other failure. */
    private void tell(DeletionRequest request, String event, String[] channels, String address, String title,
                      Supplier<String> body) {
        for (String channel : channels) {
            try {
                String text = body.get();
                if (text == null || text.isBlank()) text = title;
                send(request, event, channel, address, title, text);
            } catch (Exception error) {
                if (error instanceof InterruptedException) Thread.currentThread().interrupt();
                // Only our own codes carry a message; anything else is named by its class so no address can leak.
                Throwable cause = error instanceof ExecutionException && error.getCause() != null ? error.getCause() : error;
                log.warn("Account deletion notice not sent requestId={} event={} channel={} error={}", request.id(), event, channel,
                    cause instanceof IllegalStateException ? cause.getMessage() : cause.getClass().getSimpleName());
            }
        }
    }

    private void send(DeletionRequest request, String event, String channel, String address, String title, String body)
        throws Exception {
        AccountDeletionProperties.Service notification = properties.getServices().get("notification");
        if (notification == null || notification.getBaseUrl().isBlank() || notification.getCredential().isBlank())
            throw new IllegalStateException("NOT_CONFIGURED");
        if (("SMS".equals(channel) || "EMAIL".equals(channel)) && (address == null || address.isBlank()))
            throw new IllegalStateException("NO_ADDRESS");
        String type = "ACCOUNT_DELETION_" + event.toUpperCase(Locale.ROOT);
        // The in-app inbox is filtered by role; a whole-account request is shown in the customer inbox.
        String role = request.scope() == Scope.CHEF ? "CHEF" : "CUSTOMER";
        byte[] json = MAPPER.writeValueAsBytes(new Notice(
            "account-deletion:" + request.id() + ":" + event + ":" + channel, "auth", type, request.identityId(), role,
            channel, type + "_" + channel, address, title, body, "ACCOUNT_DELETION", request.id()));
        HttpRequest post = HttpRequest.newBuilder(URI.create(notification.getBaseUrl()).resolve("/internal/v1/notifications"))
            .timeout(properties.getCallTimeout()).header("Content-Type", "application/json")
            .header("X-Craves-Internal-Key", notification.getCredential())
            .POST(HttpRequest.BodyPublishers.ofByteArray(json)).build();
        var pending = http.sendAsync(post, HttpResponse.BodyHandlers.discarding());
        try {
            int status = pending.get(properties.getCallTimeout().toMillis() + 1000, TimeUnit.MILLISECONDS).statusCode();
            if (status / 100 != 2)
                log.warn("Account deletion notice refused requestId={} event={} channel={} status={}", request.id(), event, channel, status);
        } finally {
            if (!pending.isDone()) pending.cancel(true);
        }
    }
}
