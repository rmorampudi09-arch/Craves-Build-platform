package in.craves.subscription.config;

import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class JdbcTimesTest {
    @Test void absentOptionalTimeRemainsNull() throws Exception {
        ResultSet rows = mock(ResultSet.class);
        assertNull(JdbcTimes.instant(rows, "paused_at"));
    }

    @Test void timestampPreservesAbsoluteTimeAndFractionalSeconds() throws Exception {
        ResultSet rows = mock(ResultSet.class);
        Instant expected = java.time.OffsetDateTime.parse("2026-09-17T09:00:00.123456+05:30").toInstant();
        when(rows.getTimestamp("created_at")).thenReturn(Timestamp.from(expected));
        assertEquals(expected, JdbcTimes.instant(rows, "created_at"));
    }
}
