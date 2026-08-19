package in.craves.order.service;

import in.craves.order.domain.OrderHistoryCursor;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

public final class OrderHistoryCursorCodec {
    private OrderHistoryCursorCodec() {
    }

    public static String encode(OrderHistoryCursor cursor) {
        String raw = cursor.createdAt() + "|" + cursor.id();
        return Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    public static OrderHistoryCursor decode(String encoded) {
        try {
            String raw = new String(
                Base64.getUrlDecoder().decode(encoded),
                StandardCharsets.UTF_8
            );
            int separator = raw.lastIndexOf('|');
            if (separator <= 0 || separator == raw.length() - 1) {
                throw new IllegalArgumentException("Cursor format is invalid");
            }
            Instant createdAt = Instant.parse(raw.substring(0, separator));
            UUID id = UUID.fromString(raw.substring(separator + 1));
            return new OrderHistoryCursor(createdAt, id);
        } catch (RuntimeException ex) {
            throw new IllegalArgumentException("Cursor is invalid", ex);
        }
    }
}
