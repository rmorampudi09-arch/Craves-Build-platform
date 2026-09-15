package in.craves.order.schedule;

import in.craves.order.exception.OrderApiException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.UUID;

public final class ScheduledOrderCursorCodec {
    private static final int MAX_CURSOR_LENGTH = 512;

    private ScheduledOrderCursorCodec() {
    }

    public static String encode(ScheduledOrderCursor cursor) {
        String raw = cursor.requestedAt() + "|" + cursor.scheduleRequestId() + "|" + cursor.orderId();
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    public static ScheduledOrderCursor decode(String encoded) {
        if (encoded == null || encoded.isBlank()) {
            return null;
        }
        if (encoded.length() > MAX_CURSOR_LENGTH) {
            throw OrderApiException.badRequest("SCHEDULE_CURSOR_INVALID", "Schedule cursor is too long");
        }
        try {
            String raw = new String(Base64.getUrlDecoder().decode(encoded), StandardCharsets.UTF_8);
            String[] parts = raw.split("\\|", -1);
            if (parts.length != 3) {
                throw new IllegalArgumentException("cursor field count");
            }
            return new ScheduledOrderCursor(
                Instant.parse(parts[0]),
                UUID.fromString(parts[1]),
                UUID.fromString(parts[2])
            );
        } catch (IllegalArgumentException | DateTimeParseException exception) {
            throw OrderApiException.badRequest("SCHEDULE_CURSOR_INVALID", "Schedule cursor is invalid");
        }
    }
}
