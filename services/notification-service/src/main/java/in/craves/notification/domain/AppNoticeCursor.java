package in.craves.notification.domain;

import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

public record AppNoticeCursor(
    OffsetDateTime createdAt,
    UUID id
) {
    public AppNoticeCursor {
        Objects.requireNonNull(createdAt, "createdAt");
        Objects.requireNonNull(id, "id");
    }
}
