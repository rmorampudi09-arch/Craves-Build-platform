package in.craves.notification.service;

import in.craves.notification.domain.AppNoticeCursor;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.UUID;

public final class AppNoticeCursorCodec {
    private static final DateTimeFormatter TIMESTAMP_FORMAT = DateTimeFormatter.ISO_OFFSET_DATE_TIME;

    private AppNoticeCursorCodec() {
    }

    public static String encode(AppNoticeCursor cursor) {
        String raw = TIMESTAMP_FORMAT.format(cursor.createdAt()) + "|" + cursor.id();
        return Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    public static AppNoticeCursor decode(String encoded) {
        try {
            String raw = new String(
                Base64.getUrlDecoder().decode(encoded),
                StandardCharsets.UTF_8
            );
            int separator = raw.lastIndexOf('|');
            if (separator <= 0 || separator == raw.length() - 1) {
                throw new IllegalArgumentException("Cursor format is invalid");
            }
            OffsetDateTime createdAt = OffsetDateTime.parse(
                raw.substring(0, separator),
                TIMESTAMP_FORMAT
            );
            UUID id = UUID.fromString(raw.substring(separator + 1));
            return new AppNoticeCursor(createdAt, id);
        } catch (RuntimeException ex) {
            throw new IllegalArgumentException("Cursor is invalid", ex);
        }
    }
}
