package in.craves.userchef.support;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record SupportCaseCursor(Instant updatedAt, UUID id) {
    public SupportCaseCursor {
        Objects.requireNonNull(updatedAt, "updatedAt");
        Objects.requireNonNull(id, "id");
    }
}
