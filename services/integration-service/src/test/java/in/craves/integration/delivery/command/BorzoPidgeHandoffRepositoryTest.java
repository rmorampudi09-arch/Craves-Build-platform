package in.craves.integration.delivery.command;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class BorzoPidgeHandoffRepositoryTest {

    @Test
    void handoffDueAtIsTwoMinutesFromSelectionEvenWhenBookingFinishesNearExpiry() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        BorzoPidgeHandoffRepository handoffs = new BorzoPidgeHandoffRepository(jdbc);
        UUID jobId = UUID.randomUUID();
        Instant windowStartedAt = Instant.now().minusSeconds(119);
        Instant deadline = windowStartedAt.plusSeconds(120);

        handoffs.enroll(jobId, "borzo-77", windowStartedAt);

        verify(jdbc).update(anyString(), eq(jobId), eq("borzo-77"),
            eq(windowStartedAt.atOffset(ZoneOffset.UTC)),
            eq(deadline.atOffset(ZoneOffset.UTC)),
            eq(deadline.atOffset(ZoneOffset.UTC)));
    }
}
