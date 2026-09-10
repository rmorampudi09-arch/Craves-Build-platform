package in.craves.userchef.support;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

public final class SupportCaseCursorCodec {
    private SupportCaseCursorCodec() {
    }

    public static String encode(SupportCaseCursor cursor) {
        String raw = cursor.updatedAt() + "|" + cursor.id();
        return Base64.getUrlEncoder().withoutPadding()
            .encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    public static SupportCaseCursor decode(String encoded) {
        try {
            String raw = new String(Base64.getUrlDecoder().decode(encoded), StandardCharsets.UTF_8);
            int separator = raw.lastIndexOf('|');
            if (separator <= 0 || separator == raw.length() - 1) {
                throw new IllegalArgumentException("Cursor format is invalid");
            }
            return new SupportCaseCursor(
                Instant.parse(raw.substring(0, separator)),
                UUID.fromString(raw.substring(separator + 1))
            );
        } catch (RuntimeException ex) {
            throw new IllegalArgumentException("Cursor is invalid", ex);
        }
    }
}
