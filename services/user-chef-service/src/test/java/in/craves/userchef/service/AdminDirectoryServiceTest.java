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
import org.junit.jupiter.api.function.Executable;
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
    void searchAndCustomerCasesAcceptOnlyPlatformAndSupportAdmins() {
        for (String role : List.of("ADMIN", "CHEF_ADMIN", "COMPLIANCE_ADMIN", "AUDIT_ADMIN", "PAYMENTS_ADMIN")) {
            CurrentUser user = user("CUSTOMER", role);
            assertCode(403, "ADMIN_ROLE_REQUIRED", () -> service.search(user, "+10000000000", "Customer support case 1842"));
            assertCode(403, "ADMIN_ROLE_REQUIRED", () -> service.getCustomerCase(user, UUID.randomUUID(), "Customer support case 1842"));
        }
        for (String role : List.of("PLATFORM_ADMIN", "SUPPORT_ADMIN")) {
            assertCode(400, "ADMIN_DIRECTORY_REASON_INVALID", () -> service.search(user(role), "+10000000000", "too short"));
            assertCode(400, "ADMIN_DIRECTORY_REASON_INVALID", () -> service.getCustomerCase(user(role), UUID.randomUUID(), "too short"));
        }
        verifyNoInteractions(jdbcTemplate);
    }

    @Test
    void chefCasesAcceptTheChefReviewReadSet() {
        for (String role : List.of("ADMIN", "PAYMENTS_ADMIN", "OPERATIONS_ADMIN")) {
            assertCode(403, "ADMIN_ROLE_REQUIRED", () -> service.getChefCase(user("CUSTOMER", role), UUID.randomUUID(), "Chef review case 1842"));
        }
        for (String role : List.of("PLATFORM_ADMIN", "SUPPORT_ADMIN", "CHEF_ADMIN", "COMPLIANCE_ADMIN", "AUDIT_ADMIN")) {
            assertCode(400, "ADMIN_DIRECTORY_REASON_INVALID", () -> service.getChefCase(user(role), UUID.randomUUID(), "too short"));
        }
        verifyNoInteractions(jdbcTemplate);
    }

    private static CurrentUser user(String... roles) {
        return new CurrentUser(UUID.randomUUID(), "firebase", "+10000000000", List.of(roles));
    }

    private static void assertCode(int status, String code, Executable call) {
        ApiException error = assertThrows(ApiException.class, call);
        assertEquals(status, error.getStatus());
        assertEquals(code, error.getCode());
    }

    @Test
    void rejectsMissingOperationalReasonBeforeTouchingDatabase() {
        CurrentUser admin = new CurrentUser(UUID.randomUUID(), "firebase", "+919999999999", List.of("SUPPORT_ADMIN"));

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
        CurrentUser admin = new CurrentUser(UUID.randomUUID(), "firebase", "+919999999999", List.of("SUPPORT_ADMIN"));

        ApiException error = assertThrows(
            ApiException.class,
            () -> service.search(admin, "* everything *", "Customer support case 1842")
        );

        assertEquals(400, error.getStatus());
        assertEquals("ADMIN_DIRECTORY_QUERY_INVALID", error.getCode());
        verifyNoInteractions(jdbcTemplate);
    }
}
