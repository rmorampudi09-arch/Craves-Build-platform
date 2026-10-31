package in.craves.advanced.platform.data;

import in.craves.advanced.platform.web.ApiProblem;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

/** Opaque keyset cursor over (timestamp, id). */
public record Cursor(Instant at, UUID id) {
    public String encode() {
        String raw = at.toEpochMilli() + ":" + at.getNano() + ":" + id;
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    public static Cursor decode(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            String[] parts = new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8).split(":");
            if (parts.length != 3) throw new IllegalArgumentException();
            Instant at = Instant.ofEpochMilli(Long.parseLong(parts[0]));
            at = at.plusNanos(Integer.parseInt(parts[1]) % 1_000_000);
            return new Cursor(at, UUID.fromString(parts[2]));
        } catch (RuntimeException ex) {
            throw ApiProblem.badRequest("INVALID_CURSOR", "The cursor is not valid");
        }
    }

    public static int limit(Integer requested, int fallback, int max) {
        if (requested == null) return fallback;
        if (requested < 1 || requested > max) throw ApiProblem.badRequest("INVALID_LIMIT", "limit must be between 1 and " + max);
        return requested;
    }
}
