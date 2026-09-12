package in.craves.integration.delivery.pidge;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.config.PidgeProperties;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

class PidgeWebhookTest {
    final ObjectMapper mapper = new ObjectMapper();
    final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    final PidgeProperties properties = new PidgeProperties();
    final PidgeWebhookService service = new PidgeWebhookService(properties, mapper, jdbc);
    final String payload = "{\"id\":\"order-1\",\"status\":\"fulfilled\",\"updated_at\":\"2026-09-12T08:00:00Z\",\"fulfillment\":{\"status\":\"PICKED_UP\"}}";
    @Test void unauthenticatedCallbackCannotPersistAnything() {
        properties.setWebhookToken("test-secret");
        assertEquals(401, assertThrows(ResponseStatusException.class, () -> service.accept(payload, "wrong")).getStatusCode().value());
        verifyNoInteractions(jdbc);
    }
    @Test void emptyProbeStillRequiresAuthenticationAndPayload() {
        properties.setWebhookToken("test-secret");
        assertEquals(400, assertThrows(ResponseStatusException.class, () -> service.accept("{}", "Bearer test-secret")).getStatusCode().value());
        verifyNoInteractions(jdbc);
    }
    @Test void duplicateEventHasStableIdentityAndCredentialIsNotStored() {
        properties.setWebhookToken("test-secret");
        var first = service.accept(payload, "Bearer test-secret");
        var second = service.accept(payload, "test-secret");
        assertTrue(first.duplicate()); assertEquals(first.eventId(), second.eventId());
        verify(jdbc, times(2)).update(anyString(), any(Object[].class));
    }
    @Test void normalizerUsesProviderTimestampAndIdentity() throws Exception {
        var update = new PidgeWebhookNormalizer().normalize(mapper.readTree(payload));
        assertEquals("order-1", update.providerOrderId());
        assertEquals(Instant.parse("2026-09-12T08:00:00Z"), update.observedAt());
        assertEquals("PICKED_UP", update.status().name());
    }
}
