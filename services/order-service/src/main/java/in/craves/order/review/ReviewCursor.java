package in.craves.order.review;

import java.time.Instant;
import java.util.UUID;

public record ReviewCursor(Instant timestamp, UUID id) {
}
