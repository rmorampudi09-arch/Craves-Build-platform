package in.craves.order.review;

import in.craves.order.exception.OrderApiException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.UUID;

public final class ReviewCursorCodec {
    private static final int MAX_CURSOR_LENGTH = 256;

    private ReviewCursorCodec() {
    }

    public static String encode(ReviewCursor cursor) {
        String raw = cursor.timestamp().toString() + "|" + cursor.id();
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    public static ReviewCursor decode(String encoded) {
        if (encoded == null || encoded.isBlank()) {
            return null;
        }
        if (encoded.length() > MAX_CURSOR_LENGTH) {
            throw OrderApiException.badRequest("INVALID_REVIEW_CURSOR", "Review cursor is too long");
        }
        try {
            String raw = new String(Base64.getUrlDecoder().decode(encoded), StandardCharsets.UTF_8);
            String[] parts = raw.split("\\|", -1);
            if (parts.length != 2) {
                throw new IllegalArgumentException("cursor field count");
            }
            return new ReviewCursor(Instant.parse(parts[0]), UUID.fromString(parts[1]));
        } catch (IllegalArgumentException | DateTimeParseException exception) {
            throw OrderApiException.badRequest("INVALID_REVIEW_CURSOR", "Review cursor is invalid");
        }
    }
}
