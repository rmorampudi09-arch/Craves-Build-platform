package in.craves.order.review;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import in.craves.order.exception.OrderApiException;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ReviewCursorCodecTest {
    @Test
    void roundTripsDeterministicCursor() {
        ReviewCursor cursor = new ReviewCursor(
            Instant.parse("2026-09-11T00:00:00Z"),
            UUID.fromString("11111111-2222-3333-4444-555555555555")
        );
        assertThat(ReviewCursorCodec.decode(ReviewCursorCodec.encode(cursor))).isEqualTo(cursor);
    }

    @Test
    void emptyCursorMeansFirstPage() {
        assertThat(ReviewCursorCodec.decode(null)).isNull();
        assertThat(ReviewCursorCodec.decode(" ")).isNull();
    }

    @Test
    void malformedCursorFailsClosed() {
        assertThatThrownBy(() -> ReviewCursorCodec.decode("not-a-valid-cursor"))
            .isInstanceOf(OrderApiException.class);
    }
}
