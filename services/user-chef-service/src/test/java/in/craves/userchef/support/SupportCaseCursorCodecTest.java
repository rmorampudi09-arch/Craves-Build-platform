package in.craves.userchef.support;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SupportCaseCursorCodecTest {
    @Test
    void roundTripsOpaqueCursor() {
        SupportCaseCursor original = new SupportCaseCursor(
            Instant.parse("2026-08-19T14:30:15.123Z"),
            UUID.fromString("11111111-2222-3333-4444-555555555555")
        );

        String encoded = SupportCaseCursorCodec.encode(original);
        SupportCaseCursor decoded = SupportCaseCursorCodec.decode(encoded);

        assertThat(encoded).doesNotContain("|");
        assertThat(decoded).isEqualTo(original);
    }

    @Test
    void rejectsMalformedCursor() {
        assertThatThrownBy(() -> SupportCaseCursorCodec.decode("not-a-valid-cursor"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("Cursor is invalid");
    }
}
