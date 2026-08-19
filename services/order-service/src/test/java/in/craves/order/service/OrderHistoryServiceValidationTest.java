package in.craves.order.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import in.craves.order.security.CravesPrincipal;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

class OrderHistoryServiceValidationTest {
    private NamedParameterJdbcTemplate jdbc;
    private OrderHistoryService service;
    private CravesPrincipal customer;
    private CravesPrincipal chef;

    @BeforeEach
    void setUp() {
        jdbc = mock(NamedParameterJdbcTemplate.class);
        service = new OrderHistoryService(jdbc);
        customer = new CravesPrincipal(
            UUID.fromString("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
            "+919999999999",
            Set.of("CUSTOMER")
        );
        chef = new CravesPrincipal(
            UUID.fromString("11111111-2222-3333-4444-555555555555"),
            "+918888888888",
            Set.of("CHEF")
        );
    }

    @Test
    void rejectsInvalidCustomerPageSizeBeforeDatabaseAccess() {
        ResponseStatusException exception = catchThrowableOfType(
            () -> service.listCustomerOrders(customer, 0, null, null),
            ResponseStatusException.class
        );

        assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        verifyNoInteractions(jdbc);
    }

    @Test
    void rejectsInvalidChefCursorBeforeDatabaseAccess() {
        ResponseStatusException exception = catchThrowableOfType(
            () -> service.listChefOrders(chef, 20, "not-a-valid-cursor", null),
            ResponseStatusException.class
        );

        assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        verifyNoInteractions(jdbc);
    }

    @Test
    void customerCannotUseChefHistoryEndpoint() {
        ResponseStatusException exception = catchThrowableOfType(
            () -> service.listChefOrders(customer, 20, null, null),
            ResponseStatusException.class
        );

        assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verifyNoInteractions(jdbc);
    }

    @Test
    void chefCannotUseCustomerHistoryEndpoint() {
        ResponseStatusException exception = catchThrowableOfType(
            () -> service.listCustomerOrders(chef, 20, null, null),
            ResponseStatusException.class
        );

        assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verifyNoInteractions(jdbc);
    }
}
