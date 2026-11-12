package in.craves.integration.admin;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.admin.AdminIntegrationInvestigationController.ProofOfDeliverySnapshot;
import in.craves.integration.admin.AdminIntegrationInvestigationController.ProofPhoto;
import in.craves.integration.erasure.AccountErasureService;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;

/**
 * Proof of delivery as a provider sent it, read from a stored delivery event (handbook E26), read only. Borzo: the check-in
 * on its last drop point ({@code checkin.recipient_full_name}, {@code checkin.recipient_position},
 * {@code courier_visit_datetime}, {@code place_photo_url}, {@code sign_photo_url}). Pidge: the https links in
 * {@code fulfillment.drop.proof}. A webhook keeps the provider's body as sent; a tracking poll keeps it under
 * {@code delivery.providerMetadata}. Borzo's {@code checkin_code} is a PIN issued for the point, not a record of a
 * handover, so it is never read. Anything else gives null. Account erasure replaces the recipient and the links in the
 * stored bodies (DropoffScrubber); its placeholders read as absent.
 */
final class ProofOfDelivery {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int MAX_TEXT = 200;
    private static final int MAX_URL = 2048;
    private static final int MAX_PHOTOS = 10;

    private ProofOfDelivery() {
    }

    static ProofOfDeliverySnapshot read(String providerId, String body, OffsetDateTime occurredAt, String status) {
        JsonNode payload;
        try {
            payload = JSON.readTree(body);
        } catch (JsonProcessingException e) {
            return null;
        }
        if (payload == null || !payload.isObject()) {
            return null;
        }
        JsonNode polled = payload.path("delivery").path("providerMetadata");
        List<ProofPhoto> photos = new ArrayList<>();
        return switch (providerId == null ? "" : providerId) {
            case "borzo" -> {
                Borzo found = borzo(payload.path("order").path("points"), photos);
                found = found != null ? found : borzo(polled.path("points"), photos);
                yield found == null ? null
                    : new ProofOfDeliverySnapshot("borzo", status, occurredAt, found.visit(), found.recipient(), found.position(), photos);
            }
            case "pidge" -> {
                pidge(payload.path("fulfillment").path("drop").path("proof"), photos);
                if (photos.isEmpty()) {
                    pidge(polled.path("fulfillment").path("drop").path("proof"), photos);
                }
                yield photos.isEmpty() ? null : new ProofOfDeliverySnapshot("pidge", status, occurredAt, null, null, null, photos);
            }
            default -> null;
        };
    }

    private record Borzo(OffsetDateTime visit, String recipient, String position) {}

    /** Point 0 is the kitchen, so the drop with proof is the last point after it that carries any. */
    private static Borzo borzo(JsonNode points, List<ProofPhoto> photos) {
        if (!points.isArray()) {
            return null;
        }
        for (int index = points.size() - 1; index >= 1; index--) {
            JsonNode point = points.get(index);
            String recipient = text(point.path("checkin").path("recipient_full_name"));
            String position = text(point.path("checkin").path("recipient_position"));
            OffsetDateTime visit = time(point.path("courier_visit_datetime"));
            addPhoto(photos, "PLACE", point.path("place_photo_url"));
            addPhoto(photos, "SIGNATURE", point.path("sign_photo_url"));
            if (recipient != null || position != null || visit != null || !photos.isEmpty()) {
                return new Borzo(visit, recipient, position);
            }
        }
        return null;
    }

    private static void pidge(JsonNode proof, List<ProofPhoto> photos) {
        if (proof.isArray()) {
            for (JsonNode item : proof) {
                addPhoto(photos, "PROOF", item);
            }
        }
    }

    private static void addPhoto(List<ProofPhoto> photos, String kind, JsonNode value) {
        String url = value.isTextual() ? value.asText().trim() : null;
        if (photos.size() < MAX_PHOTOS && url != null && url.startsWith("https://") && url.length() <= MAX_URL
            && url.chars().noneMatch(c -> c <= ' ' || c == 0x7f)) {
            photos.add(new ProofPhoto(kind, url));
        }
    }

    /** Printable text only (control and invisible format characters removed), trimmed and capped; blank or erased gives null. */
    private static String text(JsonNode value) {
        if (!value.isTextual()) {
            return null;
        }
        String cleaned = value.asText().replaceAll("[\\p{Cntrl}\\p{Cf}]", " ").trim();
        if (cleaned.isEmpty() || cleaned.equals(AccountErasureService.ERASED_NAME) || cleaned.equals(AccountErasureService.ERASED_TEXT)) {
            return null;
        }
        return cleaned.codePointCount(0, cleaned.length()) > MAX_TEXT
            ? cleaned.substring(0, cleaned.offsetByCodePoints(0, MAX_TEXT)) : cleaned;
    }

    private static OffsetDateTime time(JsonNode value) {
        if (!value.isTextual()) {
            return null;
        }
        try {
            return OffsetDateTime.parse(value.asText().trim());
        } catch (DateTimeParseException e) {
            return null;
        }
    }
}
