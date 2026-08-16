package in.craves.integration.delivery.shiprocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.integration.config.ShiprocketProperties;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ShiprocketWebhookService {
    private final ObjectMapper objectMapper;
    private final ShiprocketProperties properties;
    private final ShiprocketWebhookInboxRepository inboxRepository;

    public ShiprocketWebhookService(ObjectMapper objectMapper,
                                    ShiprocketProperties properties,
                                    ShiprocketWebhookInboxRepository inboxRepository) {
        this.objectMapper = objectMapper;
        this.properties = properties;
        this.inboxRepository = inboxRepository;
    }

    @Transactional
    public WebhookReceipt accept(String rawBody, String suppliedApiKey) {
        if (!StringUtils.hasText(properties.getWebhookToken())) {
            throw new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Delivery callback verification is not configured"
            );
        }
        if (!constantTimeEquals(properties.getWebhookToken(), suppliedApiKey)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid delivery callback credential");
        }

        JsonNode payload = parsePayload(rawBody);
        String awb = requiredText(payload, "awb");
        if (!StringUtils.hasText(payload.path("shipment_status").asText(null))
            && !payload.path("shipment_status_id").canConvertToInt()) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Delivery callback is missing shipment status"
            );
        }

        ObjectNode storedPayload = payload.deepCopy();
        storedPayload.put("_craves_received_at", Instant.now().toString());
        String providerEventId = deriveEventId(payload, rawBody);
        boolean inserted = inboxRepository.store(
            providerEventId,
            sha256Hex(suppliedApiKey),
            storedPayload
        );
        return new WebhookReceipt(providerEventId, awb, !inserted);
    }

    private JsonNode parsePayload(String rawBody) {
        if (!StringUtils.hasText(rawBody)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Delivery callback body is empty");
        }
        try {
            JsonNode payload = objectMapper.readTree(rawBody);
            if (!payload.isObject()) {
                throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Delivery callback body must be a JSON object"
                );
            }
            return payload;
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Delivery callback body is not valid JSON",
                ex
            );
        }
    }

    private static String requiredText(JsonNode payload, String field) {
        String value = payload.path(field).asText(null);
        if (!StringUtils.hasText(value)) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Delivery callback is missing " + field
            );
        }
        return value.trim();
    }

    private static String deriveEventId(JsonNode payload, String rawBody) {
        String canonical = String.join(
            "|",
            payload.path("awb").asText(""),
            payload.path("shipment_status_id").asText(""),
            payload.path("shipment_status").asText(""),
            payload.path("current_timestamp").asText(""),
            payload.path("order_id").asText("")
        );
        if (canonical.replace("|", "").isBlank()) {
            canonical = rawBody;
        }
        return sha256Hex(canonical);
    }

    private static boolean constantTimeEquals(String expected, String supplied) {
        if (!StringUtils.hasText(expected) || !StringUtils.hasText(supplied)) {
            return false;
        }
        return MessageDigest.isEqual(
            expected.getBytes(StandardCharsets.UTF_8),
            supplied.getBytes(StandardCharsets.UTF_8)
        );
    }

    private static String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(
                digest.digest(value.getBytes(StandardCharsets.UTF_8))
            );
        } catch (Exception ex) {
            throw new IllegalStateException("Could not calculate delivery callback fingerprint", ex);
        }
    }

    public record WebhookReceipt(String providerEventId, String awb, boolean duplicate) {}
}
