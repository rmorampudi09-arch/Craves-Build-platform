package in.craves.integration.admin.deliveryintelligence;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import in.craves.integration.security.CravesPrincipal;
import java.time.OffsetDateTime;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.server.ResponseStatusException;

class AdminDeliveryIntelligenceHistoryControllerTest {

    @Test
    void acceptsAllTimeFilterUsedByProductionDashboard() {
        DeliveryIntelligenceReadRepository investigationRepository = mock(DeliveryIntelligenceReadRepository.class);
        DeliveryIntelligenceHistoryReadRepository historyRepository = mock(DeliveryIntelligenceHistoryReadRepository.class);
        AdminDeliveryIntelligenceController controller = new AdminDeliveryIntelligenceController(
            investigationRepository,
            historyRepository
        );

        controller.overview(admin(), 0, 25, "desc", 0, 0, null, null);

        verify(historyRepository).overview(0, 25, "desc", 0, 0, null, null);
    }

    @Test
    void acceptsThirtyDayFilterUsedByProductionDashboard() {
        DeliveryIntelligenceReadRepository investigationRepository = mock(DeliveryIntelligenceReadRepository.class);
        DeliveryIntelligenceHistoryReadRepository historyRepository = mock(DeliveryIntelligenceHistoryReadRepository.class);
        AdminDeliveryIntelligenceController controller = new AdminDeliveryIntelligenceController(
            investigationRepository,
            historyRepository
        );

        controller.overview(admin(), 720, 50, "asc", 25, 50, null, null);

        verify(historyRepository).overview(720, 50, "asc", 25, 50, null, null);
    }

    @Test
    void acceptsCustomHistoryWindowWhenHoursIsZero() {
        DeliveryIntelligenceReadRepository investigationRepository = mock(DeliveryIntelligenceReadRepository.class);
        DeliveryIntelligenceHistoryReadRepository historyRepository = mock(DeliveryIntelligenceHistoryReadRepository.class);
        AdminDeliveryIntelligenceController controller = new AdminDeliveryIntelligenceController(
            investigationRepository,
            historyRepository
        );
        OffsetDateTime from = OffsetDateTime.parse("2026-09-01T00:00:00+05:30");
        OffsetDateTime to = OffsetDateTime.parse("2026-09-11T00:00:00+05:30");

        controller.overview(admin(), 0, 100, "desc", 0, 0, from, to);

        verify(historyRepository).overview(0, 100, "desc", 0, 0, from, to);
    }

    @Test
    void rejectsUnsupportedHistoryWindowInsteadOfSilentlyClamping() {
        DeliveryIntelligenceReadRepository investigationRepository = mock(DeliveryIntelligenceReadRepository.class);
        DeliveryIntelligenceHistoryReadRepository historyRepository = mock(DeliveryIntelligenceHistoryReadRepository.class);
        AdminDeliveryIntelligenceController controller = new AdminDeliveryIntelligenceController(
            investigationRepository,
            historyRepository
        );

        assertThatThrownBy(() -> controller.overview(admin(), 721, 25, "desc", 0, 0, null, null))
            .isInstanceOf(ResponseStatusException.class)
            .satisfies(error -> {
                ResponseStatusException response = (ResponseStatusException) error;
                org.assertj.core.api.Assertions.assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            });
    }

    private static Authentication admin() {
        CravesPrincipal principal = new CravesPrincipal(UUID.randomUUID(), "+910000000000", Set.of("ADMIN"));
        return new UsernamePasswordAuthenticationToken(principal, null, Set.of());
    }
}
