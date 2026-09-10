package in.craves.integration.admin.deliveryintelligence;

import in.craves.integration.security.CravesPrincipal;
import java.time.OffsetDateTime;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class AdminDeliveryIntelligenceControllerTest {
    private final DeliveryIntelligenceReadRepository repository = mock(DeliveryIntelligenceReadRepository.class);
    private final AdminDeliveryIntelligenceController controller = new AdminDeliveryIntelligenceController(repository);

    private UsernamePasswordAuthenticationToken authentication(String role) {
        return new UsernamePasswordAuthenticationToken(new CravesPrincipal(UUID.randomUUID(), null, Set.of(role)), null, Set.of());
    }

    @Test void allHistoryAndOlderPagesRemainAdminOnlyAndUncached() {
        var from = OffsetDateTime.parse("2024-01-01T00:00:00Z");
        var to = OffsetDateTime.parse("2024-02-01T00:00:00Z");
        var response = controller.overview(authentication("SUPPORT_ADMIN"), 0, 25, from, to, 50, 25, "asc");
        verify(repository).overview(0, 25, from, to, 50, 25, "asc");
        assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");
    }

    @Test void customerCannotReadHistoricalData() {
        assertThatThrownBy(() -> controller.overview(authentication("CUSTOMER"), 0, 25, null, null, 0, 0, "desc"))
            .isInstanceOf(ResponseStatusException.class).hasMessageContaining("403");
        verifyNoInteractions(repository);
    }

    @Test void rejectsInvalidRangesAndPaginationBeforeQuerying() {
        var auth = authentication("ADMIN");
        var date = OffsetDateTime.parse("2024-01-01T00:00:00Z");
        assertThatThrownBy(() -> controller.overview(auth, 0, 25, date, date, 0, 0, "desc")).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> controller.overview(auth, 0, 25, null, null, -1, 0, "desc")).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> controller.overview(auth, 0, 25, null, null, 0, 0, "invalid")).isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(repository);
    }
}
