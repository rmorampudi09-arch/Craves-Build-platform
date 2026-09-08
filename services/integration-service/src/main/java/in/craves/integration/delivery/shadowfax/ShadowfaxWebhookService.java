package in.craves.integration.delivery.shadowfax;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.config.ShadowfaxProperties;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ShadowfaxWebhookService {
    private final ShadowfaxProperties properties;
    private final ObjectMapper objectMapper;
    private final ShadowfaxWebhookInboxRepository inbox;
    private final ShadowfaxStatusMapper statusMapper;

    public ShadowfaxWebhookService(ShadowfaxProperties properties,
                                   ObjectMapper objectMapper,
                                   ShadowfaxWebhookInboxRepository inbox,
                                   ShadowfaxStatusMapper statusMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.inbox = inbox;
        this.statusMapper = statusMapper;
    }

    @Transactional
    public WebhookReceipt accept(String rawBody, String suppliedSecret) {
        if (!StringUtils.hasText(properties.getCallbackSecret())) {
            throw new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE, "Shadowfax callback verification is not configured"
            );
        }
        if (!constantTimeEquals(properties.getCallbackSecret(), suppliedSecret)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid Shadowfax callback credential");
        }
        JsonNode payload = parse(rawBody);
        String providerOrderId = requiredText(payload, "sfx_order_id");
        String providerStatus = requiredText(payload, "order_status");
        String eventId = sha256(String.join(
            "|", providerOrderId, providerStatus, eventTimestamp(payload),
            payload.path("client_order_id").asText("")
        ));
        boolean inserted = inbox.store(eventId, sha256(suppliedSecret), payload);
        return new WebhookReceipt(
            eventId, providerStatus, statusMapper.fromProvider(providerStatus), !inserted
        );
    }

    private JsonNode parse(String rawBody) {
        if (!StringUtils.hasText(rawBody)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Shadowfax callback body is empty");
        }
        try {
            JsonNode payload = objectMapper.readTree(rawBody);
            if (!payload.isObject()) {
                throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Shadowfax callback body must be a JSON object"
                );
            }
            return payload;
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Shadowfax callback body is not valid JSON", ex
            );
        }
    }

    static String eventTimestamp(JsonNode payload) {
        for (String field : new String[] {
            "allot_time", "arrival_time", "dispatch_time", "customer_doorstep_arrival_time",
            "delivery_time", "cancel_time", "return_time", "rts_time", "time"
        }) {
            String value = payload.path(field).asText(null);
            if (StringUtils.hasText(value)) {
                return value;
            }
        }
        return "timestamp-not-supplied";
    }

    private static String requiredText(JsonNode payload, String field) {
        String value = payload.path(field).asText(null);
        if (!StringUtils.hasText(value)) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Shadowfax callback is missing " + field
            );
        }
        return value;
    }

    private static boolean constantTimeEquals(String expected, String supplied) {
        if (!StringUtils.hasText(supplied)) {
            return false;
        }
        return MessageDigest.isEqual(
            expected.getBytes(StandardCharsets.UTF_8), supplied.getBytes(StandardCharsets.UTF_8)
        );
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))
            );
        } catch (Exception ex) {
            throw new IllegalStateException("Could not calculate Shadowfax event identity", ex);
        }
    }

    public record WebhookReceipt(
        String providerEventId,
        String providerStatus,
        DeliveryStatus normalizedStatus,
        boolean duplicate
    ) {}
}
