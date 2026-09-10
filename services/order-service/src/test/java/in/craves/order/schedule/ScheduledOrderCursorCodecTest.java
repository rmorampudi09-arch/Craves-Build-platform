package in.craves.order.schedule;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import in.craves.order.exception.OrderApiException;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ScheduledOrderCursorCodecTest {
    @Test
    void roundTripsCursor() {
        ScheduledOrderCursor cursor = new ScheduledOrderCursor(
            Instant.parse("2026-09-11T12:30:00Z"),
            UUID.fromString("11111111-2222-3333-4444-555555555555"),
            UUID.fromString("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
        );
        assertThat(ScheduledOrderCursorCodec.decode(ScheduledOrderCursorCodec.encode(cursor)))
            .isEqualTo(cursor);
    }

    @Test
    void blankMeansFirstPageAndMalformedFailsClosed() {
        assertThat(ScheduledOrderCursorCodec.decode(null)).isNull();
        assertThat(ScheduledOrderCursorCodec.decode(" ")).isNull();
        assertThatThrownBy(() -> ScheduledOrderCursorCodec.decode("broken"))
            .isInstanceOf(OrderApiException.class);
    }
}
