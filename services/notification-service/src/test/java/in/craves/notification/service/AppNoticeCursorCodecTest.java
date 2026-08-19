package in.craves.notification.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import in.craves.notification.domain.AppNoticeCursor;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AppNoticeCursorCodecTest {
    @Test
    void roundTripsOpaqueCursor() {
        AppNoticeCursor original = new AppNoticeCursor(
            OffsetDateTime.of(2026, 8, 19, 19, 30, 15, 123_000_000, ZoneOffset.ofHoursMinutes(5, 30)),
            UUID.fromString("11111111-2222-3333-4444-555555555555")
        );

        String encoded = AppNoticeCursorCodec.encode(original);
        AppNoticeCursor decoded = AppNoticeCursorCodec.decode(encoded);

        assertThat(encoded).doesNotContain("|");
        assertThat(decoded).isEqualTo(original);
    }

    @Test
    void rejectsMalformedCursor() {
        assertThatThrownBy(() -> AppNoticeCursorCodec.decode("not-a-valid-cursor"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("Cursor is invalid");
    }
}
