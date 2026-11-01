package in.craves.integration.fleet.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.fleet.FleetProperties;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * notification-service's rider calls (header X-Craves-Internal-Key): POST /internal/v1/push/realtime, one high-priority
 * FCM data message per offer, and POST /internal/v1/ops-alerts. Neither is retried here: notification-service retries a
 * push once while the offer is open, offers also reach the app on every /locations call, and an ops alert that fails is
 * a CRAVES_ALERT log line instead.
 */
@Component
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class RiderPushClient {
    private static final Logger LOGGER = LoggerFactory.getLogger(RiderPushClient.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final RestClient client;
    private final String secret;

    @Autowired
    public RiderPushClient(FleetProperties properties, @Value("${craves.fleet.services.notification-base-url:}") String baseUrl,
                           RestClient.Builder builder) {
        this.secret = properties.internalServiceKey();
        if (!StringUtils.hasText(baseUrl) || !StringUtils.hasText(secret)) {
            this.client = null;
            return;
        }
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(2));
        factory.setReadTimeout(Duration.ofSeconds(30)); // notification-service waits for FCM, retries once, up to ~25 s
        this.client = builder.clone().baseUrl(baseUrl).requestFactory(factory).build();
    }

    RiderPushClient(RestClient client, String secret) {
        this.client = client;
        this.secret = secret;
    }

    /**
     * Rings the offer on the rider's phone. ttlSeconds is the time left on the offer (1 to 600). Returns SENT, EXPIRED,
     * OFF, or notification-service's code (TOKEN_UNREGISTERED, TOKEN_INVALID, FCM_*, PUSH_DISABLED, ...).
     */
    public String offer(String fcmToken, UUID offerId, String offerJson, String title, String body, int ttlSeconds) {
        if (ttlSeconds < 1) {
            return "EXPIRED";
        }
        if (client == null) {
            return "OFF";
        }
        return realtime(Map.of("app", "rider", "token", fcmToken,
            "data", Map.of("type", "OFFER", "offerId", offerId.toString(), "offer", offerJson),
            "notification", Map.of("title", title, "body", body),
            "ttlSeconds", Math.min(600, ttlSeconds), "collapseKey", "offer-" + offerId));
    }

    /**
     * "You're offline. Tap to go back online" on a phone whose shift is open but which stopped calling (blueprint A7): a
     * data message of type GO_ONLINE, alive 10 minutes, a newer one replacing it. Returns SENT, OFF or notification-service's
     * code, as offer does.
     */
    public String goOnline(String fcmToken) {
        if (client == null) {
            return "OFF";
        }
        return realtime(Map.of("app", "rider", "token", fcmToken, "data", Map.of("type", "GO_ONLINE"),
            "notification", Map.of("title", "You're offline", "body", "Tap to go back online and get orders."),
            "ttlSeconds", 600, "collapseKey", "go-online"));
    }

    /**
     * Ops decided the rider's application (P6-04): a data message of type ACCOUNT with the decision, APPROVE or FIXES, so
     * an open app moves on at once and a closed one shows a notice whose tap opens it. The phone words it in the rider's
     * language; this English shows only to English readers. Alive 10 minutes, a newer one replacing it. Returns SENT, OFF
     * or notification-service's code, as offer does.
     */
    public String account(String fcmToken, boolean approved) {
        if (client == null) {
            return "OFF";
        }
        return realtime(Map.of("app", "rider", "token", fcmToken, "data", Map.of("type", "ACCOUNT", "decision", approved ? "APPROVE" : "FIXES"),
            "notification", approved ? Map.of("title", "You're approved", "body", "Open Craves Rider for your next step.")
                : Map.of("title", "Your application needs a fix", "body", "Open Craves Rider to see what ops asked for."),
            "ttlSeconds", 600, "collapseKey", "account"));
    }

    /**
     * The rider's trip ended without them (FleetTripService.tellRider): a data message of type TRIP_ENDED with the trip and
     * the reason (CANCELLED, RELEASED, HANDED_TO_RIDER or ORDER_CANCELLED), so an open app re-reads its trip at once and a
     * closed one shows a notice, worded by the phone in the rider's language. Alive 10 minutes. Returns as offer does.
     */
    public String tripEnded(String fcmToken, UUID tripId, String reason) {
        if (client == null) {
            return "OFF";
        }
        return realtime(Map.of("app", "rider", "token", fcmToken,
            "data", Map.of("type", "TRIP_ENDED", "tripId", tripId.toString(), "reason", reason),
            // English riders see these words (the phone words it for the others), as strings.xml rider_trip_ended_*.
            "notification", Map.of("title", "Your trip has ended", "body", switch (reason) {
                case "RELEASED" -> "Craves ops gave this order to Borzo or Pidge. You're paid for the trip so far.";
                case "HANDED_TO_RIDER" -> "Craves ops gave this order to another rider. You're paid for the trip so far.";
                case "ORDER_CANCELLED" -> "The customer's order was cancelled. You're paid for the trip so far.";
                default -> "Craves ops cancelled this trip. You're paid for the trip so far.";
            }),
            "ttlSeconds", 600, "collapseKey", "trip-ended-" + tripId));
    }

    private String realtime(Map<String, Object> request) {
        try {
            return client.post().uri("/internal/v1/push/realtime").header("X-Craves-Internal-Key", secret)
                .contentType(MediaType.APPLICATION_JSON).body(request)
                .exchange((ignored, response) -> {
                    if (response.getStatusCode().is2xxSuccessful()) {
                        return "SENT";
                    }
                    JsonNode reply = JSON.readTree(response.getBody().readAllBytes());
                    return reply != null && reply.path("code").isTextual() ? reply.path("code").asText()
                        : "HTTP_" + response.getStatusCode().value();
                });
        } catch (RestClientException exception) {
            return "UNREACHABLE";
        }
    }

    /** True when notification-service accepted the alert (202). kind is upper snake case. */
    public boolean opsAlert(String kind, String title, String body, Map<String, String> data) {
        boolean sent = false;
        if (client != null) {
            try {
                sent = client.post().uri("/internal/v1/ops-alerts").header("X-Craves-Internal-Key", secret)
                    .contentType(MediaType.APPLICATION_JSON).body(Map.of("kind", kind, "title", title, "body", body, "data", data))
                    .exchange((ignored, response) -> response.getStatusCode().value() == 202);
            } catch (RestClientException exception) {
                sent = false;
            }
        }
        if (!sent) {
            LOGGER.error("CRAVES_ALERT alert={} title={} data={} (ops alert not delivered)", kind, title, data);
        }
        return sent;
    }
}
