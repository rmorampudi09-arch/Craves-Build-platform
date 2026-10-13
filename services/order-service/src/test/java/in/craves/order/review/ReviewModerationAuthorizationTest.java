package in.craves.order.review;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import in.craves.order.exception.OrderApiException;
import in.craves.order.security.CravesPrincipal;
import in.craves.order.web.AdminReviewController;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

class ReviewModerationAuthorizationTest {
    private final NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
    private final OrderReviewService service = new OrderReviewService(jdbc, mock(ReviewMediaAuthorizer.class));
    private final AdminReviewController controller = new AdminReviewController(service);
    private final UUID reviewId = UUID.randomUUID();

    @Test
    void retiredAdminRoleCannotModerateReviewsOrManageTags() {
        CravesPrincipal legacy = actor("ADMIN");
        assertCode("ROLE_REQUIRED", () -> service.listModerationQueue(legacy, null, null, null));
        assertCode("ROLE_REQUIRED", () -> service.moderate(legacy, reviewId, null, "Synthetic moderation reason"));
        assertCode("ROLE_REQUIRED", () -> service.listReports(legacy, reviewId));
        assertCode("ROLE_REQUIRED", () -> controller.tags(legacy));
        assertCode("ROLE_REQUIRED", () -> service.upsertTagDefinition(actor("SUPPORT_ADMIN"), "TASTE", null, "Synthetic tag change"));
        verifyNoInteractions(jdbc);
    }

    @Test
    void supportAndPlatformRolesPassTheirRoleGate() {
        CravesPrincipal support = actor("SUPPORT_ADMIN");
        assertDoesNotThrow(() -> service.listModerationQueue(support, null, null, null));
        assertCode("ADMIN_REASON_INVALID", () -> service.moderate(support, reviewId, null, "short"));
        assertCode("ORDER_REVIEW_NOT_FOUND", () -> service.listReports(support, reviewId));
        assertDoesNotThrow(() -> controller.tags(actor("PLATFORM_ADMIN")));
        assertCode("ADMIN_REASON_INVALID", () -> service.upsertTagDefinition(actor("PLATFORM_ADMIN"), "TASTE", null, "short"));
    }

    private static CravesPrincipal actor(String role) {
        return new CravesPrincipal(UUID.randomUUID(), "+10000000000", Set.of(role));
    }

    private static void assertCode(String code, Executable call) {
        OrderApiException error = assertThrows(OrderApiException.class, call);
        assertEquals(code, error.code());
        if ("ROLE_REQUIRED".equals(code)) assertEquals(HttpStatus.FORBIDDEN, error.status());
    }
}
