package in.craves.userchef.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import in.craves.userchef.exception.ApiException;
import in.craves.userchef.security.CurrentUser;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class AdminDirectoryServiceTest {
    private final JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    private final AdminDirectoryService service = new AdminDirectoryService(jdbcTemplate);

    @Test
    void rejectsNonAdminBeforeTouchingDatabase() {
        CurrentUser user = new CurrentUser(UUID.randomUUID(), "firebase", "+919999999999", List.of("CUSTOMER"));

        ApiException error = assertThrows(
            ApiException.class,
            () -> service.search(user, "+919999999999", "Customer support case 1842")
        );

        assertEquals(403, error.getStatus());
        assertEquals("ADMIN_ROLE_REQUIRED", error.getCode());
        verifyNoInteractions(jdbcTemplate);
    }

    @Test
    void rejectsMissingOperationalReasonBeforeTouchingDatabase() {
        CurrentUser admin = new CurrentUser(UUID.randomUUID(), "firebase", "+919999999999", List.of("ADMIN"));

        ApiException error = assertThrows(
            ApiException.class,
            () -> service.search(admin, "+919999999999", "too short")
        );

        assertEquals(400, error.getStatus());
        assertEquals("ADMIN_DIRECTORY_REASON_INVALID", error.getCode());
        verifyNoInteractions(jdbcTemplate);
    }

    @Test
    void rejectsUnboundedFreeTextBeforeTouchingDatabase() {
        CurrentUser admin = new CurrentUser(UUID.randomUUID(), "firebase", "+919999999999", List.of("ADMIN"));

        ApiException error = assertThrows(
            ApiException.class,
            () -> service.search(admin, "* everything *", "Customer support case 1842")
        );

        assertEquals(400, error.getStatus());
        assertEquals("ADMIN_DIRECTORY_QUERY_INVALID", error.getCode());
        verifyNoInteractions(jdbcTemplate);
    }
}
