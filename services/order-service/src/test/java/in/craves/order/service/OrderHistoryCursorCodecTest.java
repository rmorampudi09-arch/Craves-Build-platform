package in.craves.order.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import in.craves.order.domain.OrderHistoryCursor;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class OrderHistoryCursorCodecTest {
    @Test
    void roundTripsOpaqueCursor() {
        OrderHistoryCursor original = new OrderHistoryCursor(
            Instant.parse("2026-08-19T14:30:15.123Z"),
            UUID.fromString("11111111-2222-3333-4444-555555555555")
        );

        String encoded = OrderHistoryCursorCodec.encode(original);
        OrderHistoryCursor decoded = OrderHistoryCursorCodec.decode(encoded);

        assertThat(encoded).doesNotContain("|");
        assertThat(decoded).isEqualTo(original);
    }

    @Test
    void rejectsMalformedCursor() {
        assertThatThrownBy(() -> OrderHistoryCursorCodec.decode("not-a-valid-cursor"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("Cursor is invalid");
    }
}
