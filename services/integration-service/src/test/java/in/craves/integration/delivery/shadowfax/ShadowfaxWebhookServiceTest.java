package in.craves.integration.delivery.shadowfax;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.config.ShadowfaxProperties;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

class ShadowfaxWebhookServiceTest {
    private static final String PAYLOAD = """
        {"sfx_order_id":"123456","order_status":"ALLOTTED"}
        """;

    @Test
    void rejectsCallbackWhenTokenIsNotConfigured() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ShadowfaxWebhookService service = new ShadowfaxWebhookService(
            properties(""),
            new ObjectMapper(),
            jdbc
        );

        assertThatThrownBy(() -> service.accept(PAYLOAD, "Bearer supplied"))
            .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED));

        verifyNoInteractions(jdbc);
    }

    @Test
    void rejectsCallbackWhenTokenIsWrong() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ShadowfaxWebhookService service = new ShadowfaxWebhookService(
            properties("expected"),
            new ObjectMapper(),
            jdbc
        );

        assertThatThrownBy(() -> service.accept(PAYLOAD, "Bearer wrong"))
            .isInstanceOfSatisfying(ResponseStatusException.class, ex ->
                assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED));

        verifyNoInteractions(jdbc);
    }

    @Test
    void acceptsValidCallbackAndReportsDuplicateInboxEntry() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.update(anyString(), any(), any(), any(), any())).thenReturn(0);
        ShadowfaxWebhookService service = new ShadowfaxWebhookService(
            properties("expected"),
            new ObjectMapper(),
            jdbc
        );

        ShadowfaxWebhookService.Receipt receipt = service.accept(PAYLOAD, "Bearer expected");

        assertThat(receipt.accepted()).isTrue();
        assertThat(receipt.duplicate()).isTrue();
        assertThat(receipt.eventId()).isEqualTo("123456:ALLOTTED");
    }

    private ShadowfaxProperties properties(String webhookToken) {
        ShadowfaxProperties properties = new ShadowfaxProperties();
        properties.setWebhookToken(webhookToken);
        return properties;
    }
}
