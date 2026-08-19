package in.craves.userchef.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import in.craves.userchef.exception.ApiException;
import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.web.SupportCaseDtos.CreateSupportCaseRequest;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

class SupportCaseServiceValidationTest {
    private NamedParameterJdbcTemplate jdbc;
    private SupportCaseService service;
    private CurrentUser customer;
    private CurrentUser supportAdmin;

    @BeforeEach
    void setUp() {
        jdbc = mock(NamedParameterJdbcTemplate.class);
        service = new SupportCaseService(jdbc);
        customer = new CurrentUser(
            UUID.fromString("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
            "firebase-customer",
            "+919999999999",
            List.of("CUSTOMER")
        );
        supportAdmin = new CurrentUser(
            UUID.fromString("11111111-2222-3333-4444-555555555555"),
            "firebase-support",
            "+918888888888",
            List.of("SUPPORT_ADMIN")
        );
    }

    @Test
    void rejectsContextRoleNotOwnedByCallerBeforeDatabaseAccess() {
        ApiException exception = catchThrowableOfType(
            () -> service.create(
                customer,
                new CreateSupportCaseRequest("CHEF", null, "Help", "I need assistance")
            ),
            ApiException.class
        );

        assertThat(exception.getCode()).isEqualTo("INVALID_SUPPORT_CONTEXT_ROLE");
        verifyNoInteractions(jdbc);
    }

    @Test
    void rejectsInvalidCursorBeforeDatabaseAccess() {
        ApiException exception = catchThrowableOfType(
            () -> service.listMine(customer, 20, "not-a-valid-cursor", null),
            ApiException.class
        );

        assertThat(exception.getCode()).isEqualTo("INVALID_CURSOR");
        verifyNoInteractions(jdbc);
    }

    @Test
    void rejectsInvalidPageSizeBeforeDatabaseAccess() {
        ApiException exception = catchThrowableOfType(
            () -> service.listBackoffice(supportAdmin, 101, null, null, false),
            ApiException.class
        );

        assertThat(exception.getCode()).isEqualTo("INVALID_PAGE_SIZE");
        verifyNoInteractions(jdbc);
    }

    @Test
    void customerCannotUseBackofficeSupportOperations() {
        ApiException exception = catchThrowableOfType(
            () -> service.listBackoffice(customer, 20, null, null, false),
            ApiException.class
        );

        assertThat(exception.getCode()).isEqualTo("SUPPORT_ADMIN_ROLE_REQUIRED");
        verifyNoInteractions(jdbc);
    }

    @Test
    void supportAdminCannotCreateRequesterCaseWithoutCustomerOrChefRole() {
        ApiException exception = catchThrowableOfType(
            () -> service.create(
                supportAdmin,
                new CreateSupportCaseRequest("CUSTOMER", null, "Help", "Message")
            ),
            ApiException.class
        );

        assertThat(exception.getCode()).isEqualTo("SUPPORT_REQUESTER_ROLE_REQUIRED");
        verifyNoInteractions(jdbc);
    }
}
