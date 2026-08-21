package in.craves.order.domain;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record OrderHistoryCursor(
    Instant createdAt,
    UUID id
) {
    public OrderHistoryCursor {
        Objects.requireNonNull(createdAt, "createdAt");
        Objects.requireNonNull(id, "id");
    }
}
