package in.craves.order.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import in.craves.order.security.CravesPrincipal;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

class RepeatOrderServiceValidationTest {
    private NamedParameterJdbcTemplate jdbc;
    private RepeatOrderService service;

    @BeforeEach
    void setUp() {
        jdbc = mock(NamedParameterJdbcTemplate.class);
        service = new RepeatOrderService(jdbc);
    }

    @Test
    void springContextUsesJdbcTemplateConstructor() {
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.registerBean(JdbcTemplate.class, () -> mock(JdbcTemplate.class));
            context.register(RepeatOrderService.class);
            context.refresh();

            assertThat(context.getBean(RepeatOrderService.class)).isNotNull();
        }
    }

    @Test
    void rejectsNonCustomerBeforeDatabaseAccess() {
        CravesPrincipal chef = new CravesPrincipal(UUID.randomUUID(), "+910000000000", Set.of("CHEF"));
        assertThatThrownBy(() -> service.listCandidates(chef, 20, null))
            .isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(jdbc);
    }

    @Test
    void rejectsOversizedPageBeforeDatabaseAccess() {
        CravesPrincipal customer = new CravesPrincipal(UUID.randomUUID(), "+919876543210", Set.of("CUSTOMER"));
        assertThatThrownBy(() -> service.listCandidates(customer, 51, null))
            .isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(jdbc);
    }

    @Test
    void rejectsMalformedCursorBeforeDatabaseAccess() {
        CravesPrincipal customer = new CravesPrincipal(UUID.randomUUID(), "+919876543210", Set.of("CUSTOMER"));
        assertThatThrownBy(() -> service.listCandidates(customer, 20, "not-a-valid-cursor"))
            .isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(jdbc);
    }
}
